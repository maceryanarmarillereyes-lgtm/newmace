// ===== CODE UNTOUCHABLES =====
// Do NOT remove duplicate suppression logic.
// Do NOT bypass cooldown handling.
// These are permanent safeguards against Supabase 429 errors.
// Exception: Only change if required by Supabase API updates
// or documented behavior changes.
// ==============================

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

// Best-effort in-memory cooldown/backoff for 429 mitigation.
// NOTE: This is not distributed; each warm serverless instance has its own memory.
const COOLDOWNS = globalThis.__MUMS_CREATE_COOLDOWNS || (globalThis.__MUMS_CREATE_COOLDOWNS = {
  creators: new Map(), // creatorKey -> { cooldownUntilMs, lastAttemptMs, backoffCount, reason }
  usernames: new Map() // username -> { cooldownUntilMs, backoffCount, reason }
});

const MIN_CREATOR_INTERVAL_MS = parseInt(process.env.CREATE_USER_CREATOR_COOLDOWN_MS || '5000', 10);
const BASE_BACKOFF_SECONDS = parseInt(process.env.CREATE_USER_BASE_BACKOFF_SECONDS || '5', 10);
const MAX_BACKOFF_SECONDS = parseInt(process.env.CREATE_USER_MAX_BACKOFF_SECONDS || '120', 10);

function getState(map, key) {
  const k = String(key || '').trim();
  if (!k) return { cooldownUntilMs: 0, lastAttemptMs: 0, backoffCount: 0, reason: '' };
  let st = map.get(k);
  if (!st || typeof st !== 'object') {
    st = { cooldownUntilMs: 0, lastAttemptMs: 0, backoffCount: 0, reason: '' };
    map.set(k, st);
  }
  return st;
}

function remainingSeconds(untilMs) {
  const u = parseInt(String(untilMs || '0'), 10);
  if (!Number.isFinite(u) || u <= Date.now()) return 0;
  return Math.max(1, Math.ceil((u - Date.now()) / 1000));
}

function parseRetryAfterSeconds(v) {
  const raw = String(v || '').trim();
  if (!raw) return 0;
  // Retry-After can be delta-seconds or an HTTP date.
  if (/^\d+$/.test(raw)) return Math.max(0, parseInt(raw, 10));
  const t = Date.parse(raw);
  if (Number.isFinite(t)) {
    const s = Math.ceil((t - Date.now()) / 1000);
    return s > 0 ? s : 0;
  }
  return 0;
}

function computeBackoffSeconds(nextCount) {
  const c = Math.max(1, parseInt(String(nextCount || '1'), 10));
  const exp = Math.min(5, c - 1); // cap exponent
  const base = Math.max(1, BASE_BACKOFF_SECONDS);
  const max = Math.max(base, MAX_BACKOFF_SECONDS);
  // Add a small jitter (0-3s) to reduce thundering herd.
  const jitter = Math.floor(Math.random() * 4);
  return Math.min(max, base * Math.pow(2, exp) + jitter);
}

function decodeJwtSub(jwt) {
  try {
    const parts = String(jwt || '').split('.');
    if (parts.length < 2) return '';
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
<<<<<<< HEAD
    const payloadB64 = b64 + pad;

    // Decode without depending on Node-only Buffer (Cloudflare-compatible).
    let json = '';
    try {
      if (typeof Buffer !== 'undefined') {
        json = Buffer.from(payloadB64, 'base64').toString('utf8');
      }
    } catch (_) {}
    if (!json) {
      // atob exists in Workers and in Node 20+.
      const bin = (typeof atob === 'function') ? atob(payloadB64) : '';
      // atob returns a binary string; convert to UTF-8 safe string.
      // JWT payload is ASCII/UTF-8 JSON; this direct conversion is sufficient.
      json = bin;
    }
=======
    const json = Buffer.from(b64 + pad, 'base64').toString('utf8');
>>>>>>> 6d0188b85578d391a5251805aa5311d13aaacb9b
    const obj = JSON.parse(json);
    return String(obj && (obj.sub || obj.user_id || obj.uid) ? (obj.sub || obj.user_id || obj.uid) : '').trim();
  } catch (_) {
    return '';
  }
}

function getClientIp(req) {
  const xf = String((req && req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '').trim();
  if (xf) return xf.split(',')[0].trim();
  try {
    return String((req && req.socket && req.socket.remoteAddress) || '').trim();
  } catch (_) {
    return '';
  }
}

function pickCreatorKey(req, authedUser, jwt) {
  const id = authedUser && authedUser.id ? String(authedUser.id).trim() : '';
  if (id) return id;
  const sub = decodeJwtSub(jwt);
  if (sub) return sub;
  const ip = getClientIp(req);
  return ip || 'unknown_creator';
}

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

    // Local throttling / cooldown guard to avoid hammering Supabase Auth.
    const creatorKey = pickCreatorKey(req, authedUser, jwt);
    const creatorState = getState(COOLDOWNS.creators, creatorKey);
    {
      const rem = remainingSeconds(creatorState.cooldownUntilMs);
      if (rem > 0) {
        try { res.setHeader('Retry-After', String(rem)); } catch (_) {}
        return sendJson(res, 429, {
          ok: false,
          error: 'cooldown_active',
          message: `Please wait ${rem}s before retrying.`,
          retry_after: rem,
          retry_after_source: creatorState.reason || 'local',
          upstream: 'local_guard',
          upstream_status: 429
        });
      }

      const now = Date.now();
      if (creatorState.lastAttemptMs && now - creatorState.lastAttemptMs < MIN_CREATOR_INTERVAL_MS) {
        const waitSec = Math.max(1, Math.ceil((MIN_CREATOR_INTERVAL_MS - (now - creatorState.lastAttemptMs)) / 1000));
        creatorState.cooldownUntilMs = now + waitSec * 1000;
        creatorState.reason = 'local_min_interval';
        try { res.setHeader('Retry-After', String(waitSec)); } catch (_) {}
        return sendJson(res, 429, {
          ok: false,
          error: 'cooldown_active',
          message: `Please wait ${waitSec}s before retrying.`,
          retry_after: waitSec,
          retry_after_source: 'local_min_interval',
          upstream: 'local_guard',
          upstream_status: 429
        });
      }

      // Record attempt time regardless of outcome (prevents rapid resubmits of invalid payloads).
      creatorState.lastAttemptMs = now;
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

    // Username-scoped cooldown: if this username was recently rate-limited, block retries briefly.
    const usernameState = getState(COOLDOWNS.usernames, username);
    {
      const rem = remainingSeconds(usernameState.cooldownUntilMs);
      if (rem > 0) {
        try { res.setHeader('Retry-After', String(rem)); } catch (_) {}
        return sendJson(res, 429, {
          ok: false,
          error: 'cooldown_active',
          message: `Please wait ${rem}s before retrying this user creation.`,
          retry_after: rem,
          retry_after_source: usernameState.reason || 'local',
          upstream: 'local_guard',
          upstream_status: 429
        });
      }
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

    // Preflight: prevent duplicate email in profiles (if column exists).
    // This reduces unnecessary Auth Admin calls when the user already exists in the directory.
    let existingEmail = null;
    try {
      const q = `select=user_id&email=eq.${encodeURIComponent(email)}&limit=1`;
      existingEmail = await serviceSelect('mums_profiles', q);
      if (existingEmail && !existingEmail.ok && isMissingColumn(existingEmail, 'email')) {
        existingEmail = null; // ignore if schema doesn't yet have email
      }
    } catch (_) {
      existingEmail = null;
    }

    if (existingEmail && existingEmail.ok && Array.isArray(existingEmail.json) && existingEmail.json[0]) {
      return sendJson(res, 409, { ok: false, error: 'email_exists', message: 'Email already exists.' });
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

        // Capture upstream retry hints when available.
        let upstreamRetryAfterRaw = '';
        try {
          upstreamRetryAfterRaw = createUser && createUser.headers && typeof createUser.headers.get === 'function'
            ? String(createUser.headers.get('retry-after') || '').trim()
            : '';
        } catch (_) {
          upstreamRetryAfterRaw = '';
        }

        let retryAfterSeconds = parseRetryAfterSeconds(upstreamRetryAfterRaw);
        let retryAfterSource = retryAfterSeconds > 0 ? 'upstream' : '';

        // Default message with a small amount of classification.
        let message = rawMsg || `Failed to create auth user (${status}).`;

        if (status === 429) {
          message = 'Rate limited by the authentication provider. Wait briefly and retry.';

          // If upstream didn't provide a window, use exponential backoff.
          if (!retryAfterSeconds) {
            const nextCreatorCount = (creatorState.backoffCount || 0) + 1;
            const nextUserCount = (usernameState.backoffCount || 0) + 1;
            retryAfterSeconds = computeBackoffSeconds(Math.max(nextCreatorCount, nextUserCount));
            retryAfterSource = 'fallback';
          }

          // Apply cooldown for both the creator and the target username to suppress rapid retries.
          try {
            const until = Date.now() + retryAfterSeconds * 1000;
            creatorState.cooldownUntilMs = Math.max(creatorState.cooldownUntilMs || 0, until);
            creatorState.backoffCount = (creatorState.backoffCount || 0) + 1;
            creatorState.reason = `upstream_429:${retryAfterSource}`;

            usernameState.cooldownUntilMs = Math.max(usernameState.cooldownUntilMs || 0, until);
            usernameState.backoffCount = (usernameState.backoffCount || 0) + 1;
            usernameState.reason = `upstream_429:${retryAfterSource}`;
          } catch (_) {}

          try { res.setHeader('Retry-After', String(retryAfterSeconds)); } catch (_) {}
        }

        return sendJson(res, status, {
          ok: false,
          error: 'auth_admin_create_failed',
          message,
          retry_after: retryAfterSeconds || undefined,
          retry_after_source: retryAfterSource || undefined,
          upstream: 'supabase_auth_admin',
          upstream_status: status,
          upstream_retry_after: upstreamRetryAfterRaw || undefined,
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

      // Successful create: reset backoff counters for the creator and username.
      try {
        creatorState.backoffCount = 0;
        creatorState.reason = '';
        // Keep lastAttemptMs for min-interval enforcement, but clear any active cooldown.
        creatorState.cooldownUntilMs = 0;

        usernameState.backoffCount = 0;
        usernameState.reason = '';
        usernameState.cooldownUntilMs = 0;
      } catch (_) {}

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
