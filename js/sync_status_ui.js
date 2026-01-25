(function(){
  function root(){ return document.getElementById('realtimeSyncStatus'); }
  function isLoginPage(){
    try {
      const p = String(location.pathname || '');
      return p.endsWith('/login.html') || p.endsWith('login.html');
    } catch (_) { return false; }
  }

  function ensureBlocker(){
    if (isLoginPage()) return null;
    let el = document.getElementById('realtimeBlocker');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'realtimeBlocker';
    el.className = 'realtime-blocker';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="realtime-blocker-card" role="dialog" aria-modal="true" aria-labelledby="rtTitle">
        <div class="rt-head">
          <div class="rt-title" id="rtTitle">Realtime Sync Required</div>
          <div class="rt-sub">This app requires an active realtime connection to ensure cross-device consistency.</div>
        </div>
        <div class="rt-body">
          <div class="rt-status"><span class="rt-dot"></span><span class="rt-status-text">Connecting…</span></div>
          <div class="rt-detail" aria-live="polite"></div>
          <div class="rt-hint">
            If this persists, verify: (1) you are logged in, (2) Supabase Realtime is enabled for <b>mums_documents</b>, and (3) your network allows WebSockets.
          </div>
        </div>
        <div class="rt-actions">
          <button class="btn btn-primary" type="button" id="rtRetryBtn">Retry connection</button>
          <button class="btn" type="button" id="rtReloadBtn">Reload page</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    try {
      el.querySelector('#rtRetryBtn').addEventListener('click', function(){
        try {
          if (window.Realtime && typeof Realtime.forceReconnect === 'function') Realtime.forceReconnect();
          else location.reload();
        } catch (_) { location.reload(); }
      });
      el.querySelector('#rtReloadBtn').addEventListener('click', function(){ location.reload(); });
    } catch (_) {}
    return el;
  }

  function setBlockerVisible(visible, mode, detail){
    const el = ensureBlocker();
    if (!el) return;
    el.style.display = visible ? 'flex' : 'none';
    if (!visible) return;
    try {
      const st = el.querySelector('.rt-status-text');
      if (st) st.textContent = (mode === 'connecting') ? 'Connecting…' : 'Offline';
      const det = el.querySelector('.rt-detail');
      if (det) det.textContent = detail || '';
    } catch (_) {}
  }

  function set(mode, detail){
    var el = root();
    if (!el) return;
    el.classList.remove('ok','poll','off');
    if (mode === 'realtime') el.classList.add('ok');
    else if (mode === 'connecting' || mode === 'polling') el.classList.add('poll');
    else el.classList.add('off');

    var state = el.querySelector('.state');
    if (state) {
      state.textContent = (mode === 'realtime') ? 'Connected' : (mode === 'connecting') ? 'Connecting' : (mode === 'polling') ? 'Polling' : 'Offline';
    }
    if (detail) el.title = detail;

    // Mandatory realtime: block interactions unless connected.
    if (mode === 'realtime') setBlockerVisible(false);
    else setBlockerVisible(true, mode, detail);
  }

  window.addEventListener('mums:syncstatus', function(e){
    try {
      var d = (e && e.detail) ? e.detail : {};
      set(String(d.mode || 'offline'), String(d.detail || ''));
    } catch(_) {}
  });

  document.addEventListener('DOMContentLoaded', function(){
    // Default to connecting; realtime module will update shortly.
    set('connecting', 'Sync starting…');
  });
})();
