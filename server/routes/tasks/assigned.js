const { sendJson, requireAuthedUser, serviceSelect } = require('./_common');

function normStatus(value) {
  const status = String(value || 'PENDING').toUpperCase();
  if (status === 'DONE' || status === 'IN_PROGRESS') return status;
  return 'PENDING';
}

function itemDeadlineValue(item) {
  return item && (item.deadline || item.deadline_at || item.due_at || item.created_at || 0);
}

module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });

    const auth = await requireAuthedUser(req);
    if (!auth) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    const uid = encodeURIComponent(String(auth.authed.id || ''));
    const out = await serviceSelect('task_items', `select=*&assigned_to=eq.${uid}&order=created_at.desc`);
    if (!out.ok) return sendJson(res, 500, { ok: false, error: 'assigned_query_failed', details: out.json || out.text });

    const rows = Array.isArray(out.json) ? out.json : [];
    const distIds = Array.from(new Set(rows.map((r) => String(r.distribution_id || '').trim()).filter(Boolean)));

    let distMap = {};
    if (distIds.length) {
      const list = distIds.map((id) => encodeURIComponent(id)).join(',');
      const d = await serviceSelect('task_distributions', `select=*&id=in.(${list})`);
      const drows = d.ok && Array.isArray(d.json) ? d.json : [];
      distMap = drows.reduce((acc, cur) => {
        acc[String(cur.id)] = cur;
        return acc;
      }, {});
    }

    const creatorIds = Array.from(new Set(Object.values(distMap).map((d) => String((d && d.created_by) || '')).filter(Boolean)));
    let nameByUid = {};
    if (creatorIds.length) {
      const list = creatorIds.map((id) => encodeURIComponent(id)).join(',');
      const p = await serviceSelect('mums_profiles', `select=user_id,name,username&user_id=in.(${list})`);
      const prow = p.ok && Array.isArray(p.json) ? p.json : [];
      nameByUid = prow.reduce((acc, cur) => {
        acc[String(cur.user_id)] = String(cur.name || cur.username || cur.user_id || 'N/A');
        return acc;
      }, {});
    }

    const grouped = rows.reduce((acc, row) => {
      const distributionId = String(row.distribution_id || 'unassigned');
      const dist = distMap[String(row.distribution_id || '')] || {};
      const creatorId = String(dist.created_by || '');
      const creatorName = nameByUid[creatorId] || creatorId || 'N/A';
      const status = normStatus(row.status);

      if (!acc[distributionId]) {
        acc[distributionId] = {
          distribution_id: distributionId,
          project_title: String(dist.title || 'Untitled Distribution'),
          assigner_name: creatorName,
          assigned_at: dist.created_at || row.created_at || null,
          pending_count: 0,
          total_count: 0,
          done_count: 0,
          items: []
        };
      }

      const item = Object.assign({}, row, {
        status,
        creator_name: creatorName,
        distribution_title: dist.title || ''
      });

      acc[distributionId].items.push(item);
      acc[distributionId].total_count += 1;
      if (status === 'DONE') acc[distributionId].done_count += 1;
      if (status !== 'DONE') acc[distributionId].pending_count += 1;
      return acc;
    }, {});

    const groups = Object.values(grouped)
      .map((group) => {
        group.items.sort((a, b) => {
          const aTime = new Date(itemDeadlineValue(a)).getTime();
          const bTime = new Date(itemDeadlineValue(b)).getTime();
          return aTime - bTime;
        });
        return group;
      })
      .sort((a, b) => {
        const aDate = new Date(a.assigned_at || (a.items[0] && a.items[0].created_at) || 0).getTime();
        const bDate = new Date(b.assigned_at || (b.items[0] && b.items[0].created_at) || 0).getTime();
        return bDate - aDate;
      });

    return sendJson(res, 200, { ok: true, groups });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: 'assigned_failed', message: String(err && err.message ? err.message : err) });
  }
};
