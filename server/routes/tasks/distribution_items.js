const { sendJson, requireAuthedUser, roleFlags, serviceSelect } = require('./_common');

const OWNER_COLUMNS = ['created_by', 'created_by_user_id', 'owner_id', 'user_id'];

function ownerIdFromDistribution(distribution) {
  const row = distribution && typeof distribution === 'object' ? distribution : {};
  for (const key of OWNER_COLUMNS) {
    const value = String(row[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function isSchemaShapeError(out) {
  const status = Number(out && out.status);
  const text = JSON.stringify((out && (out.json || out.text)) || '').toLowerCase();
  // Common PostgREST/Supabase "table/view missing" shapes
  return status === 404 || text.includes('does not exist') || text.includes('undefined_table') || text.includes('relation');
}

module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });

    const auth = await requireAuthedUser(req);
    if (!auth) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    const distributionId = String((req.query && req.query.distribution_id) || '').trim();
    if (!distributionId) return sendJson(res, 400, { ok: false, error: 'missing_distribution_id' });

    const d = await serviceSelect('task_distributions', `select=*&id=eq.${encodeURIComponent(distributionId)}&limit=1`);
    if (!d.ok) {
      if (isSchemaShapeError(d)) return sendJson(res, 200, { ok: true, distribution: null, rows: [] });
      return sendJson(res, 500, { ok: false, error: 'distribution_fetch_failed', details: d.json || d.text });
    }

    const distribution = Array.isArray(d.json) && d.json[0] ? d.json[0] : null;
    if (!distribution) return sendJson(res, 404, { ok: false, error: 'distribution_not_found' });

    const flags = roleFlags(auth.profile && auth.profile.role);
    const ownerId = ownerIdFromDistribution(distribution);
    const isOwner = ownerId && ownerId === String(auth.authed.id || '');
    if (!isOwner && !flags.isAdmin && !flags.isLead) return sendJson(res, 403, { ok: false, error: 'forbidden' });

    let out = await serviceSelect('task_items', `select=*&distribution_id=eq.${encodeURIComponent(distributionId)}&order=created_at.desc`);
    if (!out.ok) {
      const fallback = await serviceSelect('task_items', `select=*&task_distribution_id=eq.${encodeURIComponent(distributionId)}&order=created_at.desc`);
      out = fallback.ok ? fallback : out;
    }
    if (!out.ok) return sendJson(res, 500, { ok: false, error: 'items_fetch_failed', details: out.json || out.text });

    return sendJson(res, 200, { ok: true, distribution, rows: Array.isArray(out.json) ? out.json : [] });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: 'distribution_items_failed', message: String(err && err.message ? err.message : err) });
  }
};
