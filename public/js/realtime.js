/*
  Realtime (Collaboration Sync)
  -------------------------------------------------------------------
  - Local dev: optional WebSocket relay (ws://localhost...) for fast iteration.
  - Production: cloud sync via Supabase (Vercel functions /api/sync/*).

  Data model:
  - Only shared/team-interaction features are synced (announcements, schedules,
    mailbox state/tables, cases, team reminders, activity logs, etc.).
  - Per-user preferences (theme, world clock, quick links) are NOT synced here.

  Sync modes:
  - Green  : realtime channel (Supabase Realtime) active
  - Yellow : connecting / reconnecting
  - Red    : offline (blocked when realtime is mandatory)
*/
(function(){
  const isLocalHost = (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

  // Keys that should synchronize across all devices/users (global read).
  const SYNC_KEYS = [
    'ums_announcements',
    'mums_team_reminders',
    'ums_weekly_schedules',
    'ums_master_schedule',
    'ums_schedule_locks',
    'ums_member_leaves',
    'ums_schedule_notifs',
    'mums_team_config',
    'mums_attendance',
    'mums_mailbox_tables',
    'mums_mailbox_state',
    'ums_cases',
    'ums_activity_logs',
    'mums_mailbox_time_override_cloud'
  ];

  const DEFAULT_RELAY_URL = 'ws://localhost:17601';

  let ws = null;
  let wsOk = false;

  // Cloud sync
  // NOTE: Realtime is mandatory for collaborative features in production.
  // We still run a light periodic reconciliation pull while realtime is connected
  // to protect against missed events (tab sleep, network hiccups).
  let lastCloudTs = 0;
  let cloudOkAt = 0;
  let cloudMode = 'offline'; // realtime | connecting | offline
  let sbClient = null;
  let sbChannel = null;
  let connectTimer = null;
  let reconnectTimer = null;
  let reconcileTimer = null;
  let reconnectBackoffMs = 1200;
  let lastAuthToken = '';

  const pushTimers = new Map();
  const lastLocalByKey = new Map();
  const clientId = (function(){
    try {
      const k = 'mums_client_id';
      let v = localStorage.getItem(k);
      if (!v) {
        v = 'c_' + Math.random().toString(36).slice(2) + '_' + Date.now().toString(36);
        localStorage.setItem(k, v);
      }
      return v;
    } catch (_) {
      return 'c_' + Math.random().toString(36).slice(2);
    }
  })();

  function dispatchStatus(mode, detail){
    cloudMode = mode;
    try {
      window.dispatchEvent(new CustomEvent('mums:syncstatus', {
        detail: { mode, detail: detail || '', lastOkAt: cloudOkAt }
      }));
    } catch(_) {}
  }

  function shouldSyncKey(key){
    return SYNC_KEYS.indexOf(key) !== -1;
  }

  function applyRemoteKey(key, value){
    if (!shouldSyncKey(key)) return;
    if (!window.Store || typeof Store.__writeRaw !== 'function') return;
    Store.__writeRaw(key, value, { fromRealtime: true });
  }

  // ----------------------
  // Local relay (dev only)
  // ----------------------
  function connectRelay(){
    try {
      const env = (window.EnvRuntime && EnvRuntime.env && EnvRuntime.env()) || (window.MUMS_ENV || {});
      const relayUrl = (env.REALTIME_RELAY_URL || '').trim() || DEFAULT_RELAY_URL;
      if (!isLocalHost) return; // only for dev

      ws = new WebSocket(relayUrl);
      ws.addEventListener('open', ()=>{ wsOk = true; });
      ws.addEventListener('close', ()=>{ wsOk = false; });
      ws.addEventListener('error', ()=>{ wsOk = false; });
      ws.addEventListener('message', (ev)=>{
        try{
          const msg = JSON.parse(ev.data || '{}');
          if (!msg || msg.type !== 'set' || !shouldSyncKey(msg.key)) return;
          applyRemoteKey(msg.key, msg.value);
        }catch(_){ }
      });
    } catch (_) {}
  }

  function relaySend(key, value){
    try {
      if (!wsOk || !ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type:'set', key, value }));
    } catch (_) {}
  }

  // ----------------------
  // Cloud sync (Supabase)
  // ----------------------
  async function cloudFetch(url, opts){
    const headers = Object.assign({}, (opts && opts.headers) || {});
    const token = window.CloudAuth && CloudAuth.accessToken ? CloudAuth.accessToken() : '';
    if (token) headers['Authorization'] = 'Bearer ' + token;
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    const res = await fetch(url, Object.assign({}, opts || {}, { headers }));
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) {}
    return { ok: res.ok, status: res.status, json, text };
  }

  async function pullOnce(){
    try {
      const out = await cloudFetch(`/api/sync/pull?since=${encodeURIComponent(String(lastCloudTs))}&clientId=${encodeURIComponent(clientId)}`);
      if (!out.ok) {
        // Keep current status; surface detail.
        dispatchStatus(cloudMode, `Pull failed (${out.status})`);
        return;
      }
      const docs = (out.json && out.json.docs) ? out.json.docs : [];
      for (const d of docs) {
        if (!d || !d.key) continue;
        // Ignore our own echo if desired; Store.__writeRaw already suppresses republish.
        applyRemoteKey(d.key, d.value);
        if (d.updatedAt && d.updatedAt > lastCloudTs) lastCloudTs = d.updatedAt;
      }
      cloudOkAt = Date.now();
      // Do not downgrade mode to polling; realtime remains mandatory.
    } catch (e) {
      dispatchStatus(cloudMode, `Pull error: ${String(e && e.message ? e.message : e)}`);
    }
  }

  function stopCloud(){
    try {
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (reconcileTimer) { clearInterval(reconcileTimer); reconcileTimer = null; }
    } catch (_) {}
    try { if (sbChannel && sbChannel.unsubscribe) sbChannel.unsubscribe(); } catch (_) {}
    sbChannel = null;
    sbClient = null;
  }

  function scheduleReconnect(reason){
    try {
      if (reconnectTimer) return;
      const delay = Math.min(12000, reconnectBackoffMs);
      reconnectBackoffMs = Math.min(12000, Math.round(reconnectBackoffMs * 1.6));
      dispatchStatus('connecting', `Reconnecting… ${reason ? '('+reason+')' : ''}`);
      reconnectTimer = setTimeout(()=>{
        reconnectTimer = null;
        connectCloudMandatory();
      }, delay);
    } catch (_) {}
  }

  function trySupabaseRealtimeMandatory(){
    try {
      const env = (window.EnvRuntime && EnvRuntime.env && EnvRuntime.env()) || (window.MUMS_ENV || {});
      const enabled = String(env.SYNC_ENABLE_SUPABASE_REALTIME || 'true').toLowerCase() !== 'false';
      if (!enabled) return false;
      if (!window.supabase || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return false;
      if (!(window.CloudAuth && CloudAuth.accessToken && CloudAuth.accessToken())) return false;

      const token = String(CloudAuth.accessToken() || '');
      if (!token) return false;
      lastAuthToken = token;

      sbClient = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 10 } },
        global: {
          headers: {
            // Critical: provide user JWT so Realtime respects RLS (authenticated role)
            Authorization: 'Bearer ' + token
          }
        }
      });

      // Critical: authorize Realtime socket (Supabase Realtime v2)
      try { sbClient.realtime && sbClient.realtime.setAuth && sbClient.realtime.setAuth(token); } catch (_) {}

      // Subscribe to documents table changes (server writes). RLS allows authenticated select;
      // we still do a reconciliation pull after we are subscribed.
      sbChannel = sbClient.channel('mums-sync-docs')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'mums_documents' }, (payload) => {
          try {
            const row = payload && payload.new ? payload.new : null;
            if (!row || !row.key) return;
            if (row.updated_by_client_id && row.updated_by_client_id === clientId) return;
            applyRemoteKey(row.key, row.value);
            const ts = row.updated_at ? Date.parse(row.updated_at) : Date.now();
            if (ts > lastCloudTs) lastCloudTs = ts;
          } catch (_) {}
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            cloudOkAt = Date.now();
            reconnectBackoffMs = 1200;
            dispatchStatus('realtime', 'Supabase Realtime connected');
            // Bootstrap latest state right after realtime is live.
            pullOnce();

            // Integrity reconciliation: keep status green, but periodically pull
            // to protect against missed events.
            try {
              const intervalMs = Math.max(5000, Number(env.SYNC_RECONCILE_MS || 15000));
              if (reconcileTimer) clearInterval(reconcileTimer);
              reconcileTimer = setInterval(()=>{
                if (cloudMode !== 'realtime') return;
                pullOnce();
              }, intervalMs);
            } catch (_) {}
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            dispatchStatus('offline', `Realtime error: ${status}`);
            scheduleReconnect(status);
          }
        });

      // Mandatory realtime: fail fast if we cannot subscribe within timeout.
      try {
        const timeoutMs = Math.max(2500, Number(env.SYNC_CONNECT_TIMEOUT_MS || 7000));
        if (connectTimer) clearTimeout(connectTimer);
        connectTimer = setTimeout(()=>{
          connectTimer = null;
          if (cloudMode !== 'realtime') {
            dispatchStatus('offline', 'Realtime required but not connected (check network / Realtime replication)');
            scheduleReconnect('not-subscribed');
          }
        }, timeoutMs);
      } catch (_) {}

      return true;
    } catch (_) {
      return false;
    }
  }

  function connectCloudMandatory(){
    try {
      stopCloud();

      if (!(window.CloudAuth && CloudAuth.isEnabled && CloudAuth.isEnabled())) {
        dispatchStatus('offline', 'Cloud auth disabled (SUPABASE_URL/ANON_KEY missing)');
        return;
      }

      if (!(CloudAuth.accessToken && CloudAuth.accessToken())) {
        dispatchStatus('offline', 'Not authenticated');
        return;
      }

      dispatchStatus('connecting', 'Connecting to Supabase Realtime…');

      // Attempt Supabase Realtime (mandatory).
      const ok = trySupabaseRealtimeMandatory();
      if (!ok) {
        dispatchStatus('offline', 'Realtime init failed (env/auth missing)');
        scheduleReconnect('init-failed');
      }
    } catch (e) {
      dispatchStatus('offline', String(e && e.message ? e.message : e));
    }
  }

  async function cloudPush(key, value, removedIds, op){
    try {
      const body = { key, value, removedIds: removedIds || [], op: op || 'set', clientId, ts: Date.now() };
      const out = await cloudFetch('/api/sync/push', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      if (!out.ok) {
        // Do not change mode on push failures; surface detail only.
        dispatchStatus(cloudMode, `Push failed (${out.status})`);
      }
    } catch (e) {
      dispatchStatus(cloudMode, `Push error: ${String(e && e.message ? e.message : e)}`);
    }
  }

  function diffArray(prevArr, nextArr){
    const prev = Array.isArray(prevArr) ? prevArr : [];
    const next = Array.isArray(nextArr) ? nextArr : [];
    const idOf = (it)=>{
      if (!it || typeof it !== 'object') return '';
      return String(it.id || it.caseNo || it.case_no || it.uuid || it.key || '');
    };
    const prevIds = new Set(prev.map(idOf).filter(Boolean));
    const nextIds = new Set(next.map(idOf).filter(Boolean));
    const removed = [];
    prevIds.forEach((id)=>{ if (!nextIds.has(id)) removed.push(id); });
    return removed;
  }

  function schedulePush(key, value){
    if (!shouldSyncKey(key)) return;

    // Relay (dev)
    relaySend(key, value);

    // Cloud
    if (!(window.CloudAuth && CloudAuth.isEnabled && CloudAuth.isEnabled())) return;

    // Debounce per key
    if (pushTimers.has(key)) clearTimeout(pushTimers.get(key));
    pushTimers.set(key, setTimeout(()=>{
      pushTimers.delete(key);
      const prev = lastLocalByKey.get(key);
      lastLocalByKey.set(key, value);

      let removedIds = [];
      let op = 'set';
      if (Array.isArray(value)) {
        removedIds = diffArray(prev, value);
        op = 'merge'; // safe for list keys
      } else if (typeof value === 'object') {
        op = 'merge';
      }

      cloudPush(key, value, removedIds, op);
    }, 300));
  }

  // Connect after DOM and env are ready
  function boot(){
    try {
      connectRelay();

      // Mandatory realtime: only connect once we have a token.
      if (window.CloudAuth && CloudAuth.isEnabled && CloudAuth.isEnabled() && CloudAuth.accessToken && CloudAuth.accessToken()) {
        connectCloudMandatory();
      } else {
        dispatchStatus('offline', 'Login required');
      }

      // Reconnect on login/logout.
      window.addEventListener('mums:auth', (e)=>{
        // e.detail = { type: 'login'|'logout' }
        const t = (e && e.detail && e.detail.type) ? String(e.detail.type) : '';
        if (t === 'logout') {
          stopCloud();
          dispatchStatus('offline', 'Logged out');
          return;
        }
        connectCloudMandatory();
      });

      // If Supabase access token rotates (refresh), reconnect realtime
      // to avoid silent RLS auth failures.
      window.addEventListener('mums:authtoken', (e)=>{
        try {
          const t = (e && e.detail && e.detail.token) ? String(e.detail.token) : '';
          if (!t || t === lastAuthToken) return;
          lastAuthToken = t;
          // Reconnect to ensure both HTTP headers and WS auth are updated.
          connectCloudMandatory();
        } catch (_) {}
      });
    } catch (_) {}
  }

  // Delay boot to allow Store/Auth to initialize.
  setTimeout(boot, 400);

  window.Realtime = {
    onLocalWrite: schedulePush,
    clientId: ()=>clientId,
    syncKeys: ()=>SYNC_KEYS.slice(),
    forceReconnect: ()=>{ try{ connectCloudMandatory(); }catch(_){ } }
  };
})();
