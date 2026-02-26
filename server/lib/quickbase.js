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

function extractQuickbaseInfoFromLink(linkRaw) {
  const link = String(linkRaw || '').trim();
  if (!link) return { realm: '', tableId: '' };

  let realm = '';
  let tableId = '';
  try {
    const parsed = new URL(link);
    realm = String(parsed.hostname || '').trim();
  } catch (_) {}

  const dbMatch = link.match(/\/db\/([a-zA-Z0-9]+)/i);
  if (dbMatch && dbMatch[1]) {
    tableId = String(dbMatch[1]).trim();
  }

  if (!tableId) {
    const tableMatch = link.match(/\/table\/([a-zA-Z0-9]+)/i);
    if (tableMatch && tableMatch[1]) {
      tableId = String(tableMatch[1]).trim();
    }
  }

  return { realm, tableId };
}

function readQuickbaseConfig(override) {
  const envRealm = getEnv('QB_REALM') || getEnv('QUICKBASE_REALM');
  const envToken = getEnv('QB_USER_TOKEN') || getEnv('QUICKBASE_TOKEN');
  const envTableId = getEnv('QB_TABLE_ID') || getEnv('QUICKBASE_TABLE_ID');
  const envQid = getEnv('QB_QUERY_ID') || getEnv('QUICKBASE_QUERY_ID') || '-2021117';

  const o = override && typeof override === 'object' ? override : {};
  const fromLink = extractQuickbaseInfoFromLink(o.reportLink || o.qb_report_link || '');

  const realm = String(o.realm || o.qb_realm || fromLink.realm || envRealm || '').trim();
  const token = String(o.token || o.qb_token || envToken || '').trim();
  const tableId = String(o.tableId || o.qb_table_id || fromLink.tableId || envTableId || '').trim();
  const qid = String(o.queryId || o.qb_qid || envQid || '-2021117').trim() || '-2021117';

  return { realm, token, tableId, qid };
}

async function queryQuickbaseRecords(opts = {}) {
  const cfg = readQuickbaseConfig(opts.config);
  if (!cfg.realm || !cfg.token || !cfg.tableId) {
    return {
      ok: false,
      status: 500,
      error: 'quickbase_env_missing',
      message: 'Quickbase environment variables are missing.'
    };
  }

  const limit = Number(opts.limit);
  const select = Array.isArray(opts.select)
    ? Array.from(new Set(opts.select.map((id) => Number(id)).filter((id) => Number.isFinite(id))))
    : [];

  // Quickbase can return empty row payloads when no `select` fields are sent.
  // Keep a deterministic fallback to include the Case # fid.
  if (!select.length) select.push(3);

  const body = {
    from: cfg.tableId,
    select,
    queryId: cfg.qid,
    options: {
      top: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 50,
      skip: 0
    }
  };

  if (opts.where) body.where = String(opts.where);
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
  const mappedRecords = records.map((record) => {
    const src = record && typeof record === 'object' ? record : {};
    const mapped = {};
    Object.keys(src).forEach((key) => {
      const fid = String(key || '');
      if (!fid) return;
      const raw = src[fid];
      const value = (raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'value'))
        ? raw.value
        : raw;
      mapped[fid] = value == null ? '' : value;
    });
    return mapped;
  });

  return { ok: true, status: 200, records, mappedRecords };
}

async function listQuickbaseFields() {
  const cfg = readQuickbaseConfig(arguments[0] && arguments[0].config);
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
