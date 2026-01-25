/*
  CloudAuth (Supabase Auth wrapper)
  ------------------------------------------------------------
  This module intentionally provides backward-compatible method
  names used across earlier iterations of the app:
    - isEnabled() / enabled()
    - signIn()    / login()
    - signOut()   / logout()

  Only SAFE (public) env values are used from /api/env.
*/
(function(){
  const LS_SESSION = 'mums_supabase_session';
  // In-memory fallback for browsers/environments where localStorage is blocked
  // (e.g., strict privacy/tracking prevention settings).
  let memSession = null;
  let refreshTimer = null;


  function _cookieSecureFlag(){
    try { return (location && location.protocol === 'https:'); } catch (_) { return false; }
  }
  function _setCookie(name, value, days){
    try {
      const maxAge = (days ? (days * 86400) : 86400 * 30);
      const secure = _cookieSecureFlag() ? '; Secure' : '';
      document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
    } catch (_) {}
  }
  function _getCookie(name){
    try {
      const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\\/\+^])/g,'\\$1') + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : '';
    } catch (_) { return ''; }
  }
  function _delCookie(name){
    try {
      const secure = _cookieSecureFlag() ? '; Secure' : '';
      document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    } catch (_) {}
  }
  function _minifySession(session){
    if(!session) return null;
    const u = session.user || null;
    let expires_at = session.expires_at || null;
    if(!expires_at && session.expires_in){
      expires_at = Math.floor(Date.now()/1000) + Number(session.expires_in||0);
    }
    return {
      access_token: session.access_token || '',
      refresh_token: session.refresh_token || '',
      expires_at,
      user: u ? { id: u.id, email: u.email } : null
    };
  }


  function env(){
    try{ return (window.EnvRuntime && EnvRuntime.env) ? EnvRuntime.env() : (window.MUMS_ENV || {}); }catch(_){ return (window.MUMS_ENV || {}); }
  }

  function apiFetch(path, opts){
    const e = env();
    const base = String(e.SUPABASE_URL || '').replace(/\/$/, '');
    const anon = String(e.SUPABASE_ANON_KEY || '');
    if(!base || !anon) throw new Error('Supabase env missing (SUPABASE_URL/SUPABASE_ANON_KEY)');

    const url = base + path;
    const o = Object.assign({ method:'GET', headers:{} }, (opts||{}));
    o.headers = Object.assign({
      'apikey': anon,
      'Authorization': `Bearer ${anon}`
    }, (o.headers||{}));
    return fetch(url, o);
  }

  function readSession(){
    // localStorage → sessionStorage → cookie → in-memory
    try {
      const v = localStorage.getItem(LS_SESSION);
      if (v) return JSON.parse(v);
    } catch (_) {}
    try {
      const v2 = sessionStorage.getItem(LS_SESSION);
      if (v2) return JSON.parse(v2);
    } catch (_) {}
    try {
      const cv = _getCookie(LS_SESSION);
      if (cv) return JSON.parse(cv);
    } catch (_) {}
    return memSession;
  }

  function writeSession(session){
    memSession = session || null;
    const payload = JSON.stringify(_minifySession(session));
    try{ localStorage.setItem(LS_SESSION, payload); }catch(_){ }
    try{ sessionStorage.setItem(LS_SESSION, payload); }catch(_){ }
    try{ _setCookie(LS_SESSION, payload, 30); }catch(_){ }
  }

  function clearSession(){
    memSession = null;
    try{ localStorage.removeItem(LS_SESSION); }catch(_){ }
    try{ sessionStorage.removeItem(LS_SESSION); }catch(_){ }
    try{ _delCookie(LS_SESSION); }catch(_){ }
  }

  function emitToken(){
    try {
      const t = accessToken();
      if (!t) return;
      window.dispatchEvent(new CustomEvent('mums:authtoken', { detail: { token: t } }));
    } catch (_) {}
  }

  function clearRefreshTimer(){
    try { if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; } } catch (_) {}
  }

  async function refreshSession(){
    try {
      const s = readSession();
      const rt = s && s.refresh_token ? String(s.refresh_token) : '';
      if (!rt) return;

      const r = await apiFetch('/auth/v1/token?grant_type=refresh_token', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ refresh_token: rt })
      });

      const bodyText = await r.text().catch(()=> '');
      let data = null;
      try{ data = bodyText ? JSON.parse(bodyText) : null; }catch(_){ data = null; }

      if (!r.ok || !data || !data.access_token) {
        // If refresh fails, force re-login on next protected action.
        return;
      }

      // Preserve refresh token if not returned.
      if (!data.refresh_token && s && s.refresh_token) data.refresh_token = s.refresh_token;

      // Normalize expires_at if missing.
      if (!data.expires_at && data.expires_in) {
        data.expires_at = Math.floor(Date.now()/1000) + Number(data.expires_in);
      }

      writeSession(data);
      emitToken();
      scheduleRefresh(data);
    } catch (_) {}
  }

  function scheduleRefresh(session){
    clearRefreshTimer();
    try {
      const s = session || readSession();
      if (!s) return;
      const expiresAt = s.expires_at ? Number(s.expires_at) : 0;
      let msUntil = 0;
      if (expiresAt) {
        msUntil = Math.max(0, (expiresAt * 1000) - Date.now());
      } else if (s.expires_in) {
        msUntil = Math.max(0, Number(s.expires_in) * 1000);
      }
      // Refresh 60s before expiry (min 15s).
      const refreshIn = Math.max(15000, msUntil - 60000);
      refreshTimer = setTimeout(refreshSession, refreshIn);
    } catch (_) {}
  }

  async function login(usernameOrEmail, password){
    const e = env();
    const domain = String(e.USERNAME_EMAIL_DOMAIN || 'mums.local');

    const id = String(usernameOrEmail||'').trim();
    if(!id) return { ok:false, message:'Missing username/email.' };

    // Accept either full email or username.
    const email = id.includes('@') ? id : `${id}@${domain}`;

    const r = await apiFetch('/auth/v1/token?grant_type=password', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email, password })
    });

    const bodyText = await r.text().catch(()=> '');
    let data = null;
    try{ data = bodyText ? JSON.parse(bodyText) : null; }catch(_){ data = null; }

    if(!r.ok){
      const msg = (data && (data.error_description || data.msg || data.message || data.error)) ? (data.error_description || data.msg || data.message || data.error) : bodyText;
      return { ok:false, message: String(msg || 'Login failed.') };
    }

    // Supabase returns access_token + user
    if (!data.expires_at && data.expires_in) {
      data.expires_at = Math.floor(Date.now()/1000) + Number(data.expires_in);
    }
    writeSession(data);
    emitToken();
    scheduleRefresh(data);
    return { ok:true, session:data, user:data.user || null };
  }

  async function logout(){
    // Best-effort: clear local session. (Server revoke is optional.)
    clearRefreshTimer();
    clearSession();
    return { ok:true };
  }

  function accessToken(){
    const s = readSession();
    return (s && s.access_token) ? String(s.access_token) : '';
  }

  function getUser(){
    const s = readSession();
    return (s && s.user) ? s.user : null;
  }

  function enabled(){
    const e = env();
    return Boolean(e.SUPABASE_URL && e.SUPABASE_ANON_KEY);
  }

  // Backward-compatible wrappers
  async function signIn(usernameOrEmail, password){
    const out = await login(usernameOrEmail, password);
    if(out && out.ok) return { ok:true, user: out.user, session: out.session };
    return { ok:false, message: (out && out.message) ? out.message : 'Login failed.' };
  }

  async function signOut(){
    return logout();
  }

  window.CloudAuth = {
    // Canonical
    enabled,
    login,
    logout,
    accessToken,
    loadSession: readSession,
    getUser,
    refreshSession,

    // Compatibility
    isEnabled: enabled,
    signIn,
    signOut
  };

  // If a session is already present (page reload / new tab), ensure refresh scheduling
  // so long-lived realtime sessions do not silently expire.
  try {
    const s = readSession();
    if (s && s.access_token) {
      emitToken();
      scheduleRefresh(s);
    }
  } catch (_) {}
})();
