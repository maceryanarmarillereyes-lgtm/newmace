const { getUserFromJwt, serviceSelect, serviceInsert } = require('../_supabase');

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// POST /api/users/ensure_profile
// Creates a profile row for the authenticated user if missing.
// Bootstrap behavior:
// - If SUPERADMIN_EMAIL is set, only that email becomes SUPER_ADMIN.
// - Else, first ever profile in the project becomes SUPER_ADMIN.

function parseBody(req) {
  try {
    if (!req || req.body == null) return {};
    if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
    return req.body || {};
  } catch (_) {
    return {};
  }
}

module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method && req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    }

    const auth = String(req.headers.authorization || '');
    const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
    const user = jwt ? await getUserFromJwt(jwt) : null;
    if (!user) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    // Return existing profile if present.
    const existing = await serviceSelect(
      'mums_profiles',
      `select=*&user_id=eq.${encodeURIComponent(user.id)}&limit=1`
    );
    if (!existing.ok) {
      return sendJson(res, existing.status || 500, { ok: false, error: 'db_error', details: existing.json || existing.text });
    }
    if (Array.isArray(existing.json) && existing.json[0]) {
      return sendJson(res, 200, { ok: true, profile: existing.json[0], created: false });
    }

    // Determine bootstrap role.
    const bootstrapEmail = String(process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
    let role = 'MEMBER';

    if (bootstrapEmail) {
      if (String(user.email || '').toLowerCase() === bootstrapEmail) role = 'SUPER_ADMIN';
    } else {
      // If no profiles exist, first login becomes SUPER_ADMIN.
      const any = await serviceSelect('mums_profiles', 'select=user_id&limit=1');
      if (any.ok && Array.isArray(any.json) && any.json.length === 0) role = 'SUPER_ADMIN';
    }

    const username = String(user.email || '').split('@')[0] || 'user';
    const metaName = user.user_metadata ? (user.user_metadata.full_name || user.user_metadata.name) : '';
    const name = String(metaName || '').trim() || username;

    // Optional per-user defaults from request body (future-proofing)
    const body = parseBody(req);
    const duty = String(body.duty || '').trim();

    const profileRow = {
      user_id: user.id,
      username,
      name,
      role,
      team_id: null,
      duty: duty || ''
    };

    const ins = await serviceInsert('mums_profiles', [profileRow]);
    if (!ins.ok) {
      return sendJson(res, ins.status || 500, { ok: false, error: 'profile_create_failed', details: ins.json || ins.text });
    }

    return sendJson(res, 200, { ok: true, profile: ins.json && ins.json[0] ? ins.json[0] : null, created: true });
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: 'server_error', message: e?.message || String(e) });
  }
};
