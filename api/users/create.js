const {
  getUserFromJwt,
  getProfileForUserId,
  serviceSelect,
  serviceFetch,
  serviceInsert
} = require('../_supabase');

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// POST /api/users/create
// Body: { username, name, password, role, team_id, duty }
// Creator permissions:
// - SUPER_ADMIN: can create any role
// - TEAM_LEAD : can create MEMBER users (their own team only)

const ALLOWED_ROLES = new Set(['SUPER_ADMIN', 'SUPER_USER', 'ADMIN', 'TEAM_LEAD', 'MEMBER']);

function parseBody(req) {
  try {
    if (!req || req.body == null) return {};
    if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
    return req.body || {};
  } catch (_) {
    return {};
  }
}

function normalizeUsername(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  // If an email was provided, use the local-part as username.
  if (v.includes('@')) return v.split('@')[0].trim();
  return v;
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

    const body = parseBody(req);

    const username = normalizeUsername(body.username);
    const name = String(body.name || '').trim();
    const password = String(body.password || '').trim();
    const role = String(body.role || 'MEMBER').trim().toUpperCase();
    const team_id = String(body.team_id || '').trim();
    const duty = String(body.duty || '').trim();

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
      if (team_id && team_id !== creatorProfile.team_id) {
        return sendJson(res, 403, {
          ok: false,
          error: 'team_mismatch',
          message: 'Team lead can only create users for their own team.'
        });
      }
    }

    // Team assignment is allowed for all roles; SUPER_ADMIN cannot be created via this endpoint.
    const finalTeamId = String(body.teamId || '').trim() || null;

    // Preflight: prevent duplicate username in profiles.
    const existing = await serviceSelect(
      'mums_profiles',
      `select=user_id&username=eq.${encodeURIComponent(username)}&limit=1`
    );
    if (existing.ok && Array.isArray(existing.json) && existing.json[0]) {
      return sendJson(res, 409, { ok: false, error: 'username_exists' });
    }

    const domain = String(process.env.USERNAME_EMAIL_DOMAIN || 'mums.local').trim();
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
    return sendJson(res, 500, { ok: false, error: 'server_error', message: String(e?.message || e) });
  }
};
