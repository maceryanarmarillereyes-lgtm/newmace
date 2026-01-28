const {
  getUserFromJwt,
  getProfileForUserId,
  serviceSelect,
  serviceFetch,
  serviceInsert
} = require('../../lib/supabase');

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

// POST /api/users/create
// Body: { username, name, password, role, team_id|teamId, duty }
// Creator permissions:
// - SUPER_ADMIN: can create any role except SUPER_ADMIN (reserved).
// - TEAM_LEAD : can create MEMBER users (their own team only)

const ALLOWED_ROLES = new Set(['SUPER_ADMIN', 'SUPER_USER', 'ADMIN', 'TEAM_LEAD', 'MEMBER']);

function normalizeUsername(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  // If an email was provided, use the local-part as username.
  if (v.includes('@')) return v.split('@')[0].trim();
  return v;
}

function pickTeamId(body) {
  try {
    const v = (body && (body.team_id != null ? body.team_id : body.teamId)) || '';
    const s = String(v || '').trim();
    return s ? s : null;
  } catch (_) {
    return null;
  }
}

module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });

    const auth = String(req.headers.authorization || '');
    const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
    const authedUser = await getUserFromJwt(jwt);
    if (!authedUser) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    const creatorProfile = await getProfileForUserId(authedUser.id);
    if (!creatorProfile) return sendJson(res, 403, { ok: false, error: 'profile_missing' });

    const creatorRole = String(creatorProfile.role || 'MEMBER').toUpperCase();
    if (creatorRole !== 'SUPER_ADMIN' && creatorRole !== 'TEAM_LEAD') {
      return sendJson(res, 403, { ok: false, error: 'insufficient_permission' });
    }

    let body = {};
    try {
      body = await readBody(req);
    } catch (_) {
      return sendJson(res, 400, { ok: false, error: 'invalid_json' });
    }

    const username = normalizeUsername(body.username);
    const name = String(body.name || '').trim();
    const password = String(body.password || '').trim();
    const role = String(body.role || 'MEMBER').trim().toUpperCase();
    const duty = String(body.duty || '').trim();

    // Team assignment (nullable). TEAM_LEAD users are forced to their own team.
    let finalTeamId = pickTeamId(body);

    if (!username || !name || !password) {
      return sendJson(res, 400, {
        ok: false,
        error: 'missing_fields',
        message: 'username, name, and password are required.'
      });
    }

    if (!ALLOWED_ROLES.has(role)) {
      return sendJson(res, 400, { ok: false, error: 'invalid_role' });
    }

    // Endpoint policy: SUPER_ADMIN is reserved / bootstrap-only.
    if (role === 'SUPER_ADMIN') {
      return sendJson(res, 403, { ok: false, error: 'forbidden', message: 'Cannot create SUPER_ADMIN via this endpoint.' });
    }

    // TEAM_LEAD hard rules
    if (creatorRole === 'TEAM_LEAD') {
      if (role !== 'MEMBER') {
        return sendJson(res, 403, {
          ok: false,
          error: 'forbidden',
          message: 'TEAM_LEAD can only create MEMBER accounts.'
        });
      }
      if (!creatorProfile.team_id) {
        return sendJson(res, 403, { ok: false, error: 'team_lead_missing_team' });
      }
      // If provided, must match creator's team. Otherwise, default to creator team.
      if (finalTeamId && finalTeamId !== creatorProfile.team_id) {
        return sendJson(res, 403, {
          ok: false,
          error: 'team_mismatch',
          message: 'Team lead can only create users for their own team.'
        });
      }
      finalTeamId = creatorProfile.team_id;
    }

    // Preflight: prevent duplicate username in profiles.
    const existing = await serviceSelect(
      'mums_profiles',
      `select=user_id&username=eq.${encodeURIComponent(username)}&limit=1`
    );
    if (existing.ok && Array.isArray(existing.json) && existing.json[0]) {
      return sendJson(res, 409, { ok: false, error: 'username_exists' });
    }

    const domain = String(process.env.USERNAME_EMAIL_DOMAIN || 'mums.local').trim() || 'mums.local';
    const email = `${username}@${domain}`;

    // 1) Create Supabase Auth user (admin API)
    const createAuth = await serviceFetch('/auth/v1/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        email,
        password,
        email_confirm: true,
        user_metadata: { username, name }
      }
    });

    if (!createAuth.ok) {
      return sendJson(res, createAuth.status || 500, {
        ok: false,
        error: 'auth_create_failed',
        details: createAuth.json || createAuth.text
      });
    }

    const newUser = createAuth.json;

    // 2) Create profile row
    const profileRow = {
      user_id: newUser.id,
      username,
      name,
      role,
      team_id: finalTeamId,
      duty: duty || ''
    };

    const insert = await serviceInsert('mums_profiles', [profileRow]);

    if (!insert.ok) {
      // Rollback auth user to avoid orphan accounts
      try {
        await serviceFetch(`/auth/v1/admin/users/${newUser.id}`, { method: 'DELETE' });
      } catch (_) {}

      return sendJson(res, insert.status || 500, {
        ok: false,
        error: 'profile_create_failed',
        details: insert.json || insert.text
      });
    }

    return sendJson(res, 200, {
      ok: true,
      user: { id: newUser.id, email: newUser.email },
      profile: insert.json && insert.json[0] ? insert.json[0] : null
    });
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: 'server_error', message: String(e && e.message ? e.message : e) });
  }
};
