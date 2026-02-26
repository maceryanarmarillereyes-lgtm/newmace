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
  serviceInsert
} = require('../../lib/supabase');

const CREATE_LOCKS = new Map();
const COOLDOWNS = globalThis.__MUMS_CREATE_COOLDOWNS || (globalThis.__MUMS_CREATE_COOLDOWNS = {
  creators: new Map(),
  usernames: new Map()
});

const MIN_CREATOR_INTERVAL_MS = 3000;

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function isPlainObject(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function getState(map, key) {
  const k = String(key || '').trim();
  if (!k) return { cooldownUntilMs: 0, lastAttemptMs: 0, reason: '' };
  let st = map.get(k);
  if (!st || typeof st !== 'object') {
    st = { cooldownUntilMs: 0, lastAttemptMs: 0, reason: '' };
    map.set(k, st);
  }
  return st;
}

function remainingSeconds(untilMs) {
  const u = parseInt(String(untilMs || '0'), 10);
  if (!Number.isFinite(u) || u <= Date.now()) return 0;
  return Math.max(1, Math.ceil((u - Date.now()) / 1000));
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
  try { CREATE_LOCKS.delete(key); } catch (_) {}
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    try {
      if (req && typeof req.body !== 'undefined' && req.body !== null) {
        if (isPlainObject(req.body)) return resolve(req.body);
        if (typeof req.body === 'string') return resolve(req.body ? JSON.parse(req.body) : {});
      }
    } catch (_) {}

    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      const raw = String(data || '').trim();
      if (!raw) return resolve({});
      try { return resolve(JSON.parse(raw)); } catch (e) { return reject(e); }
    });
  });
}

function normalizeUsername(raw) {
  let v = String(raw || '').trim().toLowerCase();
  if (!v) return '';
  if (v.includes('@')) v = v.split('@')[0].trim();
  return v;
}

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function pickTeamId(body) {
  try {
    const raw = body && (body.team_id != null ? body.team_id : body.teamId != null ? body.teamId : body.team != null ? body.team : '');
    const s = String(raw || '').trim();
    if (!s) return null;
    const t = s.toLowerCase();
    if (t.includes('morning')) return 'morning';
    if (t === 'mid' || t.includes('mid')) return 'mid';
    if (t.includes('night')) return 'night';
    return t;
  } catch (_) {
    return null;
  }
}

function extractErrorMessage(payload) {
  if (!payload) return '';
  if (Array.isArray(payload) && payload[0]) return extractErrorMessage(payload[0]);
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'object') {
    return String(payload.message || payload.error || payload.hint || '').trim();
  }
  return '';
}

function isMissingColumn(payload, table, column) {
  if (!payload || !column) return false;
  const msg = extractErrorMessage(payload).toLowerCase();
  const code = String((payload && payload.code) || (Array.isArray(payload) && payload[0] && payload[0].code) || '').trim();
  if (code && code !== '42703') return false;
  const tbl = String(table || '').toLowerCase();
  const col = String(column || '').toLowerCase();
  return msg.includes(`column ${tbl}.${col} does not exist`) || msg.includes(`column \"${col}\" does not exist`) || msg.includes(`column ${col} does not exist`);
}

function isNotNullViolation(payload, column) {
  if (!payload || !column) return false;
  const msg = extractErrorMessage(payload).toLowerCase();
  const code = String((payload && payload.code) || (Array.isArray(payload) && payload[0] && payload[0].code) || '').trim();
  if (code && code !== '23502') return false;
  const col = String(column || '').toLowerCase();
  return msg.includes(`null value in column "${col}"`) || msg.includes(`null value in column ${col}`);
}

function generateUuid() {
  try {
    if (globalThis && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return String(globalThis.crypto.randomUUID());
    }
  } catch (_) {}
  try {
    // eslint-disable-next-line global-require
    const { randomUUID } = require('crypto');
    if (typeof randomUUID === 'function') return String(randomUUID());
  } catch (_) {}
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

// POST /api/users/create
// Invite-only create: whitelist user in public.mums_profiles only (no auth.signUp/auth admin create).
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

    const creatorKey = String(authedUser.id || 'unknown_creator');
    const creatorState = getState(COOLDOWNS.creators, creatorKey);
    const creatorRem = remainingSeconds(creatorState.cooldownUntilMs);
    if (creatorRem > 0) {
      try { res.setHeader('Retry-After', String(creatorRem)); } catch (_) {}
      return sendJson(res, 429, { ok: false, error: 'cooldown_active', message: `Please wait ${creatorRem}s before retrying.`, retry_after: creatorRem });
    }

    const now = Date.now();
    if (creatorState.lastAttemptMs && (now - creatorState.lastAttemptMs < MIN_CREATOR_INTERVAL_MS)) {
      const waitSec = Math.max(1, Math.ceil((MIN_CREATOR_INTERVAL_MS - (now - creatorState.lastAttemptMs)) / 1000));
      creatorState.cooldownUntilMs = now + (waitSec * 1000);
      creatorState.reason = 'local_min_interval';
      try { res.setHeader('Retry-After', String(waitSec)); } catch (_) {}
      return sendJson(res, 429, { ok: false, error: 'cooldown_active', message: `Please wait ${waitSec}s before retrying.`, retry_after: waitSec });
    }
    creatorState.lastAttemptMs = now;

    let body = {};
    try {
      body = await readBody(req);
    } catch (_) {
      return sendJson(res, 400, { ok: false, error: 'invalid_json' });
    }

    const email = normalizeEmail(body.email);
    const username = normalizeUsername(body.username || email);
    const fullName = String(body.full_name || body.fullName || body.name || '').trim();
    const role = String(body.role || '').trim().toUpperCase();
    const duty = String(body.duty || '').trim();
    const finalTeamId = pickTeamId(body);

    const missing = [];
    if (!email) missing.push('email');
    if (!username) missing.push('username');
    if (!fullName) missing.push('full_name');
    if (!role) missing.push('role');
    if (missing.length) return sendJson(res, 400, { ok: false, error: 'missing_fields', message: `Missing required fields: ${missing.join(', ')}`, missing });

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendJson(res, 400, { ok: false, error: 'invalid_email', message: 'Email must be a valid address (e.g., user@copeland.com).' });
    }

    if (!/^[a-z0-9._-]{3,}$/i.test(username)) {
      return sendJson(res, 400, { ok: false, error: 'invalid_username', message: 'Username must be at least 3 characters and use letters/numbers/._-' });
    }

    const allowedRoles = new Set(['SUPER_ADMIN', 'SUPER_USER', 'ADMIN', 'TEAM_LEAD', 'MEMBER']);
    if (!allowedRoles.has(role)) {
      return sendJson(res, 400, { ok: false, error: 'invalid_role', message: 'Invalid role.' });
    }

    if (creatorRole === 'TEAM_LEAD') {
      if (role !== 'MEMBER') return sendJson(res, 403, { ok: false, error: 'forbidden_role_for_team_lead' });
      const creatorTeam = String(creatorProfile.team_id || '').trim();
      const reqTeam = String(finalTeamId || '').trim();
      if (!creatorTeam || creatorTeam !== reqTeam) {
        return sendJson(res, 403, { ok: false, error: 'forbidden_team_for_team_lead' });
      }
    }

    if (role !== 'SUPER_ADMIN' && !finalTeamId) {
      return sendJson(res, 400, { ok: false, error: 'team_required', message: 'Team is required for non-super-admin users.' });
    }

    const lockKey = `invite:${username}:${email}`;
    if (!acquireLock(lockKey, 6000)) {
      return sendJson(res, 409, { ok: false, error: 'request_in_flight', message: 'A create request for this user is already in progress. Please wait and try again.' });
    }

    try {
      const existingUsername = await serviceSelect('mums_profiles', `select=user_id,username&username=eq.${encodeURIComponent(username)}&limit=1`);
      if (existingUsername.ok && Array.isArray(existingUsername.json) && existingUsername.json.length > 0) {
        return sendJson(res, 409, { ok: false, error: 'username_exists', message: 'Username is already in use.' });
      }

      let supportsEmailColumn = true;
      const existingEmail = await serviceSelect('mums_profiles', `select=user_id,email&email=eq.${encodeURIComponent(email)}&limit=1`);
      if (existingEmail.ok && Array.isArray(existingEmail.json) && existingEmail.json.length > 0) {
        return sendJson(res, 409, { ok: false, error: 'email_exists', message: 'Email is already whitelisted.' });
      }
      if (!existingEmail.ok && isMissingColumn(existingEmail.json, 'mums_profiles', 'email')) {
        supportsEmailColumn = false;
      }

      const row = {
        username,
        name: fullName,
        role,
        team_id: finalTeamId,
        duty: duty || ''
      };
      if (supportsEmailColumn) row.email = email;

      let ins = await serviceInsert('mums_profiles', [row]);
      if (!ins.ok && supportsEmailColumn && isMissingColumn(ins.json, 'mums_profiles', 'email')) {
        supportsEmailColumn = false;
        const retryRow = {
          username,
          name: fullName,
          role,
          team_id: finalTeamId,
          duty: duty || ''
        };
        ins = await serviceInsert('mums_profiles', [retryRow]);
      }

      // Backward-compat: some older databases still require user_id NOT NULL.
      // Invite-only flow whitelists users before auth account exists, so we insert a
      // temporary UUID and let auth trigger overwrite it on first successful login.
      if (!ins.ok && isNotNullViolation(ins.json, 'user_id')) {
        const retryRow = Object.assign({}, row, { user_id: generateUuid() });
        if (!supportsEmailColumn) delete retryRow.email;
        ins = await serviceInsert('mums_profiles', [retryRow]);
      }

      if (!ins.ok) {
        return sendJson(res, ins.status || 500, { ok: false, error: 'profile_create_failed', details: ins.json || ins.text });
      }

      creatorState.cooldownUntilMs = 0;
      creatorState.reason = '';

      return sendJson(res, 200, {
        ok: true,
        invite_only: true,
        schema_compat: { email: supportsEmailColumn },
        user: null,
        profile: Array.isArray(ins.json) && ins.json[0] ? ins.json[0] : null
      });
    } finally {
      releaseLock(lockKey);
    }
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: 'server_error', message: String(e && e.message ? e.message : e) });
  }
};
