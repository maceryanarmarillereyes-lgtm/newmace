function getEnv(name) {
  try {
    if (globalThis && globalThis.__MUMS_ENV && Object.prototype.hasOwnProperty.call(globalThis.__MUMS_ENV, name)) {
      const v = globalThis.__MUMS_ENV[name];
      return v == null ? '' : String(v);
    }
  } catch (_) {}
  try {
    if (typeof process !== 'undefined' && process.env && Object.prototype.hasOwnProperty.call(process.env, name)) {
      const v = process.env[name];
      return v == null ? '' : String(v);
    }
  } catch (_) {}
  return '';
}

function readQuickbaseConfig() {
  const realm = getEnv('QB_REALM') || getEnv('QUICKBASE_REALM');
  const token = getEnv('QB_USER_TOKEN') || getEnv('QUICKBASE_TOKEN');
  const tableId = getEnv('QB_TABLE_ID') || getEnv('QUICKBASE_TABLE_ID');
  return { realm, token, tableId };
}

async function queryQuickbaseRecords(opts = {}) {
  const cfg = readQuickbaseConfig();
  if (!cfg.realm || !cfg.token || !cfg.tableId) {
    return {
      ok: false,
      status: 500,
      error: 'quickbase_env_missing',
      message: 'Quickbase environment variables are missing.'
    };
  }

  const limit = Number(opts.limit);
  const body = {
    from: cfg.tableId,
    options: {
      top: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 50,
      skip: 0
    }
  };

  if (opts.where) body.where = String(opts.where);

  const response = await fetch('https://api.quickbase.com/v1/records/query', {
    method: 'POST',
    headers: {
      'QB-Realm-Hostname': cfg.realm,
      Authorization: `QB-USER-TOKEN ${cfg.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const rawText = await response.text();
  let json;
  try { json = rawText ? JSON.parse(rawText) : {}; } catch (_) { json = {}; }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status || 502,
      error: 'quickbase_query_failed',
      message: json.message || `Quickbase query failed with status ${response.status}`
    };
  }

  const records = Array.isArray(json.data) ? json.data : [];
  return { ok: true, status: 200, records };
}

module.exports = {
  queryQuickbaseRecords
};
