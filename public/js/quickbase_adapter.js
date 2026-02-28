/* @AI_CRITICAL_GUARD: UNTOUCHABLE ZONE. Do not modify existing UI/UX, layouts, or core logic in this file without explicitly asking Thunter BOY for clearance. If changes are required here, STOP and provide a RISK IMPACT REPORT first. */
(function(){
  function getToken() {
    try {
      if (window.CloudAuth && typeof CloudAuth.accessToken === 'function') {
        const t = CloudAuth.accessToken();
        if (t) return String(t);
      }
    } catch (_) {}
    try {
      if (window.Store && typeof Store.getSession === 'function') {
        const s = Store.getSession();
        const t = s && (s.access_token || (s.session && s.session.access_token));
        if (t) return String(t);
      }
    } catch (_) {}
    return '';
  }


  function flattenFidFields(fields) {
    const src = fields && typeof fields === 'object' ? fields : {};
    const mapped = {};
    Object.keys(src).forEach(function(fid){
      if (!fid) return;
      const raw = src[fid];
      const value = (raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'value'))
        ? raw.value
        : raw;
      mapped[String(fid)] = value == null ? '' : value;
    });
    return mapped;
  }

  function toSafePayload(payload) {
    const src = payload && typeof payload === 'object' ? payload : {};
    const rows = Array.isArray(src.records)
      ? src.records
      : (Array.isArray(src.rows) ? src.rows : []);
    const columns = Array.isArray(src.columns) ? src.columns : [];
    const normalizedRows = rows.map(function(r){
      const normalizedFields = flattenFidFields(r && r.fields);
      const fallbackRecordId = normalizedFields['3'];
      const qbRecordId = String((r && r.qbRecordId) || fallbackRecordId || 'N/A');
      const fields = {};
      Object.keys(normalizedFields).forEach(function(fid){
        fields[fid] = { value: normalizedFields[fid] == null ? '' : normalizedFields[fid] };
      });
      return {
        qbRecordId: qbRecordId,
        fields: fields
      };
    });

    return {
      ok: !!src.ok,
      warning: String(src.warning || ''),
      columns: columns.map(function(c){
        return {
          id: String((c && c.id) || ''),
          label: String((c && c.label) || '')
        };
      }).filter(function(c){ return !!c.id; }),
      rows: normalizedRows,
      records: normalizedRows,
      allAvailableFields: Array.isArray(src.allAvailableFields) ? src.allAvailableFields : [],
      settings: (src.settings && typeof src.settings === 'object') ? src.settings : {}
    };
  }

  async function fetchMonitoringData(overrideParams) {
    const token = getToken();
    if (!token) {
      throw new Error('Quickbase auth token missing. Please login again.');
    }

    // Get user profile for QID settings
    let qid = '';
    let tableId = '';
    let realm = '';

    if (overrideParams && typeof overrideParams === 'object') {
      qid = String(overrideParams.qid || '').trim();
      tableId = String(overrideParams.tableId || '').trim();
      realm = String(overrideParams.realm || '').trim();
    }

    // Fallback to stored profile if not provided
    if (!qid || !tableId || !realm) {
      try {
        const me = (window.Auth && Auth.getUser) ? Auth.getUser() : null;
        if (me && window.Store && Store.getProfile) {
          const profile = Store.getProfile(me.id);
          if (profile) {
            qid = qid || String(profile.qb_qid || profile.quickbase_qid || '').trim();
            tableId = tableId || String(profile.qb_table_id || profile.quickbase_table_id || '').trim();
            realm = realm || String(profile.qb_realm || profile.quickbase_realm || '').trim();
          }
        }
      } catch (_) {}
    }

    // Validate required params
    if (!qid || !tableId || !realm) {
      const missingErr = new Error('Quickbase settings not configured. Please set your QID, Table ID, and Realm in My Quickbase Settings.');
      missingErr.code = 'quickbase_credentials_missing';
      throw missingErr;
    }

    const headers = {
      'content-type': 'application/json',
      authorization: 'Bearer ' + token
    };

    // Construct URL with query parameters
    const queryParams = new URLSearchParams({
      qid: qid,
      tableId: tableId,
      realm: realm
    });

    const candidates = [
      '/api/quickbase/monitoring?' + queryParams.toString(),
      '/functions/quickbase/monitoring?' + queryParams.toString()
    ];

    let lastErr = null;

    for (const url of candidates) {
      try {
        const res = await fetch(url, { method: 'GET', headers, cache: 'no-store' });
        const data = await res.json().catch(function(){ return {}; });

        if (!res.ok) {
          const message = data && data.message ? String(data.message) : ('Endpoint ' + url + ' failed with ' + res.status);
          lastErr = new Error(message);
          continue;
        }

        const safePayload = toSafePayload(data);

        if (safePayload.warning === 'quickbase_credentials_missing') {
          const missingCredsErr = new Error('Missing Quickbase Credentials: Token or Realm not found. Please verify your Profile Settings.');
          missingCredsErr.code = 'quickbase_credentials_missing';
          throw missingCredsErr;
        }

        try {
          console.info('[Enterprise DB] Quickbase Payload (QID: ' + qid + '):', safePayload.rows);
        } catch (_) {}

        return safePayload;
      } catch (e) {
        lastErr = e;
      }
    }

    throw lastErr || new Error('Quickbase endpoint unreachable');
  }

  window.QuickbaseAdapter = {
    fetchMonitoringData: fetchMonitoringData
  };
})();
