const { getUserFromJwt, getProfileForUserId, serviceSelect } = require('../_supabase');

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// GET /api/users/list
// Role-aware listing:
// - SUPER_ADMIN: sees all users
// - TEAM_LEAD : sees only users in their team_id
// - MEMBER    : sees only themselves
module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method && req.method !== 'GET') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    }

    const auth = String(req.headers.authorization || '');
    const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
    const user = await getUserFromJwt(jwt);
    if (!user) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    const me = await getProfileForUserId(user.id);
    if (!me) return sendJson(res, 403, { ok: false, error: 'profile_not_found' });

    const myRole = String(me.role || 'MEMBER').toUpperCase();
    let filter = '';

    if (myRole === 'TEAM_LEAD') {
      const team = String(me.team_id || '').trim();
      filter = team ? `&team_id=eq.${encodeURIComponent(team)}` : '&team_id=is.null';
    } else if (myRole !== 'SUPER_ADMIN') {
      filter = `&user_id=eq.${encodeURIComponent(user.id)}`;
    }

    const select = 'user_id,username,name,role,team_id,duty,avatar_url,created_at,updated_at';
    const out = await serviceSelect('mums_profiles', `select=${select}${filter}&order=name.asc`);

    if (!out.ok) {
      return sendJson(res, out.status || 500, { ok: false, error: 'db_error', details: out.json || out.text });
    }

    return sendJson(res, 200, { ok: true, rows: Array.isArray(out.json) ? out.json : [] });
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: 'server_error', message: e?.message || String(e) });
  }
};
