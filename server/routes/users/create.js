const {
  getUserFromJwt,
  getProfileForUserId,
  serviceSelect,
  serviceFetch,
  serviceInsert,
  serviceUpsert
} = require('../../lib/supabase');

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function isPlainObject(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function normalizePathBase(url) {
  return String(url || '').replace(/\/$/, '');
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
 * - Supports urlencoded forms as a fallback (useful for misconfigured clients).
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    try {
      if (req && typeof req.body !== 'undefined' && req.body !== null) {
        if (isPlainObject(req.body)) return resolve(req.body);
        if (typeof req.body === 'string') {
          try { return resolve(req.body ? JSON.parse(req.body) : {}); } catch (e) { return reject(e); }
        }
      }
    } catch (_) {}

    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      const raw = String(data || '').trim();
      if (!raw) return resolve({});

      const ct = String(req.headers['content-type'] || '').toLowerCase();
      // JSON (default)
      if (!ct || ct.includes('application/json')) {
        try { return resolve(JSON.parse(raw)); } catch (e) { return reject(e); }
      }

      // urlencoded fallback
      if (ct.includes('application/x-www-form-urlencoded')) {
        try {
          const params = new URLSearchParams(raw);
          const obj = {};
          for (const [k, v] of params.entries()) obj[k] = v;
          return resolve(obj);
        } catch (e) { return reject(e); }
      }

      // Last resort: attempt JSON parse
      try { return resolve(JSON.parse(raw)); } catch (e) { return reject(e); }
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
  // Canonicalize for auth/email consistency (prevents case-sensitivity surprises).
  return v.toLowerCase();
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

async function anonFetchJson(path, opts) {
  const SUPABASE_URL = normalizePathBase(process.env.SUPABASE_URL);
  const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || '');

  if (!SUPABASE_URL) throw new Error('Missing env: SUPABASE_URL');
  if (!SUPABASE_ANON_KEY) throw new Error('Missing env: SUPABASE_ANON_KEY');

  const p = String(path || '');
  if (!p.startsWith('/')) throw new Error('anonFetchJson path must start with /');

  const o = Object.assign({ method: 'GET', headers: {} }, opts || {});
  const headers = Object.assign({}, o.headers || {});
  headers.apikey = SUPABASE_ANON_KEY;
  // Mirror supabase-js default behavior.
  headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/json';

  let body = o.body;
  if (isPlainObject(body) || Array.isArray(body)) body = JSON.stringify(body);

  const r = await fetch(SUPABASE_URL + p, { method: o.method, headers, body });
  const text = await r.text().catch(() => '');
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) { json = null; }

  return { ok: r.ok, status: r.status, text, json };
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
    const email = `${username}@${domain}`.toLowerCase();

    // 1) Create Supabase Auth user using the public sign-up API (equivalent to supabase.auth.signUp()).
    // This ensures password grant behaves as expected across different GoTrue configurations.
    const signUp = await anonFetchJson('/auth/v1/signup', {
      method: 'POST',
      body: { email, password, data: { username, name } }
    });

    if (!signUp.ok) {
      return sendJson(res, signUp.status || 500, {
        ok: false,
        error: 'auth_signup_failed',
        details: signUp.json || signUp.text
      });
    }

    const userObj = (signUp.json && (signUp.json.user || signUp.json)) || null;
    const newUserId = userObj && userObj.id ? String(userObj.id) : '';

    if (!newUserId) {
      return sendJson(res, 500, { ok: false, error: 'auth_signup_no_user', details: signUp.json || signUp.text });
    }

    // 2) Auto-confirm email (so new users can log in immediately).
    // If confirmation is already automatic, this is a harmless no-op.
    try {
      await serviceFetch(`/auth/v1/admin/users/${newUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: { email_confirm: true }
      });
    } catch (_) {}

    // 3) Create/Upsert profile row (authoritative local directory record)
    
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

async function writeProfile(row) {
  if (typeof serviceUpsert === 'function') {
    return serviceUpsert('mums_profiles', [row], 'user_id');
  }
  return serviceInsert('mums_profiles', [row]);
}

// Prefer UPSERT on user_id to make the endpoint idempotent if the profile row already exists.
let up = await writeProfile(profileRow);

// Back-compat: if mums_profiles.email doesn't exist yet, retry without it.
if (!up.ok && isMissingColumn(up, 'email')) {
  const row2 = Object.assign({}, profileRow);
  delete row2.email;
  up = await writeProfile(row2);
}

if (!up.ok) {

      // Rollback auth user to avoid orphan accounts
      try {
        await serviceFetch(`/auth/v1/admin/users/${newUserId}`, { method: 'DELETE' });
      } catch (_) {}

      return sendJson(res, up.status || 500, {
        ok: false,
        error: 'profile_create_failed',
        details: up.json || up.text
      });
    }

    return sendJson(res, 200, {
      ok: true,
      user: { id: newUserId, email },
      profile: up.json && up.json[0] ? up.json[0] : null
    });
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: 'server_error', message: String(e && e.message ? e.message : e) });
  }
};
