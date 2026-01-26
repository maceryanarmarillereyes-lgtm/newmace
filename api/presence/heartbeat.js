const { getUserFromJwt, getProfileForUserId, serviceUpsert } = require('../_supabase');

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

    const profile = await getProfileForUserId(authed.id);
    const metaName = authed.user_metadata ? (authed.user_metadata.full_name || authed.user_metadata.name) : '';

    const record = {
      client_id: clientId,
      user_id: String(authed.id),
      name: String((profile && profile.name) || metaName || authed.email || 'User'),
      role: String((profile && profile.role) || body.role || ''),
      team_id: String((profile && profile.team_id) || body.teamId || ''),
      route: String(body.route || '').trim(),
      last_seen: new Date().toISOString()
    };

    // Stabilize monitoring: if SUPER_ADMIN has no team_id, default to morning.
    try {
      const r = String(record.role || '').toUpperCase();
      if (r === 'SUPER_ADMIN' && (!record.team_id || String(record.team_id).trim() === '')) record.team_id = 'morning';
    } catch (_) {}


    const up = await serviceUpsert('mums_presence', [record], 'client_id');
    if (!up.ok) return sendJson(res, 500, { ok: false, error: 'supabase_upsert_failed', details: up.json || up.text });

    return sendJson(res, 200, { ok: true });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: 'heartbeat_failed', message: String(err && err.message ? err.message : err) });
  }
};
