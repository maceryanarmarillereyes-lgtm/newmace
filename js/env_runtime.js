(function(){
  function safeParseInt(v, d){
    var n = parseInt(v, 10);
    return isNaN(n) ? d : n;
  }

  var env = {
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',
    PRESENCE_TTL_SECONDS: 25,
    PRESENCE_POLL_MS: 3000
  };

  var readyResolve;
  var ready = new Promise(function(resolve){ readyResolve = resolve; });
  window.__MUMS_ENV_READY = ready;
  window.MUMS_ENV = env;

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
        env.PRESENCE_TTL_SECONDS = safeParseInt(data.PRESENCE_TTL_SECONDS, 25);
        env.PRESENCE_POLL_MS = safeParseInt(data.PRESENCE_POLL_MS, 3000);
      }
      readyResolve(env);
    })
    .catch(function(){ readyResolve(env); });
})();
