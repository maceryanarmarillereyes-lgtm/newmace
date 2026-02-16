const { sendJson, requireAuthedUser, roleFlags, serviceSelect, escLike } = require('./_common');

module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });

    const auth = await requireAuthedUser(req);
    if (!auth) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    const flags = roleFlags(auth.profile && auth.profile.role);
    if (!flags.isLead && !flags.isAdmin) return sendJson(res, 403, { ok: false, error: 'forbidden' });

    const title = String((req.query && req.query.distribution_title) || '').trim();
    const q = [
      'select=task_item_id,task_status,distribution_title,member_name,member_shift,last_update',
      'order=distribution_title.asc,member_name.asc,last_update.desc'
    ];
    if (title) q.push(`distribution_title=ilike.${escLike(title)}`);

    const out = await serviceSelect('view_team_workload_matrix', q.join('&'));
    if (!out.ok) return sendJson(res, 500, { ok: false, error: 'workload_fetch_failed', details: out.json || out.text });

    return sendJson(res, 200, { ok: true, rows: Array.isArray(out.json) ? out.json : [] });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: 'workload_matrix_failed', message: String(err && err.message ? err.message : err) });
  }
};
