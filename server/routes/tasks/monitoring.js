const { sendJson, requireAuthedUser, roleFlags, serviceSelect } = require('./_common');

module.exports = async (req, res) => {
  try {
    const auth = await requireAuthedUser(req);
    if (!auth) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    const flags = roleFlags(auth.profile && auth.profile.role);
    const isSuper = flags.isAdmin || flags.isLead;
    const myTeamId = (req.query && req.query.team_id) || (auth.profile ? auth.profile.team_id : null);

    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    const dOut = await serviceSelect('task_distributions', `select=*&order=created_at.desc&limit=${limit}&offset=${offset}`);
    const dists = dOut.ok && Array.isArray(dOut.json) ? dOut.json : [];
    if (!dists.length) return sendJson(res, 200, { ok: true, distributions: [], has_more: false });

    const distIds = dists.map((d) => d.id).filter(Boolean);
    const inList = distIds.map((id) => `"${id}"`).join(',');

    const tOut = await serviceSelect(
      'task_items',
      `select=id,distribution_id,task_distribution_id,assigned_to,status,case_number,case_no,site&or=(distribution_id.in.(${inList}),task_distribution_id.in.(${inList}))`
    );
    const items = tOut.ok ? (tOut.json || []) : [];

    const userIds = [...new Set(items.map((i) => i.assigned_to).filter(Boolean))];
    const profilesById = {};
    if (userIds.length) {
      const pOut = await serviceSelect('mums_profiles', `select=user_id,name,username,team_id&user_id=in.(${userIds.join(',')})`);
      if (pOut.ok) pOut.json.forEach((p) => { profilesById[p.user_id] = p; });
    }

    const response = dists.map((d) => {
      const dItems = items.filter((i) => (i.distribution_id === d.id || i.task_distribution_id === d.id));
      const byMember = {};

      dItems.forEach((it) => {
        const mId = it.assigned_to;
        if (!mId) return;
        const prof = profilesById[mId] || {};

        if (!isSuper && myTeamId && prof.team_id && String(prof.team_id).toLowerCase() !== String(myTeamId).toLowerCase()) return;
        if (!byMember[mId]) byMember[mId] = { user_id: mId, name: prof.name || prof.username || mId, total: 0, completed: 0, pending: 0, with_problem: 0, items: [] };

        const m = byMember[mId];
        const s = String(it.status || '').toLowerCase();
        m.total += 1;
        if (s.includes('complete') || s === 'done') m.completed += 1;
        else if (s.includes('problem')) m.with_problem += 1;
        else m.pending += 1;
        m.items.push({ id: it.id, case_number: it.case_number || it.case_no || 'N/A', site: it.site || 'N/A', status: it.status });
      });

      const members = Object.values(byMember)
        .map((m) => ({ ...m, completion_pct: m.total ? Math.round((m.completed / m.total) * 100) : 0 }))
        .sort((a, b) => a.name.localeCompare(b.name));

      if (!members.length && !isSuper) return null;

      return {
        id: d.id,
        title: d.title,
        created_at: d.created_at,
        created_by_name: d.created_by_name || 'System',
        totals: members.reduce((acc, m) => {
          acc.total += m.total;
          acc.pending += m.pending;
          acc.with_problem += m.with_problem;
          return acc;
        }, { total: 0, pending: 0, with_problem: 0 }),
        members
      };
    }).filter(Boolean);

    return sendJson(res, 200, { ok: true, distributions: response, has_more: dists.length === limit });
  } catch (err) {
    return sendJson(res, 500, { ok: false, message: err.message });
  }
};
