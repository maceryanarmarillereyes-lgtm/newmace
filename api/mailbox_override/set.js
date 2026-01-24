const { getUserFromJwt, getProfileForUserId, serviceFetch } = require('../_supabase');

// POST /api/mailbox_override/set
// Body: { scope: 'global'|'superadmin', enabled, freeze, override_iso }
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
    const scope = (body.scope || 'superadmin').toString();
    if (scope === 'global' && profile.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const enabled = !!body.enabled;
    const freeze = !!body.freeze;
    const override_iso = (body.override_iso || '').toString();
    if (enabled && !override_iso) {
      return res.status(400).json({ error: 'override_iso is required when enabled' });
    }

    // Upsert singleton row per scope
    const payload = {
      scope,
      enabled,
      freeze,
      override_iso: enabled ? override_iso : null,
      updated_by: u.id,
      updated_at: new Date().toISOString(),
    };

    // Prefer deterministic id per scope
    const id = scope;
    const { res: upRes, json: upJson } = await serviceFetch(
      `/rest/v1/mums_mailbox_override?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!upRes.ok) {
      // If PATCH fails (row doesn't exist), do INSERT
      const { res: insRes, json: insJson } = await serviceFetch('/rest/v1/mums_mailbox_override', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ id, ...payload }),
      });
      if (!insRes.ok) return res.status(500).json({ error: 'Supabase insert failed', details: insJson });
      return res.status(200).json({ ok: true, row: Array.isArray(insJson) ? insJson[0] : insJson });
    }

    return res.status(200).json({ ok: true, row: Array.isArray(upJson) ? upJson[0] : upJson });
  } catch (e) {
    return res.status(500).json({ error: 'Server error', details: String(e?.message || e) });
  }
};
