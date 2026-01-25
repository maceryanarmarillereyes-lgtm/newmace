/**
 * Supabase server helpers (Vercel functions)
 * - Uses SERVICE ROLE key for privileged operations.
 * - Provides a small compatibility layer for older routes.
 */

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');

async function fetchJson(url, opts) {
  const r = await fetch(url, opts);
  const text = await r.text().catch(() => '');
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) { json = null; }
  return { ok: r.ok, status: r.status, text, json, headers: r.headers, res: { ok: r.ok, status: r.status, headers: r.headers } };
}

function serviceHeaders(extra) {
  if (!SUPABASE_URL) requireEnv('SUPABASE_URL');
  if (!SUPABASE_SERVICE_ROLE_KEY) requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return Object.assign({
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
  }, (extra || {}));
}

/**
 * Compatibility helper: fetch any Supabase endpoint with the service role.
 * Path MUST start with '/'.
 */
async function serviceFetch(path, opts) {
  if (!SUPABASE_URL) requireEnv('SUPABASE_URL');
  const p = String(path || '');
  if (!p.startsWith('/')) throw new Error('serviceFetch path must start with /');
  const o = Object.assign({ method: 'GET', headers: {} }, (opts || {}));
  o.headers = serviceHeaders(o.headers);
  return fetchJson(SUPABASE_URL + p, o);
}

/**
 * Select rows using PostgREST.
 * - serviceSelect('table', 'select=*&id=eq.1')
 * - serviceSelect('/rest/v1/table?select=*')  // legacy path form
 */
async function serviceSelect(tableOrPath, queryMaybe) {
  const a = String(tableOrPath || '');
  if (a.startsWith('/')) {
    return serviceFetch(a, { method: 'GET' });
  }
  const table = a;
  const query = String(queryMaybe || 'select=*');
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  return fetchJson(url, { headers: serviceHeaders() });
}

async function serviceUpsert(table, rows, conflict) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${conflict ? `?on_conflict=${encodeURIComponent(conflict)}` : ''}`;
  return fetchJson(url, {
    method: 'POST',
    headers: serviceHeaders({
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=representation'
    }),
    body: JSON.stringify(rows)
  });
}

async function serviceInsert(table, rows) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  return fetchJson(url, {
    method: 'POST',
    headers: serviceHeaders({
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }),
    body: JSON.stringify(rows)
  });
}

async function serviceUpdate(table, matchQuery, patch) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${matchQuery}`;
  return fetchJson(url, {
    method: 'PATCH',
    headers: serviceHeaders({
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }),
    body: JSON.stringify(patch)
  });
}

async function getUserFromJwt(jwt) {
  if (!SUPABASE_URL) requireEnv('SUPABASE_URL');
  if (!SUPABASE_ANON_KEY) requireEnv('SUPABASE_ANON_KEY');
  const token = String(jwt || '').trim();
  if (!token) return null;
  const url = `${SUPABASE_URL}/auth/v1/user`;
  const out = await fetchJson(url, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`
    }
  });
  if (!out.ok) return null;
  return out.json;
}

async function getProfileForUserId(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  const out = await serviceSelect('mums_profiles', `select=*&user_id=eq.${encodeURIComponent(uid)}&limit=1`);
  if (!out.ok) return null;
  return (out.json && out.json[0]) ? out.json[0] : null;
}

module.exports = {
  serviceFetch,
  serviceHeaders,
  serviceSelect,
  serviceUpsert,
  serviceInsert,
  serviceUpdate,
  getUserFromJwt,
  getProfileForUserId
};
