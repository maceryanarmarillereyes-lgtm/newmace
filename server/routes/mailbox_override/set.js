const {
  getUserFromJwt,
  getProfileForUserId,
  serviceSelect,
  serviceUpsert,
  serviceInsert
} = require('../../lib/supabase');

// ===== CODE UNTOUCHABLES =====
// Global mailbox override enforcement is a PERMANENT behavior.
// - Only SUPER_ADMIN may write (set/reset/freeze) overrides.
// - Every successful change MUST attempt to write an audit row into mums_sync_log.
// - Action derivation (set/reset/freeze) is part of the audit contract.
// Exception: Only change if required by documented Supabase API behavior changes.
// ==============================

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// POST /api/mailbox_override/set
// Body: { scope: 'global'|'superadmin', enabled, freeze, override_iso }
module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');

    const auth = req.headers.authorization || '';
    const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
    const u = await getUserFromJwt(jwt);
    if (!u) return sendJson(res, 401, { ok: false, error: 'unauthorized', message: 'Missing or invalid bearer token.' });

    const profile = await getProfileForUserId(u.id);
    if (!profile || profile.role !== 'SUPER_ADMIN') {
      return sendJson(res, 403, { ok: false, error: 'forbidden', message: 'Super Admin only.' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const scope = (body.scope || 'superadmin').toString().toLowerCase();
    if (!['global', 'superadmin'].includes(scope)) {
      return sendJson(res, 400, { ok: false, error: 'invalid_scope', message: 'scope must be global or superadmin' });
    }

    const enabled = !!body.enabled;
    const freeze = !!body.freeze;
    const override_iso = (body.override_iso || '').toString();

    if (enabled) {
      if (!override_iso) {
        return sendJson(res, 400, { ok: false, error: 'missing_override_iso', message: 'override_iso is required when enabled' });
      }
      const parsed = Date.parse(override_iso);
      if (!Number.isFinite(parsed)) {
        return sendJson(res, 400, { ok: false, error: 'invalid_override_iso', message: 'override_iso must be a valid ISO datetime string' });
      }
    }

    // Read previous row (to compute audit action).
    let prev = null;
    try {
      const prevOut = await serviceSelect('mums_mailbox_override', `select=*&scope=eq.${encodeURIComponent(scope)}&limit=1`);
      if (prevOut.ok && Array.isArray(prevOut.json) && prevOut.json[0]) prev = prevOut.json[0];
    } catch (_) {}

    const prevEnabled = !!(prev && prev.enabled);
    const prevFreeze = !!(prev && (Object.prototype.hasOwnProperty.call(prev, 'is_frozen') ? prev.is_frozen : prev.freeze));

    let action = 'set';
    if (!enabled) {
      action = 'reset';
    } else if (!prevEnabled) {
      action = 'set';
    } else if (prevEnabled && (prevFreeze !== freeze)) {
      action = 'freeze';
    } else {
      action = 'set';
    }

    const nowIso = new Date().toISOString();

    const payload = {
      scope,
      enabled,
      is_frozen: freeze,
      override_iso: enabled ? override_iso : '',
      updated_by: u.id,
      updated_at: nowIso
    };

    const up = await serviceUpsert('mums_mailbox_override', [payload], 'scope');
    if (!up.ok) {
      return sendJson(res, 500, { ok: false, error: 'override_upsert_failed', message: 'Supabase upsert failed', details: up.json || up.text });
    }

    // Audit log: record every change.
    const logRow = {
      user_id: u.id,
      scope,
      timestamp: nowIso,
      effective_time: enabled ? override_iso : null,
      action
    };

    let audit = { ok: true };
    try {
      const ins = await serviceInsert('mums_sync_log', [logRow]);
      if (!ins.ok) audit = { ok: false, status: ins.status, details: ins.json || ins.text };
    } catch (e) {
      audit = { ok: false, details: String(e?.message || e) };
    }

    const row = Array.isArray(up.json) ? up.json[0] : up.json;

    return sendJson(res, 200, {
      ok: true,
      override_row: row,
      audit
    });
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: 'server_error', message: String(e?.message || e) });
  }
};
