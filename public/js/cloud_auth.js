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
  const DBG = (window.MUMS_DEBUG || {log(){},warn(){},error(){}});

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
    // Priority: localStorage → sessionStorage → cookie → in-memory
    try{
      const raw = localStorage.getItem(LS_SESSION);
      if(raw){ return JSON.parse(raw); }
    }catch(e){
      DBG.warn('cloud_auth.readSession.localStorage_error', {e: String(e)});
    }
    try{
      const raw = sessionStorage.getItem(LS_SESSION);
      if(raw){ return JSON.parse(raw); }
    }catch(e){
      DBG.warn('cloud_auth.readSession.sessionStorage_error', {e: String(e)});
    }
    try{
      const raw = _getCookie(LS_SESSION);
      if(raw){ return JSON.parse(raw); }
    }catch(e){
      DBG.warn('cloud_auth.readSession.cookie_error', {e: String(e)});
    }
    if(memSession) return memSession;
    return null;
  }

  function writeSession(session){
    // IMPORTANT: Supabase token payloads can be large. Persist a minimal, stable
    // session shape to avoid cookie/localStorage bloat and reduce login/reconnect loops.
    const min = _minifySession(session || null);
    memSession = min;
    const payload = JSON.stringify(min || null);
    try{ localStorage.setItem(LS_SESSION, payload); }
    catch(e){ DBG.warn('cloud_auth.writeSession.localStorage_error', {e: String(e), len: payload.length}); }
    try{ sessionStorage.setItem(LS_SESSION, payload); }
    catch(e){ DBG.warn('cloud_auth.writeSession.sessionStorage_error', {e: String(e), len: payload.length}); }
    // Cookies are size-limited; best-effort only (minified payload).
    try{ _setCookie(LS_SESSION, payload, 30); }
    catch(e){ DBG.warn('cloud_auth.writeSession.cookie_error', {e: String(e), len: payload.length}); }
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
      if (!rt) return { ok:false, message:'missing_refresh_token' };

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
        return { ok:false, message:'refresh_failed', status:r.status, data };
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
      return { ok:true, session:data };
    } catch (_) {}
    return { ok:false, message:'refresh_exception' };
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
    if(e.SUPABASE_URL && e.SUPABASE_ANON_KEY) return true;
    // Cold start: EnvRuntime may not be ready yet. If a session exists, allow auth-dependent flows.
    try{
      const s = readSession();
      if(s && (s.access_token || (s.session && s.session.access_token))){
        DBG.warn('cloud_auth.enabled.env_missing_but_session_present', {hasUrl: !!e.SUPABASE_URL, hasKey: !!e.SUPABASE_ANON_KEY});
        return true;
      }
    }catch(e){}
    return false;
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
