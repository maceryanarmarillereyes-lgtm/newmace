// Shared Supabase helpers for Vercel serverless routes.
// IMPORTANT: Do NOT expose SUPABASE_SERVICE_ROLE_KEY to the client.

const fetchJson = async (url, opts) => {
  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text };
  }
  return { res, json, text };
};

function assertEnv() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    const missing = [
      !SUPABASE_URL ? 'SUPABASE_URL' : null,
      !SUPABASE_ANON_KEY ? 'SUPABASE_ANON_KEY' : null,
      !SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY' : null,
    ].filter(Boolean);
    const err = new Error(`Missing required env vars: ${missing.join(', ')}`);
    err.code = 'missing_env';
    throw err;
  }
  return { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY };
}

async function getUserFromJwt(jwt) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = assertEnv();
  if (!jwt) return null;
  const { res, json } = await fetchJson(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${jwt}`,
    },
  });
  if (!res.ok) return null;
  return json;
}

async function serviceSelect(table, query, opts = {}) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = assertEnv();
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const { res, json, text } = await fetchJson(url, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...opts.headers,
    },
  });
  if (!res.ok) {
    const err = new Error(`Supabase select failed: ${res.status} ${text}`);
    err.status = res.status;
    err.details = json;
    throw err;
  }
  return json;
}

async function serviceUpsert(table, rows, opts = {}) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = assertEnv();
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const { res, json, text } = await fetchJson(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const err = new Error(`Supabase upsert failed: ${res.status} ${text}`);
    err.status = res.status;
    err.details = json;
    throw err;
  }
  return json;
}

async function serviceInsert(table, rows, opts = {}) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = assertEnv();
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const { res, json, text } = await fetchJson(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const err = new Error(`Supabase insert failed: ${res.status} ${text}`);
    err.status = res.status;
    err.details = json;
    throw err;
  }
  return json;
}

async function serviceUpdate(table, query, patch) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = assertEnv();
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const { res, json, text } = await fetchJson(url, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = new Error(`Supabase update failed: ${res.status} ${text}`);
    err.status = res.status;
    err.details = json;
    throw err;
  }
  return json;
}

async function serviceCreateAuthUser({ email, password, metadata }) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = assertEnv();
  const { res, json, text } = await fetchJson(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: metadata || {} }),
  });
  if (!res.ok) {
    const err = new Error(`Supabase auth create user failed: ${res.status} ${text}`);
    err.status = res.status;
    err.details = json;
    throw err;
  }
  return json;
}

module.exports = {
  assertEnv,
  getUserFromJwt,
  serviceSelect,
  serviceUpsert,
  serviceInsert,
  serviceUpdate,
  serviceCreateAuthUser,
};
