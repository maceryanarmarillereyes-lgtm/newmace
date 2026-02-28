/* @AI_CRITICAL_GUARD: UNTOUCHABLE ZONE. Do not modify existing UI/UX, layouts, or core logic in this file without explicitly asking Thunter BOY for clearance. If changes are required here, STOP and provide a RISK IMPACT REPORT first. */
const { getUserFromJwt, getProfileForUserId, serviceUpdate, serviceSelect } = require('../../lib/supabase');
const { normalizeFilters } = require('../../lib/quickbase-utils');
const { escapeQuickbaseValue } = require('../../lib/escape');
const { ensureQuickbaseSettingsColumn } = require('../../startup/schema-check');

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    try {
      if (req && typeof req.body !== 'undefined' && req.body !== null) {
        if (typeof req.body === 'object' && !Array.isArray(req.body)) return resolve(req.body);
        if (typeof req.body === 'string') {
          try { return resolve(req.body ? JSON.parse(req.body) : {}); } catch (e) { return reject(e); }
        }
      }
    } catch (_) {}

    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
  });
}


function normalizeQuickbaseOperator(value) {
  const key = String(value == null ? 'EX' : value).trim().toUpperCase();
  const mapped = {
    'IS EQUAL TO': 'EX',
    'IS (EXACT)': 'EX',
    EX: 'EX',
    '=': 'EX',
    'IS NOT': 'XEX',
    'NOT EQUAL TO': 'XEX',
    'IS NOT EQUAL TO': 'XEX',
    XEX: 'XEX',
    '!=': 'XEX',
    '<>': 'XEX',
    CONTAINS: 'CT',
    CT: 'CT',
    'DOES NOT CONTAIN': 'XCT',
    XCT: 'XCT'
  };
  return mapped[key] || key || 'EX';
}


function parseQuickbaseConfigInput(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function normalizeQuickbaseConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const customColumns = Array.isArray(src.customColumns || src.qb_custom_columns)
    ? (src.customColumns || src.qb_custom_columns)
        .map((v) => String(v == null ? '' : v).trim())
        .filter(Boolean)
        .slice(0, 200)
    : [];
  const customFilters = Array.isArray(src.customFilters || src.qb_custom_filters)
    ? (src.customFilters || src.qb_custom_filters)
        .filter((f) => f && typeof f === 'object')
        .map((f) => ({
          fieldId: String((f.fieldId ?? f.field_id ?? f.fid ?? f.id ?? '')).trim(),
          operator: normalizeQuickbaseOperator(f.operator),
          value: String((f.value ?? '')).trim()
        }))
        .filter((f) => f.fieldId && f.value)
        .slice(0, 200)
    : [];

  const filterMatchRaw = String(src.filterMatch || src.qb_filter_match || '').trim().toUpperCase();
  const filterMatch = filterMatchRaw === 'ANY' ? 'ANY' : 'ALL';

  return {
    reportLink: String(src.reportLink || src.qb_report_link || '').trim(),
    qid: String(src.qid || src.qb_qid || '').trim(),
    realm: String(src.realm || src.qb_realm || '').trim().toLowerCase(),
    tableId: String(src.tableId || src.qb_table_id || '').trim(),
    customColumns,
    customFilters,
    filterMatch
  };
}

function toBool(v){
  if (v === true || v === false) return v;
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return undefined;
  if (s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === 'on') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === 'n' || s === 'off') return false;
  return undefined;
}

function createServiceSupabaseAdapter() {
  return {
    from(tableName) {
      const mappedTable = tableName === 'profiles' ? 'mums_profiles' : tableName;
      return {
        update(updates) {
          return {
            async eq(column, value) {
              const mappedColumn = mappedTable === 'mums_profiles' && column === 'id' ? 'user_id' : column;
              const out = await serviceUpdate(mappedTable, updates || {}, { [mappedColumn]: `eq.${value}` });
              return {
                data: out && out.ok ? out.json : null,
                error: out && out.ok ? null : (out.json || out.text || { message: 'unknown_update_error' })
              };
            }
          };
        }
      };
    }
  };
}

// PATCH /api/users/update_me
// Updates the authenticated user's profile (server-side, service key).
module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'PATCH' && req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });

    const auth = String(req.headers.authorization || '');
    const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
    const authed = await getUserFromJwt(jwt);
    if (!authed) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    const body = await readBody(req);
    req.user = req.user || { id: authed.id };
    const patch = {};

    if (Object.prototype.hasOwnProperty.call(body, 'name')) {
      const name = String(body.name || '').trim();
      if (name && name.length > 80) return sendJson(res, 400, { ok: false, error: 'invalid_name' });
      if (name) patch.name = name;
    }

    // Allow duty update (optional); UI may use it.
    if (Object.prototype.hasOwnProperty.call(body, 'duty')) {
      const duty = String(body.duty || '').trim();
      if (duty.length > 120) return sendJson(res, 400, { ok: false, error: 'invalid_duty' });
      patch.duty = duty;
    }

    // Personal Quickbase config updates (save via server/service-role to avoid client RLS failures).
    if (Object.prototype.hasOwnProperty.call(body, 'qb_token')) {
      const qbToken = String(body.qb_token || '').trim();
      if (qbToken.length > 255) return sendJson(res, 400, { ok: false, error: 'invalid_qb_token' });
      patch.qb_token = qbToken;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'qb_report_link')) {
      const link = String(body.qb_report_link || '').trim();
      if (link.length > 2000) return sendJson(res, 400, { ok: false, error: 'invalid_qb_report_link' });
      patch.qb_report_link = link;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'qb_qid')) {
      const qid = String(body.qb_qid || '').trim();
      if (qid.length > 120) return sendJson(res, 400, { ok: false, error: 'invalid_qb_qid' });
      patch.qb_qid = qid;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'qb_realm')) {
      const realm = String(body.qb_realm || '').trim().toLowerCase();
      if (realm.length > 255) return sendJson(res, 400, { ok: false, error: 'invalid_qb_realm' });
      patch.qb_realm = realm;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'qb_table_id')) {
      const tableId = String(body.qb_table_id || '').trim();
      if (tableId.length > 80) return sendJson(res, 400, { ok: false, error: 'invalid_qb_table_id' });
      patch.qb_table_id = tableId;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'qb_custom_columns')) {
      const cols = Array.isArray(body.qb_custom_columns) ? body.qb_custom_columns : [];
      const normalized = cols
        .map((v) => String(v == null ? '' : v).trim())
        .filter(Boolean)
        .slice(0, 200);
      patch.qb_custom_columns = normalized;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'quickbase_settings')) {
      let inputQuickbaseSettings = body.quickbase_settings;
      if (typeof inputQuickbaseSettings === 'string') {
        try {
          inputQuickbaseSettings = inputQuickbaseSettings ? JSON.parse(inputQuickbaseSettings) : {};
        } catch (_) {
          return sendJson(res, 400, { error: 'invalid_payload', detail: 'quickbase_settings not valid JSON' });
        }
      }

      if (!inputQuickbaseSettings || typeof inputQuickbaseSettings !== 'object' || Array.isArray(inputQuickbaseSettings)) {
        return sendJson(res, 400, { error: 'invalid_payload', detail: 'quickbase_settings must be an object' });
      }

      if (Object.prototype.hasOwnProperty.call(inputQuickbaseSettings, 'filters')) {
        if (!Array.isArray(inputQuickbaseSettings.filters)) {
          return sendJson(res, 400, { error: 'invalid_payload', detail: 'quickbase_settings.filters must be an array' });
        }
        try {
          const normalizedFilters = normalizeFilters(inputQuickbaseSettings.filters)
            .map((filter) => ({
              ...filter,
              value: escapeQuickbaseValue(filter.value)
            }));
          inputQuickbaseSettings.filters = normalizedFilters;
          inputQuickbaseSettings.qb_custom_filters = normalizedFilters;
          console.info('[users.update] quickbase filter normalization applied', { count: normalizedFilters.length });
        } catch (err) {
          return sendJson(res, 400, { error: 'invalid_payload', detail: String(err && err.message ? err.message : err) });
        }
      }

      const normalizedSettings = normalizeQuickbaseConfig(inputQuickbaseSettings);
      patch.quickbase_settings = normalizedSettings;
      patch.quickbase_config = normalizedSettings;

      // Keep legacy columns in sync for backward compatibility.
      patch.qb_report_link = normalizedSettings.reportLink;
      patch.qb_qid = normalizedSettings.qid;
      patch.qb_realm = normalizedSettings.realm;
      patch.qb_table_id = normalizedSettings.tableId;
      patch.qb_custom_columns = normalizedSettings.customColumns;
      patch.qb_custom_filters = normalizedSettings.customFilters;
      patch.qb_filter_match = normalizedSettings.filterMatch;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'quickbase_config')) {
      const normalizedConfig = normalizeQuickbaseConfig(parseQuickbaseConfigInput(body.quickbase_config));
      patch.quickbase_config = normalizedConfig;
      patch.quickbase_settings = normalizedConfig;

      // Keep legacy columns in sync for backward compatibility.
      patch.qb_report_link = normalizedConfig.reportLink;
      patch.qb_qid = normalizedConfig.qid;
      patch.qb_realm = normalizedConfig.realm;
      patch.qb_table_id = normalizedConfig.tableId;
      patch.qb_custom_columns = normalizedConfig.customColumns;
      patch.qb_custom_filters = normalizedConfig.customFilters;
      patch.qb_filter_match = normalizedConfig.filterMatch;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'qb_filter_match')) {
      const match = String(body.qb_filter_match || '').trim().toUpperCase();
      patch.qb_filter_match = match === 'ANY' ? 'ANY' : 'ALL';
    }

    if (Object.prototype.hasOwnProperty.call(body, 'qb_custom_filters')) {
      const filters = Array.isArray(body.qb_custom_filters) ? body.qb_custom_filters : [];
      const normalized = filters
        .filter((f) => f && typeof f === 'object')
        .map((f) => ({
          fieldId: String((f.fieldId ?? f.field_id ?? '')).trim(),
          operator: normalizeQuickbaseOperator(f.operator),
          value: String((f.value ?? '')).trim()
        }))
        .filter((f) => f.fieldId && f.value)
        .slice(0, 200);
      patch.qb_custom_filters = normalized;
    }
    const prof = await getProfileForUserId(authed.id);
    if (!prof) return sendJson(res, 404, { ok: false, error: 'profile_missing', message: 'Profile not found. Call /api/users/me first.' });

    // SUPER_ADMIN team override
    // - team_override=false => team_id NULL (Developer Access)
    // - team_override=true  => team_id one of the configured shift buckets (morning/mid/night)
    const wantsTeam = (
      Object.prototype.hasOwnProperty.call(body, 'team_id') ||
      Object.prototype.hasOwnProperty.call(body, 'teamId') ||
      Object.prototype.hasOwnProperty.call(body, 'team_override') ||
      Object.prototype.hasOwnProperty.call(body, 'teamOverride')
    );

    if (wantsTeam) {
      const roleUpper = String(prof.role || '').trim().toUpperCase();
      if (roleUpper !== 'SUPER_ADMIN') return sendJson(res, 403, { ok: false, error: 'forbidden_team_change' });

      const allowed = new Set(['morning','mid','night']);
      const teamIn = (Object.prototype.hasOwnProperty.call(body, 'team_id') ? body.team_id : body.teamId);
      const overrideIn = (Object.prototype.hasOwnProperty.call(body, 'team_override') ? body.team_override : body.teamOverride);
      const overrideBool = toBool(overrideIn);

      let teamId = (teamIn === null || teamIn === undefined) ? '' : String(teamIn).trim();
      if (teamId === 'null') teamId = '';
      if (teamId && teamId.includes('@')) teamId = teamId.split('@')[0];

      // Determine desired state.
      let wantOverride;
      let wantTeam;

      if (overrideBool !== undefined) {
        wantOverride = overrideBool;
        if (!wantOverride) {
          wantTeam = null;
        } else {
          if (!teamId) return sendJson(res, 400, { ok: false, error: 'invalid_team', message: 'team_id required when team_override=true' });
          if (!allowed.has(teamId)) return sendJson(res, 400, { ok: false, error: 'invalid_team' });
          wantTeam = teamId;
        }
      } else {
        // If no explicit override flag is sent, infer it from team_id.
        if (!teamId) {
          wantOverride = false;
          wantTeam = null;
        } else {
          if (!allowed.has(teamId)) return sendJson(res, 400, { ok: false, error: 'invalid_team' });
          wantOverride = true;
          wantTeam = teamId;
        }
      }

      patch.team_override = !!wantOverride;
      patch.team_id = wantTeam;
    }

    if (!Object.keys(patch).length) return sendJson(res, 200, { ok: true, updated: false, profile: null });

    let out;
    const filtersCount = Array.isArray((patch.quickbase_settings || {}).customFilters)
      ? patch.quickbase_settings.customFilters.length
      : 0;

    const db = {
      async query() {
        const query = 'select=column_name&table_name=eq.users&column_name=eq.quickbase_settings&limit=1';
        const schemaOut = await serviceSelect('/rest/v1/information_schema.columns?' + query);
        return (schemaOut && schemaOut.ok && Array.isArray(schemaOut.json)) ? schemaOut.json : [];
      }
    };

    if (Object.prototype.hasOwnProperty.call(patch, 'quickbase_settings')) {
      const hasQuickbaseSettingsColumn = await ensureQuickbaseSettingsColumn(db);
      if (!hasQuickbaseSettingsColumn) {
        console.warn('[users.update] quickbase_settings column missing; writing to quickbase_config fallback');
        patch.quickbase_config = patch.quickbase_settings;
        delete patch.quickbase_settings;
      }
    }

    const allowedFields = [
      'name',
      'duty',
      'qb_token',
      'qb_report_link',
      'qb_qid',
      'qb_realm',
      'qb_table_id',
      'qb_custom_columns',
      'qb_custom_filters',
      'qb_filter_match',
      'quickbase_config',
      'quickbase_settings',
      'team_override',
      'team_id'
    ];
    const updates = allowedFields.reduce((acc, key) => {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) return acc;
      let value = patch[key];
      if (key === 'quickbase_settings' && typeof value === 'string') {
        try {
          value = value ? JSON.parse(value) : {};
        } catch (_) {
          value = {};
        }
      }
      acc[key] = value;
      return acc;
    }, {});

    const supabase = createServiceSupabaseAdapter();
    try {
      out = await supabase.from('profiles').update(updates).eq('id', req.user.id);
      if (out && out.error) {
        console.error('Supabase Update Error:', out.error);
      }
    } catch (err) {
      console.error('[users.update] DB_WRITE_FAILED', err);
      return sendJson(res, 500, { error: 'update_failed', code: 'DB_WRITE_FAILED' });
    }

    // Backward-compatible fallback:
    // If environment DB is missing qb_custom_* columns, retry update without those keys
    // so core Quickbase config (token/qid/table/realm/link) still saves successfully.
    if (out && out.error) {
      const detailBlob = JSON.stringify(out.error || '').toLowerCase();
      const missingCustomCols = detailBlob.includes('qb_custom_columns') || detailBlob.includes('qb_custom_filters') || detailBlob.includes('quickbase_config') || detailBlob.includes('quickbase_settings');
      if (missingCustomCols) {
        const retryPatch = { ...updates };
        delete retryPatch.qb_custom_columns;
        delete retryPatch.qb_custom_filters;
        delete retryPatch.quickbase_config;
        delete retryPatch.quickbase_settings;
        if (Object.keys(retryPatch).length > 0) {
          const retryOut = await supabase.from('profiles').update(retryPatch).eq('id', req.user.id);
          if (!retryOut.error) {
            return sendJson(res, 200, {
              ok: true,
              updated: true,
              patch: retryPatch,
              warning: 'quickbase_columns_or_config_missing_in_db',
              message: 'Saved core Quickbase settings. Run latest migrations to enable custom columns/filters/config persistence.'
            });
          }
        }
      }
      console.error('[users.update] DB_WRITE_FAILED', out.error || 'unknown');
      return sendJson(res, 500, { error: 'update_failed', code: 'DB_WRITE_FAILED' });
    }
    console.info('[users.update] quickbase_settings saved', { userId: authed.id, filtersCount });
    return sendJson(res, 200, { ok: true, updated: true, patch });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: 'update_me_failed', message: String(err && err.message ? err.message : err) });
  }
};
