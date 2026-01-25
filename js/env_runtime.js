(function(){
  const DBG = (window.MUMS_DEBUG || {log(){},warn(){},error(){}});
  DBG.log('info','env_runtime.start');

  function safeParseInt(v, d){
    var n = parseInt(v, 10);
    return isNaN(n) ? d : n;
  }

  // Public (safe) runtime env delivered by /api/env
  var env = {
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',
    USERNAME_EMAIL_DOMAIN: 'mums.local',
    REALTIME_RELAY_URL: '',
    REMOTE_PATCH_URL: '',
    MAILBOX_OVERRIDE_POLL_MS: 2000,
    PRESENCE_TTL_SECONDS: 25,
    PRESENCE_POLL_MS: 3000,
    SYNC_POLL_MS: 2000,
    SYNC_ENABLE_SUPABASE_REALTIME: true
  };

  var readyResolve;
  var ready = new Promise(function(resolve){ readyResolve = resolve; });

  // Backwards-compatible globals
  window.__MUMS_ENV_READY = ready;
  window.MUMS_ENV = env;

  // Canonical helper used across modules
  window.EnvRuntime = {
    ready: function(){ return ready; },
    env: function(){ return env; }
  };

  // file:// cannot call /api. Keep env empty and resolve.
  if (location.protocol === 'file:') {
    readyResolve(env);
    return;
  }

  fetch('/api/env', { cache: 'no-store' })
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(data){
      if (data && typeof data === 'object') {
        env.SUPABASE_URL = data.SUPABASE_URL || '';
        env.SUPABASE_ANON_KEY = data.SUPABASE_ANON_KEY || '';
        env.USERNAME_EMAIL_DOMAIN = data.USERNAME_EMAIL_DOMAIN || env.USERNAME_EMAIL_DOMAIN;
        env.REALTIME_RELAY_URL = data.REALTIME_RELAY_URL || '';
        env.REMOTE_PATCH_URL = data.REMOTE_PATCH_URL || '';
        env.MAILBOX_OVERRIDE_POLL_MS = safeParseInt(data.MAILBOX_OVERRIDE_POLL_MS, env.MAILBOX_OVERRIDE_POLL_MS);
        env.PRESENCE_TTL_SECONDS = safeParseInt(data.PRESENCE_TTL_SECONDS, env.PRESENCE_TTL_SECONDS);
        env.PRESENCE_POLL_MS = safeParseInt(data.PRESENCE_POLL_MS, env.PRESENCE_POLL_MS);
        env.SYNC_POLL_MS = safeParseInt(data.SYNC_POLL_MS, env.SYNC_POLL_MS);
        env.SYNC_ENABLE_SUPABASE_REALTIME = (String(data.SYNC_ENABLE_SUPABASE_REALTIME || 'true') !== 'false');
      }
      readyResolve(env);
    })
    .catch(function(){ readyResolve(env); });
})();