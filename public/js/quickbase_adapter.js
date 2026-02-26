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
    const rows = Array.isArray(src.records) ? src.records : [];
    const columns = Array.isArray(src.columns) ? src.columns : [];
    return {
      ok: !!src.ok,
      warning: String(src.warning || ''),
      columns: columns.map(function(c){
        return {
          id: String((c && c.id) || ''),
          label: String((c && c.label) || '')
        };
      }).filter(function(c){ return !!c.id; }),
      rows: rows.map(function(r){
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
      }),
      settings: (src.settings && typeof src.settings === 'object') ? src.settings : {}
    };
  }

  async function fetchMonitoringData() {
    const token = getToken();
    if (!token) {
      throw new Error('Quickbase auth token missing. Please login again.');
    }

    const headers = {
      'content-type': 'application/json',
      authorization: 'Bearer ' + token
    };

    const candidates = ['/api/quickbase/monitoring', '/functions/quickbase/monitoring'];
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
        try { console.info('[Enterprise DB] Quickbase Payload mapped:', safePayload.rows); } catch (_) {}
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
