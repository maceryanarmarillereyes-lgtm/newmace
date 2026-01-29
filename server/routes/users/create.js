const {
  getUserFromJwt,
  getProfileForUserId,
  serviceSelect,
  serviceFetch,
  serviceInsert,
  serviceUpsert
} = require('../../lib/supabase');

// Best-effort in-memory lock to reduce accidental double-submits on warm instances.
// NOTE: This is not a distributed lock; multiple serverless instances can still race.
const CREATE_LOCKS = new Map(); // key -> { ts }

function cleanupLocks(ttlMs) {
  const now = Date.now();
  for (const [k, v] of CREATE_LOCKS.entries()) {
    if (!v || !v.ts || now - v.ts > ttlMs) CREATE_LOCKS.delete(k);
  }
}

function acquireLock(key, ttlMs) {
  cleanupLocks(ttlMs);
  const now = Date.now();
  const v = CREATE_LOCKS.get(key);
  if (v && now - v.ts < ttlMs) return false;
  CREATE_LOCKS.set(key, { ts: now });
  return true;
}

function releaseLock(key) {
  try {
    CREATE_LOCKS.delete(key);
  } catch (_) {}
}

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function isPlainObject(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function isMissingColumn(resp, columnName) {
  const needle1 = `column "${columnName}" does not exist`;
  const needle2 = `column ${columnName} does not exist`;
  const txt = String((resp && (resp.text || '')) || '');
  const j = resp && resp.json ? resp.json : null;
  const hay = (s) => String(s || '').toLowerCase();
  const n1 = needle1.toLowerCase();
  const n2 = needle2.toLowerCase();

  if (j && typeof j === 'object') {
    const code = String(j.code || '');
    const msg = hay(j.message || j.error);
    const details = hay(j.details);
    if (code === '42703' && (msg.includes(n1) || msg.includes(n2) || details.includes(n1) || details.includes(n2))) return true;
    if (msg.includes(n1) || msg.includes(n2) || details.includes(n1) || details.includes(n2)) return true;
  }

  const t = hay(txt);
  return t.includes(n1) || t.includes(n2);
}

/**
 * Robust JSON body reader.
 * - Supports Vercel/Express-style `req.body` (object or string).
 * - Falls back to reading the raw stream.
 * - Supports urlencoded forms as a fallback.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    try {
      if (req && typeof req.body !== 'undefined' && req.body !== null) {
        if (isPlainObject(req.body)) return resolve(req.body);
        if (typeof req.body === 'string') {
          try {
            return resolve(req.body ? JSON.parse(req.body) : {});
          } catch (e) {
            return reject(e);
          }
        }
      }
    } catch (_) {}

    let data = '';
    req.on('data', (c) => {
      data += c;
    });
    req.on('end', () => {
      const raw = String(data || '').trim();
      if (!raw) return resolve({});

      const ct = String(req.headers['content-type'] || '').toLowerCase();

      if (!ct || ct.includes('application/json')) {
        try {
          return resolve(JSON.parse(raw));
        } catch (e) {
          return reject(e);
        }
      }

      if (ct.includes('application/x-www-form-urlencoded')) {
        try {
          const params = new URLSearchParams(raw);
          const obj = {};
          for (const [k, v] of params.entries()) obj[k] = v;
          return resolve(obj);
        } catch (e) {
          return reject(e);
        }
      }

      try {
        return resolve(JSON.parse(raw));
      } catch (e) {
        return reject(e);
      }
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
  let v = String(raw || '').trim();
  if (!v) return '';
  // If an email was provided, use the local-part as username.
  if (v.includes('@')) v = v.split('@')[0].trim();
  return v.toLowerCase();
}

function pickTeamId(body) {
  try {
    const raw =
      (body &&
        (body.team_id != null
          ? body.team_id
          : body.teamId != null
            ? body.teamId
            : body.team != null
              ? body.team
              : '')) ||
      '';
    const s = String(raw || '').trim();
    if (!s) return null;

    const t = s.toLowerCase();
    // Accept labels as well as ids.
    if (t.includes('morning')) return 'morning';
    if (t === 'mid' || t.includes('mid')) return 'mid';
    if (t.includes('night')) return 'night';

    return t; // may be validated later
  } catch (_) {
    return null;
  }
}

function safeMsgFromSupabase(resp) {
  const j = resp && resp.json ? resp.json : null;
  if (j && typeof j === 'object') {
    return (
      j.message ||
      j.msg ||
      j.error_description ||
      j.error ||
      (j.details ? String(j.details) : '')
    );
  }
  return String((resp && resp.text) || '').trim();
}

async function writeProfile(row) {
  if (typeof serviceUpsert === 'function') {
    return serviceUpsert('mums_profiles', [row], 'user_id');
  }
  return serviceInsert('mums_profiles', [row]);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  try {
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

    const rawEmail = String(body.email || '').trim().toLowerCase();
    const rawRole = body.role;

    const username = normalizeUsername(body.username || rawEmail);
    const full_name = String(body.full_name || body.fullName || body.name || '').trim();
    const password = String(body.password || '').trim();
    const role = String(rawRole || '').trim().toUpperCase();
    const duty = String(body.duty || '').trim();

    // Required fields validation
    const missing = [];
    if (!rawEmail) missing.push('email');
    if (!username) missing.push('username');
    if (!full_name) missing.push('full_name');
    if (!password) missing.push('password');
    if (!role) missing.push('role');

    if (missing.length) {
      return sendJson(res, 400, {
        ok: false,
        error: 'missing_fields',
        message: `Missing required fields: ${missing.join(', ')}`,
        missing
      });
    }

    // Basic email validation (client supplies email, but we also verify format).
    const email = rawEmail;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      return sendJson(res, 400, {
        ok: false,
        error: 'invalid_email',
        message: 'Email must be a valid address (e.g., username@example.com).'
      });
    }

    const name = full_name;

    // Team assignment (nullable). TEAM_LEAD users are forced to their own team.
    let finalTeamId = pickTeamId(body);

    const teamFieldPresent =
      Object.prototype.hasOwnProperty.call(body, 'team_id') ||
      Object.prototype.hasOwnProperty.call(body, 'teamId') ||
      Object.prototype.hasOwnProperty.call(body, 'team');

    const allowedTeams = new Set(['morning', 'mid', 'night']);

    // Require explicit team selection for new users (matches frontend).
    if (!teamFieldPresent) {
      return sendJson(res, 400, {
        ok: false,
        error: 'missing_fields',
        message: 'Missing required fields: team_id',
        missing: ['team_id']
      });
    }

    // Developer Access (empty team) is reserved for Super Admin.
    if (!finalTeamId || String(finalTeamId).trim() === '') {
      return sendJson(res, 400, {
        ok: false,
        error: 'invalid_team',
        message: 'Developer Access is reserved for Super Admin. Choose Morning/Mid/Night shift.'
      });
    }

    if (!username || !name || !password) {
      return sendJson(res, 400, {
        ok: false,
        error: 'missing_fields',
        message: 'username, name, and password are required.'
      });
    }

    if (!ALLOWED_ROLES.has(role)) {
      return sendJson(res, 400, { ok: false, error: 'invalid_role', message: 'Role is not allowed for this system.' });
    }

    // Endpoint policy: SUPER_ADMIN is reserved / bootstrap-only.
    if (role === 'SUPER_ADMIN') {
      return sendJson(res, 403, {
        ok: false,
        error: 'forbidden',
        message: 'Cannot create SUPER_ADMIN via this endpoint.'
      });
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

    // Enforce team assignment for all non-SUPER_ADMIN roles.
    if (teamFieldPresent && (!finalTeamId || String(finalTeamId).trim() === '')) {
      return sendJson(res, 400, {
        ok: false,
        error: 'invalid_team',
        message: 'Developer Access is reserved for Super Admin. Choose Morning/Mid/Night shift.'
      });
    }

    if (!allowedTeams.has(String(finalTeamId))) {
      return sendJson(res, 400, {
        ok: false,
        error: 'invalid_team',
        message: 'Team must be one of: morning, mid, night.'
      });
    }

    // Preflight: prevent duplicate username in profiles.
    const existing = await serviceSelect(
      'mums_profiles',
      `select=user_id&username=eq.${encodeURIComponent(username)}&limit=1`
    );
    if (existing.ok && Array.isArray(existing.json) && existing.json[0]) {
      return sendJson(res, 409, { ok: false, error: 'username_exists', message: 'Username already exists.' });
    }

    // Best-effort lock to reduce accidental double-create via UI retries.
    const lockKey = `create:${username}`;
    if (!acquireLock(lockKey, 6000)) {
      return sendJson(res, 409, {
        ok: false,
        error: 'request_in_flight',
        message: 'A create request for this username is already in progress. Please wait and try again.'
      });
    }

    // Email is provided by the client and validated above.

    let newUserId = '';

    try {
      // 1) Create Supabase Auth user via Admin API (service role).
      // This avoids public sign-up rate limits and matches a Super Admin provisioning flow.
      const createUser = await serviceFetch('/auth/v1/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          email,
          password,
          email_confirm: true,
          user_metadata: { username, name, full_name: name, role, team_id: finalTeamId, duty },
          app_metadata: { role }
        }
      });

      if (!createUser.ok) {
        const rawMsg = safeMsgFromSupabase(createUser);
        const status = createUser.status || 500;

        // Propagate upstream retry hints when available.
        // Supabase Auth may include `retry-after` and/or rate limit headers.
        let retryAfter = '';
        try {
          const ra = createUser && createUser.headers && typeof createUser.headers.get === 'function'
            ? createUser.headers.get('retry-after')
            : '';
          retryAfter = String(ra || '').trim();
        } catch (_) {
          retryAfter = '';
        }

        // Default message with a small amount of classification.
        let message = rawMsg || `Failed to create auth user (${status}).`;
        if (status === 429) {
          message = 'Rate limited by the authentication provider. Wait briefly and retry.';

          // Provide a conservative default if upstream didn't provide one.
          if (!retryAfter) retryAfter = '10';
          try { res.setHeader('Retry-After', retryAfter); } catch (_) {}
        }

        return sendJson(res, status, {
          ok: false,
          error: 'auth_admin_create_failed',
          message,
          retry_after: retryAfter || undefined,
          upstream: 'supabase_auth_admin',
          details: createUser.json || createUser.text
        });
      }

      const userObj = (createUser.json && (createUser.json.user || createUser.json)) || null;
      newUserId = userObj && userObj.id ? String(userObj.id) : '';

      if (!newUserId) {
        return sendJson(res, 500, {
          ok: false,
          error: 'auth_admin_no_user',
          message: 'Auth admin endpoint returned no user id.',
          details: createUser.json || createUser.text
        });
      }

      // 2) Create/Upsert profile row (authoritative local directory record)
      const profileRow = {
        user_id: newUserId,
        username,
        name,
        // Persist email in profiles for directory UX + future uniqueness constraints (if column exists).
        email: String(email || '').trim().toLowerCase() || null,
        role,
        team_id: finalTeamId,
        duty: duty || ''
      };

      // Prefer UPSERT on user_id to make the endpoint idempotent if the profile row already exists.
      let up = await writeProfile(profileRow);

      // Back-compat: if mums_profiles.email doesn't exist yet, retry without it.
      if (!up.ok && isMissingColumn(up, 'email')) {
        const row2 = Object.assign({}, profileRow);
        delete row2.email;
        up = await writeProfile(row2);
      }

      if (!up.ok) {
        // Rollback auth user to avoid orphan accounts.
        try {
          await serviceFetch(`/auth/v1/admin/users/${newUserId}`, { method: 'DELETE' });
        } catch (_) {}

        return sendJson(res, up.status || 500, {
          ok: false,
          error: 'profile_create_failed',
          message: safeMsgFromSupabase(up) || 'Failed to create profile row.',
          details: up.json || up.text
        });
      }

      return sendJson(res, 200, {
        ok: true,
        user: { id: newUserId, email },
        profile: up.json && up.json[0] ? up.json[0] : null
      });
    } finally {
      releaseLock(lockKey);
    }
  } catch (e) {
    return sendJson(res, 500, {
      ok: false,
      error: 'server_error',
      message: String(e && e.message ? e.message : e)
    });
  }
};
