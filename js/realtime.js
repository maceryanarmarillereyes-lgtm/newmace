/**
 * MUMS Realtime Relay (optional)
 * Enables real-time sync across different browsers / Incognito sessions by connecting to a local relay server.
 *
 * Frontend connects to ws://localhost:17601 by default.
 * If the server isn't running, the app works normally (offline / single-browser).
 */
(function(){
  const DEFAULT_URL = 'ws://localhost:17601';
  const SYNC_KEYS = new Set([
    // Online presence + attendance must sync across different browser contexts
    // (Edge normal vs InPrivate) when using the relay.
    'mums_online_users',
    'mums_attendance',
    'mums_mailbox_time_override',
    'mums_mailbox_tables',
    'mums_mailbox_state',
    'ums_activity_logs',
    'ums_schedule_notifs'
  ]);

  function rid(){
    try{ return (crypto && crypto.randomUUID) ? crypto.randomUUID() : null; }catch(_){ return null; }
  }

  const Realtime = {
    url: DEFAULT_URL,
    clientId: rid() || ('c_' + Math.random().toString(16).slice(2) + '_' + Date.now()),
    ws: null,
    connected: false,
    _queue: [],
    _lastSendAt: 0,
    _applyLock: false,

    shouldSyncKey(key){
      return SYNC_KEYS.has(String(key||''));
    },

    connect(){
      try{
        if(Realtime.ws && (Realtime.ws.readyState === 0 || Realtime.ws.readyState === 1)) return;
        // Prevent noisy ws://localhost attempts in production deployments.
        if(!isLocalHost && /^ws:\/\/localhost/i.test(Realtime.url)) return;
        const ws = new WebSocket(Realtime.url);
        Realtime.ws = ws;

        ws.addEventListener('open', ()=>{
          Realtime.connected = true;
          try{
            ws.send(JSON.stringify({ t:'hello', clientId:Realtime.clientId, now:Date.now() }));
          }catch(_){}
          Realtime.flush();
        });

        ws.addEventListener('close', ()=>{
          Realtime.connected = false;
          // retry with backoff
          setTimeout(()=>Realtime.connect(), 2000);
        });

        ws.addEventListener('error', ()=>{
          Realtime.connected = false;
          try{ ws.close(); }catch(_){}
        });

        ws.addEventListener('message', (ev)=>{
          try{
            const msg = JSON.parse(String(ev.data||'{}'));
            if(!msg || typeof msg !== 'object') return;
            if(msg.clientId && msg.clientId === Realtime.clientId) return; // ignore echoes
            if(msg.t === 'snapshot' && msg.data && typeof msg.data === 'object'){
              // Apply initial snapshot for sync keys
              for(const k of Object.keys(msg.data)){
                if(!Realtime.shouldSyncKey(k)) continue;
                Realtime.applyRemoteKey(k, msg.data[k]);
              }
              return;
            }
            if(msg.t === 'store:update' && msg.key){
              if(!Realtime.shouldSyncKey(msg.key)) return;
              Realtime.applyRemoteKey(msg.key, msg.value);
              return;
            }
          }catch(_){}
        });
      }catch(_){}
    },

    flush(){
      try{
        if(!Realtime.ws || Realtime.ws.readyState !== 1) return;
        while(Realtime._queue.length){
          const item = Realtime._queue.shift();
          try{ Realtime.ws.send(JSON.stringify(item)); }catch(_){ break; }
        }
      }catch(_){}
    },

    // Called by Store.write() for local writes (excluding fromRealtime writes).
    onLocalWrite(key, value){
      try{
        if(!Realtime.shouldSyncKey(key)) return;
        const payload = { t:'store:update', key:String(key), value:value, clientId:Realtime.clientId, ts:Date.now() };
        if(!Realtime.ws || Realtime.ws.readyState !== 1){
          Realtime._queue.push(payload);
          return;
        }
        Realtime.ws.send(JSON.stringify(payload));
        Realtime._lastSendAt = Date.now();
      }catch(_){}
    },

    applyRemoteKey(key, value){
      try{
        // Prevent feedback loop: Store.write() won't publish because we pass opts.fromRealtime
        if(!window.Store || !Store.__writeRaw) return;
        Realtime._applyLock = true;
        Store.__writeRaw(String(key), value, { fromRealtime:true });
      }catch(_){}
      finally{
        Realtime._applyLock = false;
      }
    }
  };

  // Expose
  window.Realtime = Realtime;

  // Wire minimal Store hook for remote writes.
  // Store.js uses a private write() function; we expose a safe wrapper here.
  // This keeps the rest of the codebase unchanged.
  (function exposeStoreWriteRaw(){
    try{
      if(!window.Store) return;
      if(Store.__writeRaw) return;
      Store.__writeRaw = function(key, value, opts){
        try{
          // Store.saveX methods are safer for some keys, but for sync we need exact key parity.
          // Use Store's internal write via Store._rawSet if available; fallback to localStorage.
          if(Store.__rawWrite){
            return Store.__rawWrite(key, value, opts);
          }
          // Fallback: use localStorage set directly and fire store event for UI update.
          localStorage.setItem(String(key), JSON.stringify(value));
          try{ window.dispatchEvent(new CustomEvent('mums:store', { detail: { key:String(key) } })); }catch(_){}
          return true;
        }catch(_){ return false; }
      };
    }catch(_){}
  })();

  // Auto-connect on load (non-blocking).
  setTimeout(()=>Realtime.connect(), 250);
})();
