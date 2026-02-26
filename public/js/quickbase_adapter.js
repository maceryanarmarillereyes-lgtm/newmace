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
    if (!payload || !payload.ok) return { columns: [], rows: [], settings: {} };
    const rows = Array.isArray(payload.records) ? payload.records : [];
    const columns = Array.isArray(payload.columns) ? payload.columns : [];
    return {
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
      settings: (payload && payload.settings && typeof payload.settings === 'object') ? payload.settings : {}
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
        if (!res.ok) {
          lastErr = new Error('Endpoint ' + url + ' failed with ' + res.status);
          continue;
        }
        const data = await res.json();
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
