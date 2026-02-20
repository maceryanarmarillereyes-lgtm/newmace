const { sendJson, requireAuthedUser, roleFlags, serviceSelect } = require('./_common');

const ITEM_DISTRIBUTION_COLUMNS = ['distribution_id', 'task_distribution_id'];
const ASSIGNEE_COLUMNS = ['assigned_to', 'assignee_user_id', 'assigned_user_id'];

function encodeInList(values) {
  return values
    .map((value) => encodeURIComponent(String(value || '').trim()))
    .filter(Boolean)
    .join(',');
}

function readFirstField(row, fields) {
  const source = row && typeof row === 'object' ? row : {};
  for (const field of fields) {
    const value = String(source[field] || '').trim();
    if (value) return value;
  }
  return '';
}

async function selectItemsByDistributionIds(distributionIds) {
  const ids = Array.isArray(distributionIds) ? distributionIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
  if (!ids.length) return { rows: [], distributionColumn: ITEM_DISTRIBUTION_COLUMNS[0] };

  const inList = encodeInList(ids);
  for (const key of ITEM_DISTRIBUTION_COLUMNS) {
    const out = await serviceSelect('task_items', `select=*&${encodeURIComponent(key)}=in.(${inList})`);
    if (out.ok) {
      return {
        rows: Array.isArray(out.json) ? out.json : [],
        distributionColumn: key
      };
    }
  }

  return { rows: [], distributionColumn: ITEM_DISTRIBUTION_COLUMNS[0] };
}

module.exports = async (req, res) => {
  try {
    const auth = await requireAuthedUser(req);
    if (!auth) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    const rawRole = auth.profile ? String(auth.profile.role || '').toUpperCase() : '';
    const flags = roleFlags(rawRole);
    const isSuper = flags.isAdmin || flags.isLead || ['TEAM_LEAD', 'ADMIN', 'SUPER_ADMIN', 'SUPER_USER'].includes(rawRole);
    const myTeamId = auth.profile ? auth.profile.team_id : null;

    const limit = Math.max(1, Math.min(20, Number(req.query.limit) || 20));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const dOut = await serviceSelect('task_distributions', `select=*&order=created_at.desc&limit=${limit}&offset=${offset}`);
    const dists = dOut.ok && Array.isArray(dOut.json) ? dOut.json : [];
    if (!dists.length) return sendJson(res, 200, { ok: true, distributions: [], has_more: false });

    const distIds = dists.map((d) => d && d.id).filter(Boolean);
    const itemsResult = await selectItemsByDistributionIds(distIds);
    const items = itemsResult.rows;
    const itemDistributionColumn = itemsResult.distributionColumn;

    const userIds = [...new Set(items.map((i) => readFirstField(i, ASSIGNEE_COLUMNS)).filter(Boolean))];
    const profilesById = {};
    if (userIds.length) {
      const userInList = encodeInList(userIds);
      const pOut = await serviceSelect(
        'mums_profiles',
        `select=user_id,name,username,team_id&user_id=in.(${userInList})`
      );
      if (pOut.ok && Array.isArray(pOut.json)) {
        pOut.json.forEach((p) => {
          if (p && p.user_id) profilesById[String(p.user_id)] = p;
        });
      }
    }

    const response = dists
      .map((d) => {
        const distId = d && d.id ? String(d.id) : '';
        const dItems = items.filter((i) => String(i && i[itemDistributionColumn] ? i[itemDistributionColumn] : '') === distId);
        const byMember = {};

        dItems.forEach((it) => {
          const mId = readFirstField(it, ASSIGNEE_COLUMNS);
          if (!mId) return;

          const prof = profilesById[mId] || {};
          if (!isSuper && myTeamId && prof.team_id) {
            if (String(prof.team_id).toLowerCase() !== String(myTeamId).toLowerCase()) return;
          }

          if (!byMember[mId]) {
            byMember[mId] = {
              user_id: mId,
              name: prof.name || prof.username || mId,
              total: 0,
              completed: 0,
              pending: 0,
              with_problem: 0,
              items: []
            };
          }

          const member = byMember[mId];
          const status = String((it && it.status) || '').toLowerCase();
          member.total += 1;
          if (status.includes('complete') || status === 'done') member.completed += 1;
          else if (status.includes('problem')) member.with_problem += 1;
          else member.pending += 1;

          member.items.push({
            id: it && it.id,
            case_number: (it && (it.case_number || it.case_no)) || 'N/A',
            site: (it && it.site) || 'N/A',
            status: it && it.status
          });
        });

        const members = Object.values(byMember)
          .map((member) => ({
            ...member,
            completion_pct: member.total ? Math.round((member.completed / member.total) * 100) : 0
          }))
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

        if (!isSuper && !members.length) return null;

        return {
          id: d.id,
          title: d.title,
          created_at: d.created_at,
          created_by_name: d.created_by_name || 'System',
          totals: members.reduce(
            (acc, member) => {
              acc.total += Number(member.total || 0);
              acc.pending += Number(member.pending || 0);
              acc.with_problem += Number(member.with_problem || 0);
              return acc;
            },
            { total: 0, pending: 0, with_problem: 0 }
          ),
          members
        };
      })
      .filter(Boolean);

    return sendJson(res, 200, { ok: true, distributions: response, has_more: dists.length === limit });
  } catch (err) {
    return sendJson(res, 500, { ok: false, message: err.message });
  }
};
