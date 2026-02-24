const { getUserFromJwt, getProfileForUserId, serviceSelect } = require('../../lib/supabase');

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

const PRIVILEGED_ROLES = new Set(['SUPER_ADMIN', 'SUPER_USER', 'ADMIN', 'TEAM_LEAD']);
const SHIFT_TEAM_IDS = new Set(['morning', 'mid', 'night']);

module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method && req.method !== 'GET') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    }

    const auth = String(req.headers.authorization || '');
    const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
    const actor = await getUserFromJwt(jwt);
    if (!actor) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    const profile = await getProfileForUserId(actor.id);
    if (!profile) return sendJson(res, 403, { ok: false, error: 'profile_not_found' });

    const myRole = String(profile.role || 'MEMBER').toUpperCase();
    const myTeam = String(profile.team_id || '').trim();
    const reqTeam = String((req.query && req.query.teamId) || '').trim();
    const reqTeamNorm = reqTeam.toLowerCase();
    const isShiftTeamRequest = SHIFT_TEAM_IDS.has(reqTeamNorm);

    let teamId = myTeam;
    // Mailbox roster must stay globally aligned to the active shift.
    // Any authenticated user can request one of the canonical shift teams.
    if (isShiftTeamRequest) {
      teamId = reqTeamNorm;
    } else if (reqTeam && PRIVILEGED_ROLES.has(myRole)) {
      // Keep privileged flexibility for non-canonical team ids used by admins.
      teamId = reqTeam;
    }

    if (!teamId) return sendJson(res, 200, { ok: true, teamId: '', rows: [] });

    const q = `select=user_id,name,username,role,team_id,duty,avatar_url&team_id=eq.${encodeURIComponent(teamId)}&order=name.asc`;
    const out = await serviceSelect('mums_profiles', q);
    if (!out.ok) {
      return sendJson(res, out.status || 500, { ok: false, error: 'db_error', details: out.json || out.text });
    }

    const rows = (Array.isArray(out.json) ? out.json : []).map((r) => ({
      id: String(r.user_id || ''),
      name: String(r.name || r.username || 'N/A'),
      username: String(r.username || ''),
      role: String(r.role || 'MEMBER'),
      teamId: String(r.team_id || ''),
      duty: String(r.duty || ''),
      avatarUrl: String(r.avatar_url || ''),
      status: 'active'
    })).filter((r) => r.id);

    return sendJson(res, 200, { ok: true, teamId, rows });
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: 'server_error', message: e?.message || String(e) });
  }
};
