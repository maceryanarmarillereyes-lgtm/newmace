(function(){
  let cleanup = null;
  let annTimer = null;
  let notifCleanup = null;

  function showFatalError(err){
    try{
      console.error(err);
      // Log fatal errors into Activity Logs (for reporting)
      try{
        if(window.Store && Store.addLog){
          const u = (window.Auth && Auth.getUser) ? Auth.getUser() : null;
          Store.addLog({
            ts: Date.now(),
            teamId: (u && u.teamId) ? u.teamId : 'system',
            actorId: (u && u.id) ? u.id : 'system',
            actorName: (u && u.name) ? u.name : 'SYSTEM',
            action: 'APP_ERROR',
            msg: String(err && (err.message||err)) ,
            detail: String((err && err.stack) ? err.stack : '')
          });
        }
      }catch(__){}
      const main = document.getElementById('main');
      if(main){
        main.innerHTML = `
          <div class="card pad" style="border:1px solid rgba(255,80,80,.35)">
            <div class="h2" style="margin:0 0 8px">Something went wrong</div>
            <div class="small" style="white-space:pre-wrap;opacity:.9">${UI && UI.esc ? UI.esc(String(err && (err.stack||err.message||err))) : String(err)}</div>
            <div class="small muted" style="margin-top:10px">Tip: try Logout → Login, or hard refresh (Ctrl+Shift+R). If it still happens, send the console error screenshot.</div>
          </div>
        `;
      }
    }catch(_){ /* ignore */ }
  }

  // Global safety net: surface uncaught errors in a controlled, user-friendly way.
  // This is intentionally lightweight (no dependencies) and runs once per tab.
  try{
    if(!window.__mumsGlobalErrorBound){
      window.__mumsGlobalErrorBound = true;
      window.addEventListener('error', (ev)=>{
        try{
          // Ignore resource load errors (script/css 404) here; devtools will still show them.
          if(ev && ev.target && (ev.target.tagName === 'SCRIPT' || ev.target.tagName === 'LINK')) return;
          const err = (ev && ev.error) ? ev.error : new Error(String(ev && ev.message || 'Unknown error'));
          showFatalError(err);
        }catch(_){ }
      });
      window.addEventListener('unhandledrejection', (ev)=>{
        try{
          const reason = ev && ev.reason;
          const err = (reason instanceof Error) ? reason : new Error(String(reason || 'Unhandled promise rejection'));
          showFatalError(err);
        }catch(_){ }
      });
    }
  }catch(_){ }

  // Reduce font-size until text fits its box (used for sidebar profile). Cheap and safe.
  function fitText(el, minPx, maxPx){
    try{
      if(!el) return;
      const min = Number(minPx||12);
      const max = Number(maxPx||22);
      el.style.fontSize = max + 'px';
      // Force reflow
      void el.offsetHeight;
      let cur = max;
      // Shrink while overflowing (height-wise) or causing horizontal overflow.
      while(cur > min && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)){
        cur -= 1;
        el.style.fontSize = cur + 'px';
      }
    }catch(e){ /* ignore */ }
  }

  // Theme application via CSS variables
  function applyTheme(themeId){
    const themes = (Config && Array.isArray(Config.THEMES)) ? Config.THEMES : [];
    const t = themes.find(x=>x.id===themeId) || themes[0];
    if(!t) return;

    // Classic Style supports auto mode (follows OS preference) and an optional dark palette.
    // Safe for other themes: only activates when t.mode === 'auto'.
    let modePref = (t.mode ? String(t.mode) : (String(t.id||'').includes('light') ? 'light' : 'dark'));
    let mode = modePref;
    if(modePref === 'auto'){
      try{
        mode = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
      }catch(_){ mode = 'light'; }
    }

    // Choose palette for the computed mode (if provided)
    let tt = t;
    if(modePref === 'auto' && mode === 'dark' && t.dark && typeof t.dark === 'object'){
      try{ tt = Object.assign({}, t, t.dark); }catch(_){ tt = t; }
    }

    const r = document.documentElement;
    r.style.setProperty('--bg', tt.bg);
    r.style.setProperty('--panel', tt.panel);
    r.style.setProperty('--panel2', tt.panel2);
    r.style.setProperty('--text', tt.text);
    r.style.setProperty('--muted', tt.muted);
    r.style.setProperty('--border', tt.border);
    r.style.setProperty('--accent', tt.accent);

    // Derived RGB vars for CSS rgba() usage (keeps themes consistent across light/dark)
    try{
      const hex = String(tt.accent||'').trim();
      const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
      if(m){
        const s = m[1];
        const rr = parseInt(s.slice(0,2), 16);
        const gg = parseInt(s.slice(2,4), 16);
        const bb = parseInt(s.slice(4,6), 16);
        r.style.setProperty('--accent-rgb', `${rr},${gg},${bb}`);
      }else{
        r.style.setProperty('--accent-rgb', '74,163,255');
      }
    }catch(_){ r.style.setProperty('--accent-rgb', '74,163,255'); }

    r.style.setProperty('--bgRad1', tt.bgRad1);
    r.style.setProperty('--bgRad3', tt.bgRad3);

    // Optional deeper theme controls
    try{
      if(tt.font) r.style.setProperty('--font', tt.font); else r.style.removeProperty('--font');
      if(tt.radius) r.style.setProperty('--radius', tt.radius); else r.style.removeProperty('--radius');
      if(tt.shadow) r.style.setProperty('--shadow', tt.shadow); else r.style.removeProperty('--shadow');
    }catch(_){ }
    try{
      document.body.dataset.theme = t.id;
      // Expose theme mode for CSS (computed; supports classic auto-mode)
      document.body.dataset.mode = mode;
      document.documentElement.dataset.mode = mode;
      
      // Fix16: semantic tokens + mode-specific control colors + accent contrast
      try{
        r.style.setProperty("--surface-0", tt.bg);
        r.style.setProperty("--surface-1", tt.panel);
        r.style.setProperty("--surface-2", tt.panel2);
        r.style.setProperty("--text-0", tt.text);
        r.style.setProperty("--text-muted", tt.muted);
        r.style.setProperty("--border-0", tt.border);
        const isLight = mode === "light";
        r.style.setProperty("--control-bg", isLight ? "rgba(255,255,255,.92)" : "rgba(18,24,38,.92)");
        r.style.setProperty("--control-border", isLight ? "rgba(15,23,42,.12)" : tt.border);
        r.style.setProperty("--control-text", tt.text);
        r.style.setProperty("--overlay-scrim", isLight ? "rgba(15,23,42,.40)" : "rgba(0,0,0,.55)");
        r.style.setProperty("--btn-glass-top", isLight ? "rgba(15,23,42,.04)" : "rgba(255,255,255,.08)");
        r.style.setProperty("--btn-glass-bot", isLight ? "rgba(15,23,42,.02)" : "rgba(255,255,255,.02)");
        r.style.setProperty("--accent-contrast", chooseAccentText(tt.accent));
      }catch(_){ }

      try{ window.dispatchEvent(new CustomEvent("mums:themeApplied", { detail: { id: t.id, mode } })); }catch(_){ }
      try{ if(typeof renderThemeAudit === "function") renderThemeAudit(); }catch(_){ }

    }catch(e){}
  }


  // Fix16: Theme Lab (contrast/visibility checks)
  function _parseColor(str){
    const s = String(str||'').trim();
    // #rgb or #rrggbb
    let m = /^#?([0-9a-f]{3})$/i.exec(s);
    if(m){
      const h = m[1];
      return [int(h[0]*2), int(h[1]*2), int(h[2]*2)];
    }
    m = /^#?([0-9a-f]{6})$/i.exec(s);
    if(m){
      const h = m[1];
      return [int(h.slice(0,2)), int(h.slice(2,4)), int(h.slice(4,6))];
    }
    // rgb/rgba
    m = /^rgba?\(([^)]+)\)$/i.exec(s);
    if(m){
      const parts = m[1].split(',').map(x=>parseFloat(x));
      if(parts.length>=3) return [clamp(parts[0]), clamp(parts[1]), clamp(parts[2])];
    }
    return [255,255,255];

    function int(hex){ return parseInt(hex,16); }
    function clamp(n){ n = Number(n); if(!Number.isFinite(n)) return 0; return Math.max(0, Math.min(255, n)); }
  }


  // Hide Settings cards per-role (Option A: hidden completely when disabled)
  function applySettingsVisibility(user){
    try{
      if(!user || !window.Store || !Store.getRoleSettingsFeatures) return;

      // Defensive role normalization: prevents accidental hiding when role strings differ
      // (e.g., "Team Lead" vs "TEAM_LEAD") or when older sessions have legacy values.
      const rawRole = String(user.role||'').trim();
      const role = (Store && Store.normalizeRole) ? Store.normalizeRole(rawRole)
        : rawRole.toUpperCase().replace(/\s+/g,'_').replace(/-+/g,'_');

      const all = Store.getRoleSettingsFeatures();
      const feats = (all && all[role]) ? all[role] : null;

      // If there is no explicit feature config for this role, do not hide anything.
      const hasAny = feats && typeof feats==='object' && Object.keys(feats).length>0;
      if(!hasAny){
        document.querySelectorAll('.settings-card').forEach(c=>{ try{ c.style.display=''; }catch(_){ } });
        return;
      }

      const map = {
        profile: 'openProfileBtn',
        sound: 'openSoundBtn',
        theme: 'openThemeBtn',
        quicklinks: 'openLinksBtn',
        worldclocks: 'openClocksBtn',
        cursor: 'openCursorBtn',
        sidebar: 'openSidebarBtn',
        datatools: 'openDataToolsBtn',
      };

      Object.keys(map).forEach(key=>{
        // Default allow for forward-compat (new cards should appear unless explicitly disabled).
        const allowed = (key in feats) ? !!feats[key] : true;
        const btn = document.getElementById(map[key]);
        if(!btn) return;
        const card = btn.closest ? btn.closest('.settings-card') : null;
        if(card) card.style.display = allowed ? '' : 'none';
      });
    }catch(e){ /* ignore */ }
  };

  // -----------------------------
  // System Check (Super Admin / Super User)
  // -----------------------------
  // Offline-first diagnostics and smoke tests to catch common regressions and
  // provide actionable recommendations. Not a replacement for CI, but valuable
  // for local/offline deployments.
  function bindSystemCheckModal(currentUser){
    // Bind once
    if(window.__mumsSystemCheck && window.__mumsSystemCheck.bound) return;

    const els = {
      state: document.getElementById('syscheckState'),
      countdown: document.getElementById('syscheckCountdown'),
      fill: document.getElementById('syscheckFill'),
      hint: document.getElementById('syscheckHint'),
      list: document.getElementById('syscheckList'),
      critPill: document.getElementById('syscheckCriticalPill'),
      minorPill: document.getElementById('syscheckMinorPill'),
      runBtn: document.getElementById('syscheckRunBtn'),
      clearBtn: document.getElementById('syscheckClearResolvedBtn'),
    };
    if(!els.runBtn || !els.list) return;

    let running = false;
    let timer = null;
    let remaining = 0;

    function setState(s){ if(els.state) els.state.textContent = s; }
    function setHint(s){ if(els.hint) els.hint.textContent = s; }
    function setProgress(p){ if(els.fill) els.fill.style.width = `${Math.max(0, Math.min(100, p))}%`; }

    function renderFindings(findings){
      const crit = findings.filter(f=>f.severity==='Critical').length;
      const minor = findings.filter(f=>f.severity==='Minor').length;
      if(els.critPill) els.critPill.textContent = `Critical: ${crit}`;
      if(els.minorPill) els.minorPill.textContent = `Minor: ${minor}`;
      els.list.innerHTML = findings.map(f=>{
        const cls = (f.severity==='Critical') ? 'crit' : 'minor';
        const sev = (f.severity==='Critical') ? `<span class="sev crit">CRITICAL</span>` : `<span class="sev minor">MINOR</span>`;
        const rec = f.recommendation ? `<div class="small" style="margin-top:8px"><b>Recommendation:</b> ${UI.esc(f.recommendation)}</div>` : '';
        const impact = f.impact ? `<div class="small muted" style="margin-top:6px">${UI.esc(f.impact)}</div>` : '';
        const detail = f.details ? `<details style="margin-top:10px"><summary class="small" style="cursor:pointer;font-weight:900">Details</summary><div class="small muted" style="margin-top:8px;white-space:pre-wrap">${UI.esc(String(f.details))}</div></details>` : '';
        return `<div class="syscheck-item ${cls}"><div class="t"><div><div style="font-weight:950">${UI.esc(f.title||'Finding')}</div>${impact}</div>${sev}</div>${rec}${detail}</div>`;
      }).join('');
    }

    function reset(){
      running = false;
      if(timer){ clearInterval(timer); timer=null; }
      remaining = 0;
      if(els.countdown) els.countdown.textContent = '—';
      setState('Ready');
      setHint('Press Run to start diagnostics.');
      setProgress(0);
      renderFindings([]);
    }

    function makeFinding(severity, title, impact, recommendation, details){
      return { severity, title, impact, recommendation, details };
    }

    async function run(){
      if(running) return;
      running = true;
      setState('Running');
      setHint('Initializing checks...');
      setProgress(0);
      renderFindings([]);

      const findings = [];

      // Small helper to run a step and update progress
      const steps = [];
      const addStep = (label, fn)=> steps.push({ label, fn });

      addStep('Core globals', ()=>{
        const missing = [];
        ['Config','Store','UI','Auth','Pages'].forEach(k=>{ if(!window[k]) missing.push(k); });
        if(missing.length){
          findings.push(makeFinding('Critical', 'Missing core globals', 'The app may fail to route or render pages.', 'Verify script load order and ensure all bundled JS files are present.', `Missing: ${missing.join(', ')}`));
        }
      });

      addStep('Navigation integrity', ()=>{
        try{
          const nav = (window.Config && Config.NAV) ? Config.NAV : [];
          const flat = [];
          (nav||[]).forEach(i=>{ if(i && i.children) i.children.forEach(c=>flat.push(c.id)); else if(i) flat.push(i.id); });
          if(flat.includes('gmt_overview')){
            findings.push(makeFinding('Minor', 'GMT Overview is still present in the main navigation', 'Users may access the page outside Settings > World Clocks.', 'Remove the GMT Overview entry from Config.NAV.', 'Config.NAV contains gmt_overview'));
          }
        }catch(e){
          findings.push(makeFinding('Minor', 'Navigation integrity check failed', 'Unable to validate navigation items.', 'Review Config.NAV structure.', String(e)));
        }
      });

      addStep('User record sanity', ()=>{
        try{
          const users = (Store && Store.getUsers) ? Store.getUsers() : [];
          const ids = new Set();
          const dup = [];
          (users||[]).forEach(u=>{ if(!u) return; const id = String(u.id||''); if(ids.has(id)) dup.push(id); ids.add(id); });
          if(dup.length){
            findings.push(makeFinding('Critical', 'Duplicate user IDs found', 'May cause permission and routing inconsistencies.', 'Clean local storage users list and ensure user deletion is permanent.', `Duplicate IDs: ${dup.join(', ')}`));
          }
          // Super Admin should not have team assignment
          const sa = (users||[]).find(u=>String(u.role||'').toUpperCase()==='SUPER_ADMIN');
          if(sa && (sa.teamId || sa.shiftId)){
            findings.push(makeFinding('Minor', 'Super Admin still has team/shift assigned', 'UI may show incorrect shift context for the Super Admin account.', 'Clear teamId/shiftId for SUPER_ADMIN in the users store.', JSON.stringify({teamId:sa.teamId, shiftId:sa.shiftId})));
          }
        }catch(e){
          findings.push(makeFinding('Minor', 'User record sanity check failed', 'Unable to validate users store.', 'Review users storage schema.', String(e)));
        }
      });

      addStep('World Clocks config', ()=>{
        try{
          const list = (Store && Store.getWorldClocks) ? Store.getWorldClocks() : [];
          if(!Array.isArray(list)){
            findings.push(makeFinding('Critical', 'World clocks config is not an array', 'Clocks modal and bottom bar may fail to render.', 'Reset world clocks config in local storage and re-save via Settings.', typeof list));
            return;
          }
          // Verify GMT offsets list exists (required by GMT Overview).
          const offs = (window.WorldClockUtils && Array.isArray(WorldClockUtils.GMT_OFFSETS_MINUTES)) ? WorldClockUtils.GMT_OFFSETS_MINUTES : null;
          if(!offs || !offs.length){
            findings.push(makeFinding('Critical', 'GMT offsets list missing', 'GMT Overview and pinned offset clocks may fail.', 'Ensure WorldClockUtils.GMT_OFFSETS_MINUTES is defined (app.js) and loaded before any GMT pages.', 'WorldClockUtils.GMT_OFFSETS_MINUTES is missing/empty'));
          }

          // Basic formatting smoke test
          if(window.WorldClockUtils && typeof WorldClockUtils.formatTimePartsForClock==='function'){
            const sample = list[0] || { timeZone:'UTC', offsetMinutes:0 };
            try{ WorldClockUtils.formatTimePartsForClock(new Date(), sample); }catch(ex){
              findings.push(makeFinding('Critical', 'World clock formatter threw an exception', 'Clock rendering may crash pages.', 'Validate timeZone / offsetMinutes values in world clocks settings.', String(ex)));
            }
          }
        }catch(e){
          findings.push(makeFinding('Minor', 'World clocks check failed', 'Unable to validate world clocks configuration.', 'Review Store.getWorldClocks and clock schemas.', String(e)));
        }
      });

      addStep('Page smoke tests', async ()=>{
        try{
          const pageIds = Object.keys(window.Pages||{});
          // Only smoke-test known pages that should render without additional user input.
          const allow = new Set(['dashboard','logs','gmt_overview','master_schedule','my_schedule']);
          const root = document.createElement('div');
          root.style.cssText = 'position:fixed;left:-99999px;top:-99999px;width:1200px;height:800px;overflow:hidden;';
          document.body.appendChild(root);
          for(const id of pageIds){
            if(!allow.has(id)) continue;
            root.innerHTML = '';
            try{ await Promise.resolve(window.Pages[id](root)); }
            catch(ex){
              findings.push(makeFinding('Minor', `Smoke test failed: ${id}`, 'This page may throw errors for some users.', 'Open Activity Logs for the stack trace and fix the offending module.', String(ex && (ex.stack||ex))));
            }
          }
          root.remove();
        }catch(e){
          findings.push(makeFinding('Minor', 'Page smoke tests failed', 'Unable to run render smoke tests.', 'Check that Pages registry exists and functions are callable.', String(e)));
        }
      });

      // Estimate time: ~1s per step + small buffer
      remaining = Math.max(6, Math.ceil(steps.length * 1.2));
      if(els.countdown) els.countdown.textContent = String(remaining);
      if(timer) clearInterval(timer);
      timer = setInterval(()=>{
        remaining = Math.max(0, remaining-1);
        if(els.countdown) els.countdown.textContent = String(remaining);
        if(remaining<=0 && timer){ clearInterval(timer); timer=null; }
      }, 1000);

      for(let i=0;i<steps.length;i++){
        const step = steps[i];
        setHint(`Running: ${step.label} (${i+1}/${steps.length})`);
        try{ await Promise.resolve(step.fn()); }
        catch(e){ findings.push(makeFinding('Minor', `System check step failed: ${step.label}`, 'A diagnostics step threw unexpectedly.', 'Review the system check implementation and ensure it is safe for offline use.', String(e && (e.stack||e)))); }
        setProgress(Math.round(((i+1)/steps.length)*100));
        // Keep the UI responsive
        await new Promise(r=>setTimeout(r, 150));
      }

      renderFindings(findings);
      const critCount = findings.filter(f=>f.severity==='Critical').length;
      setState(critCount===0 ? 'Completed' : 'Completed with issues');
      setHint(critCount===0 ? 'No critical findings. You can clear resolved error logs now.' : 'Resolve critical findings before clearing error logs.');

      // Persist the last stable run timestamp. Activity Logs can use this signal to
      // clear previously-resolved error noise without hiding currently-reproducible issues.
      try{
        if(critCount===0){
          const okTs = Date.now();
          localStorage.setItem('mums_syscheck_last_ok_ts', String(okTs));
        }
      }catch(_){ }

      // Auto-clear resolved "Script error" noise after a stable run (no critical findings).
      try{
        if(critCount===0 && window.Store && Store.autoFixLogs){
          const cut = Number(localStorage.getItem('mums_syscheck_last_ok_ts')||0) || Number(window.__mumsBootTs||0) || Date.now();
          Store.autoFixLogs({ clearResolvedBefore: cut, smartClearResolved: true });
        }
      }catch(_){ }

      running = false;
    }

    // Bind buttons
    els.runBtn.onclick = run;
    if(els.clearBtn){
      els.clearBtn.onclick = ()=>{
        try{
          const cut = Number(localStorage.getItem('mums_syscheck_last_ok_ts')||0) || Number(window.__mumsBootTs||0) || Date.now();
          if(window.Store && Store.autoFixLogs) Store.autoFixLogs({ clearResolvedBefore: cut, smartClearResolved: true });
          UI.toast && UI.toast('Resolved errors cleared from Activity Logs.');
        }catch(e){ console.error(e); }
      };
    }

    window.__mumsSystemCheck = { bound:true, reset, run };
    reset();
  }


  function _relLum(rgb){
    const srgb = rgb.map(v=>v/255).map(v=> v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4));
    return 0.2126*srgb[0] + 0.7152*srgb[1] + 0.0722*srgb[2];
  }

  function _contrast(c1, c2){
    const L1 = _relLum(_parseColor(c1));
    const L2 = _relLum(_parseColor(c2));
    const hi = Math.max(L1,L2);
    const lo = Math.min(L1,L2);
    return (hi+0.05)/(lo+0.05);
  }

  function chooseAccentText(accent){
    // Choose the better contrast of white vs deep slate on the accent background.
    const a = String(accent||'');
    const onWhite = _contrast('#ffffff', a);
    const onDark = _contrast('#0b1220', a);
    return (onDark > onWhite) ? '#0b1220' : '#ffffff';
  }

  function renderThemeAudit(){
    const audit = document.getElementById('themeAudit');
    const inner = document.getElementById('themeAuditInner');
    if(!audit || !inner) return;

    const user = (window.Auth && Auth.getUser) ? Auth.getUser() : null;
    const can = (window.Config && Config.can) ? Config.can(user, 'manage_release_notes') : false;
    if(!can){
      audit.style.display = 'none';
      inner.innerHTML = '';
      return;
    }

    const cs = getComputedStyle(document.documentElement);
    const bg = cs.getPropertyValue('--bg').trim() || '#0b1220';
    const panel = cs.getPropertyValue('--panel').trim() || '#121c2f';
    const text = cs.getPropertyValue('--text').trim() || '#eaf2ff';
    const muted = cs.getPropertyValue('--muted').trim() || '#a8b6d6';
    const border = cs.getPropertyValue('--border').trim() || 'rgba(255,255,255,.08)';
    const accent = cs.getPropertyValue('--accent').trim() || '#4aa3ff';

    const rows = [
      { k: 'Text on Panel', v: _contrast(text, panel), min: 4.5 },
      { k: 'Muted on Panel', v: _contrast(muted, panel), min: 3.0 },
      { k: 'Text on Background', v: _contrast(text, bg), min: 4.5 },
      { k: 'Accent on Panel', v: _contrast(accent, panel), min: 3.0 },
      { k: 'Border on Panel', v: _contrast(border, panel), min: 1.8 },
    ];

    function badge(r){
      if(r >= 4.5) return { label: 'PASS', cls: 'pass' };
      if(r >= 3.0) return { label: 'WARN', cls: 'warn' };
      return { label: 'FAIL', cls: 'fail' };
    }

    inner.innerHTML = `
      <div class="audit-grid">
        ${rows.map(row=>{
          const ratio = (Math.round(row.v*100)/100).toFixed(2);
          const b = (row.v >= row.min) ? {label:'PASS', cls:'pass'} : (row.v >= Math.max(3.0, row.min)) ? {label:'WARN', cls:'warn'} : {label:'FAIL', cls:'fail'};
          return `<div class="audit-row"><div style="font-weight:900">${UI.esc(row.k)}</div><div style="display:flex;gap:8px;align-items:center"><div class="small muted">${ratio}:1</div><div class="audit-pill ${b.cls}">${b.label}</div></div></div>`;
        }).join('')}
      </div>
      <div class="small muted" style="margin-top:10px">
        Guidance: If any item fails, adjust theme tokens (text/muted/border/panel). For Aurora (Ecommerce Light) the typical fix is increasing muted contrast and strengthening borders.
      </div>
    `;

    audit.style.display = 'block';
  }

  function renderThemeGrid(){
    const grid = document.getElementById('themeGrid');
    if(!grid) return;
    const cur = Store.getTheme();
    const themes = (Config && Array.isArray(Config.THEMES)) ? Config.THEMES : [];
    grid.innerHTML = themes.map(t=>{
      const active = t.id===cur;
      const fontName = (t.font ? String(t.font).split(',')[0].replace(/['\"]/g,'').trim() : 'System');
      return `
        <div class="theme-tile ${active?'active':''}" data-theme="${UI.esc(t.id)}" tabindex="0" role="button" aria-label="Theme ${UI.esc(t.name)}">
          <div class="theme-swatch" style="--sw1:${t.accent};--sw2:${t.bgRad1}"></div>
          <div>
            <div class="tname">${UI.esc(t.name)}</div>
            <div class="tmeta">Accent ${UI.esc(t.accent)} • Font ${UI.esc(fontName)}${active?' • Selected':''}</div>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('[data-theme]').forEach(tile=>{
      const pick = ()=>{
        const id = tile.dataset.theme;
        try{ if(Store && Store.dispatch) Store.dispatch('UPDATE_THEME', { id:id }); else Store.setTheme(id); }catch(_){ try{ Store.setTheme(id); }catch(__){} }
        try{ applyTheme(id); }catch(_){ }
        renderThemeGrid();
      };
      tile.onclick = pick;
      tile.onkeydown = (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); pick(); } };
    });

    // Fix16: refresh Theme Lab (contrast checks)
    try{ renderThemeAudit(); }catch(_){ }
  }

  // Bottom quick links
  function normalizeUrl(u){
    const s = String(u||'').trim();
    if(!s) return '';
    if(/^https?:\/\//i.test(s)) return s;
    return 'https://' + s;
  }

  function renderQuickLinksBar(){
    const wrap = document.getElementById('quickLinksInner');
    if(!wrap) return;
    const links = Store.getQuickLinks();

    wrap.innerHTML = links.map((l, idx)=>{
      const has = !!(l && l.url);
      const label = String(l?.label||'').trim();
      const url = normalizeUrl(l?.url||'');
      const glow = String(l?.glowColor||l?.glow||'').trim();
      const glowCss = has ? (glow || 'var(--accent)') : '';
      const tip = (label || url || `Link ${idx+1}`).trim();
      // IMPORTANT: Do not change the number inside the circle based on labels.
      const num = String(idx+1);
      const shownLabel = label || '';
      return `
        <div class="qitem" data-idx="${idx}" ${has?`data-has="1"`:''} data-tip="${UI.esc(tip)}">
          <div class="qlabel">${UI.esc(shownLabel)}</div>
          <button class="qcircle ${has?'filled glowing':''}" ${has?`style="--glow:${UI.esc(glowCss)}"`:''} type="button" data-idx="${idx}" aria-label="Quick link ${idx+1}">
            <span class="qtxt">${UI.esc(num)}</span>
          </button>
        </div>
      `;
    }).join('');

    wrap.querySelectorAll('.qcircle').forEach(btn=>{
      btn.onclick = ()=>{
        const idx = Number(btn.dataset.idx||0);
        const links = Store.getQuickLinks();
        const l = links[idx] || {};
        const url = normalizeUrl(l.url);
        if(!url) return;
        window.open(url, '_blank', 'noopener');
      };
    });
  }

  // === World clocks (3 programmable digital clocks on bottom bar) ===
  const CLOCK_STYLES = [
    {id:'classic', name:'Classic'},
    {id:'neon', name:'Neon'},
    {id:'mono', name:'Monochrome'},
    {id:'glass', name:'Glass'},
    {id:'bold', name:'Bold'},
    {id:'minimal', name:'Minimal'},
    {id:'terminal', name:'Terminal'},
    {id:'chip', name:'Chip'},
    {id:'rounded', name:'Rounded'},
    {id:'outline', name:'Outline'},
  ];

  function tzLabel(tz){
    const map = {
      'Asia/Manila':'Manila',
      'UTC':'UTC',
      'America/Los_Angeles':'Los Angeles',
      'America/New_York':'New York',
      'Europe/London':'London',
      'Europe/Paris':'Paris',
      'Asia/Tokyo':'Tokyo',
      'Asia/Singapore':'Singapore',
      'Australia/Sydney':'Sydney'
    };
    const key = String(tz||'').trim();
    return map[key] || key || 'UTC';
  }

  function formatTimeParts(date, tz){
    try{
      const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
      const parts = Object.fromEntries(fmt.formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
      return { hh: parts.hour||'00', mm: parts.minute||'00', ss: parts.second||'00' };
    }catch(e){
      const d = date;
      return { hh: String(d.getHours()).padStart(2,'0'), mm: String(d.getMinutes()).padStart(2,'0'), ss: String(d.getSeconds()).padStart(2,'0') };
    }
  }

  // === GMT / UTC offsets (enterprise World Clock enhancement) ===
  // Full set of commonly used UTC offsets in minutes (covers all current offsets in use).
  const GMT_OFFSETS_MINUTES = [
    -720,-660,-600,-570,-540,-480,-420,-360,-300,-240,-210,-180,-120,-60,
    0,60,120,180,210,240,270,300,330,345,360,390,420,480,525,540,570,600,630,660,690,720,765,780,840
  ];

  function _pad2(n){ return String(n).padStart(2,'0'); }

  function gmtLabelFromMinutes(mins){
    const m = Number(mins)||0;
    const sign = m>=0 ? '+' : '-';
    const abs = Math.abs(m);
    const hh = Math.floor(abs/60);
    const mm = abs%60;
    return `GMT${sign}${_pad2(hh)}:${_pad2(mm)}`;
  }

  function formatTimePartsForClock(now, clock){
    const c = clock || {};
    const off = (c.offsetMinutes === 0 || c.offsetMinutes) ? Number(c.offsetMinutes) : null;
    if(off !== null && Number.isFinite(off)){
      // Epoch time is UTC-based. Shift by offset minutes and read back using UTC getters.
      const ms = now.getTime() + off*60*1000;
      const d = new Date(ms);
      return { hh:_pad2(d.getUTCHours()), mm:_pad2(d.getUTCMinutes()), ss:_pad2(d.getUTCSeconds()) };
    }
    const tz = c.timeZone || 'Asia/Manila';
    return formatTimeParts(now, tz);
  }

  // Expose utilities so standalone pages (e.g., GMT Overview) can reuse the same logic.
  // Keep as a small, stable surface for future development.
  window.WorldClockUtils = window.WorldClockUtils || {};
  window.WorldClockUtils.GMT_OFFSETS_MINUTES = GMT_OFFSETS_MINUTES.slice();
  window.WorldClockUtils.gmtLabelFromMinutes = gmtLabelFromMinutes;
  window.WorldClockUtils.formatTimePartsForClock = formatTimePartsForClock;
  window.WorldClockUtils.clockZoneLabel = clockZoneLabel;

  function clockZoneLabel(clock){
    const c = clock || {};
    const off = (c.offsetMinutes === 0 || c.offsetMinutes) ? Number(c.offsetMinutes) : null;
    if(off !== null && Number.isFinite(off)) return gmtLabelFromMinutes(off);
    return tzLabel(c.timeZone || 'Asia/Manila');
  }

  function parseClockZoneValue(val){
    const v = String(val||'').trim();
    if(v.startsWith('offset:')){
      const n = Number(v.slice(7));
      return { timeZone: 'UTC', offsetMinutes: Number.isFinite(n) ? n : 0 };
    }
    return { timeZone: v || 'Asia/Manila', offsetMinutes: null };
  }

  // Render an enterprise GMT overview panel inside the World Clocks modal.
  function ensureGmtOverviewUI(){
    const modal = document.getElementById('clocksModal');
    if(!modal) return null;
    const body = modal.querySelector('.body');
    if(!body) return null;

    let panel = modal.querySelector('#gmtOverviewPanel');
    if(panel) return panel;

    panel = document.createElement('div');
    panel.id = 'gmtOverviewPanel';
    panel.className = 'gmt-overview';
    panel.innerHTML = `
      <div class="gmt-head">
        <div>
          <div class="settings-card-title">GMT Overview</div>
          <div class="small muted" style="margin-top:6px">View current time for all commonly used GMT/UTC offsets. Click an offset to pin it as a clock.</div>
        </div>
        <div class="gmt-controls">
          <input class="input" id="gmtSearch" placeholder="Search offsets (e.g., +08, 5:30, GMT+10)..." />
        </div>
      </div>
      <div class="gmt-grid" id="gmtOverviewGrid" aria-label="GMT overview"></div>
    `;
    body.appendChild(panel);

    // Delegated click: pin GMT offset as a clock
    panel.addEventListener('click', (e)=>{
      const tile = e.target && (e.target.closest ? e.target.closest('[data-gmtoff]') : null);
      if(!tile) return;
      const mins = Number(tile.getAttribute('data-gmtoff'));
      if(!Number.isFinite(mins)) return;

      try{
        const cur = Store.getWorldClocks().slice();
        const key = String(mins);
        const exists = cur.some(c=> Number(c && c.offsetMinutes) === mins);
        if(!exists){
          cur.push({
            enabled: true,
            label: gmtLabelFromMinutes(mins),
            timeZone: 'UTC',
            offsetMinutes: mins,
            hoursColor: '#EAF3FF',
            minutesColor: '#9BD1FF',
            alarmEnabled: false,
            alarmTime: '09:00',
            style: 'classic'
          });
          try{ if(Store && Store.dispatch) Store.dispatch('UPDATE_CLOCKS', cur); }catch(_){ try{ Store.saveWorldClocks(cur); }catch(__){} }
          refreshWorldClocksNow();
          try{ renderClocksGrid(); renderClocksPreviewStrip(); }catch(_){ }
        }
      }catch(err){ console.error(err); }
    });

    // Search filtering
    const search = panel.querySelector('#gmtSearch');
    if(search){
      search.addEventListener('input', ()=>{
        try{ renderGmtOverview(); }catch(_){ }
      });
    }

    return panel;
  }
  function renderGmtOverview(){
    const panel = ensureGmtOverviewUI();
    if(!panel) return;
    const grid = panel.querySelector('#gmtOverviewGrid');
    if(!grid) return;

    const q = String(panel.querySelector('#gmtSearch')?.value||'').trim().toLowerCase();
    const now = new Date();

    const filtered = GMT_OFFSETS_MINUTES.filter(mins=>{
      if(!q) return true;
      const label = gmtLabelFromMinutes(mins).toLowerCase();
      return label.includes(q) || String(mins).includes(q) || String(mins/60).includes(q);
    });

    grid.innerHTML = filtered.map(mins=>{
      const ms = now.getTime() + mins*60*1000;
      const d = new Date(ms);
      const hh = _pad2(d.getUTCHours());
      const mm = _pad2(d.getUTCMinutes());
      const dateHint = UI && UI.manilaParts ? (()=>{ 
        try{
          const man = UI.manilaParts(now).isoDate;
          const od  = UI.manilaParts(new Date(ms)).isoDate;
          if(od === man) return '';
          return od > man ? ' (+1d)' : ' (-1d)';
        }catch(_){ return ''; }
      })() : '';
      return `
        <button class="gmt-tile" type="button" data-gmtoff="${mins}">
          <div class="gmt-tile-top">
            <div class="small" style="font-weight:900">${UI.esc(gmtLabelFromMinutes(mins))}${UI.esc(dateHint)}</div>
            <div class="gmt-tile-time">${hh}:${mm}</div>
          </div>
          <div class="small muted">Click to pin</div>
        </button>
      `;
    }).join('');
  }


  
  function startGmtOverviewTicker(){
    try{
      if(window.__mumsGmtOverviewTimer) return;
      window.__mumsGmtOverviewTimer = setInterval(()=>{
        const modal = document.getElementById('clocksModal');
        if(!modal || !modal.classList.contains('open')) return;
        try{ renderGmtOverview(); }catch(_){ }
      }, 30000);
    }catch(_){ }
  }

function renderWorldClocksBar(){
    const wrap = document.getElementById('worldClocks');
    if(!wrap) return;
    const list = Store.getWorldClocks();
    const now = new Date();
    wrap.innerHTML = list.map((c, i)=>{
      const on = !!c.enabled;
      if(!on) return '';
      const t = formatTimePartsForClock(now, c);
      const tz = c.timeZone || 'Asia/Manila';
      const label = String(c.label||clockZoneLabel(c)||`Clock ${i+1}`);
      const hcol = c.hoursColor || '#EAF3FF';
      const mcol = c.minutesColor || '#9BD1FF';
      const style = String(c.style||'classic');
      return `
        <div class="wclock wc-${style}" data-idx="${i}" title="${UI.esc(label)} (${UI.esc(clockZoneLabel(c))})">
          <div class="wc-label">${UI.esc(label)}</div>
          <div class="wc-time"><span class="wc-h" style="color:${UI.esc(hcol)}">${UI.esc(t.hh)}</span><span class="wc-sep">:</span><span class="wc-m" style="color:${UI.esc(mcol)}">${UI.esc(t.mm)}</span><span class="wc-sec">:${UI.esc(t.ss)}</span></div>
        </div>
      `;
    }).join('');
  }

  // === Online Users Bar (4 sections incl. Developer Access) ===
  function _bucketForUser(u){
    try{
      if(!u) return 'mid';

      // Prefer presence-provided teamId; fallback to cached user profile to avoid flicker.
      let teamId = u.teamId || '';
      const rawRole = String(u.role || '').trim();
      let role = (window.Store && Store.normalizeRole) ? Store.normalizeRole(rawRole)
        : rawRole.toUpperCase().replace(/\s+/g,'_').replace(/-+/g,'_');

      try{
        const uid = u.id || u.user_id || u.userId || '';
        if ((!teamId || !role) && uid && window.Store && Store.getUserById) {
          const su = Store.getUserById(uid);
          if (su) {
            if (!teamId && su.teamId) teamId = su.teamId;
            if (!role && su.role) {
              const rr = String(su.role||'').trim();
              role = (window.Store && Store.normalizeRole) ? Store.normalizeRole(rr)
                : rr.toUpperCase().replace(/\s+/g,'_').replace(/-+/g,'_');
            }
            // Hydrate display fields for stable UI rendering
            if (!u.name && su.name) u.name = su.name;
            if (!u.username && su.username) u.username = su.username;
            // Hydrate avatar/photo field if present in profile cache
            if (!u.photo && (su.photo || su.avatar || su.photoDataUrl || su.avatar_url || su.avatarUrl)) {
              u.photo = su.photo || su.avatar || su.photoDataUrl || su.avatar_url || su.avatarUrl;
            }
          }
        }
      }catch(_){ }

      // SUPER roles default to Developer Access, but SUPER_ADMIN can override their team
      // (teamOverride=true) and should then appear under the selected shift bucket.
      if(role === 'SUPER_ADMIN' || role === 'SUPER_USER'){
        let teamOverride = !!(u.teamOverride ?? u.team_override ?? false);
        try{
          const uid = u.id || u.user_id || u.userId || '';
          if(uid && window.Store && Store.getUserById){
            const su = Store.getUserById(uid);
            if(su){
              if(!teamOverride && su.teamOverride !== undefined) teamOverride = !!su.teamOverride;
              if(!teamId && su.teamId) teamId = su.teamId;
            }
          }
        }catch(_){ }

        if(teamOverride && teamId){
          const t0 = Config.teamById ? Config.teamById(teamId) : null;
          const label0 = String((t0 && t0.label) || '').toLowerCase();
          if(label0.includes('morning')) return 'morning';
          if(label0.includes('mid')) return 'mid';
          if(label0.includes('night')) return 'night';
        }
        return 'dev';
      }

      if(!teamId) return 'mid';

      const t = Config.teamById ? Config.teamById(teamId) : null;
      const label = String((t && t.label) || '').toLowerCase();
      if(label.includes('morning')) return 'morning';
      if(label.includes('mid')) return 'mid';
      if(label.includes('night')) return 'night';
    }catch(_){ }
    return 'mid';
  }

  function _initials(name){
    const s = String(name||'').trim();
    if(!s) return 'U';
    const parts = s.split(/\s+/).filter(Boolean);
    const a = (parts[0]||'').slice(0,1);
    const b = (parts.length>1 ? parts[parts.length-1] : '').slice(0,1);
    return (a + b).toUpperCase();
  }

  function renderOnlineUsersBar(){
    const host = document.getElementById('onlineUsersBar');
    if(!host) return;

    const isMobile = !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches) || (window.innerWidth <= 768);

    let list = [];
    try{ list = (window.Store && Store.getOnlineUsers) ? Store.getOnlineUsers() : []; }catch(_){ list=[]; }
    const buckets = { morning:[], mid:[], night:[], dev:[] };
    list.forEach(u=>{
      const b = _bucketForUser(u);
      (buckets[b]||buckets.mid).push(u);
    });

    function pills(arr){
      return (arr||[]).slice(0, 18).map(u=>{
        const mode = String(u.mode||'').toUpperCase();
        const red = mode === 'WFH';
        const photo = u.photo ? String(u.photo) : '';
        const nm = String(u.name||u.username||'User');
        return `
          <div class="online-pill ${red?'is-red':''}" title="${UI.esc(nm)}">
            ${photo ? `<img src="${UI.esc(photo)}" alt="${UI.esc(nm)}" />` : `<span class="ini">${UI.esc(_initials(nm))}</span>`}
          </div>
        `;
      }).join('');
    }

    function sec(title, arr){
      const items = pills(arr);
      if(isMobile){
        return `
          <details class="onlinebar-acc" ${arr.length ? 'open' : ''}>
            <summary>
              <span class="onlinebar-title">${UI.esc(title)}</span>
              <span class="onlinebar-count">${arr.length}</span>
            </summary>
            <div class="onlinebar-badges">
              <div class="onlinebar-list">${items || '<span class="small" style="opacity:.7">—</span>'}</div>
            </div>
          </details>
        `;
      }

      return `
        <div class="onlinebar-sec">
          <div class="onlinebar-head">
            <div class="onlinebar-title">${UI.esc(title)}</div>
            <div class="onlinebar-count">${arr.length}</div>
          </div>
          <div class="onlinebar-list">${items || '<span class="small" style="opacity:.7">—</span>'}</div>
        </div>
      `;
    }

    const head = isMobile ? `
      <div class="mob-sheet-head">
        <div class="mob-sheet-title">User Online</div>
        <div class="mob-sheet-actions">
          <button class="mob-sheet-close" type="button" aria-label="Close" data-close-onlinebar="1">✕</button>
        </div>
      </div>
    ` : '';

    host.innerHTML = `
      ${head}
      <div class="onlinebar-inner">
        ${sec('Morning Shift', buckets.morning)}
        ${sec('Mid Shift', buckets.mid)}
        ${sec('Night Shift', buckets.night)}
        ${sec('Developer Access', buckets.dev)}
      </div>
    `;

    // Mobile close delegation (safe across re-renders)
    if(isMobile && !host.__mobCloseBound){
      host.__mobCloseBound = true;
      host.addEventListener('click', (e)=>{
        const btn = e.target && e.target.closest ? e.target.closest('[data-close-onlinebar]') : null;
        if(!btn) return;
        document.body.classList.remove('mobile-online-open');
        try{
          const t = document.getElementById('toggleUserOnlineBar');
          if(t) t.setAttribute('aria-expanded','false');
        }catch(_){}
      });
    }
  }

  // Force-refresh helper: some browsers can defer layout updates while closing modals.
  // This guarantees the clocks appear instantly after saving settings (no manual refresh).
  function refreshWorldClocksNow(){
  // Render once (re-rendering multiple times causes long tasks and event leaks in preview strip)
  try{ renderWorldClocksBar(); }catch(e){ console.error(e); }
  try{ renderClocksPreviewStrip(); }catch(_){ }
  try{ updateWorldClocksTimes(); }catch(_){ }
  try{ updateClocksPreviewTimes(); }catch(_){ }
}

  // Preview strip in World Clocks settings (modal)
  // - Shows an instant preview of the 3 clocks
  // - Supports drag re-order (left-to-right)
  function renderClocksPreviewStrip(){
    const strip = document.getElementById('clocksPreviewStrip');
    if(!strip) return;
    const list = Store.getWorldClocks();
    const now = new Date();

    strip.innerHTML = list.map((c,i)=>{
      const t = formatTimePartsForClock(now, c);
      const tz = c.timeZone || 'Asia/Manila';
      const label = String(c.label||clockZoneLabel(c)||`Clock ${i+1}`);
      const hcol = c.hoursColor || '#EAF3FF';
      const mcol = c.minutesColor || '#9BD1FF';
      const style = String(c.style||'classic');
      const on = !!c.enabled;
      return `
        <div class="wclock wc-${style} wclock-preview ${on?'':'is-off'}" draggable="true" data-idx="${i}" title="Drag to reorder • ${UI.esc(label)} (${UI.esc(clockZoneLabel(c))})">
          <div class="wc-label">${UI.esc(label)}</div>
          <div class="wc-time">
            <span class="wc-h" style="color:${UI.esc(hcol)}">${UI.esc(t.hh)}</span><span class="wc-sep">:</span><span class="wc-m" style="color:${UI.esc(mcol)}">${UI.esc(t.mm)}</span><span class="wc-sec">:${UI.esc(t.ss)}</span>
          </div>
          <div class="wc-drag" aria-hidden="true">↔</div>
        </div>
      `;
    }).join('');

    // Bind drag-and-drop reorder (safe; only 3 items)
    strip.querySelectorAll('.wclock-preview').forEach(el=>{
      el.addEventListener('dragstart', (e)=>{
        try{ e.dataTransfer.setData('text/plain', String(el.dataset.idx||'')); }catch(_){}
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', ()=>{ el.classList.remove('dragging'); });
      el.addEventListener('dragover', (e)=>{ e.preventDefault(); el.classList.add('dragover'); });
      el.addEventListener('dragleave', ()=>{ el.classList.remove('dragover'); });
      el.addEventListener('drop', (e)=>{
        e.preventDefault();
        el.classList.remove('dragover');
        let from = -1;
        try{ from = Number(e.dataTransfer.getData('text/plain')); }catch(_){}
        const to = Number(el.dataset.idx||-1);
        if(!Number.isFinite(from) || !Number.isFinite(to) || from<0 || to<0 || from===to) return;
        try{
          const cur = Store.getWorldClocks().slice();
          if(from>=cur.length || to>=cur.length) return;
          const item = cur.splice(from,1)[0];
          cur.splice(to,0,item);
          try{ if(Store && Store.dispatch) Store.dispatch('UPDATE_CLOCKS', cur); else Store.saveWorldClocks(cur); }catch(_){ try{ Store.saveWorldClocks(cur); }catch(__){} }
          // Re-render everything to reflect new order (numbers, bottom bar, preview)
          renderClocksGrid();
          renderWorldClocksBar();
          renderClocksPreviewStrip();
        }catch(err){ console.error(err); }
      });
    });
  }

// Efficient clock updates (avoid re-render + listener leaks)
function updateWorldClocksTimes(){
  const wrap = document.getElementById('worldClocks');
  if(!wrap) return;
  const list = Store.getWorldClocks();
  if(!Array.isArray(list) || list.length===0) return;
  const now = new Date();
  wrap.querySelectorAll('.wclock').forEach(el=>{
    const i = Number(el.dataset.idx||-1);
    if(!(i>=0)) return;
    const c = list[i];
    if(!c || !c.enabled) return;
    const t = formatTimePartsForClock(now, c);
      const tz = c.timeZone || 'Asia/Manila';
    const h = el.querySelector('.wc-h');
    const m = el.querySelector('.wc-m');
    const s = el.querySelector('.wc-sec');
    if(h) h.textContent = t.hh;
    if(m) m.textContent = t.mm;
    if(s) s.textContent = ':' + t.ss;
  });
}

function updateClocksPreviewTimes(){
  const strip = document.getElementById('clocksPreviewStrip');
  if(!strip) return;
  const list = Store.getWorldClocks();
  if(!Array.isArray(list) || list.length===0) return;
  const now = new Date();
  strip.querySelectorAll('.wclock-preview').forEach(el=>{
    const i = Number(el.dataset.idx||-1);
    if(!(i>=0)) return;
    const c = list[i];
    if(!c) return;
    const t = formatTimePartsForClock(now, c);
      const tz = c.timeZone || 'Asia/Manila';
    const h = el.querySelector('.wc-h');
    const m = el.querySelector('.wc-m');
    const s = el.querySelector('.wc-sec');
    if(h) h.textContent = t.hh;
    if(m) m.textContent = t.mm;
    if(s) s.textContent = ':' + t.ss;
  });
}



  // Alarm checker (runs per second)
  const _alarmState = { lastKey: null };
  function checkWorldClockAlarms(){
    const list = Store.getWorldClocks();
    const now = new Date();
    const user = Auth && Auth.getUser ? Auth.getUser() : null;
    const userId = user ? user.id : 'anon';

    for(let i=0;i<list.length;i++){
      const c = list[i] || {};
      if(!c.enabled || !c.alarmEnabled || !c.alarmTime) continue;
      const t = formatTimePartsForClock(now, c);
      const tz = c.timeZone || 'Asia/Manila';
      const hm = `${t.hh}:${t.mm}`;
      if(hm === c.alarmTime && t.ss === '00'){
        const key = `${i}|${tz}|${c.alarmTime}|${UI.manilaNow().isoDate}`;
        if(_alarmState.lastKey === key) continue;
        _alarmState.lastKey = key;
        // Use existing notification sound settings
        try{ UI.playNotifSound(userId); }catch(e){}
      }
    }
  }

  function renderClocksGrid(){
    const grid = document.getElementById('clocksGrid');
    if(!grid) return;
    const list = Store.getWorldClocks();
    const namedTimeZones = [
      'Asia/Manila','UTC','America/Los_Angeles','America/New_York',
      'Europe/London','Europe/Paris','Asia/Tokyo','Asia/Singapore','Australia/Sydney'
    ];

    const offsetOpts = GMT_OFFSETS_MINUTES.map(mins=>{
      const v = `offset:${mins}`;
      return { value: v, label: gmtLabelFromMinutes(mins) };
    });
    const styleOpts = CLOCK_STYLES.map(s=>`<option value="${UI.esc(s.id)}">${UI.esc(s.name)}</option>`).join('');

    grid.innerHTML = list.map((c, i)=>{
      const selTz = (c && (c.offsetMinutes === 0 || c.offsetMinutes) && Number.isFinite(Number(c.offsetMinutes)))
        ? (`offset:${Number(c.offsetMinutes)}`)
        : (c.timeZone || 'Asia/Manila');

      const gmtGroup = offsetOpts.map(o=>`<option value="${UI.esc(o.value)}" ${o.value===selTz?'selected':''}>${UI.esc(o.label)}</option>`).join('');
      const namedGroup = namedTimeZones.map(z=>`<option value="${UI.esc(z)}" ${z===selTz?'selected':''}>${UI.esc(tzLabel(z))}</option>`).join('');
      const tzOpts = `<optgroup label="GMT / UTC offsets">${gmtGroup}</optgroup><optgroup label="Named time zones">${namedGroup}</optgroup>`;
      return `
        <div class="clock-card" data-idx="${i}">
          <div class="row" style="justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
              <div class="chip">Clock ${i+1}</div>
              <label class="small" style="display:flex;gap:8px;align-items:center">
                <input type="checkbox" class="clk-enabled" ${c.enabled?'checked':''} />
                Enabled
              </label>
              <label class="small" style="display:flex;gap:8px;align-items:center">
                <input type="checkbox" class="clk-alarmEnabled" ${c.alarmEnabled?'checked':''} />
                Alarm enabled
              </label>
            </div>
            <div class="small muted" style="white-space:nowrap">Alarm uses Notification Sound</div>
          </div>

          <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:12px;margin-top:10px">
            <label class="small">Label
              <input class="input clk-label" value="${UI.esc(c.label||'')}" placeholder="e.g. Support HQ" />
            </label>
            <label class="small">Time zone
              <select class="input clk-tz">${tzOpts}</select>
            </label>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:10px">
            <label class="small">Hours color
              <input class="input clk-hc" type="color" value="${UI.esc(c.hoursColor||'#EAF3FF')}" />
            </label>
            <label class="small">Minutes color
              <input class="input clk-mc" type="color" value="${UI.esc(c.minutesColor||'#9BD1FF')}" />
            </label>
            <label class="small">Clock design
              <select class="input clk-style">${styleOpts}</select>
            </label>
          </div>

          <div style="display:grid;grid-template-columns:1fr;gap:10px;margin-top:10px">
            <label class="small">Alarm time
              <input class="input clk-alarm" type="time" value="${UI.esc(c.alarmTime||'')}" style="max-width:180px" ${c.alarmEnabled?'':'disabled'} />
            </label>
          </div>
        </div>
      `;
    }).join('');

    // set styles after render
    grid.querySelectorAll('.clock-card').forEach(card=>{
      const i = Number(card.dataset.idx||0);
      const s = (list[i] && list[i].style) ? list[i].style : 'classic';
      const sel = card.querySelector('.clk-style');
      if(sel) sel.value = s;
    });

    // Always refresh the in-modal preview strip so users can instantly see
    // what will appear on the bottom bar, and can drag-reorder clocks.
    try{ renderClocksPreviewStrip(); }catch(e){ /* ignore */ }

    // Live preview + autosave (professional UX): any change immediately updates the bottom bar.
    // This avoids "clock not visible" complaints when users expect instant feedback.
    if(!grid.__liveBind){
      grid.__liveBind = true;
      let t = null;
      const commit = ()=>{
        try{
          const next = Store.getWorldClocks();
          grid.querySelectorAll('.clock-card').forEach(card=>{
            const i = Number(card.dataset.idx||0);
            if(!next[i]) next[i] = {};
            const q = (sel)=>card.querySelector(sel);
            const alarmOn = !!q('.clk-alarmEnabled')?.checked;
            const alarmInput = q('.clk-alarm');
            // Keep UI consistent: disable the time input unless Alarm is enabled.
            try{ if(alarmInput) alarmInput.disabled = !alarmOn; }catch(_){ }
            next[i] = {
              enabled: !!q('.clk-enabled')?.checked,
              label: String(q('.clk-label')?.value||'').trim(),
              timeZone: parseClockZoneValue(String(q('.clk-tz')?.value||'Asia/Manila')).timeZone,
              offsetMinutes: parseClockZoneValue(String(q('.clk-tz')?.value||'Asia/Manila')).offsetMinutes,
              hoursColor: String(q('.clk-hc')?.value||'#EAF3FF'),
              minutesColor: String(q('.clk-mc')?.value||'#9BD1FF'),
              style: String(q('.clk-style')?.value||'classic'),
              alarmEnabled: alarmOn,
              alarmTime: alarmOn ? String(alarmInput?.value||'').trim() : '',
            };
          });
          try{ if(Store && Store.dispatch) Store.dispatch('UPDATE_CLOCKS', next); else Store.saveWorldClocks(next); }catch(_){ try{ Store.saveWorldClocks(next); }catch(__){} }
          // Immediate bottom bar update (no refresh needed)
          refreshWorldClocksNow();
          try{ renderClocksPreviewStrip(); }catch(_){ }
        }catch(e){ /* never break settings */ console.error(e); }
      };
      // Expose a safe flush hook so closing the modal applies changes immediately.
      // This prevents the "I saved but clocks didn't appear" issue when the last
      // change is still waiting in a debounce timer.
      grid.__commitClocks = ()=>{ try{ clearTimeout(t); }catch(_){ } try{ commit(); }catch(_){ } };
      grid.addEventListener('input', ()=>{ clearTimeout(t); t = setTimeout(commit, 150); });
      grid.addEventListener('change', ()=>{ clearTimeout(t); t = setTimeout(commit, 0); });
    }
  }

  function renderLinksGrid(){
    const grid = document.getElementById('linksGrid');
    if(!grid) return;
    const links = Store.getQuickLinks();
    grid.innerHTML = links.map((l, idx)=>{
      const label = String(l?.label||'');
      const url = String(l?.url||'');
      const glowColor = String(l?.glowColor||l?.glow||'');
      return `
        <div class="link-row" data-idx="${idx}">
          <div class="lr-head">
            <div class="lr-slot">Link ${idx+1}</div>
            <div class="lr-actions">
              <button class="btn tiny" type="button" data-save>Save</button>
              <button class="btn tiny danger" type="button" data-del>Delete</button>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr;gap:10px;margin-top:10px">
            <label class="small">Label
              <input class="input" data-label value="${UI.esc(label)}" placeholder="e.g., Zendesk" />
            </label>
            <label class="small">URL
              <input class="input" data-url value="${UI.esc(url)}" placeholder="https://..." />
            </label>
            <label class="small">Glow color (for filled circles)
              <div class="row" style="gap:10px;align-items:center">
                <input type="color" data-glow value="${UI.esc((glowColor||'').trim()||'#4f46e5')}" style="width:44px;height:34px;border-radius:10px;border:1px solid var(--border);background:transparent;padding:0" />
                <input class="input" data-glowText value="${UI.esc((glowColor||'').trim())}" placeholder="#4f46e5 (optional)" />
              </div>
            </label>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.link-row').forEach(row=>{
      const idx = Number(row.dataset.idx||0);
      const getVals = ()=>({
        label: String(row.querySelector('[data-label]')?.value||'').trim(),
        url: String(row.querySelector('[data-url]')?.value||'').trim(),
        glowColor: String((row.querySelector('[data-glowText]')?.value||row.querySelector('[data-glow]')?.value||'')).trim()
      });
      const saveBtn = row.querySelector('[data-save]');
      const delBtn = row.querySelector('[data-del]');
      // Sync the color picker with the hex text field
      const glowPick = row.querySelector('[data-glow]');
      const glowTxt = row.querySelector('[data-glowText]');
      if(glowPick && glowTxt){
        glowPick.oninput = ()=>{ try{ glowTxt.value = String(glowPick.value||'').trim(); }catch(_){ } };
        glowTxt.oninput = ()=>{
          const v = String(glowTxt.value||'').trim();
          if(/^#([0-9a-fA-F]{6})$/.test(v)) glowPick.value = v;
        };
      }
      if(saveBtn) saveBtn.onclick = ()=>{
        const v = getVals();
        const url = normalizeUrl(v.url);
        if(!url){ alert('Please enter a valid URL.'); return; }
        Store.setQuickLink(idx, { label: v.label, url, glowColor: v.glowColor });
        renderQuickLinksBar();
        renderLinksGrid();
      };
      if(delBtn) delBtn.onclick = async ()=>{
        const ok = await UI.confirm({ title:'Delete Quick Link', message:'Delete this quick link?', okText:'Delete', danger:true });
        if(!ok) return;
        Store.clearQuickLink(idx);
        renderQuickLinksBar();
        renderLinksGrid();
      };
    });
  }

  function renderNav(user){
    const nav = UI.el('#nav');

    const iconFor = (id)=>{
      const map = {
        dashboard: 'dashboard',
	        gmt_overview: 'dashboard',
        mailbox: 'mailbox',
        team: 'members',
        members: 'members',
        master_schedule: 'schedule',
        team_config: 'tasks',
        admin: 'users',
        users: 'users',
        announcements: 'announce',
        logs: 'dashboard',
        my_reminders: 'reminder_me',
        team_reminders: 'reminder_team',
        my_record: 'schedule',
        my_attendance: 'schedule',
        my_schedule: 'schedule',
        my_case: 'mailbox',
        my_task: 'tasks'
      };
      return map[id] || 'dashboard';
    };

    function renderItem(n, depth){
      if(!Config.can(user, n.perm)) return '';
      const padVal = (12 + depth*12);
      const pad = `style="padding-left:${padVal}px"`;
      const hasKids = Array.isArray(n.children) && n.children.length;

      if(!hasKids){
        return `<a class="nav-item" href="/${n.id}" data-page="${n.id}" data-label="${UI.esc(n.label)}" ${pad} title="${UI.esc(n.label)}">
          <span class="nav-ico" data-ico="${iconFor(n.id)}" aria-hidden="true"></span>
          <span class="nav-label">${UI.esc(n.label)}</span>
        </a>`;
      }

      const key = `nav_group_${n.id}`;
      const open = localStorage.getItem(key);
      const isOpen = open === null ? true : (open === '1');
      const kidsHtml = n.children
        .map(k => renderItem(k, depth+1))
        .filter(Boolean)
        .join('');
      if(!kidsHtml) return '';

      return `
        <div class="nav-group" data-group="${n.id}">
          <button class="nav-group-head" type="button" data-toggle="${n.id}" aria-expanded="${isOpen?'true':'false'}" ${pad} data-label="${UI.esc(n.label)}" title="${UI.esc(n.label)}">
            <span class="nav-ico" data-ico="${iconFor(n.id)}" aria-hidden="true"></span>
            <span class="nav-label">${UI.esc(n.label)}</span>
            <span class="chev">▾</span>
          </button>
          <div class="nav-group-kids" style="display:${isOpen?'block':'none'}">${kidsHtml}</div>
        </div>
      `;
    }

    nav.innerHTML = Config.NAV.map(n=>renderItem(n,0)).filter(Boolean).join('');

    // --- dynamic Commands menu (delegated privileges per-user) ---
    try{
      const extras = (window.Store && Store.getUserExtraPrivs) ? Store.getUserExtraPrivs(user.id) : [];
      const kids = [];
      if(extras && extras.length){
        kids.push({ id: 'commands', label: 'Commands', icon: '⚡', perm: 'view_dashboard' });
        if(extras.includes('view_master_schedule')) kids.push({ id: 'master_schedule', label: 'Master Schedule', icon: '📅', perm: 'view_master_schedule' });
        if(extras.includes('create_users')) kids.push({ id: 'users', label: 'User Management', icon: '👤', perm: 'create_users' });
        if(extras.includes('manage_announcements')) kids.push({ id: 'announcements', label: 'Announcement', icon: '📣', perm: 'manage_announcements' });

        const cmdGroup = { id: 'commands_group', label: 'Commands', icon: '⚡', perm: 'view_dashboard', children: kids };
        const html = renderItem(cmdGroup, 0);
        if(html) nav.innerHTML += html;
      }
    }catch(_){}


    if(!nav.innerHTML.trim()){
      nav.innerHTML = `
        <div class="small muted" style="padding:10px 6px">
          No menu items available for this account.<br/>
          Check the user role/permissions in <b>User Management</b>.
        </div>
      `;
      return;
    }

    nav.querySelectorAll('[data-toggle]').forEach(btn=>{
      btn.onclick = ()=>{
        const id = btn.dataset.toggle;
        const wrap = nav.querySelector(`.nav-group[data-group="${CSS.escape(id)}"]`);
        if(!wrap) return;
        const kids = wrap.querySelector('.nav-group-kids');
        const open = kids.style.display !== 'none';
        kids.style.display = open ? 'none' : 'block';
        btn.setAttribute('aria-expanded', open ? 'false' : 'true');
        localStorage.setItem(`nav_group_${id}`, open ? '0' : '1');
      };
    });
  }

  function renderUserCard(user){
    const el = UI.el('#userCard');
    if(!el) return;
    const team = Config.teamById(user.teamId);
    // Current duty for the logged-in user (Manila time).
    // Uses the weekly schedule blocks for today's Manila date.
    const duty = (function(){
      const todayISO = UI.manilaTodayISO();

      // 1) Leaves override duty
      const lv = Store.getLeave(user.id, todayISO);
      if(lv && lv.type){
        const map = { SICK:'ON SICK LEAVE', EMERGENCY:'ON EMERGENCY LEAVE', VACATION:'ON VACATION LEAVE', HOLIDAY:'ON HOLIDAY LEAVE' };
        return { roleId: null, label: map[lv.type] || 'ON LEAVE' };
      }

      // 2) Rest day override duty (based on master schedule cycle)
      try{
        const mm = Store.getMasterMember(user.teamId, user.id);
        const tm = Store.getTeamMaster(user.teamId) || {};
        const freq = Number(tm.frequencyMonths || 1) || 1;
        if(mm && Array.isArray(mm.restWeekdays) && mm.restWeekdays.length){
          const dow = UI.weekdayFromISO(todayISO);
          // month-difference cycle check (Manila calendar, ISO-safe)
          const s = String(mm.startISO || todayISO);
          const sy = parseInt(s.slice(0,4),10), sm = parseInt(s.slice(5,7),10);
          const ty = parseInt(todayISO.slice(0,4),10), tm0 = parseInt(todayISO.slice(5,7),10);
          if(Number.isFinite(sy) && Number.isFinite(sm) && Number.isFinite(ty) && Number.isFinite(tm0)){
            const monthsDiff = (ty - sy) * 12 + (tm0 - sm);
            const inCycle = monthsDiff >= 0 ? (monthsDiff % freq === 0) : false;
            if(inCycle && mm.restWeekdays.includes(dow)){
              return { roleId: null, label: 'ON REST DAY' };
            }
          }
        }
      }catch(e){ /* ignore */ }

      // 3) Otherwise, compute duty from the currently active scheduled block
      const dow = UI.weekdayFromISO(todayISO);
      if(dow === null) return { roleId: null, label: '—' };

      const p = UI.manilaNow();
      const nowMin = UI.minutesOfDay(p);
      const blocks = Store.getUserDayBlocks(user.id, dow) || [];
      for(const b of blocks){
        const s = UI.parseHM(b.start);
        const e = UI.parseHM(b.end);
        if(!Number.isFinite(s) || !Number.isFinite(e)) continue;
        const wraps = e <= s;
        const hit = (!wraps && nowMin >= s && nowMin < e) || (wraps && (nowMin >= s || nowMin < e));
        if(hit){
          const sc = Config.scheduleById(b.role);
          return { roleId: b.role, label: (sc && sc.label) ? sc.label : String(b.role||'—') };
        }
      }
      return { roleId: null, label: '—' };
    })();
    const prof = Store.getProfile(user.id) || {};
    const initials = UI.initials(user.name||user.username);
    const avatarHtml = prof.photoDataUrl
      ? `<img src="${prof.photoDataUrl}" alt="User photo" />`
      : `<div class="initials">${UI.esc(initials)}</div>`;

    // Sidebar profile: compact by default to maximize vertical space for the menu list.
    // (Users can still edit profile via Settings.)
    let shiftLabel = (team && team.label) ? String(team.label).toUpperCase() : '';
    // Developer Access label parity (matches Online Users Bar + backend normalization):
    // SUPER roles default to Developer Access when teamOverride is false and teamId is empty.
    try{
      const r = String(user.role||'').toUpperCase();
      const isSuper = (window.Config && Config.ROLES) ? (r === String(Config.ROLES.SUPER_ADMIN) || r === String(Config.ROLES.SUPER_USER)) : (r === 'SUPER_ADMIN' || r === 'SUPER_USER');
      const override = !!(user.teamOverride ?? user.team_override ?? false);
      const tid = (user.teamId === null || user.teamId === undefined) ? '' : String(user.teamId);
      if(isSuper && !override && !tid){
        shiftLabel = 'DEVELOPER ACCESS';
      }
    }catch(_){}
    const roleLabel = String(user.role||'').replaceAll('_',' ');
    el.innerHTML = `
      <div class="sp-compact sp-compact-v2" role="group" aria-label="User profile">
        <div class="sp-name sp-name-sm sp-name-top">${UI.esc(user.name||user.username)}</div>
        <div class="sp-row">
          <div class="sp-photo sp-photo-sm" aria-hidden="true">${avatarHtml}</div>
          <div class="sp-info sp-info-row">
            <div class="sp-meta">
              <span class="sp-role">${UI.esc(roleLabel||'')}</span>
              <span class="sp-dot" aria-hidden="true">•</span>
              <span class="sp-shift-sm">${UI.esc(shiftLabel||'')}</span>
            </div>
            <div class="sp-dutyline"><span class="muted">Duty:</span> <span class="sp-dutyvalue">${UI.esc(duty.label||'—')}</span></div>
            <div class="sp-tz small muted">Asia/Manila</div>
          </div>
        </div>
      </div>
    `;

    // Auto-fit text so long names/duty are still readable within the allocated sidebar width.
    const nm = el.querySelector('.sp-name');
    const dutyEl = el.querySelector('.sp-dutyline');
    // Run after layout
    requestAnimationFrame(()=>{
      try{
        if(nm) fitText(nm, 14, 22);
        if(dutyEl) fitText(dutyEl, 11, 12);
      }catch(err){ console.error('Profile RAF error', err); }
    });

    // no inline edit button
  }

  function cloudProfileEnabled(){
    try{
      return !!(window.CloudUsers && window.MUMS_ENV && MUMS_ENV.SUPABASE_URL && MUMS_ENV.SUPABASE_ANON_KEY);
    }catch(_){ return false; }
  }

  // Simple square cropper modal (drag + zoom). Returns a PNG data URL.
  function openCropModal(dataUrl, opts){
    opts = opts || {};
    const onDone = typeof opts.onDone === 'function' ? opts.onDone : function(){};
    const onCancel = typeof opts.onCancel === 'function' ? opts.onCancel : function(){};
    const canvas = UI.el('#cropCanvas');
    const zoomEl = UI.el('#cropZoom');
    const btnCancel = UI.el('#cropCancel');
    const btnSave = UI.el('#cropSave');
    if(!canvas || !zoomEl || !btnCancel || !btnSave){
      onCancel();
      return;
    }

    const ctx = canvas.getContext('2d');
    const size = canvas.width || 320;

    const state = {
      img: null,
      baseScale: 1,
      zoom: 1,
      offX: 0,
      offY: 0,
      dragging: false,
      lastX: 0,
      lastY: 0
    };

    function clamp(){
      if(!state.img) return;
      const scale = state.baseScale * state.zoom;
      const maxX = Math.max(0, (state.img.width * scale - size) / 2);
      const maxY = Math.max(0, (state.img.height * scale - size) / 2);
      state.offX = Math.max(-maxX, Math.min(maxX, state.offX));
      state.offY = Math.max(-maxY, Math.min(maxY, state.offY));
    }

    function draw(){
      if(!state.img) return;
      const scale = state.baseScale * state.zoom;
      clamp();
      ctx.clearRect(0,0,size,size);
      // background
      ctx.fillStyle = '#0b0f16';
      ctx.fillRect(0,0,size,size);

      ctx.save();
      ctx.translate(size/2 + state.offX, size/2 + state.offY);
      ctx.scale(scale, scale);
      ctx.drawImage(state.img, -state.img.width/2, -state.img.height/2);
      ctx.restore();

      // subtle border
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1,1,size-2,size-2);
      ctx.restore();
    }

    function pointToCanvas(e){
      const r = canvas.getBoundingClientRect();
      const sx = size / (r.width || size);
      const sy = size / (r.height || size);
      return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
    }

    // Wire events (overwrite each open to avoid handler buildup)
    canvas.onpointerdown = (e)=>{
      try{ canvas.setPointerCapture(e.pointerId); }catch(_){}
      const p = pointToCanvas(e);
      state.dragging = true;
      state.lastX = p.x;
      state.lastY = p.y;
    };
    canvas.onpointermove = (e)=>{
      if(!state.dragging) return;
      const p = pointToCanvas(e);
      const dx = p.x - state.lastX;
      const dy = p.y - state.lastY;
      state.lastX = p.x;
      state.lastY = p.y;
      state.offX += dx;
      state.offY += dy;
      draw();
    };
    canvas.onpointerup = ()=>{ state.dragging = false; };
    canvas.onpointercancel = ()=>{ state.dragging = false; };

    zoomEl.oninput = ()=>{
      state.zoom = Math.max(1, Math.min(3, Number(zoomEl.value||1)));
      draw();
    };

    btnCancel.onclick = ()=>{
      UI.closeModal('cropModal');
      onCancel();
    };

    btnSave.onclick = ()=>{
      if(!state.img){
        UI.closeModal('cropModal');
        onCancel();
        return;
      }
      // Render a higher-res export for upload
      const outSize = 512;
      const out = document.createElement('canvas');
      out.width = outSize;
      out.height = outSize;
      const octx = out.getContext('2d');
      const k = outSize / size;
      const baseOut = state.baseScale * k;
      const scaleOut = baseOut * state.zoom;
      const offX = state.offX * k;
      const offY = state.offY * k;

      // Clamp again for export
      const maxX = Math.max(0, (state.img.width * scaleOut - outSize) / 2);
      const maxY = Math.max(0, (state.img.height * scaleOut - outSize) / 2);
      const cx = Math.max(-maxX, Math.min(maxX, offX));
      const cy = Math.max(-maxY, Math.min(maxY, offY));

      octx.fillStyle = '#0b0f16';
      octx.fillRect(0,0,outSize,outSize);
      octx.save();
      octx.translate(outSize/2 + cx, outSize/2 + cy);
      octx.scale(scaleOut, scaleOut);
      octx.drawImage(state.img, -state.img.width/2, -state.img.height/2);
      octx.restore();

      let png = '';
      try{ png = out.toDataURL('image/png'); }catch(_){ png = ''; }
      UI.closeModal('cropModal');
      if(png) onDone(png);
      else onCancel();
    };

    // Load image
    const img = new Image();
    img.onload = ()=>{
      state.img = img;
      state.zoom = 1;
      zoomEl.value = '1';
      state.offX = 0;
      state.offY = 0;
      // Cover-fit to crop square
      state.baseScale = Math.max(size / img.width, size / img.height);
      draw();
    };
    img.onerror = ()=>{
      UI.closeModal('cropModal');
      onCancel();
    };
    img.src = dataUrl;

    UI.openModal('cropModal');
  }

  function openProfileModal(user){
    const prof = Store.getProfile(user.id) || {};
    const roleUpper0 = String(user && user.role ? user.role : '').trim().toUpperCase();
    const isSuperAdmin0 = (roleUpper0 === 'SUPER_ADMIN');
    const isSuperRole0 = (roleUpper0 === 'SUPER_ADMIN' || roleUpper0 === 'SUPER_USER');
    const inferredOverride0 = isSuperRole0 ? !!(user.teamOverride ?? user.team_override ?? false) || !!(user.teamId) : false;
    const teamForLabel = (!user.teamId && isSuperRole0 && !inferredOverride0) ? { id:'', label:'Developer Access' } : Config.teamById(user.teamId);

    const nameEl = UI.el('#profileName');
    const emailEl = UI.el('#profileEmail');
    const roleEl = UI.el('#profileRole');
    const teamEl = UI.el('#profileTeam');

    // SUPER_ADMIN Team Override Selector
    // - Default: Developer Access (team_id = NULL, team_override=false)
    // - Override: assign to a shift team (morning/mid/night)
    let teamSel = UI.el('#profileTeamSelect');
    if(isSuperAdmin0){
      try{
        if(!teamSel){
          teamSel = document.createElement('select');
          teamSel.id = 'profileTeamSelect';
          teamSel.className = 'input';

          // Default option
          const opt0 = document.createElement('option');
          opt0.value = '';
          opt0.textContent = 'Developer Access';
          teamSel.appendChild(opt0);

          // Shift teams
          (Config && Array.isArray(Config.TEAMS) ? Config.TEAMS : []).forEach(t=>{
            if(!t || !t.id) return;
            const o = document.createElement('option');
            o.value = String(t.id);
            o.textContent = String(t.label || t.id);
            teamSel.appendChild(o);
          });

          if(teamEl && teamEl.parentElement){
            teamEl.parentElement.appendChild(teamSel);
          }
        }
      }catch(_){ }
    }

    // Fill fields
    if(nameEl) nameEl.value = user.name||'';
    if(emailEl) {
      let em = user.email||'';

      // Prefer the enriched Store user record when available (cloud roster sync).
      if(!em){
        try{
          const su = (window.Store && typeof Store.getUserById === 'function') ? Store.getUserById(user.id) : null;
          if(su && su.email) em = String(su.email);
        }catch(_){ }
      }

      // Fallback: Supabase auth user.
      if(!em){
        try{
          const cu = (window.CloudAuth && typeof CloudAuth.getUser === 'function') ? CloudAuth.getUser() : null;
          if(cu && cu.email) em = String(cu.email);
        }catch(_){ }
      }

      // Final fallback: derive from username.
      if(!em){
        try{
          const domain = (window.Config && Config.USERNAME_EMAIL_DOMAIN) ? String(Config.USERNAME_EMAIL_DOMAIN) : 'mums.local';
          const un = String(user.username||'').trim();
          if(un) em = `${un}@${domain}`;
        }catch(_){ }
      }

      emailEl.value = em;
    }
    if(roleEl) roleEl.value = user.role||'';
    if(teamEl) teamEl.value = (teamForLabel && teamForLabel.label) ? teamForLabel.label : '';

    // Toggle team input/select
    try{
      if(isSuperAdmin0 && teamSel){
        if(teamEl) teamEl.style.display = 'none';
        teamSel.style.display = '';

        // For SUPER roles, only show an override team if teamOverride is enabled.
        let teamId = String(user.teamId || '').trim();
        let teamOverride = !!(user.teamOverride ?? user.team_override ?? false);
        if(isSuperRole0 && (user.teamOverride === undefined && user.team_override === undefined)) teamOverride = !!teamId;
        teamSel.value = (teamOverride && teamId) ? teamId : '';
      } else {
        if(teamEl) teamEl.style.display = '';
        if(teamSel) teamSel.style.display = 'none';
      }
    }catch(_){ }

    renderProfileAvatar(prof.photoDataUrl, user);

    // Layout selector
    const layoutSel = UI.el('#profileLayout');
    if(layoutSel){
      layoutSel.value = localStorage.getItem('mums_profile_layout') || 'banner';
    }

    // If cloud is enabled, hydrate from server profile (name + avatar_url) for correctness.
    if(cloudProfileEnabled()){
      try{
        CloudUsers.me().then(out=>{
          try{
            if(!out || !out.ok || !out.profile) return;
            const p = out.profile;
            // Update name only if user hasn't started editing.
            if(nameEl && (String(nameEl.value||'').trim() === String(user.name||'').trim())){
              if(p.name) nameEl.value = p.name;
            }
            if(p.avatar_url){
              Store.setProfile(user.id, { photoDataUrl: p.avatar_url, updatedAt: Date.now() });
              renderProfileAvatar(p.avatar_url, user);
              renderUserCard(user);
            }

            // Keep email/team fields accurate for cloud profiles.
            if(emailEl && p.email) emailEl.value = p.email;
            if(isSuperAdmin0 && teamSel){
              const roleUp = String(p.role || user.role || '').toUpperCase();
              const isSuperRole = (roleUp === 'SUPER_ADMIN' || roleUp === 'SUPER_USER');
              const teamIdRaw = (p.team_id === null || p.team_id === undefined) ? '' : String(p.team_id||'').trim();
              let tOverride = !!(p.team_override ?? p.teamOverride ?? false);
              if(isSuperRole && (p.team_override === undefined && p.teamOverride === undefined)) tOverride = !!teamIdRaw;
              teamSel.value = (tOverride && teamIdRaw) ? teamIdRaw : '';
            }
          }catch(_){ }
        }).catch(()=>{});
      }catch(_){ }
    }

    // Upload -> crop -> server upload
    const input = UI.el('#profilePhotoInput');
    if(input){
      input.value = '';
      input.onchange = async()=>{
        try{
          const f = input.files && input.files[0];
          if(!f) return;
          // Read original image; cropper will export 512x512 PNG.
          const dataUrl = await UI.readImageAsDataUrl(f, 1400);
          openCropModal(dataUrl, {
            onDone: async (croppedPng)=>{
              if(!croppedPng) return;
              if(cloudProfileEnabled()){
                const up = await CloudUsers.uploadAvatar(croppedPng);
                if(!up.ok){
                  await UI.alert({ title:'Upload failed', message: up.message || 'Could not upload avatar.' });
                  return;
                }
                const url = up.url || (up.data && (up.data.url || up.data.publicUrl)) || '';
                Store.setProfile(user.id, { photoDataUrl: url, updatedAt: Date.now() });
                renderProfileAvatar(url, user);
                renderUserCard(user);
              } else {
                // Offline fallback (local only)
                Store.setProfile(user.id, { photoDataUrl: croppedPng, updatedAt: Date.now() });
                renderProfileAvatar(croppedPng, user);
                renderUserCard(user);
              }
            },
            onCancel: ()=>{}
          });
        } catch (e){
          console.error('Photo upload error', e);
        }
      };
    }

    // Remove photo
    const rm = UI.el('#profileRemovePhoto');
    if(rm){
      rm.onclick = async ()=>{
        const hasPhoto = !!(Store.getProfile(user.id)||{}).photoDataUrl;
        if(!hasPhoto) return;
        const ok = await UI.confirm({ title:'Remove Profile Photo', message:'Remove your profile photo?', okText:'Remove', danger:true });
        if(!ok) return;

        if(cloudProfileEnabled()){
          const out = await CloudUsers.removeAvatar();
          if(!out.ok){
            await UI.alert({ title:'Remove failed', message: out.message || 'Could not remove avatar.' });
            return;
          }
        }

        Store.setProfile(user.id, { photoDataUrl: null, updatedAt: Date.now() });
        renderProfileAvatar(null, user);
        renderUserCard(Store.getUsers().find(u=>u.id===user.id) || user);
      };
    }

    UI.el('#profileSave').onclick = async ()=>{
      const name = String((nameEl && nameEl.value) || '').trim();

      // SUPER_ADMIN team override payload
      let teamIdSel = '';
      let teamOverrideSel = false;
      try{
        if(isSuperAdmin0 && teamSel){
          teamIdSel = String(teamSel.value||'').trim();
          teamOverrideSel = !!teamIdSel;
        }
      }catch(_){ }

      if(cloudProfileEnabled()){
        const payload = { name: name || (user.name||user.username) };
        if(isSuperAdmin0){
          payload.team_id = teamOverrideSel ? teamIdSel : null;
          payload.team_override = !!teamOverrideSel;
        }

        const out = await CloudUsers.updateMe(payload);
        if(!out.ok){
          await UI.alert({ title:'Save failed', message: out.message || 'Could not update profile.' });
          return;
        }

        // Refresh directory so all UI surfaces see the authoritative change.
        try{ await CloudUsers.refreshIntoLocalStore(); }catch(_){ }
      }

      // Update local store immediately for UI.
      const localPatch = { name: name || user.username };
      if(isSuperAdmin0){
        localPatch.teamOverride = !!teamOverrideSel;
        localPatch.teamId = teamOverrideSel ? teamIdSel : '';
      }
      Store.updateUser(user.id, localPatch);

      // Persist layout selection
      if(layoutSel){
        localStorage.setItem('mums_profile_layout', String(layoutSel.value||'card'));
      }

      const updated = Store.getUsers().find(u=>u.id===user.id);
      if(updated){ renderUserCard(updated); }
      UI.closeModal('profileModal');
    };

    UI.openModal('profileModal');
  }

  function renderProfileAvatar(photoDataUrl, user){
    const box = UI.el('#profileAvatar');
    if(!box) return;
    if(photoDataUrl){
      box.innerHTML = `<img src="${photoDataUrl}" alt="User photo" />`;
    } else {
      box.innerHTML = `<div class="initials" style="font-size:28px">${UI.esc(UI.initials(user.name||user.username))}</div>`;
    }
  }

  function canSeeLog(me, entry){
    const isSuper = me.role === Config.ROLES.SUPER_ADMIN;
    const isAdmin = isSuper || me.role === Config.ROLES.ADMIN;
    const isLead = me.role === Config.ROLES.TEAM_LEAD;
    if(isAdmin) return true;
    if(isLead){
      const showAll = localStorage.getItem('ums_logs_show_all') === '1';
      return showAll ? true : (entry.teamId === me.teamId);
    }
    return entry.teamId === me.teamId;
  }

  function renderSideLogs(user){

    // Component-module override (preferred)
    try{
      if(window.Components && Components.SidebarLogs){
        Components.SidebarLogs.render(user);
        return;
      }
    }catch(_){ }
    const box = UI.el('#sideLogs');
    const list = UI.el('#sideLogsList');
    const hint = UI.el('#sideLogsHint');
    const btn = UI.el('#openLogs');
    if(!box || !list || !btn) return;
    btn.onclick = ()=>{ window.location.hash = '#logs'; };
    const logs = Store.getLogs().filter(l=>canSeeLog(user,l)).slice(0,5);
    hint.textContent = logs.length ? `Showing ${logs.length} recent` : 'No activity';
    const fmt = (ts)=>{
      try{
        const p = UI.manilaParts(new Date(ts));
        const hh = String(p.hh).padStart(2,'0');
        const mm = String(p.mm).padStart(2,'0');
        return `${hh}:${mm}`;
      }catch(e){
        const d = new Date(ts);
        const hh = String(d.getHours()).padStart(2,'0');
        const mm = String(d.getMinutes()).padStart(2,'0');
        return `${hh}:${mm}`;
      }
    };
    list.innerHTML = logs.map(e=>{
      const teamClass = `team-${e.teamId}`;
      return `<div class="logline ${teamClass}" title="${UI.esc(e.detail||'')}">
        <span class="t">[${fmt(e.ts)}]</span>
        <span class="m">${UI.esc(e.msg||e.action||'')}</span>
      </div>`;
    }).join('');
  }

  function setActiveNav(page){
    UI.els('#nav a').forEach(a=>a.classList.toggle('active', a.dataset.page===page));
    // If active is inside a group, visually mark the group header too.
    UI.els('#nav .nav-group').forEach(g=>g.classList.remove('active'));
    const active = UI.el(`#nav a[data-page="${CSS.escape(page)}"]`);
    if(active){
      const group = active.closest('.nav-group');
      if(group){
        group.classList.add('active');
        // auto expand so user can see current page in tree
        const kids = group.querySelector('.nav-group-kids');
        const head = group.querySelector('.nav-group-head');
        if(kids && kids.style.display==='none'){
          kids.style.display = 'block';
          if(head) head.setAttribute('aria-expanded','true');
          const id = group.getAttribute('data-group');
          if(id) localStorage.setItem(`nav_group_${id}`,'1');
        }
      }
    }
  }

  function renderRightNow(){
    // Per UX: remove live date/time from the right sidebar.
    // Keep a lightweight static hint if needed.
    const chip = UI.el('#summaryNowChip');
    if(chip) chip.textContent = 'Asia/Manila';
  }

  // ---------------------------------------------------------------------
  // Dynamic Guide system (Right sidebar > Summary)
  // ---------------------------------------------------------------------
  function mkGuideSvg(title, lines){
    const esc = UI.esc;
    // Accept either an array of lines or a single string.
    // Some callers pass a single string; previously that caused a crash
    // because String.prototype.slice returns a string (no .map).
    let arr = [];
    if(Array.isArray(lines)) arr = lines;
    else if(typeof lines === 'string') arr = lines.split('\n');
    else if(lines != null) arr = [String(lines)];
    const safeLines = arr.slice(0,6).map(x=>esc(x));
    const lineY = [54,76,98,120,142,164];
    const text = safeLines.map((t,i)=>`<text x="28" y="${lineY[i]}" font-size="12" fill="rgba(255,255,255,.82)" font-family="system-ui,-apple-system,Segoe UI,Roboto">${t}</text>`).join('');
    return `
      <svg viewBox="0 0 520 200" width="100%" height="140" aria-hidden="true">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="rgba(255,255,255,.10)"/>
            <stop offset="1" stop-color="rgba(0,0,0,.05)"/>
          </linearGradient>
        </defs>
        <rect x="10" y="10" width="500" height="180" rx="18" fill="url(#g)" stroke="rgba(255,255,255,.12)"/>
        <rect x="24" y="26" width="472" height="28" rx="10" fill="rgba(0,0,0,.18)" stroke="rgba(255,255,255,.10)"/>
        <text x="36" y="46" font-size="13" fill="rgba(255,255,255,.92)" font-weight="700" font-family="system-ui,-apple-system,Segoe UI,Roboto">${esc(title)}</text>
        ${text}
        <rect x="24" y="158" width="180" height="18" rx="9" fill="rgba(255,255,255,.07)"/>
        <rect x="212" y="158" width="120" height="18" rx="9" fill="rgba(255,255,255,.06)"/>
        <rect x="340" y="158" width="156" height="18" rx="9" fill="rgba(255,255,255,.05)"/>
      </svg>
    `;
  }

  const GUIDES = {
    dashboard: {
      title: 'Dashboard',
      guide: [
        { q:'What is this page for?', a:'Dashboard gives you a quick overview of your day and system status in MUMS.' },
        { q:'Manila time', a:'All time-based logic (duty, schedules, announcements) follows Asia/Manila time.' },
      ],
      notes: [
        'If you are a Team Lead, use Members > Assign Tasks to update schedules.',
        'Use Announcements to broadcast updates to your team.'
      ],
      legends: [
        ['🔒','Locked week (cannot edit until unlocked)'],
        ['📣','Announcement broadcast'],
      ]
    },
    mailbox: {
      title: 'Mailbox',
      guide: [
        { q:'What is Mailbox duty?', a:'Mailbox duty indicates the member responsible for mailbox handling at the current hour.' },
        { q:'How is duty computed?', a:'Duty is derived from the scheduled task blocks and Manila time.' },
      ],
      notes: [
        'If duty looks incorrect, confirm the week and day selector on Assign Tasks.'
      ],
      legends: [
        ['📥','Mailbox Manager'],
        ['📞','Call-related tasks']
      ]
    },
    members: {
      title: 'Assign Tasks',
      guide: [
        { q:'How do I assign tasks to members?', a:'Select a member row, choose a task, then click-and-drag on the hour grid. All scheduling is strictly 1-hour blocks (no minutes).' },
        { q:'What is Paint mode?', a:'Paint lets you click-and-drag across multiple hours to fill quickly with the selected task. It still enforces 1-hour blocks.' },
        { q:'How do SL / EL / VL / HL work?', a:'Use the leave buttons on a member to set Sick Leave (SL), Emergency Leave (EL), Vacation Leave (VL), or Holiday Leave (HL). When active, the member is greyed out and excluded from Auto Schedule.' },
        { q:'What is the Coverage Meter?', a:'Coverage Meter shows OK Hours and Health% for the selected day grid. OK Hours = hours with valid active coverage; Health% = (OK Hours / required hours) × 100.' },
        { q:'How do I delete schedule blocks?', a:'Click one or more blocks to select them, then press Delete/Backspace to remove immediately. You can also use Delete Selected or Clear All.' },
        { q:'What does Clear All do?', a:'Clear All deletes ALL assigned blocks for the selected member for the entire week (Sun–Sat). You will be asked to confirm.' },
        { q:'What does Send do?', a:'Send notifies members that the schedule was updated and requires acknowledgement. Team Lead can see who acknowledged.' },
      ],
      manual: [
        {title:'Assign blocks', caption:'Assign 1-hour blocks via drag or Paint', svg: mkGuideSvg('Assign Tasks','Drag on the hour grid — snaps to hours only')},
        {title:'Leave buttons', caption:'SL/EL/VL/HL grey out a member for the selected date', svg: mkGuideSvg('Leave Controls','Click to set; click again to remove (confirm)')},
        {title:'Coverage Meter', caption:'OK Hours and Health% for the selected day grid', svg: mkGuideSvg('Coverage Meter','Shows day label and health trend signals')},
        {title:'Send & Acknowledge', caption:'Send updates to members and track acknowledgements', svg: mkGuideSvg('Send','Members receive pop-up + beep, then acknowledge')}
      ],
      notes: [
        'Active members appear on top. Members on Rest Day or Leave appear below.',
        'Rest Day is driven by Master Schedule and follows Manila calendar date (no timezone shifts).',
        'Locked weeks cannot be edited. Unlock (Mon–Fri) if you need changes.'
      ],
      legends: [
        ['SL','Sick Leave'],
        ['EL','Emergency Leave'],
        ['VL','Vacation Leave'],
        ['HL','Holiday Leave'],
        ['🖌','Paint mode'],
        ['🧹','Clear All'],
        ['⌫','Delete selected blocks'],
        ['ON REST DAY','Member is not schedulable on that date'],
      ]
    },
    master_schedule: {
      title: 'Master Schedule',
      guide: [
        { q:'What is Master Schedule?', a:'Master Schedule defines each member\'s fixed Rest Day pattern (e.g., Friday & Saturday) and frequency (monthly/quarterly). It drives the Rest Day greying in Assign Tasks.' },
        { q:'How do I set Rest Days?', a:'Select a member, choose rest weekdays, choose frequency, then save. The Assign Tasks page updates automatically.' },
      ],
      manual: [
        {title:'Rest days', caption:'Set fixed rest weekdays per member', svg: mkGuideSvg('Master Schedule','Choose weekdays and save rule')} ,
        {title:'Frequency', caption:'Monthly / Every 2 months / Every 3 months / Quarterly', svg: mkGuideSvg('Frequency','Controls when fixed pattern repeats')}
      ],
      notes: [
        'Rest Day is a calendar rule (weekday-based) computed in Manila time.',
        'Members on Rest Day are shown as disabled in Assign Tasks with “ON REST DAY”.'
      ],
      legends: [
        ['Fri/Sat','Example Rest Day selection'],
        ['Monthly','Rule frequency example']
      ]
    },
    users: {
      title: 'User Management',
      guide: [
        { q:'What is this page for?', a:'User Management is where Admin/Super User maintains the user roster, roles, and team assignment.' },
        { q:'Why do users sometimes look missing?', a:'MUMS includes recovery/migration logic for older stored user keys. If a browser profile was reset, re-import or re-create users as needed.' },
      ],
      manual: [
        {title:'Roles', caption:'Assign MEMBER, TEAM_LEAD, ADMIN, SUPER_ADMIN', svg: mkGuideSvg('User Management','Roles control what pages are visible')} ,
        {title:'Roster', caption:'Create and maintain user list', svg: mkGuideSvg('User Roster','Existing users are recovered via migration/backup')}
      ],
      notes: [
        'For production multi-user shared data, connect to online backend later (realtime roster + schedules).'
      ],
      legends: [
        ['TEAM_LEAD','Can manage schedules for own team'],
        ['ADMIN','Can manage users + teams'],
        ['SUPER_ADMIN','Full access (MUMS)']
      ]
    },
    announcements: {
      title: 'Announcements',
      guide: [
        { q:'How does the announcement bar work?', a:'The top bar rotates one announcement every 3 seconds. Clicking it opens the full message.' },
        { q:'What is shown on the bar?', a:'Page › Announcement details › Creator full name › Broadcast time (Manila).' },
      ],
      manual: [
        {title:'Broadcast', caption:'Create announcement with creator and timestamp', svg: mkGuideSvg('Announcements','Rotates 1 item every 3 seconds')} ,
        {title:'Format', caption:'Page › Announcement: Details › User › Time', svg: mkGuideSvg('Announcement Bar','Shows who sent it and when (Manila)')}
      ],
      notes: [
        'Members can control notification sound in Settings > Sound.'
      ],
      legends: [
        ['📣','Announcement'],
        ['🔔','Notification sound (if enabled)']
      ]
    },
    logs: {
      title: 'Activity Logs',
      guide: [
        { q:'What is recorded?', a:'Important actions like schedule edits, leaves, sends, locks/unlocks, and exports are tracked for visibility.' },
      ],
      notes: [
        'Team Leads usually see their team logs unless “show all” is enabled (Admin only).' 
      ],
      legends: [
        ['🕒','Time of action'],
        ['Team tag','Which team the action belongs to']
      ]
    }
  };

  // -------------------------------------------------------------
  // Offline AI-like Guide (no internet): search over GUIDES
  // -------------------------------------------------------------
  function buildGuideKB(){
    const kb=[];
    const guides=GUIDES||{};
    const sections=[['guide','GUIDE'],['notes','NOTES'],['legends','LEGENDS'],['manual','MANUAL']];
    const norm=(s)=>String(s||'').toLowerCase();
    Object.keys(guides).forEach(pageId=>{
      const g=guides[pageId]||{};
      const pageTitle=g.title||pageId;
      sections.forEach(([key,label])=>{
        const items=g[key]||[];
        if(key==='notes'){
          items.forEach((t,i)=>{
            const q=label+' '+(i+1);
            const a=String(t||'');
            const blob=norm([pageId,pageTitle,label,q,a].join(' '));
            kb.push({pageId,pageTitle,section:label,q,aShort:a,aLong:'',steps:[],tips:[],tags:[],blob});
          });
          return;
        }
        if(key==='legends'){
          items.forEach((r,i)=>{
            const q=String((r&&r[0])|| (label+' '+(i+1)));
            const a=String((r&&r[1])||'');
            const blob=norm([pageId,pageTitle,label,q,a].join(' '));
            kb.push({pageId,pageTitle,section:label,q,aShort:a,aLong:'',steps:[],tips:[],tags:[],blob});
          });
          return;
        }
        if(key==='manual'){
          items.forEach((it,i)=>{
            const q=String(it?.title || ('Manual '+(i+1)));
            const a=String(it?.caption || '');
            const blob=norm([pageId,pageTitle,label,q,a].join(' '));
            kb.push({pageId,pageTitle,section:label,q,aShort:a,aLong:'',steps:[],tips:[],tags:[],blob});
          });
          return;
        }
        items.forEach((it,i)=>{
          if(!it) return;
          const q=String(it.q || ('Guide '+(i+1)));
          const a=String(it.a || it.a_short || '');
          const aLong=String(it.a_long || '');
          const steps=Array.isArray(it.steps)?it.steps:[];
          const tips=Array.isArray(it.tips)?it.tips:[];
          const tags=Array.isArray(it.tags)?it.tags:[];
          const blob=norm([pageId,pageTitle,label,q,a,aLong,steps.join(' '),tips.join(' '),tags.join(' ')].join(' '));
          kb.push({pageId,pageTitle,section:label,q,aShort:a,aLong,steps,tips,tags,blob});
        });
      });
    });
    return kb;
  }

  const _guideKB = buildGuideKB();

  function _tokenize(s){
    return String(s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean).filter(w=>w.length>1);
  }

  function _scoreGuideItem(tokens, item, currentPageId){
    let score=0;
    if(item.pageId===currentPageId) score+=20;
    const blob=item.blob||'';
    const q=String(item.q||'').toLowerCase();
    for(const t of tokens){
      if(blob.includes(t)) score+=3;
      if(q.includes(t)) score+=4;
    }
    const joined=tokens.join(' ');
    if(joined.includes('paint') && blob.includes('paint')) score+=8;
    if(joined.includes('coverage') && blob.includes('coverage')) score+=8;
    if(joined.includes('clear') && blob.includes('clear')) score+=6;
    if((joined.includes('sl')||joined.includes('el')||joined.includes('vl')||joined.includes('hl')) && item.section==='LEGENDS') score+=6;
    return score;
  }

  function answerGuideQuestion(question, currentPageId){
    const tokens=_tokenize(question);
    if(!tokens.length) return {best:null, related:[], note:'Type a clearer question (example: how to use Paint?).', confidence:0, scores:{best:0, second:0}};
    const scored=_guideKB
      .map(it=>({it, score:_scoreGuideItem(tokens,it,currentPageId)}))
      .filter(x=>x.score>0)
      .sort((a,b)=>b.score-a.score);

    const bestObj = scored[0] || null;
    const secondObj = scored[1] || null;
    const best = bestObj ? bestObj.it : null;
    const related = scored.slice(1,4).map(x=>x.it);

    // Confidence heuristic (0..100):
    // - higher when best score is high
    // - higher when best is well separated from 2nd
    const bestScore = bestObj ? bestObj.score : 0;
    const secondScore = secondObj ? secondObj.score : 0;
    let conf = 0;
    if(bestScore > 0){
      const separation = (bestScore - secondScore) / Math.max(1, bestScore);
      // Base increases quickly then saturates
      const base = 1 - Math.exp(-bestScore / 18);
      conf = Math.round(100 * Math.min(1, Math.max(0, 0.55*base + 0.45*separation)));
    }

    return {
      best,
      related,
      note: best ? '' : 'No match found. Try different keywords (Paint, Clear All, SL).',
      confidence: conf,
      scores: { best: bestScore, second: secondScore }
    };
  }

  function renderSummaryGuide(pageId, menuLabel){
    const titleEl = UI.el('#summaryMenuTitle');
    const metaEl = UI.el('#summaryMenuMeta');
    const bodyEl = UI.el('#summaryGuide');
    if(!titleEl || !metaEl || !bodyEl) return;

    const g = GUIDES[pageId] || {
      title: (menuLabel||pageId||'').toString(),
      guide: [{ q:'Guide not available yet', a:'This page is new. Add a guide entry so Summary can show procedures, notes, legends, and manual screenshots.' }],
      notes: ['MUMS guides are dynamic and will expand as new pages/features are added.'],
      legends: [],
      manual: []
    };

    titleEl.textContent = `Guide: ${g.title}`;
    metaEl.textContent = `${(menuLabel||g.title)} • Use Search to find answers. Guides update automatically when you switch menus.`;

    // Guide enabled toggle
    const enabledToggle = UI.el('#guideEnabledToggle');
    const enabled = localStorage.getItem('mums_guide_enabled') !== '0';
    if(enabledToggle){
      enabledToggle.checked = enabled;
    }

    if(!enabled){
      bodyEl.innerHTML = `
        <div class="gpanel">
          <div class="gpanel-disabled">
            <div class="gpanel-disabled-title">Guide is disabled</div>
            <div class="small muted">Enable Guide in the toggle above to see procedures, notes, legends, and mini manual for this page.</div>
            <button class="btn" type="button" id="guideEnableNow">Enable Guide</button>
          </div>
        </div>
      `;
      const b = UI.el('#guideEnableNow');
      if(b){
        b.onclick = ()=>{
          localStorage.setItem('mums_guide_enabled','1');
          renderSummaryGuide(pageId, menuLabel);
        };
      }
      return;
    }

    const activeTab = (localStorage.getItem('mums_guide_tab') || 'guide');
    // Sync tab UI
    try{ UI.els('.gtab').forEach(b=>{ const on = (b.dataset.gtab||'')===activeTab; b.classList.toggle('active', on); b.setAttribute('aria-selected', on?'true':'false'); }); }catch(e){}
    const searchEl = UI.el('#guideSearch');
    const q = (searchEl && searchEl.value) ? String(searchEl.value).trim().toLowerCase() : '';

    // Remember questions per page
    const qKey = `mums_guide_questions_${pageId}`;
    let savedQs = [];
    try{ savedQs = JSON.parse(localStorage.getItem(qKey) || '[]') || []; }catch(e){ savedQs = []; }

    // Last offline AI answer for this page
    let lastAI = null;
    try{ lastAI = JSON.parse(localStorage.getItem('mums_ai_last_'+pageId) || 'null'); }catch(e){ lastAI=null; }

    const esc = UI.esc;

    function matchText(s){
      if(!q) return true;
      return String(s||'').toLowerCase().includes(q);
    }

    const guideItems = (g.guide||[]).filter(it=> matchText(it.q) || matchText(it.a));
    const noteItems = (g.notes||[]).filter(it=> matchText(it));
    const legendItems = (g.legends||[]).filter(it=> matchText(it[0]) || matchText(it[1]));
    const manualItems = (g.manual||[]).filter(it=> matchText(it.caption) || matchText(it.title));

    function renderGuide(){
      const parts = [];

      // AI answer card (if user asked a question)
      if(lastAI && lastAI.q){
        const qTxt = String(lastAI.q||'');
        const ansObj = lastAI.ans || {};
        const best = ansObj.best || null;
        const note = ansObj.note || '';
        const related = Array.isArray(ansObj.related) ? ansObj.related : [];
        const answerText = best ? (best.aShort || best.q || '') : (note || 'No answer found.');
        const src = best ? (best.pageTitle + ' • ' + best.section) : '';
        const conf = (typeof ansObj.confidence === 'number') ? ansObj.confidence : 0;
        const confText = conf ? (`Confidence: ${conf}%`) : 'Confidence: —';
        const relHtml = related.length ? (`<div class="grel">` + related.map((r,i)=>{
          const label = esc(r.q || ('Related '+(i+1)));
          return `<button class="btn ghost small" type="button" data-grel="${esc(r.q||'')}">${label}</button>`;
        }).join('') + `</div>`) : '';

        parts.push(`
          <div class="gcard gai">
            <div class="gcard-top">
              <span class="badge">AI (Offline)</span>
              <span class="small muted">${esc(confText)}${src ? (' • ' + esc(src)) : ''}</span>
            </div>
            <div class="gq">${esc(qTxt)}</div>
            <div class="ga">${esc(answerText)}</div>
            ${relHtml}
            <div class="gcard-actions">
              <button class="btn small" type="button" data-gai-more="1">More details</button>
              <button class="btn ghost small" type="button" data-gai-src="1" ${best?'':'disabled'} title="Show where this answer came from">Show sources</button>
              <button class="btn ghost small" type="button" data-gai-clear="1">Clear</button>
            </div>
          </div>
        `);
      }

      if(!guideItems.length){
        parts.push(`<div class="small muted">No results.</div>`);
      } else {
        parts.push(`<div class="gcards">` + guideItems.map((it,idx)=>{
          const qv = esc(it.q);
          const av = esc(it.a);
          return `
            <div class="gcard" data-gidx="${idx}">
              <div class="gq">${qv}</div>
              <div class="ga">${av}</div>
              <div class="gcard-actions">
                <button class="btn ghost small" type="button" data-gmore="${idx}">More details</button>
              </div>
            </div>
          `;
        }).join('') + `</div>`);
      }

      return parts.join('');
    }

    function renderNotes(){
      if(!noteItems.length) return `<div class="small muted">No results.</div>`;
      return `<ul class="gnotes">` + noteItems.map(n=>`<li>${esc(n)}</li>`).join('') + `</ul>`;
    }

    function renderLegends(){
      if(!legendItems.length) return `<div class="small muted">No legends.</div>`;
      return `<table class="gleg"><thead><tr><th>Label</th><th>Meaning</th></tr></thead><tbody>`+
        legendItems.map(r=>`<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')+
      `</tbody></table>`;
    }

    function renderManual(){
      if(!manualItems.length) return `<div class="small muted">No manual images available for this page yet.</div>`;
      return `<div class="gmanual">` + manualItems.map((m,i)=>{
        const id = `gm_${pageId}_${i}`;
        return `
          <button class="gthumb" type="button" data-gimg="${esc(id)}" title="Open">
            <div class="gthumb-img">${m.svg||''}</div>
            <div class="gthumb-cap">${esc(m.caption||m.title||'')}</div>
          </button>
        `;
      }).join('') + `</div>`;
    }

    const tabContent = {
      guide: renderGuide(),
      notes: renderNotes(),
      legends: renderLegends(),
      manual: renderManual()
    };

    bodyEl.innerHTML = `
      <div class="gpanel">
        <div class="gpanel-head">
          <div class="gpanel-title">${esc(g.title)}</div>
          <div class="small muted">${q ? ('Showing results for “'+esc(q)+'”') : 'Select a tab to view details.'}</div>
        </div>
        <div class="gpanel-body">
          <div class="gpanel-tab" data-tab="${esc(activeTab)}">
            ${tabContent[activeTab] || tabContent.guide}
          </div>
        </div>
        <div class="gpanel-foot">
          <div class="small muted">Tip: Use Search to filter the guide. Click a manual thumbnail to enlarge.</div>
          ${savedQs.length ? (`<div class="gqs"><div class="small muted">Saved questions</div>`+
            savedQs.slice(-3).reverse().map(x=>`<div class="gqs-item">• ${esc(x)}</div>`).join('') + `</div>`) : ''}
        </div>
      </div>
    `;

    // Wire manual thumbnail clicks (open image modal)
    const thumbs = bodyEl.querySelectorAll('.gthumb');
    thumbs.forEach((b)=>{
      b.onclick = ()=>{
        const cap = b.querySelector('.gthumb-cap')?.textContent || 'Guide';
        const svg = b.querySelector('.gthumb-img')?.innerHTML || '';
        UI.openModal('guideImgModal');
        const t = UI.el('#guideImgTitle');
        const c = UI.el('#guideImgCaption');
        const bd = UI.el('#guideImgBody');
        if(t) t.textContent = 'Mini Manual';
        if(c) c.textContent = cap;
        if(bd) bd.innerHTML = `<div class="gimg-wrap">${svg}</div>`;
      };
    });

    // Wire guide "More details" and Offline AI buttons
    bodyEl.querySelectorAll('[data-gmore]').forEach((btn)=>{
      btn.onclick = ()=>{
        const i = Number(btn.getAttribute('data-gmore')||0);
        const it = (g.guide||[])[i];
        if(!it) return;
        UI.openModal('guideImgModal');
        const t = UI.el('#guideImgTitle');
        const c = UI.el('#guideImgCaption');
        const bd = UI.el('#guideImgBody');
        if(t) t.textContent = 'Guide Details';
        if(c) c.textContent = it.q || 'Guide';
        if(bd){
          bd.innerHTML = `
            <div class="gdetail">
              <div class="gq">${esc(it.q||'')}</div>
              <div class="ga" style="margin-top:10px">${esc(it.a||'')}</div>
            </div>
          `;
        }
      };
    });

    // Offline AI: related buttons
    bodyEl.querySelectorAll('[data-grel]').forEach((btn)=>{
      btn.onclick = ()=>{
        const relQ = String(btn.getAttribute('data-grel')||'').trim();
        if(!relQ) return;
        try{
          const ans = answerGuideQuestion(relQ, pageId);
          localStorage.setItem('mums_ai_last_'+pageId, JSON.stringify({ q:relQ, ans:ans, ts:Date.now() }));
        }catch(e){}
        // render again and switch to Guide tab
        localStorage.setItem('mums_guide_tab','guide');
        const searchEl = UI.el('#guideSearch');
        if(searchEl) searchEl.value = '';
        renderSummaryGuide(pageId, menuLabel);
      };
    });

    // Offline AI: clear card
    const clearAI = bodyEl.querySelector('[data-gai-clear]');
    if(clearAI){
      clearAI.onclick = ()=>{
        try{ localStorage.removeItem('mums_ai_last_'+pageId); }catch(e){}
        renderSummaryGuide(pageId, menuLabel);
      };
    }

    // Offline AI: more details
    const moreAI = bodyEl.querySelector('[data-gai-more]');
    if(moreAI && lastAI && lastAI.ans){
      moreAI.onclick = ()=>{
        const qTxt = String(lastAI.q||'');
        const ansObj = lastAI.ans||{};
        const best = ansObj.best||null;
        const related = Array.isArray(ansObj.related)?ansObj.related:[];
        UI.openModal('guideImgModal');
        const t = UI.el('#guideImgTitle');
        const c = UI.el('#guideImgCaption');
        const bd = UI.el('#guideImgBody');
        if(t) t.textContent = 'AI Answer (Offline)';
        if(c) c.textContent = qTxt;
        if(bd){
          const steps = (best && Array.isArray(best.steps) && best.steps.length) ? ('<div class="small muted" style="margin-top:12px"><b>Steps</b><br>'+best.steps.map((s,i)=> (i+1)+'. '+esc(s)).join('<br>')+'</div>') : '';
          const tips = (best && Array.isArray(best.tips) && best.tips.length) ? ('<div class="small muted" style="margin-top:12px"><b>Tips</b><br>'+best.tips.map(s=>'• '+esc(s)).join('<br>')+'</div>') : '';
          const rel = related.length ? ('<div class="small muted" style="margin-top:12px"><b>Related</b><br>'+related.map(r=>'• '+esc(r.q||'' )+' ('+esc(r.pageTitle||r.pageId||'')+')').join('<br>')+'</div>') : '';
          bd.innerHTML = `
            <div class="gdetail">
              <div class="gq">${esc(qTxt)}</div>
              <div class="ga" style="margin-top:10px">${esc(best ? (best.aShort||'') : (ansObj.note||''))}</div>
              ${(best && best.aLong) ? ('<div class=\"small muted\" style=\"margin-top:12px\">'+esc(best.aLong)+'</div>') : ''}
              ${steps}
              ${tips}
              ${rel}
            </div>
          `;
        }
      };
    }

    // Offline AI: show sources (which KB entry produced the answer)
    const srcAI = bodyEl.querySelector('[data-gai-src]');
    if(srcAI && lastAI && lastAI.ans){
      srcAI.onclick = ()=>{
        const ansObj = lastAI.ans || {};
        const best = ansObj.best || null;
        if(!best) return;
        UI.openModal('guideImgModal');
        const t = UI.el('#guideImgTitle');
        const c = UI.el('#guideImgCaption');
        const bd = UI.el('#guideImgBody');
        const conf = (typeof ansObj.confidence==='number') ? ansObj.confidence : 0;
        if(t) t.textContent = 'Answer Sources';
        if(c) c.textContent = `${best.pageTitle || best.pageId || ''} • ${best.section || ''}${conf?(' • Confidence '+conf+'%'):''}`;
        if(bd){
          const steps = (Array.isArray(best.steps) && best.steps.length)
            ? ('<div class="small muted" style="margin-top:12px"><b>Steps</b><br>' + best.steps.map((s,i)=> (i+1)+'. '+esc(s)).join('<br>') + '</div>')
            : '';
          const tips = (Array.isArray(best.tips) && best.tips.length)
            ? ('<div class="small muted" style="margin-top:12px"><b>Tips</b><br>' + best.tips.map(s=>'• '+esc(s)).join('<br>') + '</div>')
            : '';
          const long = best.aLong ? ('<div class="small muted" style="margin-top:12px">'+esc(best.aLong)+'</div>') : '';
          bd.innerHTML = `
            <div class="gdetail">
              <div class="small muted">This answer was matched from the MUMS in-app guide knowledge base.</div>
              <div class="gq" style="margin-top:10px"><b>Entry question</b><br>${esc(best.q||'')}</div>
              <div class="ga" style="margin-top:10px"><b>Entry answer</b><br>${esc(best.aShort||'')}</div>
              ${long}
              ${steps}
              ${tips}
              <div class="small muted" style="margin-top:12px"><b>Source</b><br>${esc(best.pageTitle||best.pageId||'')} • ${esc(best.section||'')}</div>
            </div>
          `;
        }
      };
    }
  }

  function openFullManualForPage(pageId, menuLabel){
    const esc = UI.esc;
    const g = GUIDES[pageId] || {
      title: (menuLabel||pageId||'').toString(),
      guide: [], notes: [], legends: [], manual: []
    };
    UI.openModal('guideImgModal');
    const t = UI.el('#guideImgTitle');
    const c = UI.el('#guideImgCaption');
    const bd = UI.el('#guideImgBody');
    if(t) t.textContent = 'Full Manual';
    if(c) c.textContent = `${g.title} • Guide + Notes + Legends + Manual`;
    if(!bd) return;

    const guideHtml = (g.guide||[]).length ? (g.guide||[]).map((it,i)=>{
      return `
        <div class="card pad" style="margin:10px 0">
          <div class="small muted">GUIDE</div>
          <div class="h3" style="margin:6px 0">${esc(it.q||('Guide '+(i+1)))}</div>
          <div class="small" style="white-space:pre-wrap">${esc(it.a||it.a_short||'')}</div>
          ${it.a_long ? `<div class="small muted" style="margin-top:10px;white-space:pre-wrap">${esc(it.a_long)}</div>` : ''}
          ${(Array.isArray(it.steps)&&it.steps.length) ? (`<div class="small" style="margin-top:10px"><b>Steps</b><br>`+it.steps.map((s,ix)=>`${ix+1}. ${esc(s)}`).join('<br>')+`</div>`) : ''}
          ${(Array.isArray(it.tips)&&it.tips.length) ? (`<div class="small" style="margin-top:10px"><b>Tips</b><br>`+it.tips.map(s=>`• ${esc(s)}`).join('<br>')+`</div>`) : ''}
        </div>
      `;
    }).join('') : `<div class="small muted">No guide entries yet.</div>`;

    const notesHtml = (g.notes||[]).length ? (`<ul style="margin:8px 0 0 18px">`+(g.notes||[]).map(n=>`<li class="small" style="margin:6px 0">${esc(n)}</li>`).join('')+`</ul>`) : `<div class="small muted">No notes.</div>`;

    const legendsHtml = (g.legends||[]).length ? (`<table class="gleg" style="margin-top:8px"><thead><tr><th>Label</th><th>Meaning</th></tr></thead><tbody>`+
      (g.legends||[]).map(r=>`<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')+
    `</tbody></table>`) : `<div class="small muted">No legends.</div>`;

    const manualHtml = (g.manual||[]).length ? (`<div class="gmanual" style="margin-top:8px">`+(g.manual||[]).map((m,i)=>{
      return `
        <div class="card pad" style="margin:10px 0">
          <div class="small muted">MANUAL</div>
          <div class="h3" style="margin:6px 0">${esc(m.title||('Manual '+(i+1)))}</div>
          <div class="small muted" style="margin-bottom:10px">${esc(m.caption||'')}</div>
          <div class="gimg-wrap">${m.svg||''}</div>
        </div>
      `;
    }).join('')+`</div>`) : `<div class="small muted">No manual images available for this page yet.</div>`;

    bd.innerHTML = `
      <div>
        <div class="h2" style="margin:0 0 8px">Guide</div>
        ${guideHtml}

        <div class="h2" style="margin:18px 0 8px">Notes</div>
        ${notesHtml}

        <div class="h2" style="margin:18px 0 8px">Legends</div>
        ${legendsHtml}

        <div class="h2" style="margin:18px 0 8px">Manual</div>
        ${manualHtml}
      </div>
    `;
  }

  function updateAnnouncementBar(){
    const bar = UI.el('#announceBar');
    const active = UI.activeAnnouncements();

    const titleEl = UI.el('#announceTitle');
    const msgEl = UI.el('#announceMsg');
    const metaEl = UI.el('#announceMeta');
    const avatarEl = UI.el('#announceAvatar');
    const whoEl = UI.el('#announceWho');

    if(!active.length){
      bar.style.visibility='hidden';
      bar.dataset.count='0';
      bar.dataset.idx='0';
      if(avatarEl) avatarEl.innerHTML = '';
      if(whoEl) whoEl.textContent = '';
      return;
    }

    bar.style.visibility='visible';
    const count = active.length;
    const idx = Number(bar.dataset.idx||0) % count;
    const a = active[idx];

    bar.dataset.count = String(count);
    bar.dataset.idx = String(idx);

    const who = a.createdByName || '—';
    if(whoEl) whoEl.textContent = who;

    // Time label: startAt (activation) then createdAt
    const tms = a.startAt || a.createdAt;
    let when = '—';
    if(tms){
      const ts = new Date(tms);
      const p = UI.manilaParts(ts);
      const pad = n => String(n).padStart(2,'0');
      when = `${p.isoDate} ${pad(p.hh)}:${pad(p.mm)}`;
    }

    // Populate content
    if(titleEl) titleEl.textContent = String(a.title||'Announcement');
    if(msgEl) msgEl.textContent = String(a.short || '').trim() || '—';
    if(metaEl) metaEl.textContent = when ? `Active from ${when}` : '';

    // Team Leader Announcements: profile logo + full name (below logo)
    try{
      const pid = String(a.createdBy||'');
      const prof = pid ? Store.getProfile(pid) : null;
      const photo = prof && prof.photoDataUrl ? prof.photoDataUrl : '';
      const initials = String(who||'—').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
      if(avatarEl){
        avatarEl.innerHTML = photo
          ? `<img src="${photo}" alt="" />`
          : `<div class="initials">${UI.esc(initials || '—')}</div>`;
      }
    }catch(_){}

    bar.onclick = ()=>{
      UI.el('#annModalTitle').textContent = a.title || 'Announcement';
      const body = UI.el('#annModalBody');
      if(a.fullHtml){ body.innerHTML = a.fullHtml; }
      else { body.textContent = a.full || a.short || ''; }
      UI.openModal('topAnnModal');
    };
  }

  function startAnnouncementRotation(){
    // Start once and keep running across page navigation.
    // Page routing must NOT reset the rotation index or restart the interval,
    // otherwise announcements appear to "change" when switching menu pages.
    if(annTimer) return;
    updateAnnouncementBar();
    annTimer = setInterval(()=>{
      try{
      const bar = UI.el('#announceBar');
      const count = Number(bar.dataset.count||0);
      if(count<=1){ updateAnnouncementBar(); return; }
      bar.dataset.idx = String((Number(bar.dataset.idx||0)+1)%count);
      updateAnnouncementBar();
    
      }catch(e){ console.error('Announcement interval error', e); }
    }, 3000);
  }

  
  // ----------------------
  // Path + hash routing helpers
  // - Supports clean URLs like /dashboard while preserving legacy hash routing.
  // - Hash takes precedence when present (supports file:// mode and deep-links).
  // ----------------------
  function _routePageIdFromHref(href){
    try{
      const h = String(href||'').trim();
      if(!h) return '';
      if(h[0] === '#'){
        // Support legacy hash routes both with and without a leading slash:
        //   #my_schedule   ✅
        //   #/my_schedule  ✅
        let s = h.slice(1).split('?')[0].split('#')[0];
        if(s.startsWith('/')) s = s.slice(1);
        return s.split('/')[0] || '';
      }
      if(h[0] === '/'){
        return h.slice(1).split('?')[0].split('#')[0].split('/')[0];
      }
      return '';
    }catch(_){ return ''; }
  }

  function resolveRoutePageId(){
    try{
      const pages = window.Pages || {};
      let h = String(window.location.hash||'').replace(/^#/, '').trim();
      // Support legacy hash routes both with and without a leading slash:
      //   #my_schedule   ✅
      //   #/my_schedule  ✅
      if(h.startsWith('/')) h = h.slice(1);
      if(h && pages[h]) return h;

      const proto = String(window.location.protocol||'');
      if(proto !== 'file:'){
        const p = String(window.location.pathname||'/');
        const seg = (p.split('/').filter(Boolean)[0] || '').trim();
        if(seg && !seg.includes('.') && pages[seg]) return seg;
      }

      if(pages['dashboard']) return 'dashboard';
      const keys = Object.keys(pages);
      return keys.length ? keys[0] : 'dashboard';
    }catch(_){
      return 'dashboard';
    }
  }

  function navigateToPageId(pageId, opts){
    const pages = window.Pages || {};
    let id = String(pageId||'').trim();
    if(!id || !pages[id]) id = pages['dashboard'] ? 'dashboard' : (Object.keys(pages)[0] || 'dashboard');

    const proto = String(window.location.protocol||'');
    if(proto === 'file:'){
      window.location.hash = '#' + id;
      return;
    }

    try{
      const url = '/' + id;
      if(opts && opts.replace) history.replaceState({},'', url);
      else history.pushState({},'', url);
      // pushState/replaceState does not trigger navigation handlers
      try{ route(); }catch(_){ }
    }catch(_){
      // Fallback to hash routing
      window.location.hash = '#' + id;
    }
  }
function route(){
    try{
      const user = Auth.getUser();
      if(!user) return;
      renderUserCard(user);
      renderSideLogs(user);

      const pageId = resolveRoutePageId();
	      // Track active page id globally so background sync/listeners in other modules
	      // cannot overwrite the current view.
	      try{ window._currentPageId = pageId; }catch(_){ }
      try{
        const m = (Config && Config.menu) ? Config.menu.find(x=>x.id===pageId) : null;
        window._currentPageLabel = m ? (m.label||pageId) : pageId;
      }catch(e){ window._currentPageLabel = pageId; }

      // Update the right sidebar Summary guide based on the currently selected menu page.
      renderSummaryGuide(pageId, window._currentPageLabel);
      setActiveNav(pageId);

      const main = UI.el('#main');
      if(cleanup){ try{ cleanup(); }catch(e){} cleanup=null; }
      main.innerHTML = '';

      try{
        window.Pages[pageId](main);
      }catch(pageErr){
        showFatalError(pageErr);
      }
      if(main._cleanup){ cleanup = main._cleanup; main._cleanup = null; }

      // Do not restart announcements on route changes.
      // Just refresh the content in case announcements changed.
      updateAnnouncementBar();
    }catch(e){
      showFatalError(e);
    }
  }


  // -----------------------------
  // Reminders Engine (My / Team)
  // -----------------------------
  const ReminderEngine = (function(){
    let started = false;
    let timer = null;
    let ticking = false;

    // UI state
    let showAll = false;
    const expanded = new Set(); // key: "<kind>:<id>"
    let lastSignature = '';

    const KEYS = {
      my: 'mums_my_reminders',
      team: 'mums_team_reminders',
      settings: 'mums_reminder_settings',
      prefsPrefix: 'mums_reminder_prefs_' // per-user
    };

    function getSettings(){
      try{
        if(window.Store && typeof Store.getReminderSettings === 'function'){
          return Store.getReminderSettings();
        }
      }catch(_){}
      return { snoozePresets:[5,10,15,30], categories:['Work','Personal','Urgent'], escalationAfterMin:2, maxVisible:3 };
    }

    function getPrefs(userId){
      try{
        const raw = localStorage.getItem(KEYS.prefsPrefix + String(userId));
        if(!raw) return { muteUntil: 0 };
        const o = JSON.parse(raw);
        return (o && typeof o === 'object') ? { muteUntil: Number(o.muteUntil||0) } : { muteUntil: 0 };
      }catch(_){ return { muteUntil: 0 }; }
    }
    function setPrefs(userId, patch){
      try{
        const cur = getPrefs(userId);
        const next = Object.assign({}, cur, patch||{});
        next.muteUntil = Number(next.muteUntil||0);
        localStorage.setItem(KEYS.prefsPrefix + String(userId), JSON.stringify(next));
        // propagate cross-tab
        try{ window.dispatchEvent(new CustomEvent('mums:store', { detail:{ key: KEYS.prefsPrefix + String(userId) }})); }catch(_){}
      }catch(_){}
    }

    // Audio (beep until closed)
    const Audio = (function(){
      let ctx = null;
      let osc = null;
      let gain = null;
      let running = false;
      let locked = false;
      let pulseTimer = null;
      let curInterval = 650;

      function ensure(){
        if(ctx) return;
        try{
          const AC = window.AudioContext || window.webkitAudioContext;
          if(!AC) return;
          ctx = new AC();
          gain = ctx.createGain();
          gain.gain.value = 0.0001;
          gain.connect(ctx.destination);
          osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = 880;
          osc.connect(gain);
          osc.start();
        }catch(e){
          ctx=null; osc=null; gain=null;
        }
      }
      async function unlock(){
        try{
          ensure();
          if(!ctx) return false;
          if(ctx.state === 'suspended') await ctx.resume();
          locked = false;
          return true;
        }catch(e){
          locked = true;
          return false;
        }
      }
      async function start(mode){
        ensure();
        if(!ctx || !gain) { locked=true; return; }
        try{
          if(ctx.state === 'suspended') await ctx.resume();
          locked = false;
        }catch(e){ locked=true; }
        const interval = (mode && mode.interval) ? Number(mode.interval) : 650;
        const amp = (mode && mode.amp) ? Number(mode.amp) : 0.04;

        // If already running with same mode, do nothing
        if(running && interval === curInterval) return;

        running = true;
        curInterval = interval;

        try{ if(pulseTimer) clearInterval(pulseTimer); }catch(_){}
        pulseTimer = null;

        let on = false;
        const pulse = ()=>{
          if(!running) return;
          try{
            on = !on;
            gain.gain.setTargetAtTime(on ? amp : 0.0001, ctx.currentTime, 0.01);
          }catch(e){}
        };
        pulse();
        pulseTimer = setInterval(pulse, curInterval);
      }
      function stop(){
        running = false;
        try{ if(pulseTimer) clearInterval(pulseTimer); }catch(_){}
        pulseTimer = null;
        try{
          if(gain && ctx) gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.01);
        }catch(e){}
      }
      function isLocked(){ return !!locked; }
      return { start, stop, unlock, isLocked };
    })();

    function repeatLabel(r){
      const rep = String(r.repeat||'none');
      if(rep === 'custom') return 'Custom';
      if(rep === 'daily') return 'Daily';
      if(rep === 'weekly') return 'Weekly';
      return 'One-time';
    }

    function nextAlarmAtForReminder(r, now){
      const rep = String(r.repeat||'none');
      const base = Number(r.alarmAt||now);
      if(rep === 'none') return base;

      const baseDate = new Date(base);
      const hh = baseDate.getHours();
      const mm = baseDate.getMinutes();

      const makeCandidate = (d)=>{
        const dt = new Date(d);
        dt.setHours(hh, mm, 0, 0);
        return dt.getTime();
      };

      if(rep === 'daily'){
        let t = makeCandidate(now);
        if(t <= now + 500) t += 24*60*60*1000;
        return t;
      }

      if(rep === 'weekly'){
        const targetDow = baseDate.getDay();
        const d0 = new Date(now);
        d0.setHours(0,0,0,0);
        for(let i=0;i<14;i++){
          const d = new Date(d0.getTime() + i*24*60*60*1000);
          if(d.getDay() === targetDow){
            const t = makeCandidate(d.getTime());
            if(t > now + 500) return t;
          }
        }
        return base + 7*24*60*60*1000;
      }

      if(rep === 'custom'){
        const days = Array.isArray(r.repeatDays) ? r.repeatDays.map(x=>Number(x)).filter(x=>x>=0 && x<=6) : [];
        if(!days.length) return base;
        const set = new Set(days);
        const d0 = new Date(now);
        d0.setHours(0,0,0,0);
        for(let i=0;i<21;i++){
          const d = new Date(d0.getTime() + i*24*60*60*1000);
          if(set.has(d.getDay())){
            const t = makeCandidate(d.getTime());
            if(t > now + 500) return t;
          }
        }
        return base + 7*24*60*60*1000;
      }

      return base;
    }

    function getActiveForUser(user){
      const now = Date.now();
      const active = [];
      try{
        const my = (Store.getMyReminders && Store.getMyReminders(user.id)) || [];
        my.forEach(r=>{
          if(!r || r.closedAt) return;
          const dueAt = (r.snoozeUntil && r.snoozeUntil>now) ? r.snoozeUntil : r.alarmAt;
          if(now >= Number(dueAt||0)){
            const ageMin = Math.max(0, (now - Number(dueAt||now)) / 60000);
            active.push({ kind:'my', r, dueAt, ageMin });
          }
        });

        const team = (Store.getTeamReminders && Store.getTeamReminders(user.teamId)) || [];
        team.forEach(r=>{
          if(!r) return;
          const st = (r.perUser && r.perUser[String(user.id)]) ? r.perUser[String(user.id)] : {};
          if(st && st.closedAt) return;
          const dueAt = (st && st.snoozeUntil && st.snoozeUntil>now) ? st.snoozeUntil : r.alarmAt;
          if(now >= Number(dueAt||0)){
            const ageMin = Math.max(0, (now - Number(dueAt||now)) / 60000);
            active.push({ kind:'team', r, dueAt, ageMin });
          }
        });
      }catch(e){}

      active.sort((a,b)=>{
        const pa = (a.r && a.r.priority==='high') ? 0 : 1;
        const pb = (b.r && b.r.priority==='high') ? 0 : 1;
        if(pa!==pb) return pa-pb;
        return (a.dueAt||0)-(b.dueAt||0);
      });
      return active;
    }

    function getNextDueForUser(user){
      const now = Date.now();
      let min = null;
      try{
        const my = (Store.getMyReminders && Store.getMyReminders(user.id)) || [];
        my.forEach(r=>{
          if(!r || r.closedAt) return;
          const dueAt = (r.snoozeUntil && r.snoozeUntil>now) ? r.snoozeUntil : r.alarmAt;
          const t = Number(dueAt||0);
          if(!t) return;
          if(min===null || t < min) min = t;
        });

        const team = (Store.getTeamReminders && Store.getTeamReminders(user.teamId)) || [];
        team.forEach(r=>{
          if(!r) return;
          const st = (r.perUser && r.perUser[String(user.id)]) ? r.perUser[String(user.id)] : {};
          if(st && st.closedAt) return;
          const dueAt = (st && st.snoozeUntil && st.snoozeUntil>now) ? st.snoozeUntil : r.alarmAt;
          const t = Number(dueAt||0);
          if(!t) return;
          if(min===null || t < min) min = t;
        });
      }catch(_){}
      return min;
    }

    function signatureFor(active, settings){
      // Only include fields that affect rendering / sound decisions.
      const parts = active.map(a=>{
        const r = a.r||{};
        return [
          a.kind, r.id,
          Number(a.dueAt||0),
          String(r.short||''),
          String(r.details||''),
          String(r.priority||'normal'),
          String(r.category||''),
          String(r.repeat||'none'),
          Array.isArray(r.repeatDays)? r.repeatDays.join('.') : '',
          // per-user status for team reminders is encoded by whether active exists; no need further
          Math.floor(a.ageMin*10)/10
        ].join('|');
      });
      return [String(showAll), String(Audio.isLocked()), String(settings.escalationAfterMin||0), String(settings.maxVisible||3), parts.join(';;')].join('::');
    }

    function renderCards(user, active){
      const host = UI.el('#reminderFloatHost');
      if(!host) return;

      const settings = getSettings();
      const sig = signatureFor(active, settings);

      if(sig === lastSignature){
        // No UI changes needed.
        return;
      }
      lastSignature = sig;

      host.innerHTML = '';
      if(!active.length) return;

      const maxVisible = Math.max(1, Number(settings.maxVisible||3));
      const now = Date.now();

      const visible = showAll ? active : active.slice(0, maxVisible);
      const hiddenCount = showAll ? 0 : Math.max(0, active.length - visible.length);

      // "More" card
      if(hiddenCount > 0){
        const more = document.createElement('div');
        more.className = 'reminder-card more';
        more.innerHTML = `
          <div class="rc-top">
            <div class="rc-badge">Reminders</div>
            <div style="min-width:0;flex:1 1 auto">
              <div class="rc-title">+${hiddenCount} more</div>
              <div class="rc-meta">Click to expand the full list</div>
            </div>
            <div class="rc-actions">
              <button class="rc-close" type="button" title="Show all">Show</button>
            </div>
          </div>
        `;
        more.addEventListener('click', (e)=>{
          e.stopPropagation();
          showAll = true;
          tickSoon(0);
        });
        host.appendChild(more);
      }

      const presets = Array.isArray(settings.snoozePresets) ? settings.snoozePresets : [5,10];

      visible.forEach(item=>{
        const r = item.r;
        const kind = item.kind;
        const isMy = kind==='my';
        const cls = isMy ? 'my' : 'team';
        const pri = (r.priority==='high') ? 'high' : 'normal';
        const dueLabel = new Date(item.dueAt||r.alarmAt||now).toLocaleString();
        const badge = isMy ? 'My Reminder' : 'Team Reminder';
        const cat = String(r.category||'').trim();
        const escalated = (Number(settings.escalationAfterMin||0) > 0) && (item.ageMin >= Number(settings.escalationAfterMin||0));

        const snoozeButtons = presets.slice(0, 6).map(m=>{
          const mm = Math.max(1, Number(m||0));
          return `<button class="reminder-pill" data-act="snooze" data-min="${UI.esc(String(mm))}" type="button">Snooze ${UI.esc(String(mm))}m</button>`;
        }).join('');

        const key = `${kind}:${String(r.id||'')}`;

        const card = document.createElement('div');
        card.className = `reminder-card ${cls} ${pri}${escalated ? ' escalated' : ''}${expanded.has(key) ? ' expanded' : ''}`;
        card.setAttribute('data-kind', kind);
        card.setAttribute('data-id', String(r.id||''));
        card.innerHTML = `
          <div class="rc-top">
            <div class="rc-badge">${UI.esc(badge)}</div>
            <div style="min-width:0;flex:1 1 auto">
              <div class="rc-title">${UI.esc(r.short||'Reminder')}</div>
              <div class="rc-meta">${UI.esc(dueLabel)}${cat ? ` • ${UI.esc(cat)}` : ''}${r.priority==='high' ? ' • HIGH' : ''}${Audio.isLocked() ? ' • Sound blocked (click)' : ''}${escalated ? ' • Escalated' : ''}</div>
            </div>
            <div class="rc-actions">
              <button class="rc-close" type="button" title="Close alarm">Close</button>
            </div>
          </div>

          <div class="rc-body">
            <div class="rc-details">${UI.esc(r.details||'')}</div>
            <div class="rc-row">
              <div><b>Repeat:</b> ${UI.esc(repeatLabel(r))}</div>
              <div><b>Duration:</b> ${UI.esc(String(r.durationMin||1))}m</div>
            </div>
            <div class="rc-pills">
              ${snoozeButtons}
              <button class="reminder-pill" data-act="mute" data-min="15" type="button">Mute 15m</button>
              <button class="reminder-pill primary" data-act="open" type="button">${isMy ? 'Open My Reminders' : 'Open Team Reminders'}</button>
            </div>
          </div>
        `;
        host.appendChild(card);

        card.addEventListener('click', async (e)=>{
          try{
            const closeBtn = e.target && e.target.closest && e.target.closest('.rc-close');
            const pill = e.target && e.target.closest && e.target.closest('.reminder-pill');
            if(closeBtn){
              e.stopPropagation();
              await Audio.unlock();
              handleClose(user, kind, r);
              tickSoon(50);
              return;
            }
            if(pill){
              e.stopPropagation();
              await Audio.unlock();
              const act = pill.getAttribute('data-act');
              if(act==='snooze'){
                const min = Number(pill.getAttribute('data-min')||10);
                handleSnooze(user, kind, r, min);
              }else if(act==='open'){
                window.location.hash = isMy ? '#my_reminders' : '#team_reminders';
              }else if(act==='mute'){
                const min = Math.max(1, Number(pill.getAttribute('data-min')||15));
                const until = Date.now() + min*60*1000;
                setPrefs(user.id, { muteUntil: until });
              }
              tickSoon(50);
              return;
            }
            await Audio.unlock();
            if(expanded.has(key)) expanded.delete(key); else expanded.add(key);
            tickSoon(0);
          }catch(_){}
        });
      });
    }

    function handleClose(user, kind, r){
      const now = Date.now();
      if(kind==='my'){
        if((r.repeat||'none')==='none'){
          Store.updateMyReminder(r.id, { closedAt: now, snoozeUntil: null });
        }else{
          const t = nextAlarmAtForReminder(r, now);
          Store.updateMyReminder(r.id, { alarmAt: t, snoozeUntil: null, closedAt: null });
        }
      }else{
        Store.closeTeamReminderForUser(r.id, user.id);
        // If repeating, reschedule only when all members have closed
        try{
          const all = Store.getAllTeamReminders ? Store.getAllTeamReminders() : [];
          const cur = all.find(x=>x && String(x.id)===String(r.id));
          if(cur && (cur.repeat||'none')!=='none'){
            const users = (Store.getUsers && Store.getUsers()) || [];
            const members = users.filter(u => u && u.status==='active' && String(u.teamId)===String(cur.teamId));
            const ids = members.map(u=>String(u.id));
            const perUser = cur.perUser || {};
            const allClosed = ids.length ? ids.every(id=> perUser[id] && perUser[id].closedAt ) : true;
            if(allClosed){
              const t = nextAlarmAtForReminder(cur, now);
              const ackLog = Array.isArray(cur.ackLog) ? cur.ackLog.slice() : [];
              ackLog.push({ ts: now, userId: String(user.id), action:'repeat_reset' });
              Store.updateTeamReminder(cur.id, { alarmAt: t, perUser: {}, ackLog });
            }
          }
        }catch(_){}
      }
    }

    function handleSnooze(user, kind, r, minutes){
      const now = Date.now();
      const until = now + Math.max(1, Number(minutes||10))*60*1000;
      if(kind==='my'){
        Store.updateMyReminder(r.id, { snoozeUntil: until, closedAt: null });
      }else{
        Store.snoozeTeamReminderForUser(r.id, user.id, Math.max(1, Number(minutes||10)));
      }
    }

    function computeNextDelay(user, active){
      const now = Date.now();
      if(active.length){
        // Keep a light heartbeat to update escalation state and catch cross-tab updates.
        return 1000;
      }
      const nextDue = getNextDueForUser(user);
      if(nextDue === null) return 60000;
      const dt = Math.max(250, Math.min(60000, Number(nextDue) - now));
      return dt;
    }

    async function tick(){
      if(ticking) return;
      ticking = true;
      try{
        const user = Auth.getUser();
        if(!user) return;

        const settings = getSettings();
        const prefs = getPrefs(user.id);
        const now = Date.now();

        const active = getActiveForUser(user);

        // Render (only when state changed)
        renderCards(user, active);

        // Audio logic (respect mute)
        const muted = (prefs.muteUntil && Number(prefs.muteUntil) > now);

        if(active.length && !muted){
          const escalated = active.some(a => Number(settings.escalationAfterMin||0) > 0 && a.ageMin >= Number(settings.escalationAfterMin||0));
          await Audio.start(escalated ? { interval: 350, amp: 0.06 } : { interval: 650, amp: 0.04 });
        }else{
          Audio.stop();
          if(!active.length) showAll = false;
        }

        // schedule next tick
        if(started){
          scheduleNext(computeNextDelay(user, active));
        }
      }catch(_){
        if(started) scheduleNext(2000);
      }finally{
        ticking = false;
      }
    }

    function scheduleNext(ms){
      try{ if(timer) clearTimeout(timer); }catch(_){}
      timer = setTimeout(()=>tick(), Math.max(0, Number(ms||0)));
    }
    function tickSoon(ms){
      if(!started) return;
      scheduleNext(Math.max(0, Number(ms||0)));
    }

    function start(){
      if(started) return;
      started = true;
      lastSignature = '';
      tickSoon(0);

      window.addEventListener('pointerdown', ()=>{ Audio.unlock(); }, { passive:true });
      window.addEventListener('hashchange', ()=>{ showAll = false; tickSoon(0); }, { passive:true });

      // React to data changes across tabs
      window.addEventListener('mums:store', (e)=>{
        try{
          const k = e && e.detail ? String(e.detail.key||'') : '';
          if(k === KEYS.settings || k === KEYS.my || k === KEYS.team || k.startsWith(KEYS.prefsPrefix)){
            tickSoon(0);
          }
        }catch(_){}
      });
    }

    function stop(){
      started = false;
      try{ if(timer) clearTimeout(timer); }catch(_){}
      timer = null;
      try{ Audio.stop(); }catch(_){}
    }

    return { start, stop, tickSoon, setPrefs, getPrefs };
  })();
  window.ReminderEngine = ReminderEngine;




  function openDataToolsModal(){
    try{
      const summary = document.getElementById('storageHealthSummary');
      const details = document.getElementById('healthDetails');
      const rep = Store.healthCheck ? Store.healthCheck() : {ok:true,keysChecked:0,errors:[],sizeBytes:0};
      const mb = (rep.sizeBytes/1024/1024).toFixed(2);
      if(summary) summary.textContent = rep.ok ? `OK • ${rep.keysChecked} keys • ~${mb} MB` : `Issues • ${rep.errors.length} errors • ~${mb} MB`;
      if(details) details.textContent = rep.ok ? '' : rep.errors.map(e=>`${e.key}: ${e.error}`).join('\n');

      const runBtn = document.getElementById('runHealthCheckBtn');
      if(runBtn){
        runBtn.onclick = ()=>{
          const r = Store.healthCheck();
          const mb2 = (r.sizeBytes/1024/1024).toFixed(2);
          if(summary) summary.textContent = r.ok ? `OK • ${r.keysChecked} keys • ~${mb2} MB` : `Issues • ${r.errors.length} errors • ~${mb2} MB`;
          if(details) details.textContent = r.ok ? '' : r.errors.map(e=>`${e.key}: ${e.error}`).join('\n');
        };
      }

      const exportBtn = document.getElementById('exportAllBtn');
      if(exportBtn){
        exportBtn.onclick = ()=>{
          const data = Store.exportAllData();
          UI.downloadJSON(data, `mums_export_${new Date().toISOString().slice(0,10)}.json`);
        };
      }

      const impInput = document.getElementById('importAllInput');
      if(impInput){
        impInput.onchange = async ()=>{
          const f = impInput.files && impInput.files[0];
          if(!f) return;
          const txt = await f.text();
          let obj=null;
          try{ obj = JSON.parse(txt); }catch(e){ alert('Invalid JSON'); return; }
          const res = Store.importAllData(obj);
          if(!res.ok){ alert('Import failed: '+(res.error||'')); return; }
          alert('Import successful. Reloading...');
          location.reload();
        };
      }

      const resetBtn = document.getElementById('factoryResetBtn2');
      if(resetBtn){
        resetBtn.onclick = async ()=>{
          const ok = await UI.confirm({ title:'Factory Reset', message:'Factory reset local data? This will clear offline storage for this app.', okText:'Reset', danger:true });
          if(!ok) return;
          try{ Store.factoryReset && Store.factoryReset(); }catch(e){}
          alert('Reset complete. Reloading...');
          location.href = 'login.html';
        };
      }

      UI.openModal('dataHealthModal');
    }catch(e){ console.error(e); }
  }


  // Classic Style: Manila time in topbar center (theme-specific, injected)
  function setupClassicTopbarClock(){
    let timer = null;
    let fmt = null;

    function ensureFormatter(){
      if(fmt) return fmt;
      try{
        fmt = new Intl.DateTimeFormat('en-US', {
          weekday:'short', year:'numeric', month:'short', day:'2-digit',
          hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false,
          timeZone:'Asia/Manila'
        });
      }catch(_){
        fmt = null;
      }
      return fmt;
    }

    function tick(){
      const el = document.getElementById('classicManilaClock');
      if(!el) return;
      try{
        const f = ensureFormatter();
        el.textContent = f ? f.format(new Date()) : new Date().toISOString().replace('T',' ').slice(0,19);
      }catch(_){
        el.textContent = new Date().toISOString().replace('T',' ').slice(0,19);
      }
    }

    function apply(){
      const isClassic = (document.body && document.body.dataset && document.body.dataset.theme==='classic_style');
      const host = document.querySelector('.topbar-center');
      let el = document.getElementById('classicManilaClock');

      if(!isClassic){
        if(el) el.style.display = 'none';
        if(timer){ clearInterval(timer); timer=null; }
        return;
      }

      if(!host) return;
      if(!el){
        el = document.createElement('div');
        el.id = 'classicManilaClock';
        el.className = 'classic-clock';
        host.insertBefore(el, host.firstChild);
      }
      el.style.display = '';
      tick();
      if(!timer){ timer = setInterval(tick, 1000); }
    }

    window.addEventListener('mums:themeApplied', apply);
    apply();
  }

async function boot(){
    // Prevent double-boot (inline boot + auto-boot safety).
    if(window.__mumsBooted) return;
    window.__mumsBooted = true;
    try{ UI.bindDataClose && UI.bindDataClose(); }catch(_){ }
    // Global safety net: don't allow a blank screen.
    window.addEventListener('error', (e)=>{ showFatalError(e.error || e.message || e); });
    window.addEventListener('unhandledrejection', (e)=>{ showFatalError(e.reason || e); });

    // ensure initial super user exists
    Store.ensureSeed();

    // Apply saved theme ASAP (before heavy rendering)
    applyTheme(Store.getTheme());
    try{ setupClassicTopbarClock(); }catch(_){ }
    // Enterprise UI preferences
    // Density (normal vs compact)
    try{
      const d = (localStorage.getItem('mums_density')||'normal');
      localStorage.setItem('mums_density', d);
      document.body.classList.toggle('density-compact', d==='compact');
    }catch(e){}

    try{
      const cursorMode = 'system';
      localStorage.setItem('mums_cursor_mode', cursorMode);
      // Custom cursor disabled: use native system cursor for zero-latency and OS-consistent behavior.
    }catch(e){}
    try{ applySidebarState(); }catch(e){}
    try{ bindSidebarToggle(); }catch(e){}
    try{ bindMobilePanelToggle(); }catch(e){}
    try{ bindMobileBottomSheets(); }catch(e){}
    try{ bindMobileFabStack(); }catch(e){}
    try{ applyRightbarState(); }catch(e){}
    try{ bindRightbarToggle(); }catch(e){}
    try{ applyDensity(); }catch(e){}
    try{ bindNavKeyboard(); }catch(e){}

    // Bind settings modals (cursor/sidebar)
    try{
      const curSel = document.getElementById('cursorModeSelect');
      if(curSel){
        curSel.value = (localStorage.getItem('mums_cursor_mode')||'custom');
        curSel.onchange = ()=>{ try{ UI.setCursorMode(curSel.value); }catch(e){} };
      }
      const densSel = document.getElementById('densitySelect');
      if(densSel){
        densSel.value = (localStorage.getItem('mums_density')||'normal');
        densSel.onchange = ()=>{
          const v = (densSel.value==='compact') ? 'compact' : 'normal';
          localStorage.setItem('mums_density', v);
          document.body.classList.toggle('density-compact', v==='compact');
        };

      const toggleRP = document.getElementById('toggleRightPanelBtn');
      if(toggleRP){
        toggleRP.onclick = ()=>{
          try{
            const now = document.body.classList.contains('rightbar-collapsed');
            applyRightbarState(!now);
          }catch(_){}
        };
      }

      }

      const hoverT = document.getElementById('sidebarHoverExpandToggle');
      if(hoverT){
        const on = (localStorage.getItem('mums_sidebar_hover') ?? '1');
        hoverT.checked = on==='1';
        hoverT.onchange = ()=>{
          localStorage.setItem('mums_sidebar_hover', hoverT.checked ? '1' : '0');
          // re-apply hover class
          const isCollapsed = document.body.classList.contains('sidebar-collapsed');
          document.body.classList.toggle('sidebar-hoverable', isCollapsed && hoverT.checked);
        };
      }

      const sbSel = document.getElementById('sidebarDefaultSelect');
      if(sbSel){
        sbSel.value = (localStorage.getItem('mums_sidebar_default')||'expanded');
        sbSel.onchange = ()=>{
          const v = (sbSel.value==='collapsed') ? 'collapsed' : 'expanded';
          localStorage.setItem('mums_sidebar_default', v);
          // apply immediately
          applySidebarState(v==='collapsed');
        };
      }
    }catch(e){}


    const user = await Auth.requireUser();
    if(!user) return;

    // Canonical role flags (reused across Settings + permission-gated features).
    // NOTE: Keep these in the outer scope. Inner `try{ const isSA = ... }` blocks
    // caused the System Check card to remain hidden due to isSA being out-of-scope.
    const roleUpper = String(user.role||'').trim().toUpperCase().replace(/\s+/g,'_');
    const isSA = roleUpper === String((Config && Config.ROLES ? Config.ROLES.SUPER_ADMIN : 'SUPER_ADMIN'));
    const isSU = roleUpper === 'SUPER_USER';

    // Boot marker used by Activity Logs auto-fix (clear "already fixed" issues after a stable System Check).
    try{ window.__mumsBootTs = Date.now(); }catch(_){ }
    // Safe, conservative cleanup: remove duplicate/stale error entries from older builds.
    try{ if(window.Store && Store.autoFixLogs) Store.autoFixLogs(); }catch(e){ console.error(e); }

    // Normalize user fields so routing/nav don't fail if older user records are missing data
    // OR if role values were stored in a non-canonical format (e.g., "Team Lead", "TEAM LEAD", "team_lead ").
    function normalizeRole(v){
      const raw = String(v||'').trim();
      if(!raw) return (Config?.ROLES?.MEMBER) || 'MEMBER';
      const up = raw.toUpperCase().replace(/\s+/g,'_');
      const map = {
        'TEAMLEAD':'TEAM_LEAD',
        'TEAM-LEAD':'TEAM_LEAD',
        'TEAM_LEAD':'TEAM_LEAD',
        'LEAD':'TEAM_LEAD',
        'TL':'TEAM_LEAD',
        'SUPERADMIN':'SUPER_ADMIN',
        'SUPER-ADMIN':'SUPER_ADMIN',
        'SUPER_ADMIN':'SUPER_ADMIN',
        'ADMIN':'ADMIN',
        'MEMBER':'MEMBER'
      };
      const norm = map[up] || up;
      // If unknown, fall back to MEMBER.
      return (Config && Config.PERMS && Config.PERMS[norm]) ? norm : ((Config?.ROLES?.MEMBER) || 'MEMBER');
    }

    // Defer Store user patches emitted during boot to avoid synchronous re-entrant
    // render loops (mums:store dispatch is synchronous).
    const __bootPatch = {};
    let __bootPatchTimer = null;
    function deferBootUserPatch(patch){
      try{
        Object.assign(__bootPatch, patch || {});
        if(__bootPatchTimer) return;
        __bootPatchTimer = setTimeout(function(){
          __bootPatchTimer = null;
          try{
            const p = Object.assign({}, __bootPatch);
            Object.keys(__bootPatch).forEach(k=>{ try{ delete __bootPatch[k]; }catch(_){} });
            if(window.Store && Store.updateUser) Store.updateUser(user.id, p);
          }catch(_){ }
        }, 0);
      }catch(_){ }
    }

    const fixedRole = normalizeRole(user.role);
    if(fixedRole !== user.role){
      user.role = fixedRole;
      try{ deferBootUserPatch({ role: fixedRole }); }catch(e){}
    }

    // Team normalization:
    // - Super Admin / Super User default to Developer Access (teamId = '') unless teamOverride is enabled.
    // - Non-super roles must map to a known team.
    const isSuperRole = fixedRole === 'SUPER_ADMIN' || fixedRole === 'SUPER_USER';
    const teamOverride = !!user.teamOverride;
    const teams = (Config?.TEAMS||[]);
    const isValidTeam = (tid)=> !!teams.find(t=>t.id===tid);

    if(isSuperRole && !teamOverride){
      if(String(user.teamId||'') !== ''){
        user.teamId = '';
        try{ deferBootUserPatch({ teamId: '' }); }catch(e){}
      }
    } else {
      if(!user.teamId || !isValidTeam(user.teamId)){
        user.teamId = (teams[0] && teams[0].id) ? teams[0].id : 'morning';
        try{ deferBootUserPatch({ teamId: user.teamId }); }catch(e){}
      }
    }

    // Apply role-based Settings visibility (hidden tiles)
    try{ applySettingsVisibility(user); }catch(e){ console.error(e); }

    // Mandatory Attendance enforcement:
    // - Blocks app access ONLY during the active shift window for the user's team (teamStart->teamEnd)
    // - Cannot be dismissed/cancelled; user must submit before proceeding.
    // NOTE: Super roles in Developer Access (teamId='') have no shift window and must not be blocked.
    try{
      if(isSuperRole && !teamOverride){
        // Skip enforcement.
      } else {
      const team = (Config && Config.teamById) ? Config.teamById(user.teamId) : null;
      const nowP = UI.manilaNow();
      const nowMin = UI.minutesOfDay(nowP);
      const meta = UI.shiftMeta(team || { id:user.teamId, teamStart:'06:00', teamEnd:'15:00' });
      const inShift = (!meta.wraps) ? (nowMin>=meta.start && nowMin<meta.end) : ((nowMin>=meta.start) || (nowMin<meta.end));
      if(inShift){
        // shiftKey anchored at the shift-start date (handles cross-midnight)
        let shiftDateISO = nowP.isoDate;
        if(meta.wraps && nowMin < meta.end){
          shiftDateISO = UI.addDaysISO(nowP.isoDate, -1);
        }
        const shiftKey = `${user.teamId}|${shiftDateISO}T${String(Store.getTeamConfig(user.teamId)?.schedule?.start || team?.teamStart || '00:00')}`;
        if(!Store.hasAttendance(user.id, shiftKey)){
          const rec = await UI.attendancePrompt(user, team);
          if(rec){
            rec.shiftKey = shiftKey;
            try{ Store.addAttendance(rec); }catch(e){ console.error(e); }
            UI.toast('Attendance saved.');
          }
        }
      }
      }
    }catch(e){ console.error(e); }

    UI.el('#logoutBtn').onclick = ()=>{
      try{ const u = Auth.getUser && Auth.getUser(); if(u && Store && Store.setOffline) Store.setOffline(u.id); }catch(_){ }
      Auth.logout();
      window.location.href='./login.html';
    };

    try{ bindGlobalSearch(user); }catch(e){ console.error(e); }


    // Release Notes (new icon before Dictionary)
    const rnBtn = document.getElementById('releaseNotesBtn');
    if(rnBtn){
      rnBtn.onclick = ()=>{
        try{ UI.bindReleaseNotesModal && UI.bindReleaseNotesModal(user); }catch(e){ console.error(e); }
        UI.openModal('releaseNotesModal');
      };
    }

    // Dictionary (book icon before Settings)
    const dictBtn = document.getElementById('dictionaryBtn');
    if(dictBtn){
      dictBtn.onclick = ()=>{
        try{ UI.bindDictionaryModal && UI.bindDictionaryModal(user); }catch(e){ console.error(e); }
        UI.openModal('dictionaryModal');
      };
    }

    // Settings hub (gear icon before Logout)
    const settingsBtn = document.getElementById('settingsBtn');
    if(settingsBtn){
      settingsBtn.onclick = ()=>{
        UI.openModal('settingsModal');
      };
    }
    const openSoundBtn = document.getElementById('openSoundBtn');
    if(openSoundBtn){
      openSoundBtn.onclick = ()=>{
        UI.closeModal('settingsModal');
        try{ UI.bindSoundSettingsModal && UI.bindSoundSettingsModal(user); }catch(e){}
        UI.openModal('soundSettingsModal');
      };
    }
    const openProfileBtn = document.getElementById('openProfileBtn');
    if(openProfileBtn){
      openProfileBtn.onclick = ()=>{
        UI.closeModal('settingsModal');
        openProfileModal(Auth.getUser()||user);
      };
    }

    // Theme settings
    const openThemeBtn = document.getElementById('openThemeBtn');
    if(openThemeBtn){
      openThemeBtn.onclick = ()=>{
        UI.closeModal('settingsModal');
        renderThemeGrid();
        UI.openModal('themeModal');
      };
    }

    const openCursorBtn = document.getElementById('openCursorBtn');
    if(openCursorBtn){
      openCursorBtn.onclick = ()=>{
        UI.closeModal('settingsModal');
        const sel = document.getElementById('cursorModeSelect');
        if(sel) sel.value = (localStorage.getItem('mums_cursor_mode')||'custom');
        UI.openModal('cursorSettingsModal');
      };
    }

    const openSidebarBtn = document.getElementById('openSidebarBtn');
    if(openSidebarBtn){
      openSidebarBtn.onclick = ()=>{
        UI.closeModal('settingsModal');
        const sel = document.getElementById('sidebarDefaultSelect');
        if(sel) sel.value = (localStorage.getItem('mums_sidebar_default')||'expanded');
        UI.openModal('sidebarSettingsModal');
      };
    }

    const openDataToolsBtn = document.getElementById('openDataToolsBtn');
    if(openDataToolsBtn){
      openDataToolsBtn.onclick = ()=>{
        UI.closeModal('settingsModal');
        openDataToolsModal();
      };
    }

    const openLinksBtn = document.getElementById('openLinksBtn');
    if(openLinksBtn){
      openLinksBtn.onclick = ()=>{
        UI.closeModal('settingsModal');
        renderLinksGrid();
        UI.openModal('linksModal');
      };
    }


    // Mailbox time override (Super Admin control; Global override is visible to all roles when active)
    // ===== CODE UNTOUCHABLES =====
    // If override scope is GLOBAL and enabled, non-Super Admin roles MUST be able to VIEW (read-only).
    // Editing controls (adjust/save/reset) MUST remain SUPER_ADMIN-only.
    // Exception: Only change if required by documented UX/security requirements.
    // ==============================
    try{
      const card = document.getElementById('timeOverrideCard');
      const openMailboxTimeBtn = document.getElementById('openMailboxTimeBtn');
      const modal = document.getElementById('mailboxTimeModal');

      const isGlobalOverrideActive = () => {
        try{
          const o = (window.Store && Store.getMailboxTimeOverride) ? Store.getMailboxTimeOverride() : null;
          return !!(o && o.enabled && o.ms && String(o.scope||'') === 'global');
        }catch(_){ return false; }
      };

      const refreshOverrideCard = () => {
        try{
          const active = isGlobalOverrideActive();
          const canView = isSA || active;
          if(card) card.style.display = canView ? '' : 'none';
          if(openMailboxTimeBtn) openMailboxTimeBtn.disabled = (!isSA && !active);
        }catch(_){ }
      };

      refreshOverrideCard();
      try{
        if(!window.__mumsMailboxOverrideCardListener){
          window.__mumsMailboxOverrideCardListener = true;
          window.addEventListener('mums:store', (ev)=>{
            try{
              const k = ev && ev.detail && ev.detail.key;
              if(k === 'mailbox_override_cloud' || k === 'mailbox_time_override_cloud' || k === '*') refreshOverrideCard();
            }catch(_){ }
          });
        }
      }catch(_){ }

      function fmtManilaLocal(ms){
        try{
          const p = UI.manilaParts(new Date(ms));
          const pad = (n)=>String(n).padStart(2,'0');
          return `${p.isoDate}T${pad(p.hh)}:${pad(p.mm)}`;
        }catch(_){ return ''; }
      }

      function parseManilaLocal(str){
        const s = String(str||'').trim();
        if(!s) return 0;
        const parts = s.split('T');
        if(parts.length < 2) return 0;
        const d = parts[0];
        const t = parts[1];
        const dp = d.split('-').map(n=>Number(n));
        const tp = t.split(':').map(n=>Number(n));
        if(dp.length < 3 || tp.length < 2) return 0;
        const y = dp[0], m = dp[1], da = dp[2];
        const hh = tp[0], mm = tp[1];
        if(!y || !m || !da && da !== 0) return 0;
        if([y,m,da,hh,mm].some(x=>Number.isNaN(x))) return 0;
        // Manila is UTC+8 year-round
        return Date.UTC(y, m-1, da, hh-8, mm, 0, 0);
      }

      function bindMailboxTimeModal(){
        if(!modal || modal.__bound) return;
        modal.__bound = true;

        const enabledEl = document.getElementById('mbTimeEnabled');
        const freezeEl = document.getElementById('mbTimeFreeze');
        const inputEl = document.getElementById('mbTimeInput');
        const scopeEl = document.getElementById('mbTimeScope');
        const sysEl = document.getElementById('mbTimeSys');
        const effEl = document.getElementById('mbTimeEffective');
        const errEl = document.getElementById('mbTimeErr');
        const clockEl = document.getElementById('mbTimeClock');
        const clockDateEl = document.getElementById('mbTimeClockDate');
        const saveBtn = document.getElementById('mbTimeSave');
        const resetBtn = document.getElementById('mbTimeReset');
        const setNowBtn = document.getElementById('mbTimeSetNow');

        const canEdit = !!isSA;
        const readOnly = !canEdit;
        // Read-only view for non-Super Admin when global override is active.
        try{
          if(readOnly){
            [enabledEl, freezeEl, inputEl, scopeEl].forEach(el=>{ try{ if(el) el.disabled = true; }catch(_){ } });
            try{ if(setNowBtn) setNowBtn.disabled = true; }catch(_){ }
            try{ modal.querySelectorAll('[data-mbshift]').forEach(b=>{ try{ b.disabled = true; }catch(_){ } }); }catch(_){ }
            try{ if(saveBtn) { saveBtn.disabled = true; saveBtn.style.display = 'none'; } }catch(_){ }
            try{ if(resetBtn){ resetBtn.disabled = true; resetBtn.style.display = 'none'; } }catch(_){ }
          }
        }catch(_){ }


        // Draft state while modal is open
        let draft = Store.getMailboxTimeOverride ? Store.getMailboxTimeOverride() : { enabled:false, ms:0, freeze:true, setAt:0, scope:'sa_only' };
        draft = {
          enabled: !!draft.enabled,
          ms: Number(draft.ms)||0,
          freeze: (draft.freeze !== false),
          setAt: Number(draft.setAt)||0,
          scope: (String(draft.scope||'sa_only') === 'global') ? 'global' : 'sa_only',
        };
        if(!draft.ms) draft.ms = Date.now();
        if(!draft.freeze && !draft.setAt) draft.setAt = Date.now();

        function effectiveMs(){
          if(!draft.enabled) return Date.now();
          if(!draft.ms) return Date.now();
          if(draft.freeze) return draft.ms;
          return draft.ms + Math.max(0, Date.now() - (Number(draft.setAt)||Date.now()));
        }

        function render(){
          try{ if(errEl) errEl.textContent=''; }catch(_){ }
          const sys = UI.manilaNow();
          if(sysEl){
            sysEl.textContent = `System Manila time: ${sys.iso.replace('T',' ')}`;
          }
          if(enabledEl) enabledEl.checked = !!draft.enabled;
          if(freezeEl) freezeEl.checked = !!draft.freeze;
          if(inputEl) inputEl.value = fmtManilaLocal(draft.ms);
          if(scopeEl) scopeEl.value = (String(draft.scope||'sa_only') === 'global') ? 'global' : 'sa_only';

          const on = !!draft.enabled;
          if(effEl){
            if(!on) {
              effEl.textContent = 'Override OFF — Mailbox uses system Manila time.';
            } else {
              const scopeLbl = (String(draft.scope||'sa_only') === 'global') ? 'GLOBAL' : 'Super Admin-only';
              const modeLbl = draft.freeze ? 'Frozen clock' : 'Running clock';
              if(readOnly && scopeLbl === 'GLOBAL') effEl.textContent = `${scopeLbl} override active — ${modeLbl} (read-only view).`;
              else effEl.textContent = `${scopeLbl} override active — ${modeLbl}.`;
            }
          }

          const ms = effectiveMs();
          const p = UI.manilaParts(new Date(ms));
          const pad = (n)=>String(n).padStart(2,'0');
          if(clockEl) clockEl.textContent = `${pad(p.hh)}:${pad(p.mm)}:${pad(p.ss)}`;
          if(clockDateEl) clockDateEl.textContent = `${p.isoDate} (Asia/Manila)`;
        }

        function startClock(){
          try{ if(modal.__clockInt) clearInterval(modal.__clockInt); }catch(_){ }
          modal.__clockInt = setInterval(()=>{ try{ render(); }catch(e){ } }, 1000);
        }

        function stopClock(){
          try{ if(modal.__clockInt) clearInterval(modal.__clockInt); }catch(_){ }
          modal.__clockInt = null;
        }

        function open(){
          // Refresh draft from store each open
          let o = Store.getMailboxTimeOverride ? Store.getMailboxTimeOverride() : { enabled:false, ms:0, freeze:true, setAt:0, scope:'sa_only' };
          draft = {
            enabled: !!o.enabled,
            ms: Number(o.ms)||0,
            freeze: (o.freeze !== false),
            setAt: Number(o.setAt)||0,
            scope: (String(o.scope||'sa_only') === 'global') ? 'global' : 'sa_only',
          };
          if(!draft.ms) draft.ms = Date.now();
          if(!draft.freeze && !draft.setAt) draft.setAt = Date.now();
          render();
          startClock();
        }

        // Expose to opener
        modal.__open = open;

        // Event bindings
        if(enabledEl){
          enabledEl.onchange = ()=>{
            draft.enabled = !!enabledEl.checked;
            if(draft.enabled && !draft.ms) draft.ms = Date.now();
            if(draft.enabled && !draft.freeze) draft.setAt = Date.now();
            render();
          };
        }
        if(freezeEl){
          freezeEl.onchange = ()=>{
            draft.freeze = !!freezeEl.checked;
            if(!draft.freeze) draft.setAt = Date.now();
            else draft.setAt = 0;
            render();
          };
        }
        if(inputEl){
          inputEl.onchange = ()=>{
            const ms = parseManilaLocal(inputEl.value);
            if(ms){
              draft.ms = ms;
              if(draft.enabled && !draft.freeze) draft.setAt = Date.now();
            }
            render();
          };
        }

        if(scopeEl){
          scopeEl.onchange = ()=>{
            const v = String(scopeEl.value||'sa_only');
            draft.scope = (v === 'global') ? 'global' : 'sa_only';
            render();
          };
        }

        if(setNowBtn){
          setNowBtn.onclick = ()=>{
            draft.ms = Date.now();
            if(draft.enabled && !draft.freeze) draft.setAt = Date.now();
            render();
          };
        }

        // Quick shift buttons
        modal.querySelectorAll('[data-mbshift]').forEach(btn=>{
          btn.onclick = ()=>{
            const delta = Number(btn.getAttribute('data-mbshift')||0);
            draft.ms = Number(draft.ms)||Date.now();
            draft.ms += delta;
            if(draft.enabled && !draft.freeze) draft.setAt = Date.now();
            render();
          };
        });

        if(saveBtn){
          saveBtn.onclick = ()=>{
            try{ if(errEl) errEl.textContent=''; }catch(_){ }
            if(!draft.enabled){
              if(Store.disableMailboxTimeOverride) Store.disableMailboxTimeOverride({ propagateGlobal:true });
              else Store.saveMailboxTimeOverride({ enabled:false, ms:0, freeze:true, setAt:0, scope:'sa_only' });
              render();
              return;
            }
            if(!draft.ms){
              if(errEl) errEl.textContent = 'Please select a valid Manila date & time.';
              return;
            }
            const payload = { enabled:true, ms: Number(draft.ms)||0, freeze: !!draft.freeze, scope: (draft.scope==='global'?'global':'sa_only') };
            if(!draft.freeze) payload.setAt = Number(draft.setAt)||Date.now();
            Store.saveMailboxTimeOverride(payload);
            render();
          };
        }

        if(resetBtn){
          resetBtn.onclick = ()=>{
            if(Store.disableMailboxTimeOverride) Store.disableMailboxTimeOverride({ propagateGlobal:true });
            else Store.saveMailboxTimeOverride({ enabled:false, ms:0, freeze:true, setAt:0, scope:'sa_only' });
            draft = Store.getMailboxTimeOverride();
            if(!draft.ms) draft.ms = Date.now();
            render();
          };
        }

        // Close handling should stop the interval
        UI.els('[data-close="mailboxTimeModal"]').forEach(b=>b.onclick=()=>{ stopClock(); UI.closeModal('mailboxTimeModal'); });

      }

      if(openMailboxTimeBtn){
        bindMailboxTimeModal();
        openMailboxTimeBtn.onclick = ()=>{
          const active = isGlobalOverrideActive();
          if(!isSA && !active){
            try{ UI.toast && UI.toast('Global mailbox override is not active.', 'warn'); }catch(_){ }
            return;
          }
          UI.closeModal('settingsModal');
          try{ if(modal && typeof modal.__open === 'function') modal.__open(); }catch(_){ }
          UI.openModal('mailboxTimeModal');
        };
      }

    }catch(e){ console.error('Mailbox time override init error', e); }


    // World clocks settings
    const openClocksBtn = document.getElementById('openClocksBtn');
    if(openClocksBtn){
      openClocksBtn.onclick = ()=>{
        UI.closeModal('settingsModal');
        renderClocksGrid();
        UI.openModal('clocksModal');
        try{ renderClocksPreviewStrip(); }catch(e){}
        try{ ensureGmtOverviewUI(); renderGmtOverview(); startGmtOverviewTicker(); }catch(e){}
      };
    }

	    // GMT Overview (standalone page)
	    const openGmtOverviewPageBtn = document.getElementById('openGmtOverviewPageBtn');
	    if(openGmtOverviewPageBtn){
	      openGmtOverviewPageBtn.onclick = ()=>{
	        UI.closeModal('settingsModal');
	        window.location.hash = '#gmt_overview';
	      };
	    }

    // System Check (Super Admin / Super User)
    try{
      const sysCard = document.getElementById('systemCheckCard');
      const openSysBtn = document.getElementById('openSystemCheckBtn');
      if(sysCard && (isSA || isSU)) sysCard.style.display = '';
      if(openSysBtn && (isSA || isSU)){
        bindSystemCheckModal(user);
        openSysBtn.onclick = ()=>{
          UI.closeModal('settingsModal');
          UI.openModal('systemCheckModal');
          try{ if(window.__mumsSystemCheck && typeof window.__mumsSystemCheck.reset === 'function') window.__mumsSystemCheck.reset(); }catch(_){ }
        };
      }
    }catch(_){ }
    // Ensure close handlers exist
    UI.els('[data-close="settingsModal"]').forEach(b=>b.onclick=()=>UI.closeModal('settingsModal'));
    UI.els('[data-close="systemCheckModal"]').forEach(b=>b.onclick=()=>UI.closeModal('systemCheckModal'));
    UI.els('[data-close="soundSettingsModal"]').forEach(b=>b.onclick=()=>UI.closeModal('soundSettingsModal'));
    UI.els('[data-close="dictionaryModal"]').forEach(b=>b.onclick=()=>UI.closeModal('dictionaryModal'));
    UI.els('[data-close="profileModal"]').forEach(b=>b.onclick=()=>UI.closeModal('profileModal'));
    UI.els('[data-close="themeModal"]').forEach(b=>b.onclick=()=>UI.closeModal('themeModal'));
    UI.els('[data-close="linksModal"]').forEach(b=>b.onclick=()=>UI.closeModal('linksModal'));
    UI.els('[data-close="dataHealthModal"]').forEach(b=>b.onclick=()=>UI.closeModal('dataHealthModal'));
    // World clocks: close should also flush any pending edits so users don't need to refresh.
    UI.els('[data-close="clocksModal"]').forEach(b=>b.onclick=()=>{
      try{
        const grid = document.getElementById('clocksGrid');
        if(grid && typeof grid.__commitClocks === 'function') grid.__commitClocks();
      }catch(_){ }
      UI.closeModal('clocksModal');
      try{ refreshWorldClocksNow(); }catch(_){ }
    });
    UI.els('[data-close="guideImgModal"]').forEach(b=>b.onclick=()=>UI.closeModal('guideImgModal'));

    // Save clocks
    const clocksSave = document.getElementById('clocksSave');
    if(clocksSave){
      clocksSave.onclick = ()=>{
        const grid = document.getElementById('clocksGrid');
        if(!grid) return;
        const next = Store.getWorldClocks();
        grid.querySelectorAll('.clock-card').forEach(card=>{
          const i = Number(card.dataset.idx||0);
          if(!next[i]) next[i] = {};
          const q = (sel)=>card.querySelector(sel);
          const alarmOn = !!q('.clk-alarmEnabled')?.checked;
          const alarmInput = q('.clk-alarm');
          next[i] = {
            enabled: !!q('.clk-enabled')?.checked,
            label: String(q('.clk-label')?.value||'').trim(),
            timeZone: parseClockZoneValue(String(q('.clk-tz')?.value||'Asia/Manila')).timeZone,
              offsetMinutes: parseClockZoneValue(String(q('.clk-tz')?.value||'Asia/Manila')).offsetMinutes,
            hoursColor: String(q('.clk-hc')?.value||'#EAF3FF'),
            minutesColor: String(q('.clk-mc')?.value||'#9BD1FF'),
            style: String(q('.clk-style')?.value||'classic'),
            alarmEnabled: alarmOn,
            alarmTime: alarmOn ? String(alarmInput?.value||'').trim() : '',
          };
        });
        try{ if(Store && Store.dispatch) Store.dispatch('UPDATE_CLOCKS', next); else Store.saveWorldClocks(next); }catch(_){ try{ Store.saveWorldClocks(next); }catch(__){} }
        refreshWorldClocksNow();
        UI.closeModal('clocksModal');
      };
    }


    // Render critical UI FIRST (nav + first page). Optional features are initialized later.
    try{ renderNav(user); }catch(e){ showFatalError(e); return; }
    try{ renderUserCard(user); }catch(e){ /* don't block app */ console.error(e); }
    try{ renderSideLogs(user); }catch(e){ /* don't block app */ console.error(e); }
    try{ renderRightNow(); }catch(e){ /* don't block app */ console.error(e); }

    // Ensure routing runs even if optional widgets fail.
    window.addEventListener('hashchange', route);
    window.addEventListener('popstate', route);

    // Initial route normalization:
    // - file:// mode: enforce hash routing
    // - web mode: allow clean URL routes like /dashboard (fallback to dashboard if unknown)
    try{
      const proto = String(window.location.protocol||'');
      const pages = window.Pages || {};
      const hasHash = !!(window.location.hash && window.location.hash.length > 1);
      const seg = String(window.location.pathname||'/').split('/').filter(Boolean)[0] || '';
      const hasPathPage = !!(proto !== 'file:' && seg && !seg.includes('.') && pages[seg]);

      if(proto === 'file:'){
        if(!hasHash) window.location.hash = '#dashboard';
      }else{
        if(!hasHash && !hasPathPage){
          const p = String(window.location.pathname||'/');
          if(p === '/' || p.endsWith('.html')){
            try{ history.replaceState({},'', '/dashboard'); }catch(_){ }
          }
        }
      }
    }catch(_){ }

    try{ route(); }catch(e){ showFatalError(e); return; }

    // Start reminders engine (floating notifications + beep)
    try{ if(window.ReminderEngine) ReminderEngine.start(); }catch(e){ console.error(e); }

    // Optional UI (quick links, announcements, notifications, guide) — never block routing.
    try{ renderQuickLinksBar(); renderWorldClocksBar(); renderOnlineUsersBar(); }catch(e){ console.error(e); }

    // Best-effort online presence heartbeat (offline-first).
    try{ if(window.Store && Store.startPresence) Store.startPresence(user); }catch(e){ console.error(e); }
    try{ if(window.Store && Store.startMailboxOverrideSync) Store.startMailboxOverrideSync(); }catch(e){ console.error(e); }

    // Keep the Online Users bar fresh (TTL-driven)
    try{
      if(!window.__mumsOnlineBarTimer){
        window.__mumsOnlineBarTimer = setInterval(()=>{ try{ renderOnlineUsersBar(); }catch(_){ } }, 10000);
      }
    }catch(_){ }

    // Centralized UI refresh triggers (no manual refresh needed)
    window.Renderers = window.Renderers || {};
    // World clocks
    window.Renderers.renderClocks = ()=>{ try{ renderWorldClocksBar(); }catch(_){ } try{ renderClocksPreviewStrip(); }catch(_){ } };
    // Sidebar activity logs
    window.Renderers.renderSidebarLogs = ()=>{
      try{
        const u = (window.Auth && Auth.getUser) ? Auth.getUser() : user;
        if(window.Components && Components.SidebarLogs) Components.SidebarLogs.render(u);
        else renderSideLogs(u);
      }catch(_){ }
    };
    // Coverage meter (only re-renders if component exists)
    window.Renderers.renderCoverageMeter = ()=>{ try{ if(window.Components && Components.CoverageMeter) Components.CoverageMeter.refresh(); }catch(_){ } };

    // Subscribe to reducer-style store updates so Settings changes always repaint UI instantly.
    try{
      if(Store && Store.subscribe && !window.__mumsStoreSub){
        window.__mumsStoreSub = Store.subscribe((action)=>{
          const a = String(action||'');
          if(a === 'UPDATE_THEME' || a === 'UPDATE_CLOCKS' || a === 'UPDATE_QUICKLINKS'){
            try{ window.Renderers.renderClocks && window.Renderers.renderClocks(); }catch(_){ }
            try{ window.Renderers.renderCoverageMeter && window.Renderers.renderCoverageMeter(); }catch(_){ }
            try{ window.Renderers.renderSidebarLogs && window.Renderers.renderSidebarLogs(); }catch(_){ }
          }
        });
      }
    }catch(e){ console.error(e); }
    try{
      if(!window.__mumsClockTimer){
    window.__mumsClockTick = 0;
    window.__mumsClockTimer = setInterval(()=>{
      try{ updateWorldClocksTimes(); }catch(_){}
      try{ updateClocksPreviewTimes(); }catch(_){}
      try{
        window.__mumsClockTick = (window.__mumsClockTick||0) + 1;
        // alarms don't need 1s precision; check every 5 seconds
        if(window.__mumsClockTick % 5 === 0){
          checkWorldClockAlarms();
        }
      }catch(_){}
    }, 1000);
  }
}catch(e){ console.error(e); }
    // (Removed duplicate interval) __mumsClockTimer already refreshes clocks + alarms.
    try{ startAnnouncementRotation(); }catch(e){ console.error(e); }

    // Keep theme and quick links in sync within the same tab
    window.addEventListener('mums:theme', (e)=>{
      try{ applyTheme((e && e.detail && e.detail.id) || Store.getTheme()); }catch(_){}
    });

    // Robust nav click delegation (prevents "menu not clickable" issues caused by
    // unexpected overlays / replaced DOM nodes).
    // Supports clean URLs (/dashboard) while preserving hash routing (file:// and legacy links).
    try{
      if(!window.__mumsNavDelegated){
        window.__mumsNavDelegated = true;
        document.addEventListener('click', (e)=>{
          const a = e.target && e.target.closest ? e.target.closest('a.nav-item') : null;
          if(!a) return;
          const href = String(a.getAttribute('href')||'');
          if(!(href.startsWith('/') || href.startsWith('#'))) return;

          // Respect modified clicks (open in new tab, etc.)
          if(e.defaultPrevented) return;
          if(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          if(typeof e.button === 'number' && e.button !== 0) return;

          const pageId = _routePageIdFromHref(href);
          if(!pageId) return;

          e.preventDefault();
          if(href.startsWith('#') || String(window.location.protocol||'') === 'file:'){
            window.location.hash = '#' + pageId;
          }else{
            navigateToPageId(pageId);
          }
          // Mobile: close any open drawers after explicit navigation.
          try{ if(_isMobileViewport()) closeMobileDrawers(); }catch(_){ }
        });
      }
    }catch(_){ }
window.addEventListener('mums:store', (e)=>{
      const key = e && e.detail && e.detail.key;
      if(key === 'mums_quicklinks' || key === 'mums_worldclocks'){
        try{ renderQuickLinksBar(); }catch(_){ }
        try{ refreshWorldClocksNow(); }catch(_){ }
      }
      if(key === 'mums_worldclocks'){
        try{ refreshWorldClocksNow(); }catch(_){ }
      }

      // Online users bar (presence + avatars + attendance color)
      if(key === 'mums_online_users' || key === 'mums_attendance' || key === 'ums_user_profiles' || key === 'ums_users'){
        try{ renderOnlineUsersBar(); }catch(_){ }
      }

      // Auto-refresh triggers (covers non-dispatch Store writes too)
      if(key === 'ums_activity_logs'){
        try{ window.Renderers && Renderers.renderSidebarLogs && Renderers.renderSidebarLogs(); }catch(_){ }
      }
      if(key === 'ums_auto_schedule_settings' || key === 'ums_member_leaves' || key === 'ums_schedule_locks'){
        try{ window.Renderers && Renderers.renderCoverageMeter && Renderers.renderCoverageMeter(); }catch(_){ }
      }
    });

    // Right sidebar tabs
    (function bindRightTabs(){
      const tabs = UI.els('.rtab');
      if(!tabs.length) return;
      const panels = {
        summary: UI.el('#rtab-summary'),
        cases: UI.el('#rtab-cases'),
        mylink: UI.el('#rtab-mylink')
      };
      function activate(key){
        tabs.forEach(t=>{
          const on = t.dataset.rtab===key;
          t.classList.toggle('active', on);
          t.setAttribute('aria-selected', on? 'true':'false');
        });
        Object.entries(panels).forEach(([k,p])=>{
          if(!p) return;
          p.classList.toggle('active', k===key);
        });
      }
      tabs.forEach(t=>t.onclick = ()=>activate(t.dataset.rtab));
      // default
      activate(tabs.find(t=>t.classList.contains('active'))?.dataset.rtab || 'summary');
    })();

    // Summary Guide UI (enable/disable + tabs + search + ask)
    (function bindGuideUI(){
      const toggle = UI.el('#guideEnabledToggle');
      if(toggle){
        toggle.checked = localStorage.getItem('mums_guide_enabled') !== '0';
        toggle.onchange = ()=>{
          localStorage.setItem('mums_guide_enabled', toggle.checked ? '1' : '0');
          try{ route(); }catch(e){
            // fallback: rerender current guide
            const pageId = resolveRoutePageId();
            renderSummaryGuide(pageId, window._currentPageLabel);
          }
        };
      }

      // Tabs inside Summary
      UI.els('.gtab').forEach(b=>{
        b.onclick = ()=>{
          const k = b.dataset.gtab || 'guide';
          localStorage.setItem('mums_guide_tab', k);
          const pageId = resolveRoutePageId();
          renderSummaryGuide(pageId, window._currentPageLabel);
        };
      });

      // Search (debounced)
      const search = UI.el('#guideSearch');
      let t=null;
      if(search){
        search.oninput = ()=>{
          if(t) clearTimeout(t);
          t=setTimeout(()=>{
            const pageId = resolveRoutePageId();
            renderSummaryGuide(pageId, window._currentPageLabel);
          }, 120);
        };
      }

      // Ask a question
      const ask = UI.el('#guideAsk');
      const askBtn = UI.el('#guideAskBtn');
      function submitAsk(){
        const text = (ask && ask.value) ? String(ask.value).trim() : '';
        if(!text) return;
        const pageId = resolveRoutePageId();

        // Offline AI-like answer (no internet): search across all guides,
        // but strongly prioritize the current page.
        let ans = null;
        try{ ans = answerGuideQuestion(text, pageId); }catch(e){ ans = {best:null, related:[], note:'No answer.'}; }
        try{
          localStorage.setItem('mums_ai_last_'+pageId, JSON.stringify({ q:text, ans:ans, ts:Date.now() }));
        }catch(e){}

        // Save question history per page
        const qKey = `mums_guide_questions_${pageId}`;
        let arr=[];
        try{ arr = JSON.parse(localStorage.getItem(qKey) || '[]') || []; }catch(e){ arr=[]; }
        arr.push(text);
        localStorage.setItem(qKey, JSON.stringify(arr.slice(-50)));

        localStorage.setItem('mums_guide_tab','guide');
        if(ask) ask.value='';
        renderSummaryGuide(pageId, window._currentPageLabel);
      }
      if(askBtn) askBtn.onclick = submitAsk;
      if(ask){
        ask.addEventListener('keydown', (e)=>{
          if(e.key==='Enter'){ e.preventDefault(); submitAsk(); }
        });
      }

      // Open full manual modal (Guide + Notes + Legends + Manual)
      const fullBtn = UI.el('#guideOpenFullManual');
      if(fullBtn){
        fullBtn.onclick = ()=>{
          const pageId = resolveRoutePageId();
          try{
            openFullManualForPage(pageId, window._currentPageLabel);
          }catch(err){
            try{ console.error(err); }catch(_){ }
            try{ UI.toast('Full manual failed to open. Please reload and try again.', 'error'); }catch(_){ alert('Full manual failed to open.'); }
          }
        };
      }

      // Robust fallback: if the Summary header is ever re-rendered or the button
      // gets replaced, ensure the click still works (prevents "button not working").
      if(!window.__mumsFullManualDelegated){
        window.__mumsFullManualDelegated = true;
        document.addEventListener('click', (e)=>{
          const btn = e.target && e.target.closest ? e.target.closest('#guideOpenFullManual') : null;
          if(!btn) return;
          try{
            const pageId = resolveRoutePageId();
            try{
              openFullManualForPage(pageId, window._currentPageLabel);
            }catch(err){
              try{ console.error(err); }catch(_){ }
              try{ UI.toast('Full manual failed to open. Please reload and try again.', 'error'); }catch(_){ alert('Full manual failed to open.'); }
            }
          }catch(err){ try{ console.error(err); }catch(_){} }
        });
      }
    })();

    // Real-time schedule update popups (members + leads)
    try{ if(notifCleanup) notifCleanup(); }catch(e){}
    try{ notifCleanup = UI.startScheduleNotifListener(user); }catch(e){ console.error(e); }

    UI.els('[data-close="topAnnModal"]').forEach(b=>b.onclick=()=>UI.closeModal('topAnnModal'));

    // Removed live right-sidebar clock (no date/time requested).
    setInterval(()=>{ try{ renderSideLogs(Auth.getUser()||user); }catch(e){} }, 5000);
    // Keep "Duty" fresh as schedules/time change (Manila time).
    setInterval(()=>{ try{ renderUserCard(Auth.getUser()||user); }catch(e){} }, 60000);

    // React immediately to in-app Store writes (weekly schedules / leaves / profile changes)
    window.addEventListener('mums:store', ()=>{
      try{ renderUserCard(Auth.getUser()||user); }catch(e){}
    });

    // hashchange handler already bound above.
  }

  window.App = { boot };
  // Auto-boot safety: some hosting setups or cached bundles may skip the inline boot call.
  // This ensures the app initializes once the DOM is ready.
  (function(){
    let started = false;
    function start(){
      if(started) return;
      started = true;
      try{ window.App && window.App.boot && window.App.boot(); }catch(e){ try{ console.error(e); }catch(_){} }
    }
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', start);
    }else{
      setTimeout(start, 0);
    }
  })();
})();
  // Sidebar (enterprise)
  function applySidebarState(opts){
    const side = document.querySelector('aside.side');
    if(!side) return;
    const isMobile = (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) || (window.innerWidth<=768);
    if(isMobile){
      // Preserve desktop sidebar prefs, but ensure the drawer shows the full sidebar on mobile.
      try{
        document.body.classList.remove('sidebar-collapsed');
        document.body.classList.remove('sidebar-hoverable');
        document.body.classList.remove('sidebar-pinned');
      }catch(_){ }
      return;
    }
    const pinned = (localStorage.getItem('mums_sidebar_pinned')||'0')==='1';
    const tempOpen = document.body.classList.contains('sidebar-tempopen');
    let isCollapsed;
    if(opts && typeof opts.forceCollapsed === 'boolean'){
      isCollapsed = opts.forceCollapsed;
    }else{
      const saved = localStorage.getItem('mums_sidebar_collapsed');
      const def = localStorage.getItem('mums_sidebar_default') || 'expanded';
      isCollapsed = saved ? (saved==='1') : (def==='collapsed');
    }
    // Pinned rail forces collapsed
    if(pinned) isCollapsed = true;

    if(!tempOpen){ document.body.classList.toggle('sidebar-collapsed', !!isCollapsed); }
    document.body.classList.toggle('sidebar-pinned', !!pinned);
    localStorage.setItem('mums_sidebar_collapsed', isCollapsed ? '1' : '0');

    // Auto-expand on hover only when collapsed AND not pinned
    const hoverOn = (localStorage.getItem('mums_sidebar_hover') ?? '1')==='1';
    document.body.classList.toggle('sidebar-hoverable', !!isCollapsed && hoverOn && !pinned && !tempOpen);
  }


  function _isMobileViewport(){
    try{
      return (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) || (window.innerWidth<=768);
    }catch(_){
      return (window.innerWidth||0) <= 768;
    }
  }

  function closeMobileDrawers(){
    try{ document.body.classList.remove('mobile-nav-open'); }catch(_){}
    try{ document.body.classList.remove('mobile-panel-open'); }catch(_){}
    try{ document.body.classList.remove('mobile-online-open'); }catch(_){}
    try{ document.body.classList.remove('mobile-quicklinks-open'); }catch(_){}
    try{ document.body.classList.remove('sidebar-tempopen'); }catch(_){}
    try{
      const a = document.getElementById('toggleUserOnlineBar'); if(a) a.setAttribute('aria-expanded','false');
      const b = document.getElementById('toggleQuickLinksBar'); if(b) b.setAttribute('aria-expanded','false');
    }catch(_){}
  }

  function ensureMobileDrawerOverlay(){
    let el = document.getElementById('mobileDrawerOverlay');
    if(el) return el;
    el = document.createElement('div');
    el.id = 'mobileDrawerOverlay';
    el.className = 'mobile-drawer-overlay';
    el.setAttribute('aria-hidden','true');
    document.body.appendChild(el);
    // Clicking the overlay closes any open mobile drawers.
    el.addEventListener('click', ()=>{ try{ closeMobileDrawers(); }catch(_){ } });
    return el;
  }

  function bindMobilePanelToggle(){
    const actions = document.querySelector('.topbar-actions');
    if(!actions) return;

    let btn = document.getElementById('mobilePanelToggle');
    if(!btn){
      btn = document.createElement('button');
      btn.id = 'mobilePanelToggle';
      btn.type = 'button';
      btn.className = 'btn ghost iconbtn';
      btn.title = 'Panel';
      btn.setAttribute('aria-label','Toggle panel');
      btn.innerHTML = '<span class="ico" data-ico="notes" aria-hidden="true"></span>';
      const logout = document.getElementById('logoutBtn');
      if(logout && logout.parentNode === actions) actions.insertBefore(btn, logout);
      else actions.appendChild(btn);
    }

    ensureMobileDrawerOverlay();

    btn.addEventListener('click', (e)=>{
      if(!_isMobileViewport()) return;
      try{ e.preventDefault(); e.stopPropagation(); }catch(_){}
      // Toggle right panel drawer; keep nav closed.
      document.body.classList.toggle('mobile-panel-open');
      document.body.classList.remove('mobile-nav-open');
      document.body.classList.remove('mobile-online-open');
      document.body.classList.remove('mobile-quicklinks-open');
    });

    // Escape closes drawers
    if(!window.__mumsMobileEscBound){
      window.__mumsMobileEscBound = true;
      window.addEventListener('keydown', (e)=>{
        try{ if(e.key === 'Escape') closeMobileDrawers(); }catch(_){}
      }, true);
    }

    // Breakpoint changes: close drawers and re-apply sidebar desktop prefs.
    if(window.matchMedia && !window.__mumsMobileMQBound){
      window.__mumsMobileMQBound = true;
      try{
        const mq = window.matchMedia('(max-width: 768px)');
        const onChange = ()=>{ try{ closeMobileDrawers(); applySidebarState(); }catch(_){ } };
        if(mq.addEventListener) mq.addEventListener('change', onChange);
        else if(mq.addListener) mq.addListener(onChange);
      }catch(_){}
    }
  }


  function bindMobileBottomSheets(){
    const actions = document.querySelector('.topbar-actions');
    if(!actions) return;

    // Ensure overlay exists and closes drawers/sheets.
    try{ ensureMobileDrawerOverlay(); }catch(_){}

    // Create/ensure toggle buttons (mobile only; CSS hides on desktop)
    let qBtn = document.getElementById('toggleQuickLinksBar');
    if(!qBtn){
      qBtn = document.createElement('button');
      qBtn.id = 'toggleQuickLinksBar';
      qBtn.type = 'button';
      qBtn.className = 'btn ghost iconbtn';
      qBtn.title = 'Quick Links';
      qBtn.setAttribute('aria-label','Toggle Quick Links');
      qBtn.setAttribute('aria-controls','quickLinksBar');
      qBtn.setAttribute('aria-expanded','false');
      qBtn.innerHTML = '<span class="ico" data-ico="link" aria-hidden="true"></span>';
      const panelBtn = document.getElementById('mobilePanelToggle');
      const logout = document.getElementById('logoutBtn');
      if(panelBtn && panelBtn.parentNode === actions) actions.insertBefore(qBtn, panelBtn);
      else if(logout && logout.parentNode === actions) actions.insertBefore(qBtn, logout);
      else actions.appendChild(qBtn);
    }

    let oBtn = document.getElementById('toggleUserOnlineBar');
    if(!oBtn){
      oBtn = document.createElement('button');
      oBtn.id = 'toggleUserOnlineBar';
      oBtn.type = 'button';
      oBtn.className = 'btn ghost iconbtn';
      oBtn.title = 'User Online';
      oBtn.setAttribute('aria-label','Toggle User Online');
      oBtn.setAttribute('aria-controls','onlineUsersBar');
      oBtn.setAttribute('aria-expanded','false');
      oBtn.innerHTML = '<span class="ico" data-ico="users" aria-hidden="true"></span>';
      const panelBtn = document.getElementById('mobilePanelToggle');
      const logout = document.getElementById('logoutBtn');
      if(panelBtn && panelBtn.parentNode === actions) actions.insertBefore(oBtn, panelBtn);
      else if(logout && logout.parentNode === actions) actions.insertBefore(oBtn, logout);
      else actions.appendChild(oBtn);
    }

    // Ensure Quick Links sheet header exists (desktop-hidden; mobile-visible)
    const qBar = document.getElementById('quickLinksBar');
    if(qBar && !qBar.querySelector('.mob-sheet-head')){
      const head = document.createElement('div');
      head.className = 'mob-sheet-head';
      head.innerHTML = '<div class="mob-sheet-title">Quick Links</div><div class="mob-sheet-actions"><button class="mob-sheet-close" type="button" aria-label="Close" data-close-quicklinks="1">✕</button></div>';
      qBar.insertBefore(head, qBar.firstChild);
      head.addEventListener('click', (e)=>{
        const btn = e.target && e.target.closest ? e.target.closest('[data-close-quicklinks]') : null;
        if(!btn) return;
        document.body.classList.remove('mobile-quicklinks-open');
        try{ qBtn.setAttribute('aria-expanded','false'); }catch(_){}
      });
    }

    const toggleQuick = (e)=>{
      if(!_isMobileViewport()) return;
      try{ e.preventDefault(); e.stopPropagation(); }catch(_){}
      const open = document.body.classList.contains('mobile-quicklinks-open');
      closeMobileDrawers();
      if(!open){
        document.body.classList.add('mobile-quicklinks-open');
        try{ qBtn.setAttribute('aria-expanded','true'); }catch(_){}
      }
    };

    const toggleOnline = (e)=>{
      if(!_isMobileViewport()) return;
      try{ e.preventDefault(); e.stopPropagation(); }catch(_){}
      const open = document.body.classList.contains('mobile-online-open');
      closeMobileDrawers();
      if(!open){
        document.body.classList.add('mobile-online-open');
        try{ oBtn.setAttribute('aria-expanded','true'); }catch(_){}
      }
    };

    if(!qBtn.__bound){ qBtn.__bound = true; qBtn.addEventListener('click', toggleQuick); }
    if(!oBtn.__bound){ oBtn.__bound = true; oBtn.addEventListener('click', toggleOnline); }

    // When navigating, close sheets to avoid sidebar/content mismatch.
    if(!window.__mumsMobileNavCloseSheetsBound){
      window.__mumsMobileNavCloseSheetsBound = true;
      document.addEventListener('click', (e)=>{
        const a = e.target && e.target.closest ? e.target.closest('a.nav-item') : null;
        if(!a) return;
        try{ closeMobileDrawers(); }catch(_){}
      }, true);
    }
  }

  function bindMobileFabStack(){
    // DOM exists on desktop too, but CSS keeps it hidden.
    if(document.querySelector('.mobile-fab-stack')) return;
    const wrap = document.createElement('div');
    wrap.className = 'mobile-fab-stack';
    wrap.setAttribute('aria-hidden','true');
    wrap.innerHTML = `
      <button class="fab" type="button" aria-label="Menu" data-fab="nav"><span class="ico" data-ico="menu" aria-hidden="true"></span></button>
      <button class="fab" type="button" aria-label="Quick Links" data-fab="quick"><span class="ico" data-ico="link" aria-hidden="true"></span></button>
      <button class="fab" type="button" aria-label="User Online" data-fab="online"><span class="ico" data-ico="users" aria-hidden="true"></span></button>
      <button class="fab" type="button" aria-label="Panel" data-fab="panel"><span class="ico" data-ico="notes" aria-hidden="true"></span></button>
    `;
    document.body.appendChild(wrap);

    const click = (sel)=>{
      const el = document.querySelector(sel);
      if(el && typeof el.click==='function') el.click();
    };

    wrap.addEventListener('click', (e)=>{
      if(!_isMobileViewport()) return;
      const btn = e.target && e.target.closest ? e.target.closest('button.fab') : null;
      if(!btn) return;
      const which = btn.getAttribute('data-fab');
      if(which==='nav') click('#sidebarToggle');
      if(which==='panel') click('#mobilePanelToggle');
      if(which==='quick') click('#toggleQuickLinksBar');
      if(which==='online') click('#toggleUserOnlineBar');
    });
  }

  function bindSidebarToggle(){
    const btn = document.getElementById('sidebarToggle');
    const side = document.querySelector('aside.side');
    if(!btn || !side) return;

    // Ensure the mobile overlay exists (used by both nav + right panel drawers).
    try{ ensureMobileDrawerOverlay(); }catch(_){ }

    const CLICK_DELAY = 240;
    let clickTimer = null;

    const setCollapsed = (collapsed)=>{
      document.body.classList.toggle('sidebar-collapsed', !!collapsed);
      // Hover-expand preference (desktop rail mode)
      const hoverOn = (localStorage.getItem('mums_sidebar_hover') ?? '1') === '1';
      document.body.classList.toggle('sidebar-hoverable', !!collapsed && hoverOn);
      try{ localStorage.setItem('mums_sidebar_collapsed', collapsed ? '1' : '0'); }catch(_){ }
    };

    const setPinned = (pinned)=>{
      document.body.classList.toggle('sidebar-pinned', !!pinned);
      try{ localStorage.setItem('mums_sidebar_pinned', pinned ? '1' : '0'); }catch(_){ }
    };

    const toggleMobileNav = ()=>{
      document.body.classList.toggle('mobile-nav-open');
      document.body.classList.remove('mobile-panel-open');
      document.body.classList.remove('mobile-online-open');
      document.body.classList.remove('mobile-quicklinks-open');
      try{
        const a = document.getElementById('toggleUserOnlineBar'); if(a) a.setAttribute('aria-expanded','false');
        const b = document.getElementById('toggleQuickLinksBar'); if(b) b.setAttribute('aria-expanded','false');
      }catch(_){ }
    };

    const handleSingle = ()=>{
      const pinned = (localStorage.getItem('mums_sidebar_pinned')||'0')==='1';
      const isCollapsed = document.body.classList.contains('sidebar-collapsed');

      if(pinned){
        setPinned(false);
        setCollapsed(false);
        return;
      }

      if(isCollapsed){
        // Temporary open with hover behavior (if enabled)
        const hoverOn = (localStorage.getItem('mums_sidebar_hover') ?? '1') === '1';
        if(hoverOn){
          document.body.classList.add('sidebar-tempopen');
          document.body.classList.remove('sidebar-collapsed');
          const closeTemp = ()=>{
            document.body.classList.remove('sidebar-tempopen');
            document.body.classList.add('sidebar-collapsed');
            side.removeEventListener('mouseleave', closeTemp);
          };
          side.addEventListener('mouseleave', closeTemp);
        }else{
          setCollapsed(false);
        }
      }else{
        setCollapsed(true);
      }
    };

    const handleDouble = ()=>{
      const pinned = (localStorage.getItem('mums_sidebar_pinned')||'0')==='1';
      if(!pinned){
        setPinned(true);
      }else{
        setPinned(false);
        setCollapsed(false);
      }
    };

    btn.addEventListener('click', (e)=>{
      if(_isMobileViewport()){
        try{ e.preventDefault(); e.stopPropagation(); }catch(_){ }
        toggleMobileNav();
        return;
      }
      if(clickTimer) return;
      clickTimer = setTimeout(()=>{
        clickTimer = null;
        handleSingle();
      }, CLICK_DELAY);
    });

    btn.addEventListener('dblclick', (e)=>{
      // Mobile: ignore double-click pin behavior.
      if(_isMobileViewport()){
        try{ e.preventDefault(); }catch(_){ }
        return;
      }
      try{ e.preventDefault(); }catch(_){ }
      if(clickTimer){ clearTimeout(clickTimer); clickTimer=null; }
      handleDouble();
    });

    window.addEventListener('keydown', (e)=>{
      try{
        if((e.ctrlKey || e.metaKey) && (e.key==='b' || e.key==='B')){
          e.preventDefault();
          if(_isMobileViewport()) toggleMobileNav();
          else handleSingle();
        }
      }catch(_){}
    });
  }


  function bindNavKeyboard(){
    const nav = document.getElementById('nav');
    if(!nav) return;
    nav.addEventListener('keydown', (e)=>{
      const key = e.key;
      if(!['ArrowDown','ArrowUp','Home','End'].includes(key)) return;
      const items = Array.from(nav.querySelectorAll('a.nav-item, button.nav-group-head')).filter(el=>!el.disabled && el.offsetParent!==null);
      if(!items.length) return;
      const idx = items.indexOf(document.activeElement);
      let next = idx;
      if(key==='ArrowDown') next = (idx<0?0:Math.min(items.length-1, idx+1));
      if(key==='ArrowUp') next = (idx<0?0:Math.max(0, idx-1));
      if(key==='Home') next = 0;
      if(key==='End') next = items.length-1;
      if(next!==idx){
        e.preventDefault();
        items[next].focus();
      }
    });
  }




  
  // Right sidebar (collapsible, remembers state)
  function applyRightbarState(){
    // Right sidebar is fixed/always visible (no collapse).
    try{ document.body.classList.remove('rightbar-collapsed'); }catch(_){ }
    try{ localStorage.setItem('mums_rightbar_collapsed','0'); }catch(_){ }
  }

  function bindRightbarToggle(){ /* right sidebar fixed (no toggle) */ }

  // Density
  function applyDensity(){
    const d = (localStorage.getItem('mums_density')||'normal');
    document.body.classList.toggle('density-compact', d==='compact');
  }


// Global Search (Ctrl+K). Searches across offline datasets and navigates to relevant pages.
  function bindGlobalSearch(me){
    const open = ()=>{
      UI.openModal('globalSearchModal');
      const inp = document.getElementById('globalSearchModalInput');
      if(inp){ inp.value = (document.getElementById('globalSearchInput')?.value || '').trim(); setTimeout(()=>inp.focus(), 0); }
      runSearch();
    };

    const close = ()=>{ try{ UI.closeModal('globalSearchModal'); }catch(_){} };

    const topInput = document.getElementById('globalSearchInput');
    const btn = document.getElementById('globalSearchBtn');
    const modalInp = document.getElementById('globalSearchModalInput');
    const resHost = document.getElementById('globalSearchResults');
    if(btn) btn.onclick = open;
    if(topInput){
      topInput.addEventListener('keydown', (e)=>{
        if(e.key==='Enter'){ e.preventDefault(); open(); }
      });
    }
    window.addEventListener('keydown', (e)=>{
      try{
        if((e.ctrlKey || e.metaKey) && (e.key==='k' || e.key==='K')){
          e.preventDefault(); open();
        }
        if(e.key==='Escape'){
          const m = document.getElementById('globalSearchModal');
          if(m && m.classList.contains('open')) close();
        }
      }catch(_){}
    });

    let activeIndex = 0;
    let flat = [];
    let t = null;

    const fmtWhen = (v)=>{
      try{
        if(!v) return '—';
        const d = (typeof v==='number') ? new Date(v) : new Date(String(v));
        if(isNaN(d.getTime())) return '—';
        const p = UI.manilaParts ? UI.manilaParts(d) : null;
        if(p) return `${p.isoDate} ${String(p.hh).padStart(2,'0')}:${String(p.mm).padStart(2,'0')}`;
        return d.toLocaleString();
      }catch(_){ return '—'; }
    };

    function score(hay, q){
      hay = String(hay||'').toLowerCase();
      q = String(q||'').toLowerCase();
      if(!q) return 0;
      if(hay===q) return 100;
      if(hay.startsWith(q)) return 70;
      if(hay.includes(q)) return 40;
      return 0;
    }

    function build(query){
      const q = String(query||'').trim().toLowerCase();
      const out = { Users:[], Reminders:[], TeamReminders:[], Announcements:[], Cases:[] };

      // Users
      try{
        const users = Store.getUsers();
        for(const u of users){
          const s = Math.max(
            score(u.username,q),
            score(u.email,q),
            score(u.fullName||u.name,q),
            score(u.role,q),
            score(u.teamId,q)
          );
          if(s>0){
            out.Users.push({
              s, label: u.username,
              meta: `${u.role} • ${Config.teamLabel(u.teamId)}`,
              sub: u.email || '',
              go: '#user_management',
              focus: { type:'user', id:u.id, query:q }
            });
          }
        }
      }catch(_){}

      // My reminders (mine)
      try{
        const list = (Store.getAllMyReminders ? Store.getAllMyReminders() : JSON.parse(localStorage.getItem('mums_my_reminders')||'[]'));
        for(const r of (list||[])){
          if(r.userId && r.userId!==me.id) continue;
          const s = Math.max(score(r.short,q), score(r.details,q));
          if(s>0){
            out.Reminders.push({
              s, label: r.short || 'Reminder',
              meta: `My Reminder • ${fmtWhen(r.alarmAt)}`,
              sub: (r.details||'').slice(0,80),
              go: '#my_reminders',
              focus: { type:'myReminder', id:r.id }
            });
          }
        }
      }catch(_){}

      // Team reminders (my team)
      try{
        const list = (Store.getAllTeamReminders ? Store.getAllTeamReminders() : JSON.parse(localStorage.getItem('mums_team_reminders')||'[]'));
        for(const r of (list||[])){
          if(r.teamId && r.teamId!==me.teamId) continue;
          const s = Math.max(score(r.short,q), score(r.details,q));
          if(s>0){
            out.TeamReminders.push({
              s, label: r.short || 'Team Reminder',
              meta: `Team Reminder • ${Config.teamLabel(r.teamId||me.teamId)} • ${fmtWhen(r.alarmAt)}`,
              sub: (r.details||'').slice(0,80),
              go: '#team_reminders',
              focus: { type:'teamReminder', id:r.id }
            });
          }
        }
      }catch(_){}

      // Announcements
      try{
        const list = Store.getAnnouncements();
        for(const a of (list||[])){
          const s = Math.max(score(a.title,q), score(a.message,q));
          if(s>0){
            out.Announcements.push({
              s, label: a.title || 'Announcement',
              meta: `${Config.teamLabel(a.teamId||'all')} • ${fmtWhen(a.startAt||a.createdAt||a.when)}`,
              sub: (a.message||'').slice(0,100),
              go: '#announcements',
              focus: { type:'announcement', id:a.id }
            });
          }
        }
      }catch(_){}

      // Cases placeholder (if implemented later)
      try{
        const list = Store.getCases ? Store.getCases() : [];
        for(const c of (list||[])){
          const s = Math.max(score(c.title,q), score(c.description,q), score(c.id,q));
          if(s>0){
            out.Cases.push({
              s, label: c.title || c.id || 'Case',
              meta: `${c.status||'—'}`,
              sub: (c.description||'').slice(0,90),
              go: '#cases',
              focus: { type:'case', id:c.id }
            });
          }
        }
      }catch(_){}

      // Sort & cap
      for(const k of Object.keys(out)){
        out[k] = out[k].sort((a,b)=>b.s-a.s).slice(0,8);
      }
      return out;
    }

    function render(groups){
      if(!resHost) return;
      const q = String(modalInp?.value || '').trim();
      if(!q){
        resHost.innerHTML = '<div class="small muted">Start typing to search.</div>';
        flat = []; activeIndex = 0;
        return;
      }
      const keys = Object.keys(groups).filter(k=>groups[k].length);
      if(!keys.length){
        resHost.innerHTML = '<div class="small muted">No results.</div>';
        flat = []; activeIndex = 0;
        return;
      }
      let html = '';
      flat = [];
      for(const k of keys){
        const items = groups[k];
        html += `<div class="gsec"><div class="gsec-title"><span>${k}</span><span class="glabel">${items.length}</span></div><div class="glist">`;
        for(const it of items){
          const idx = flat.length;
          flat.push(it);
          html += `<div class="gitem" data-idx="${idx}" tabindex="0" role="button" aria-label="Open ${k} result">
            <div style="flex:1">
              <div style="font-weight:800">${UI.esc(it.label)}</div>
              <div class="gmeta">${UI.esc(it.meta||'')}</div>
              ${it.sub ? `<div class="small muted" style="margin-top:2px">${UI.esc(it.sub)}</div>` : ''}
            </div>
          </div>`;
        }
        html += `</div></div>`;
      }
      resHost.innerHTML = html;
      setActive(0);

      resHost.querySelectorAll('.gitem').forEach(el=>{
        el.addEventListener('click', ()=>openIdx(Number(el.dataset.idx)));
        el.addEventListener('keydown', (e)=>{ if(e.key==='Enter') openIdx(Number(el.dataset.idx)); });
      });
    }

    function setActive(i){
      activeIndex = Math.max(0, Math.min(flat.length-1, i));
      resHost?.querySelectorAll('.gitem').forEach(el=>el.classList.remove('active'));
      const el = resHost?.querySelector(`.gitem[data-idx="${activeIndex}"]`);
      if(el){ el.classList.add('active'); el.scrollIntoView({ block:'nearest' }); }
    }

    function openIdx(i){
      const it = flat[i];
      if(!it) return;
      try{ localStorage.setItem('mums_global_focus', JSON.stringify(it.focus||{})); }catch(_){}
      close();
      // Navigate
      window.location.hash = it.go || '#dashboard';
      // Nudge the destination page to focus
      setTimeout(()=>{
        try{ window.dispatchEvent(new CustomEvent('mums:globalFocus', { detail: it.focus||{} })); }catch(_){}
      }, 80);
    }

    function runSearch(){
      const q = String(modalInp?.value || '').trim();
      const groups = build(q);
      render(groups);
    }

    if(modalInp){
      modalInp.addEventListener('input', ()=>{
        clearTimeout(t);
        t = setTimeout(runSearch, 120);
      });
      modalInp.addEventListener('keydown', (e)=>{
        if(e.key==='ArrowDown'){ e.preventDefault(); setActive(activeIndex+1); }
        if(e.key==='ArrowUp'){ e.preventDefault(); setActive(activeIndex-1); }
        if(e.key==='Enter'){ e.preventDefault(); openIdx(activeIndex); }
      });
    }
  }
