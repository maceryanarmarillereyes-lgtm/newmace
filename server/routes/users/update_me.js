const { getUserFromJwt, getProfileForUserId, serviceUpdate } = require('../../lib/supabase');

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

function toBool(v){
  if (v === true || v === false) return v;
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return undefined;
  if (s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === 'on') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === 'n' || s === 'off') return false;
  return undefined;
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
    if (Object.prototype.hasOwnProperty.call(body, 'qb_custom_filters')) {
      const filters = Array.isArray(body.qb_custom_filters) ? body.qb_custom_filters : [];
      const normalized = filters
        .filter((f) => f && typeof f === 'object')
        .map((f) => ({
          fieldId: String((f.fieldId ?? f.field_id ?? '')).trim(),
          operator: String((f.operator ?? 'EX')).trim().toUpperCase(),
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

    const out = await serviceUpdate('mums_profiles', patch, { user_id: `eq.${authed.id}` });
    if (!out.ok) return sendJson(res, 500, { ok: false, error: 'update_failed', details: out.json || out.text });

    return sendJson(res, 200, { ok: true, updated: true, patch });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: 'update_me_failed', message: String(err && err.message ? err.message : err) });
  }
};
