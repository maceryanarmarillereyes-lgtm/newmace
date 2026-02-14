const { sendJson, requireAuthedUser, roleFlags, serviceSelect } = require('./_common');

module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });

    const auth = await requireAuthedUser(req);
    if (!auth) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    const distributionId = String((req.query && req.query.distribution_id) || '').trim();
    if (!distributionId) return sendJson(res, 400, { ok: false, error: 'missing_distribution_id' });

    const d = await serviceSelect('task_distributions', `select=*&id=eq.${encodeURIComponent(distributionId)}&limit=1`);
    if (!d.ok) return sendJson(res, 500, { ok: false, error: 'distribution_fetch_failed', details: d.json || d.text });
    const distribution = Array.isArray(d.json) && d.json[0] ? d.json[0] : null;
    if (!distribution) return sendJson(res, 404, { ok: false, error: 'distribution_not_found' });

    const flags = roleFlags(auth.profile && auth.profile.role);
    const isOwner = String(distribution.created_by || '') === String(auth.authed.id || '');
    if (!isOwner && !flags.isAdmin && !flags.isLead) return sendJson(res, 403, { ok: false, error: 'forbidden' });

    const out = await serviceSelect('task_items', `select=*&distribution_id=eq.${encodeURIComponent(distributionId)}&order=created_at.desc`);
    if (!out.ok) return sendJson(res, 500, { ok: false, error: 'items_fetch_failed', details: out.json || out.text });

    return sendJson(res, 200, { ok: true, distribution, rows: Array.isArray(out.json) ? out.json : [] });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: 'distribution_items_failed', message: String(err && err.message ? err.message : err) });
  }
};
