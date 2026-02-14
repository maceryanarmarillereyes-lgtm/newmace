const { sendJson, requireAuthedUser, serviceSelect } = require('./_common');

module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });

    const auth = await requireAuthedUser(req);
    if (!auth) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    const uid = encodeURIComponent(String(auth.authed.id || ''));
    const out = await serviceSelect('task_items', `select=*&assigned_to=eq.${uid}&order=deadline.asc.nullslast,created_at.desc`);
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

    const enriched = rows.map((row) => {
      const dist = distMap[String(row.distribution_id || '')] || {};
      const creatorId = String(dist.created_by || '');
      return Object.assign({}, row, {
        creator_name: nameByUid[creatorId] || creatorId || 'N/A',
        distribution_title: dist.title || ''
      });
    });

    return sendJson(res, 200, { ok: true, rows: enriched });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: 'assigned_failed', message: String(err && err.message ? err.message : err) });
  }
};
