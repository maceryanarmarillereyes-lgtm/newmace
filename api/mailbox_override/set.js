const { getUserFromJwt, getProfileForUserId, serviceUpsert } = require('../_supabase');

// POST /api/mailbox_override/set
// Body: { scope: 'global'|'superadmin', enabled, freeze, override_iso } (freeze stored as is_frozen in DB)
// Only SUPER_ADMIN can set overrides.
module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const auth = req.headers.authorization || '';
    const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
    const u = await getUserFromJwt(jwt);
    if (!u) return res.status(401).json({ error: 'Unauthorized' });

    const profile = await getProfileForUserId(u.id);
    if (!profile || profile.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const scope = (body.scope || 'superadmin').toString().toLowerCase();
    if (!['global', 'superadmin'].includes(scope)) {
      return res.status(400).json({ error: 'Invalid scope' });
    }

    const enabled = !!body.enabled;
    const freeze = !!body.freeze;
    const override_iso = (body.override_iso || '').toString();
    if (enabled && !override_iso) {
      return res.status(400).json({ error: 'override_iso is required when enabled' });
    }

    const payload = {
      scope,
      enabled,
      is_frozen: freeze,
      override_iso: enabled ? override_iso : null,
      updated_by: u.id,
      updated_at: new Date().toISOString()
    };

    const up = await serviceUpsert('mums_mailbox_override', [payload], 'scope');
    if (!up.ok) {
      return res.status(500).json({ error: 'Supabase upsert failed', details: up.json || up.text });
    }

    return res.status(200).json({ ok: true, row: Array.isArray(up.json) ? up.json[0] : up.json });
  } catch (e) {
    return res.status(500).json({ error: 'Server error', details: String(e?.message || e) });
  }
};
