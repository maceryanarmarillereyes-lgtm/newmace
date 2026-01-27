(function(){
  function getClientId(){
    var key = 'mums_client_id';

    function cookieSecure(){
      try { return (location && location.protocol === 'https:'); } catch(_) { return false; }
    }
    function setCookie(name, value){
      try {
        var secure = cookieSecure() ? '; Secure' : '';
        document.cookie = name + '=' + encodeURIComponent(value) + '; Path=/; Max-Age=' + (86400*365) + '; SameSite=Lax' + secure;
      } catch(_) {}
    }
    function getCookie(name){
      try {
        var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\/\+^])/g,'\\$1') + '=([^;]*)'));
        return m ? decodeURIComponent(m[1]) : '';
      } catch(_) { return ''; }
    }

    try {
      var existing = localStorage.getItem(key);
      if (existing) return existing;
    } catch(_) {}

    try {
      var c = getCookie(key);
      if (c) return c;
    } catch(_) {}

    var id = 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36);

    try { localStorage.setItem(key, id); } catch(_) {}
    try { setCookie(key, id); } catch(_) {}

    return id;
  }

  // Ensure we have a fresh access token before hitting protected API routes.
  var __jwtPromise = null;
  async function getJwt(){
    try {
      if (window.CloudAuth && typeof CloudAuth.loadSession === 'function') {
        // Debounce concurrent refreshes.
        if (!__jwtPromise) {
          __jwtPromise = (async function(){
            try { await CloudAuth.loadSession(); } catch(_) {}
            return (typeof CloudAuth.accessToken === 'function') ? CloudAuth.accessToken() : '';
          })();
          // Reset the promise after completion so future calls can refresh again.
          __jwtPromise.finally(function(){ __jwtPromise = null; });
        }
        return await __jwtPromise;
      }
      return (window.CloudAuth && typeof CloudAuth.accessToken === 'function') ? CloudAuth.accessToken() : '';
    } catch (e) {
      return '';
    }
  }

  async function authHeader(){
    var jwt = await getJwt();
    return jwt ? { Authorization: 'Bearer ' + jwt } : {};
  }

  // Refresh token on 401 once, then retry the request.
  var __refreshPromise = null;
  var __lastRefreshAt = 0;
  var REFRESH_THROTTLE_MS = 20000;

  async function refreshAuthIfPossible(){
    try {
      var now = Date.now();
      if ((now - __lastRefreshAt) < REFRESH_THROTTLE_MS) return { ok:false, throttled:true };
      if (!window.CloudAuth || typeof CloudAuth.refreshSession !== 'function') return { ok:false, missing:true };

      if (!__refreshPromise) {
        __lastRefreshAt = now;
        __refreshPromise = (async function(){
          try { return await CloudAuth.refreshSession(); } catch (e) { return { ok:false, message:'refresh_throw' }; }
        })();
        __refreshPromise.finally(function(){ __refreshPromise = null; });
      }

      var res = await __refreshPromise;
      return res && res.ok ? { ok:true } : { ok:false, result: res };
    } catch (_) {
      return { ok:false, message:'refresh_exception' };
    }
  }

  async function fetchWithAuthRetry(url, opts){
    var options = Object.assign({}, (opts || {}));
    options.headers = Object.assign({}, (options.headers || {}), await authHeader());

    var r = await fetch(url, options);
    if (r.status !== 401) return r;

    // Attempt refresh once and retry.
    var refreshed = await refreshAuthIfPossible();
    if (!refreshed.ok) return r;

    var options2 = Object.assign({}, (opts || {}));
    options2.headers = Object.assign({}, (options2.headers || {}), await authHeader());
    return await fetch(url, options2);
  }

  function toMs(iso){
    var t = Date.parse(iso);
    return isNaN(t) ? Date.now() : t;
  }

  function buildOnlineMap(rows){
    var map = {};
    (rows || []).forEach(function(r){
      var uid = r.user_id || r.userId || r.name || r.client_id;
      if (!uid) return;
      map[uid] = {
        userId: r.user_id || r.userId || uid,
        name: r.name || 'User',
        role: r.role || '',
        teamId: r.team_id || r.teamId || '',
        route: r.route || '',
        lastSeen: toMs(r.last_seen || r.lastSeen || new Date().toISOString())
      };
    });
    return map;
  }

  async function postJson(url, body){
    return await fetchWithAuthRetry(url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, (await authHeader())),
      body: JSON.stringify(body)
    });
  }

  async function run(){
    await (window.__MUMS_ENV_READY || Promise.resolve());
    var env = window.MUMS_ENV || {};
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      // Presence works only when deployed with envs.
      return;
    }

    var clientId = getClientId();

    // Throttle repeated 401 debug updates to avoid spam.
    var last401At = 0;
    var THROTTLE_401_MS = 20000;

    // Heartbeat: update server presence.
    async function heartbeat(){
      try {
        // Presence is meaningful only for authenticated sessions.
        var jwt = await getJwt();
        if (!jwt) return;

        var me = null;
        try { me = (window.Auth && Auth.getUser) ? Auth.getUser() : null; } catch(_) { me = null; }
        var hb = await postJson('/api/presence/heartbeat', {
          clientId: clientId,
          route: location.hash || '',
          teamId: (me && me.teamId) ? me.teamId : '',
          role: (me && me.role) ? me.role : ''
        });

        // If we still get a 401 after refresh attempt, do not force sync UI offline.
        if (hb && hb.status === 401) {
          var now = Date.now();
          if ((now - last401At) > THROTTLE_401_MS) {
            last401At = now;
            try { window.dispatchEvent(new CustomEvent('mums:debug', { detail: { source: 'presence_client', kind: 'http', status: 401, url: '/api/presence/heartbeat' } })); } catch(_) {}
          }
        }
} catch (e) {
        // Silent failure; best-effort.
      }
    }

    // List: pull roster and update Store online map.
    async function refreshRoster(){
      try {
        var jwt = await getJwt();
        if (!jwt) return;

        var r = await fetchWithAuthRetry('/api/presence/list', { cache: 'no-store' });
        if (!r.ok) {
          // Surface 401s to the debug overlay only. Presence must not drive the sync banner.
          if (r.status === 401) {
            var now = Date.now();
            if ((now - last401At) > THROTTLE_401_MS) {
              last401At = now;
              try {
                window.dispatchEvent(new CustomEvent('mums:debug', { detail: { source: 'presence_client', kind: 'http', status: 401, url: '/api/presence/list' } }));
              } catch(_) {}
            }
          }
          return;
        }
        var data = await r.json();
        if (!data || !data.rows) return;
        if (window.Store && window.Store.write) {
          Store.write('mums_online_users', buildOnlineMap(data.rows));
        } else {
          localStorage.setItem('mums_online_users', JSON.stringify(buildOnlineMap(data.rows)));
        }
      } catch (e) {
        // ignore
      }
    }

    var poll = Number(env.PRESENCE_POLL_MS || 3000);
    heartbeat();
    refreshRoster();
    setInterval(heartbeat, Math.max(1500, poll));
    setInterval(refreshRoster, Math.max(1500, poll));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
