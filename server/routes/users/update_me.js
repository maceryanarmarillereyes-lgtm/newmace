const { getUserFromJwt, getProfileForUserId, serviceUpdate } = require('../../lib/supabase');

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
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
  });
}

// PATCH /api/users/update_me
// Updates the authenticated user's profile (server-side, service key).
module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'PATCH' && req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });

    const auth = String(req.headers.authorization || '');
    const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
    const authed = await getUserFromJwt(jwt);
    if (!authed) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    const body = await readBody(req);
    const patch = {};

    if (Object.prototype.hasOwnProperty.call(body, 'name')) {
      const name = String(body.name || '').trim();
      if (name && name.length > 80) return sendJson(res, 400, { ok: false, error: 'invalid_name' });
      if (name) patch.name = name;
    }

    // Allow duty update (optional); UI may use it.
    if (Object.prototype.hasOwnProperty.call(body, 'duty')) {
      const duty = String(body.duty || '').trim();
      if (duty.length > 120) return sendJson(res, 400, { ok: false, error: 'invalid_duty' });
      patch.duty = duty;
    }

    if (!Object.keys(patch).length) return sendJson(res, 200, { ok: true, updated: false, profile: null });

    const prof = await getProfileForUserId(authed.id);
    if (!prof) return sendJson(res, 404, { ok: false, error: 'profile_missing', message: 'Profile not found. Call /api/users/me first.' });

    const out = await serviceUpdate('mums_profiles', patch, { user_id: `eq.${authed.id}` });
    if (!out.ok) return sendJson(res, 500, { ok: false, error: 'update_failed', details: out.json || out.text });

    return sendJson(res, 200, { ok: true, updated: true, patch });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: 'update_me_failed', message: String(err && err.message ? err.message : err) });
  }
};
