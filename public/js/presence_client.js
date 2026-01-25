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
        var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\/\+^])/g,'\$1') + '=([^;]*)'));
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

  function authHeader(){
    try {
      var jwt = (window.CloudAuth && CloudAuth.accessToken) ? CloudAuth.accessToken() : '';
      return jwt ? { Authorization: 'Bearer ' + jwt } : {};
    } catch (e) {
      return {};
    }
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
    var r = await fetch(url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeader()),
      body: JSON.stringify(body)
    });
    return r;
  }

  async function run(){
    await (window.__MUMS_ENV_READY || Promise.resolve());
    var env = window.MUMS_ENV || {};
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      // Presence works only when deployed with envs.
      return;
    }

    var clientId = getClientId();

    // Heartbeat: update server presence.
    async function heartbeat(){
      try {
        // Presence is meaningful only for authenticated sessions.
        var jwt = (window.CloudAuth && CloudAuth.accessToken) ? CloudAuth.accessToken() : '';
        if (!jwt) return;

        await postJson('/api/presence/heartbeat', {
          clientId: clientId,
          route: location.hash || ''
        });
      } catch (e) {
        // Silent failure; best-effort.
      }
    }

    // List: pull roster and update Store online map.
    async function refreshRoster(){
      try {
        var r = await fetch('/api/presence/list', { cache: 'no-store', headers: authHeader() });
        if (!r.ok) return;
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
