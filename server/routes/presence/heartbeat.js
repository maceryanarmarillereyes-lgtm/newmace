const { getUserFromJwt, getProfileForUserId, serviceUpsert, serviceUpdate } = require('../../lib/supabase');

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

// POST /api/presence/heartbeat
// Stores the current authenticated user's online marker.
module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });

    const auth = String(req.headers.authorization || '');
    const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
    const authed = await getUserFromJwt(jwt);
    if (!authed) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    const body = await readBody(req);
    const clientId = String(body.clientId || '').trim();
    if (!clientId) return sendJson(res, 400, { ok: false, error: 'missing_clientId' });

    let profile = await getProfileForUserId(authed.id);
    // Best-effort: bootstrap SUPER_ADMIN role if this user's email matches SUPERADMIN_EMAIL.
    // This keeps monitoring + permissions stable even if an old profile row exists.
    try {
      const bootstrapEmail = String(process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
      const authedEmail = String(authed.email || '').trim().toLowerCase();
      if (bootstrapEmail && authedEmail && bootstrapEmail === authedEmail && profile && String(profile.role || '') !== 'SUPER_ADMIN') {
        // Policy: SUPER_ADMIN has no team assignment.
        await serviceUpdate('mums_profiles', { role: 'SUPER_ADMIN', team_id: null }, { user_id: `eq.${authed.id}` });
        profile = Object.assign({}, profile, { role: 'SUPER_ADMIN', team_id: null });
      }
    } catch (_) {}
    const metaName = authed.user_metadata ? (authed.user_metadata.full_name || authed.user_metadata.name) : '';

    const roleUpper = String((profile && profile.role) || '').trim().toUpperCase();
    const isDevAccess = (roleUpper === 'SUPER_ADMIN' || roleUpper === 'SUPER_USER');
    const record = {
      client_id: clientId,
      user_id: String(authed.id),
      name: String((profile && profile.name) || metaName || authed.email || 'User'),
      // Do NOT trust role/team from the client; always source from the profile row.
      role: String((profile && profile.role) || 'MEMBER'),
      // Developer Access users are excluded from shift buckets.
      team_id: isDevAccess ? null : ((profile && profile.team_id) || null),
      route: String(body.route || '').trim(),
      last_seen: new Date().toISOString()
    };


    const up = await serviceUpsert('mums_presence', [record], 'client_id');
    if (!up.ok) return sendJson(res, 500, { ok: false, error: 'supabase_upsert_failed', details: up.json || up.text });

    return sendJson(res, 200, { ok: true });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: 'heartbeat_failed', message: String(err && err.message ? err.message : err) });
  }
};
