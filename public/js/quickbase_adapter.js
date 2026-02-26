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
        return {
          qbRecordId: (r && (r.qbRecordId || (r.fields && r.fields['3'] && r.fields['3'].value))) || 'N/A',
          fields: (r && r.fields && typeof r.fields === 'object') ? r.fields : {}
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
        return toSafePayload(data);
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
