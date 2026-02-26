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
  if (Array.isArray(opts.select) && opts.select.length) {
    body.select = opts.select.map((id) => Number(id)).filter((id) => Number.isFinite(id));
  }
  if (Array.isArray(opts.sortBy) && opts.sortBy.length) {
    body.sortBy = opts.sortBy
      .map((entry) => ({
        fieldId: Number(entry && entry.fieldId),
        order: String(entry && entry.order || '').toUpperCase() === 'DESC' ? 'DESC' : 'ASC'
      }))
      .filter((entry) => Number.isFinite(entry.fieldId));
  }

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

async function listQuickbaseFields() {
  const cfg = readQuickbaseConfig();
  if (!cfg.realm || !cfg.token || !cfg.tableId) {
    return {
      ok: false,
      status: 500,
      error: 'quickbase_env_missing',
      message: 'Quickbase environment variables are missing.'
    };
  }

  const url = `https://api.quickbase.com/v1/fields?tableId=${encodeURIComponent(cfg.tableId)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'QB-Realm-Hostname': cfg.realm,
      Authorization: `QB-USER-TOKEN ${cfg.token}`,
      'Content-Type': 'application/json'
    }
  });

  const rawText = await response.text();
  let json;
  try { json = rawText ? JSON.parse(rawText) : {}; } catch (_) { json = {}; }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status || 502,
      error: 'quickbase_fields_failed',
      message: json.message || `Quickbase fields lookup failed with status ${response.status}`
    };
  }

  const fields = Array.isArray(json) ? json : (Array.isArray(json.fields) ? json.fields : []);
  return { ok: true, status: 200, fields };
}

module.exports = {
  queryQuickbaseRecords,
  listQuickbaseFields
};
