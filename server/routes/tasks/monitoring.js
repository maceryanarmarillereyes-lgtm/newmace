const { sendJson, requireAuthedUser, serviceSelect } = require('./_common');

module.exports = async (req, res) => {
  try {
    const auth = await requireAuthedUser(req);
    if (!auth) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    // 1. Get Distributions
    const dOut = await serviceSelect('task_distributions', `select=*&order=created_at.desc&limit=${limit}&offset=${offset}`);
    const dists = dOut.ok && Array.isArray(dOut.json) ? dOut.json : [];
    if (!dists.length) return sendJson(res, 200, { ok: true, distributions: [], has_more: false });

    const distIds = dists.map((d) => d.id).filter(Boolean);

    // Construct clean UUID list for PostgREST
    const idFilter = distIds.map((id) => `"${id}"`).join(',');

    // 2. Get ALL Items linked to these IDs
    const tOut = await serviceSelect(
      'task_items',
      `select=id,distribution_id,assigned_to,status,case_number,case_no,site&distribution_id=in.(${idFilter})`
    );
    const allItems = tOut.ok ? (tOut.json || []) : [];

    // 3. Hydrate Profiles for Member Names
    const userIds = [...new Set(allItems.map((i) => i.assigned_to).filter(Boolean))];
    const profileMap = {};
    if (userIds.length) {
      const pOut = await serviceSelect(
        'mums_profiles',
        `select=user_id,name,username,team_id&user_id=in.(${userIds.join(',')})`
      );
      if (pOut.ok) (pOut.json || []).forEach((p) => { profileMap[p.user_id] = p; });
    }

    // 4. Force Aggregate
    const distributions = dists.map((d) => {
      const items = allItems.filter((i) => i.distribution_id === d.id);
      const memberBuckets = {};

      items.forEach((it) => {
        const uid = it.assigned_to || 'unassigned';
        const p = profileMap[uid] || {};

        if (!memberBuckets[uid]) {
          memberBuckets[uid] = {
            user_id: uid,
            name: p.name || p.username || (uid === 'unassigned' ? 'Unassigned' : uid.slice(0, 8)),
            total: 0,
            completed: 0,
            pending: 0,
            with_problem: 0,
            items: [],
          };
        }

        const m = memberBuckets[uid];
        const s = String(it.status || '').toLowerCase();
        m.total += 1;
        if (s.includes('complete') || s === 'done') m.completed += 1;
        else if (s.includes('problem')) m.with_problem += 1;
        else m.pending += 1;

        m.items.push({
          id: it.id,
          case_number: it.case_number || it.case_no || 'N/A',
          site: it.site || 'N/A',
          status: it.status,
        });
      });

      const members = Object.values(memberBuckets)
        .map((m) => ({
          ...m,
          completion_pct: m.total ? Math.round((m.completed / m.total) * 100) : 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        id: d.id,
        title: d.title,
        created_at: d.created_at,
        created_by_name: d.created_by_name || 'System',
        totals: {
          total: items.length,
          pending: items.filter((i) => !String(i.status || '').toLowerCase().includes('complete')).length,
          with_problem: items.filter((i) => String(i.status || '').toLowerCase().includes('problem')).length,
        },
        members,
      };
    });

    return sendJson(res, 200, { ok: true, distributions, has_more: dists.length === limit });
  } catch (err) {
    return sendJson(res, 500, { ok: false, message: err.message });
  }
};
