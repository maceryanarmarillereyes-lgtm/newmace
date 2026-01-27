const { getUserFromJwt, getProfileForUserId, serviceInsert, serviceUpdate } = require('../../lib/supabase');

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// GET /api/users/me
// Returns the authenticated user's profile (creates it if missing).
module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });

    const auth = String(req.headers.authorization || '');
    const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
    const authed = await getUserFromJwt(jwt);
    if (!authed) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    const email = String(authed.email || '').trim();
    const uname = email ? email.split('@')[0] : String(authed.id).slice(0, 8);
    const metaName = authed.user_metadata ? (authed.user_metadata.full_name || authed.user_metadata.name) : '';
    const defaultName = String(metaName || uname || 'User');

    let profile = await getProfileForUserId(authed.id);
    let created = false;
    let updated = false;

    // Bootstrap SUPER_ADMIN if configured.
    const bootstrapEmail = String(process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
    const isBootstrap = bootstrapEmail && email && bootstrapEmail === email.toLowerCase();

    if (!profile) {
      const insert = {
        user_id: authed.id,
        username: uname,
        name: defaultName,
        role: isBootstrap ? 'SUPER_ADMIN' : 'MEMBER',
        // Default to Morning for standard users; Dev Access is excluded from shift buckets.
        team_id: isBootstrap ? null : 'morning',
        duty: ''
      };
      const out = await serviceInsert('mums_profiles', [insert]);
      if (!out.ok) return sendJson(res, 500, { ok: false, error: 'profile_insert_failed', details: out.json || out.text });
      profile = out.json && out.json[0] ? out.json[0] : insert;
      created = true;
    } else if (isBootstrap && String(profile.role || '') !== 'SUPER_ADMIN') {
      const out = await serviceUpdate('mums_profiles', { role: 'SUPER_ADMIN', team_id: null }, { user_id: `eq.${authed.id}` });
      if (out.ok) {
        profile = Object.assign({}, profile, { role: 'SUPER_ADMIN', team_id: null });
        updated = true;
      }
    }

    return sendJson(res, 200, { ok: true, profile, created, updated });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: 'me_failed', message: String(err && err.message ? err.message : err) });
  }
};
