(window.Pages = window.Pages || {});

window.Pages.members = function(root){
  root.innerHTML = '<div class="small muted">Loading…</div>';
  (async()=>{
  const me = await Auth.requireUser();
  if(!me) return;

  if(!Config.can(me, 'view_members')){
    root.innerHTML = '<div class="h1">Members</div><div class="muted">You do not have access to this page.</div>';
    return;
  }

  const isSuper = me.role === Config.ROLES.SUPER_ADMIN;
  const isAdmin = isSuper || me.role === Config.ROLES.ADMIN;
  const isLead = me.role === Config.ROLES.TEAM_LEAD;

  const GRID_STEP_MIN = 60;
  let unlockTriggered = false;

  function readableError(err, fallback){
    if(err == null) return String(fallback||'');
    if(typeof err === 'string') return err;
    if(err instanceof Error) return String(err.message || fallback || err);
    try{
      if(typeof err === 'object'){
        if(typeof err.message === 'string' && err.message.trim()) return err.message;
        const j = JSON.stringify(err);
        if(j && j !== '{}' ) return j;
      }
    }catch(_e){ /* ignore */ }
    return String(fallback || err);
  }
  function showWarning(msg){
    const m = readableError(msg, 'Notice');
    try{ if(UI && typeof UI.toast === 'function') return UI.toast(m, 'warn'); }catch(_e){}
    try{ alert(m); }catch(_e){}
  }
  function warnScheduleLocked(){
    showWarning('Schedule is locked. Please unlock before making changes.');
  }

  // --- Shared Helpers ---
  function getTeamTaskOptions(teamId){
    const tasks = (window.Store && Store.getTeamTasks) ? (Store.getTeamTasks(teamId) || []) : [];
    const roleIds = (tasks && tasks.length) ? tasks.map(t=>t.id) : ['call_onqueue','back_office','block','lunch','mailbox_manager','mailbox_call'];
    const core = ['mailbox_manager','mailbox_call','call_onqueue','back_office','lunch','block'];
    const seen = new Set();
    const ids = [];
    for(const id of [...roleIds, ...core]){
      const v = String(id||'').trim();
      if(!v || seen.has(v)) continue;
      seen.add(v);
      ids.push(v);
    }
    const out = [];
    for(const id of ids){
      const s = Config.scheduleById(id);
      if(s){
        out.push({ id: s.id, label: s.label || id, icon: s.icon || '', color: s.color || '' });
        continue;
      }
      const t = (tasks||[]).find(x=>String(x.id)===String(id));
      if(t){
        out.push({ id, label: t.label || id, icon: '🧩', color: t.color || '' });
        continue;
      }
      out.push({ id, label: id, icon: '🧩', color: '' });
    }
    out.push({ id: '__clear__', label: 'Clear (empty)', icon: '🧽', color: '' });
    return out;
  }

  function taskMeta(teamId, roleId){
    const rid = String(roleId||'').trim();
    if(!rid) return { id:'', label:'', icon:'', color:'' };
    if(rid === '__clear__') return { id:'__clear__', label:'Clear (empty)', icon:'🧽', color:'' };
    const s = Config.scheduleById(rid);
    if(s) return { id: s.id, label: s.label || rid, icon: s.icon || '', color: s.color || '' };
    const tasks = (window.Store && Store.getTeamTasks) ? (Store.getTeamTasks(teamId) || []) : [];
    const t = (tasks||[]).find(x=>String(x.id)===rid);
    if(t) return { id: rid, label: t.label || rid, icon: '🧩', color: t.color || '' };
    return { id: rid, label: rid, icon: '🧩', color: '' };
  }

  function fallbackColorForLabel(label){
    const l = String(label||'').toLowerCase();
    if(l.includes('mailbox')) return '#4aa3ff';
    if(l.includes('call')) return '#2ecc71';
    if(l.includes('back')) return '#ffa21a';
    if(l.includes('lunch')) return '#22d3ee';
    if(l.includes('break')) return '#22d3ee';
    return '#64748b';
  }

  function legendDotEmoji(color){
    const c = String(color||'').trim().toLowerCase();
    const has = (s)=>c.includes(s);
    if(has('emerald')||has('green')||has('#22c55e')||has('#10b981')||has('#16a34a')||has('#059669')) return '🟢';
    if(has('red')||has('#ef4444')||has('#f43f5e')||has('#dc2626')||has('#b91c1c')) return '🔴';
    if(has('orange')||has('#f59e0b')||has('#f97316')||has('#fb923c')) return '🟠';
    if(has('yellow')||has('#eab308')) return '🟡';
    if(has('blue')||has('#3b82f6')||has('#60a5fa')||has('#4aa3ff')) return '🔵';
    if(has('purple')||has('#a855f7')||has('#7c3aed')) return '🟣';
    const m = /^#?([0-9a-f]{6})$/i.exec(c);
    if(m){
      const hex = m[1];
      const r = parseInt(hex.slice(0,2),16);
      const g = parseInt(hex.slice(2,4),16);
      const b = parseInt(hex.slice(4,6),16);
      const max = Math.max(r,g,b);
      if(max === r) return '🔴';
      if(max === g) return '🟢';
      if(max === b) return '🔵';
    }
    return '⚪';
  }

  function _textColorForBg(hex){
    const h = String(hex||'').trim();
    const m = /^#?([0-9a-f]{6})$/i.exec(h);
    if(!m) return '#e5e7eb';
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    const yiq = ((r*299)+(g*587)+(b*114))/1000;
    return yiq >= 140 ? '#0b0f14' : '#f4f4f5';
  }

  let selectedTeamId = isLead ? me.teamId : (Config.TEAMS[0] && Config.TEAMS[0].id);

  function getManilaDayIndex(){
    const wd = UI.weekdayFromISO(UI.manilaTodayISO());
    return (wd==null) ? 0 : wd;
  }
  let selectedDay = getManilaDayIndex();

  const _todayISO = UI.manilaTodayISO();
  const _todayWD = UI.weekdayFromISO(_todayISO);
  const _deltaToMon = (_todayWD===0) ? -6 : (1 - _todayWD);
  const defaultWeekStartISO = UI.addDaysISO(_todayISO, _deltaToMon);
  let weekStartISO = localStorage.getItem('ums_week_start_iso') || defaultWeekStartISO;

  let paint = { enabled: false, role: 'call_onqueue' };

  const GRAPH_LS_KEY = 'mums_graph_status_panel_v1';
  let graphEnabled = false;
  let graphPanelState = null;
  let graphTaskFilterId = paint.role;
  let graphSettingsOpen = false;
  let _taskSyncing = false;

  function syncTaskSelection(taskId, opts){
    const v = String(taskId||'').trim();
    if(!v) return;
    const o = opts || {};
    const shouldRender = (o.render !== false);
    const shouldPersist = (o.persist !== false);

    if(_taskSyncing){
      paint.role = v;
      graphTaskFilterId = v;
      if(shouldPersist) persistGraphPrefs();
      return;
    }
    _taskSyncing = true;
    try{
      paint.role = v;
      graphTaskFilterId = v;
      if(shouldPersist) persistGraphPrefs();
      try{ const pSel = document.getElementById('paintRole'); if(pSel && String(pSel.value||'') !== v) pSel.value = v; }catch(_e){}
      try{ const gSel = document.getElementById('gspTask'); if(gSel && String(gSel.value||'') !== v) gSel.value = v; }catch(_e){}
    }finally{ _taskSyncing = false; }

    if(shouldRender){
      try{ renderAll(); }catch(_e){}
      if(graphEnabled) try{ renderGraphPanel(getMembersForView(selectedTeamId) || []); }catch(_e){}
    }
  }

  function persistGraphPrefs(){
    try{
      const raw = localStorage.getItem(GRAPH_LS_KEY);
      let st = {};
      try{ st = raw ? JSON.parse(raw) : {}; }catch(_e){ st = {}; }
      st.enabled = !!graphEnabled;
      st.taskId = String(graphTaskFilterId||'');
      st.settingsOpen = !!graphSettingsOpen;
      st.panel = graphPanelState || st.panel || null;
      try{ delete st.view; }catch(_e){}
      try{ localStorage.setItem('settingsOpen', graphSettingsOpen ? '1' : '0'); }catch(_e){}
      localStorage.setItem(GRAPH_LS_KEY, JSON.stringify(st));
    }catch(_e){}
  }

  function requestGraphRefresh(){
    if(!graphEnabled) return;
    if(requestGraphRefresh._t) return;
    requestGraphRefresh._t = window.setTimeout(()=>{
      requestGraphRefresh._t = 0;
      try{ if(graphEnabled) renderGraphPanel(getMembersForView(selectedTeamId) || []); }catch(_e){}
    }, 40);
  }
  requestGraphRefresh._t = 0;

  function normalizeToMonday(iso){
    const wd = UI.weekdayFromISO(String(iso||defaultWeekStartISO));
    if(wd==null) return defaultWeekStartISO;
    const delta = -wd; 
    return UI.addDaysISO(String(iso||defaultWeekStartISO), delta);
  }
  weekStartISO = normalizeToMonday(weekStartISO);

  function isoForDay(dayIndex){
    const offset = Number(dayIndex) - 1; 
    return UI.addDaysISO(weekStartISO, offset);
  }

  function isRestDay(teamId, userId, isoDate){
    const t = Store.getTeamMaster ? Store.getTeamMaster(teamId) : null;
    const m = t && t.members ? t.members[userId] : null;
    if(!m || !Array.isArray(m.restWeekdays) || !m.restWeekdays.length) return false;
    const wd = UI.weekdayFromISO(isoDate);
    if(wd==null) return false;
    return m.restWeekdays.includes(wd);
  }

  function getTeamLock(teamId){
    return (Store.getLock ? Store.getLock(teamId, weekStartISO) : null);
  }
  function isDayLocked(teamId, dayIndex){
    const lock = getTeamLock(teamId);
    return !!(lock && lock.lockedDays && lock.lockedDays[String(dayIndex)]);
  }
  function isDayLockedForEdit(teamId, dayIndex){
    return isDayLocked(teamId, dayIndex);
  }
  function dayLockedForGridDisplay(isoDate, teamId){
    try{
      const tid = String(teamId || selectedTeamId || '');
      const wd = UI.weekdayFromISO(String(isoDate||''));
      if(wd == null) return false;
      return isDayLockedForEdit(tid, wd);
    }catch(_){ return false; }
  }
  function isScheduleEditLocked(teamId, dayIndex){
    return isDayLockedForEdit(teamId, dayIndex) && !unlockTriggered;
  }
  function guardScheduleEditLocked(teamId, dayIndex){
    if(isScheduleEditLocked(teamId, dayIndex)){
      warnScheduleLocked();
      return true;
    }
    return false;
  }

  function currentWeekStartISOManila(){
    const todayISO = (UI && UI.manilaTodayISO) ? UI.manilaTodayISO() : new Date().toISOString().slice(0,10);
    return normalizeToMonday(todayISO);
  }
  function isWeekInPast(weekISO){
    const w = String(weekISO||'');
    if(!w) return false;
    const cur = currentWeekStartISOManila();
    return w < cur;
  }
  function notifyPastWeekLocked(){
    const msg = "Cannot modify schedules for past dates. Please switch the calendar to the current or future week.";
    try{ if(window.UI && typeof UI.toast === 'function'){ UI.toast(msg, { type:'warn' }); return; } }catch(_){}
    alert(msg);
  }

  function dayHasAnyBlocks(teamId, dayIndex){
    const members = getMembersForView(teamId);
    return members.some(m => (Store.getUserDayBlocks(m.id, dayIndex) || []).length > 0);
  }

  function renderDayTabs(){
    const tabs = wrap.querySelector('#dayTabs');
    if(!tabs) return;
    const teamId = selectedTeamId;
    const lock = getTeamLock(teamId);
    const lockedMonFri = !!(lock && lock.lockedDays && [1,2,3,4,5].some(d=>lock.lockedDays[String(d)]));
    tabs.innerHTML = UI.DAYS.map((d,i)=>{
      const active = i===selectedDay ? 'is-on' : '';
      const iso = isoForDay(i);
      const dd = Number(String(iso||'').split('-')[2] || 0);
      const lab = `[${dd||''}] ${d.slice(0,3)}`;
      return `<button class="daytab ${active}" data-day="${i}" type="button">${UI.esc(lab)}</button>`;
    }).join('');
    tabs.querySelectorAll('.daytab').forEach(b=>{
      b.onclick = ()=>{
        selectedDay = Number(b.dataset.day);
        triggerSwap();
        renderDayTabs();
        renderAll();
      };
    });

    const badge = wrap.querySelector('#lockBadge');
    const unlockBtn = wrap.querySelector('#unlockSchedule');
    const autoBtn = wrap.querySelector('#autoSchedule');
    const previewBtn = wrap.querySelector('#previewAuto');
    const autoSettingsBtn = wrap.querySelector('#autoSettings');
    if(badge) badge.classList.toggle('hidden', !lockedMonFri);
    if(lockedMonFri) unlockTriggered = false;
    const canUnlock = lockedMonFri && (isLead || isAdmin || isSuper);
    if(unlockBtn) unlockBtn.classList.toggle('hidden', !canUnlock);
    const lockDisable = !!lockedMonFri;
    if(autoBtn) autoBtn.disabled = lockDisable;
    if(previewBtn) previewBtn.disabled = lockDisable;
    if(autoSettingsBtn) autoSettingsBtn.disabled = lockDisable;
    renderWeekWarning();
  }

  function to12h(hm){
    const mins = UI.parseHM(hm);
    const hh = Math.floor(mins/60) % 24;
    const mm = mins % 60;
    const ap = hh >= 12 ? 'PM' : 'AM';
    const h12 = ((hh + 11) % 12) + 1;
    return `${h12}:${String(mm).padStart(2,'0')} ${ap}`;
  }
  function compactTimeLabel(hm){
    try{
      const mins = UI.parseHM(hm);
      const hh = Math.floor(mins/60) % 24;
      const ap = hh >= 12 ? 'P' : 'A';
      const h12 = ((hh + 11) % 12) + 1;
      return `${h12}${ap}`;
    }catch(_){ return ''; }
  }

  let selMemberId = null;
  let selMemberIds = new Set();
  let selIdx = new Set();
  let lastCursor = null;

  function clearSelection(){
    selMemberId = null;
    selMemberIds = new Set();
    selIdx = new Set();
    updateSelectionUI();
    applySelectionStyles();
    applyMemberRowSelectionStyles();
  }

  function updateSelectionUI(){
    const badge = wrap.querySelector('#selBadge');
    const clr = wrap.querySelector('#selClear');
    const desel = wrap.querySelector('#selDeselect');
    const del = wrap.querySelector('#deleteSelected');
    const count = selIdx.size;
    if(badge) badge.textContent = `${count} selected`;
    const canClear = (selMemberIds && selMemberIds.size) ? true : !!selMemberId;
    const canDeleteSelected = !!selMemberId && count>0;
    if(clr) clr.disabled = !canClear;
    if(desel) desel.disabled = !canDeleteSelected;
    if(del) del.disabled = !canDeleteSelected;
  }

  function applySelectionStyles(){
    wrap.querySelectorAll('.timeline .seg').forEach(seg=>seg.classList.remove('selected'));
    if(!selMemberId || selIdx.size===0) return;
    const row = wrap.querySelector(`.members-row[data-id="${CSS.escape(selMemberId)}"]`);
    if(!row) return;
    selIdx.forEach(i=>{
      const seg = row.querySelector(`.seg[data-idx="${i}"]`);
      if(seg) seg.classList.add('selected');
    });
  }

  function applyMemberRowSelectionStyles(){
    const rows = wrap.querySelectorAll('.members-row');
    rows.forEach(r=>{
      const id = r.dataset.id;
      const on = (selMemberIds && selMemberIds.has(id)) || (!!selMemberId && selMemberId===id);
      r.classList.toggle('m-selected', !!on);
      const cb = r.querySelector('input.m-select');
      if(cb) cb.checked = !!(selMemberIds && selMemberIds.has(id));
    });
    wrap.querySelectorAll('.roster-item').forEach(el=>{
      const id = el.getAttribute('data-id');
      const on = (selMemberIds && selMemberIds.has(id)) || (!!selMemberId && selMemberId===id);
      el.classList.toggle('selected', !!on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if(graphEnabled){
      try{ renderGraphPanel(getMembersForView(selectedTeamId) || []); }
      catch(_e){ graphEnabled = false; try{ wrap.querySelector('#graphToggle').checked = false; }catch(__){} }
    }
  }

  let rosterFilter = 'all';
  let rosterQuery = '';

  function isElementVisible(el){
    if(!el) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  }

  function renderRoster(members){
    if (!Array.isArray(members)) members = [];
    const list = wrap.querySelector('#membersRosterList');
    const meta = wrap.querySelector('#membersRosterMeta');
    if (!list) return;
    const q = String(rosterQuery || '').trim().toLowerCase();
    const f = String(rosterFilter || 'all');
    const filtered = members.filter(m => {
      const name = String(m.name || '');
      if (q && !name.toLowerCase().includes(q)) return false;
      if (f === 'active') return !m._isInactive;
      if (f === 'inactive') return !!m._isInactive;
      return true;
    });
    if (meta) meta.textContent = `${filtered.length} of ${members.length}`;
    if (!filtered.length) {
      list.innerHTML = `<div class="empty-state">No members found</div>`;
      return;
    }
    const sel = window.selMemberId;
    list.innerHTML = filtered.map(m => {
      const selected = sel && String(sel) === String(m.id);
      const statusClass = m._isInactive ? 'status-inactive' : 'status-active';
      const right = m._isInactive ? `<span class="roster-right text-zinc-400">Inactive</span>` : '';
      return `
        <button class="roster-item ${selected?'selected':''}" role="option" aria-selected="${selected?'true':'false'}" data-id="${UI.esc(m.id)}">
          <span class="roster-left">
            <span class="status-dot ${statusClass}"></span>
            <span class="roster-name">${UI.esc(m.name)}</span>
          </span>
          ${right}
        </button>
      `;
    }).join('');
  }

  function selectMemberFromRoster(id, opts){
    const o = Object.assign({ scroll:true, preserveSelection:false, preserveBlocks:false }, opts||{});
    if(!id) return;
    const row = wrap.querySelector(`.members-row[data-id="${CSS.escape(id)}"]`);
    if(!row){
      selMemberId = null; selIdx = new Set(); selMemberIds = new Set();
      updateSelectionUI(); applySelectionStyles(); applyMemberRowSelectionStyles();
      return;
    }
    selMemberId = id;
    if(!o.preserveSelection){ selMemberIds = new Set(); selIdx = new Set(); }
    else if(!o.preserveBlocks){ selIdx = new Set(); }
    updateSelectionUI(); applySelectionStyles(); applyMemberRowSelectionStyles();
    if(o.scroll){
      try{
        const sc = wrap.querySelector('#membersTimelineScroll');
        if(sc){
          const r = row.getBoundingClientRect(); const c = sc.getBoundingClientRect();
          const inView = r.top >= c.top && r.bottom <= c.bottom;
          if(!inView) row.scrollIntoView({ block:'center', behavior:'smooth' });
        }else{ row.scrollIntoView({ block:'center', behavior:'smooth' }); }
      }catch(_){ try{ row.scrollIntoView(); }catch(__){} }
    }
  }

  const wrap = document.createElement('div');
  wrap.id = 'membersAppWrap';
  wrap.className = 'members-page bg-zinc-950 text-zinc-100 font-sans';

  wrap.innerHTML = `
    <div class="members-topbar" role="banner" aria-label="Members header">
      <div class="members-topbar-zone members-topbar-zone-left">
        <div class="members-title-stack">
          <div class="members-h1 tracking-tight">Members</div>
          <div class="members-sub text-zinc-400">Manage schedule assignments</div>
        </div>
        <label class="members-field members-teamfield">
          <select class="input" id="teamSelect">
            ${Config.TEAMS.map(t=>`<option value="${t.id}">${UI.esc(t.label)}</option>`).join('')}
          </select>
        </label>
      </div>

      <div class="members-topbar-zone members-topbar-zone-center">
        <div class="members-navtool">
          <button class="navbtn" id="weekPrev" type="button" title="Previous week">‹ Prev</button>
          <input class="navinput" id="weekSelect" type="date" value="${UI.esc(weekStartISO)}" />
          <button class="navbtn" id="weekNext" type="button" title="Next week">Next ›</button>
          <button class="navbtn navbtn-accent" id="jumpToday" type="button" title="Current Week">Current Week</button>
        </div>
        <div id="weekWarn" class="week-warn hidden" aria-live="polite"></div>
      </div>

      <div class="members-topbar-zone members-topbar-zone-right">
        <button class="btn ghost" id="membersFullscreenBtn" type="button">⛶ Fullscreen</button>

        ${(isLead||isAdmin) ? `
        <label class="switch" title="Floating Status">
          <input type="checkbox" id="graphToggle" />
          <span class="switch-ui"></span>
          <span class="switch-tx">Graph</span>
        </label>

        <button class="btn primary" id="sendSchedule" type="button" title="Apply changes">Apply</button>

        <div class="global-lock">
          <button class="btn primary" id="autoSchedule" type="button">Apply &amp; Lock</button>
          <span class="lock-badge hidden" id="lockBadge"><span class="lock-ic">🔒</span></span>
          <button class="btn danger hidden" id="unlockSchedule" type="button">Unlock</button>
        </div>

        <div class="reports-dropdown members-settings-dropdown" id="membersSettingsDropdown">
          <button class="btn ghost iconbtn" id="membersSettingsToggle" type="button">⚙️</button>
          <div class="reports-menu members-settings-menu" id="membersSettingsMenu">
            <button class="reports-item" id="coverageSettingsBtn" type="button">Coverage Settings</button>
            <button class="reports-item" id="taskSettingsBtn" type="button">Task Config (Max Hours)</button>
            <div class="reports-sep"></div>
            <button class="reports-item" id="autoSettings" type="button">Auto Settings</button>
            <button class="reports-item" id="previewAuto" type="button">Auto Preview</button>
            <div class="reports-sep"></div>
            <button class="reports-item" id="exportSchedule" type="button">Export Schedule CSV</button>
            <button class="reports-item" id="exportWorkload" type="button">Export Workload CSV</button>
            <div class="reports-sep"></div>
            <button class="reports-item" id="viewAudit" type="button">View Audit History</button>
            <button class="reports-item" id="viewAcks" type="button">View Acknowledgements</button>
            <button class="reports-item" id="viewHealthTrend" type="button">View Health Trend Weekly</button>
          </div>
        </div>
        ` : ''}
      </div>
    </div>

    <div class="daytabs" id="dayTabs"></div>

    <div class="members-enterprise-grid" id="membersEnterpriseGrid">
      <div class="card members-roster" id="membersRosterPanel">
        <div class="members-roster-header">
          <div class="members-roster-title">
            <div class="h2 tracking-tight">Team Roster</div>
            <div class="small text-zinc-400" id="membersRosterMeta">—</div>
          </div>
          <div class="members-roster-tools">
            <div class="roster-searchbar">
              <span class="search-ic">🔎</span>
              <input class="input roster-search" id="membersRosterSearch" type="search" placeholder="Search..." />
              <select class="input roster-filter" id="membersRosterFilter">
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>
        <div class="members-roster-list" id="membersRosterList"></div>
      </div>

      <div class="members-splitter" id="membersSplitLeft" tabindex="0"></div>

      <div class="card members-timeline sched-swap" id="schedulePane">
        <div id="membersTimelineToolbar" class="members-timeline-toolbar">
          <div class="mtb-left">
            <button class="btn ghost" id="paintToggle" type="button">Paint</button>
            <select class="input" id="paintRole"></select>
            <button class="btn ghost" id="selectionToggle" type="button">Select</button>
            <button class="btn ghost danger" id="deleteSelected" type="button" disabled>Delete</button>
            <button class="btn danger" id="selClear" type="button" disabled>Clear</button>
            <span class="badge" id="selBadge">0</span>
          </div>
          <div class="mtb-mid"></div>
          <div class="mtb-right">
            ${(isLead||isAdmin||isSuper) ? `<button class="btn primary" id="autoAssignBtn" type="button">Auto Assign</button>` : ``}
          </div>
        </div>

        <div class="members-timeline-scroll" id="membersTimelineScroll">
          <div id="coverageMeter" class="coverage-panel coverage-sticky"></div>
          <div class="members-tip small text-zinc-400">Assignments are strictly 1-hour blocks. Drag empty space to create. Use Paint to fill multiple hours.</div>
          <div class="timeline-ruler" id="ruler"></div>
          <div class="members-table" id="membersTable"></div>
        </div>
      </div>

      <div class="members-splitter" id="membersSplitRight" tabindex="0"></div>

      <div class="card members-inspector" id="membersAnalyticsRail">
        <div class="inspector-tabs">
          <button class="tab is-on" type="button" data-tab="analytics">Analytics</button>
          <button class="tab" type="button" data-tab="guide">Guide</button>
        </div>
        <div class="members-analytics-body inspector-panels">
          <div class="inspector-panel" id="inspAnalytics">
            <div class="p-4 border-b border-zinc-800/50">
              <div id="member-graph-container"></div>
            </div>
            <div class="small text-zinc-400 mt-3">Notes</div>
            <textarea class="input" id="enterpriseNotes" rows="6" placeholder="Notes..."></textarea>
          </div>
          <div class="inspector-panel hidden" id="inspGuide">
            <div class="guide small text-zinc-400">
              <div class="guide-line"><b>Paint</b>: click &amp; drag.</div>
              <div class="guide-line"><b>Select</b>: Shift+Click.</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="modal" id="memberSchedModal"><div class="panel"><div class="head"><div><div class="announce-title" id="msTitle"></div><div class="small" id="msSub"></div></div><button class="btn ghost" id="msClose">✕</button></div><div class="body" id="msBody"></div></div></div>
    <div class="modal" id="ackModal"><div class="panel"><div class="head"><div><div class="announce-title" id="ackTitle"></div><div class="small" id="ackSub"></div></div><button class="btn ghost" id="ackClose">✕</button></div><div class="body" id="ackBody"></div></div></div>
    <div class="modal" id="auditModal"><div class="panel"><div class="head"><div><div class="announce-title" id="auditTitle"></div><div class="small" id="auditSub"></div></div><button class="btn ghost" id="auditClose">✕</button></div><div class="body" id="auditBody"></div></div></div>
    <div class="modal" id="trendModal"><div class="panel"><div class="head"><div><div class="announce-title" id="trendTitle"></div><div class="small" id="trendSub"></div></div><button class="btn ghost" id="trendClose">✕</button></div><div class="body" id="trendBody"></div></div></div>
    <div class="modal modal-blur" id="taskSettingsModal"><div class="panel"><div class="head"><div><div class="announce-title">Task Settings</div><div class="small">Max Hours per Task</div></div><button class="btn ghost" id="taskSettingsClose">✕</button></div><div class="body" id="taskSettingsBody"></div><div class="foot task-settings-foot"><button class="btn" id="taskSettingsCancel">Cancel</button><button class="btn primary" id="taskSettingsSave">Save</button></div></div></div>

    <div id="graphPanel" class="graph-status-panel gsp-floating gsp-float-anchor gsp-resizable hidden"><div class="gsp-head" id="graphPanelHead"><div><div class="gsp-title">Graphical Task Status</div></div><button class="iconbtn" id="graphClose">✕</button></div><div class="gsp-body" id="graphBody"></div></div>
  `;

  // Init wiring...
  function initEnterpriseMembersShell(){
    const leftKey = 'mums_members_left_w';
    const rightKey = 'mums_members_right_w';
    const grid = wrap.querySelector('#membersEnterpriseGrid');
    if(grid){
      const l = parseInt(localStorage.getItem(leftKey),10);
      const r = parseInt(localStorage.getItem(rightKey),10);
      if(l && l>=220) grid.style.setProperty('--members-left', `${l}px`);
      if(r && r>=260) grid.style.setProperty('--members-right', `${r}px`);
    }
    const fsBtn = wrap.querySelector('#membersFullscreenBtn');
    if(fsBtn){
      fsBtn.onclick = ()=>{
        const isFS = document.body.classList.contains('members-fullscreen-active');
        if(isFS){
          document.body.classList.remove('members-fullscreen-active');
          wrap.classList.remove('members-fullscreen-overlay');
          fsBtn.textContent = '⛶ Fullscreen';
        }else{
          document.body.classList.add('members-fullscreen-active');
          wrap.classList.add('members-fullscreen-overlay');
          fsBtn.textContent = '✕ Exit Fullscreen';
        }
      };
    }
  }

  root.replaceChildren(wrap);
  initEnterpriseMembersShell();

  // Settings dropdown
  (function(){
    const dd = wrap.querySelector('#membersSettingsDropdown');
    const btn = wrap.querySelector('#membersSettingsToggle');
    const menu = wrap.querySelector('#membersSettingsMenu');
    if(!dd) return;
    const set = (on)=> dd.classList.toggle('open', !!on);
    btn.onclick = (e)=>{ e.stopPropagation(); set(!dd.classList.contains('open')); };
    dd.onmouseenter = ()=>set(true);
    dd.onmouseleave = ()=>set(false);
    menu.querySelectorAll('button').forEach(b=>b.onclick=()=>set(false));
  })();

  // Graph Panel
  (function initGraphPanel(){
    const toggle = wrap.querySelector('#graphToggle');
    const panel = wrap.querySelector('#graphPanel');
    const head = wrap.querySelector('#graphPanelHead');
    const closeBtn = wrap.querySelector('#graphClose');
    if(!toggle) return;
    try{
      const raw = localStorage.getItem(GRAPH_LS_KEY);
      if(raw){
        const st = JSON.parse(raw);
        graphEnabled = !!st.enabled;
        graphPanelState = st.panel;
        if(st.taskId) graphTaskFilterId = st.taskId;
        syncTaskSelection(graphTaskFilterId, { render:false });
      }
    }catch(_){}

    function setEnabled(on){
      graphEnabled = !!on;
      toggle.checked = graphEnabled;
      panel.classList.toggle('hidden', !graphEnabled);
      if(graphEnabled) requestGraphRefresh();
    }
    toggle.onchange = ()=>setEnabled(toggle.checked);
    closeBtn.onclick = ()=>setEnabled(false);
    setEnabled(graphEnabled);
  })();

  function renderMemberGraphPanel(data) {
    const container = document.getElementById('member-graph-container');
    if (!container) return;
    const list = Array.isArray(data) ? data : [];
    const total = list.length;
    const active = list.filter(m => (m && !m._isInactive)).length;
    const percentage = total > 0 ? (active / total) * 100 : 0;
    container.innerHTML = `
        <div class="flex items-center justify-between text-xs mb-2">
            <span class="text-zinc-500 font-medium">Team Availability</span>
            <span class="text-emerald-400 font-mono">${active}/${total} Online</span>
        </div>
        <div class="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div class="h-full bg-emerald-500 transition-all duration-500" style="width: ${percentage}%"></div>
        </div>
    `;
  }

  function triggerSwap(){
    const pane = wrap.querySelector('#schedulePane');
    if(pane){ pane.classList.add('swap-anim'); setTimeout(()=>pane.classList.remove('swap-anim'),240); }
  }

  // Header Controls
  const teamSel = wrap.querySelector('#teamSelect');
  if(teamSel) teamSel.onchange = ()=>{ selectedTeamId = teamSel.value; renderDayTabs(); renderAll(); };

  // Week Controls
  const weekInp = wrap.querySelector('#weekSelect');
  if(weekInp) weekInp.onchange = ()=>{ weekStartISO = normalizeToMonday(weekInp.value); renderDayTabs(); renderAll(); };
  wrap.querySelector('#weekPrev').onclick = ()=>{ weekStartISO = UI.addDaysISO(weekStartISO, -7); if(weekInp) weekInp.value = weekStartISO; renderDayTabs(); renderAll(); };
  wrap.querySelector('#weekNext').onclick = ()=>{ weekStartISO = UI.addDaysISO(weekStartISO, 7); if(weekInp) weekInp.value = weekStartISO; renderDayTabs(); renderAll(); };
  wrap.querySelector('#jumpToday').onclick = ()=>{ weekStartISO = currentWeekStartISOManila(); if(weekInp) weekInp.value = weekStartISO; selectedDay = getManilaDayIndex(); renderDayTabs(); renderAll(); };

  function syncTimelineToolbarUI(){
    const roleSel = wrap.querySelector('#paintRole');
    if(roleSel){
      const teamKey = String(selectedTeamId);
      if(roleSel.dataset.teamKey !== teamKey){
        const opts = getTeamTaskOptions(selectedTeamId).map(o=>{
          const meta = taskMeta(selectedTeamId, o.id);
          const dot = legendDotEmoji(meta.color||'');
          return `<option value="${UI.esc(o.id)}">${dot} ${UI.esc(o.label)}</option>`;
        }).join('');
        roleSel.innerHTML = opts;
        roleSel.dataset.teamKey = teamKey;
      }
      roleSel.value = paint.role;
      roleSel.onchange = ()=>{ paint.role = roleSel.value; syncTaskSelection(paint.role); };
    }
    const pBtn = wrap.querySelector('#paintToggle');
    if(pBtn){
      pBtn.classList.toggle('primary', paint.enabled);
      pBtn.onclick = ()=>{ paint.enabled = !paint.enabled; wrap.classList.toggle('paint-enabled', paint.enabled); syncTimelineToolbarUI(); };
    }
    const sBtn = wrap.querySelector('#selectionToggle');
    if(sBtn){
      // (Simplified selection logic trigger)
    }
  }

  // Wire standard components
  wireInspectorTabs();
  wireTaskSettingsModal();
  wireAutoAssignBtn();

  function segStyle(b){
    const team = Config.teamById(selectedTeamId);
    if(!team) return { left:0, width:0, hours:0 };
    const meta = UI.shiftMeta(team);
    const total = meta.length || (9*60);
    const s = UI.offsetFromShiftStart(team, b.start);
    const e = UI.offsetFromShiftStart(team, b.end);
    const left = (s/total)*100;
    const width = ((e-s)/total)*100;
    return { left, width, hours: Math.round(((e-s)/60)*10)/10 };
  }

  function renderAll(){
    const ctxKey = `${selectedTeamId}|${weekStartISO}|${selectedDay}`;
    const ctxChanged = (wrap._lastCtx !== ctxKey);
    wrap._lastCtx = ctxKey;
    if(ctxChanged){ selIdx = new Set(); selMemberIds = new Set(); }

    renderWeekWarning();
    const team = Config.teamById(selectedTeamId);
    const isoDate = isoForDay(selectedDay);
    const members = getMembersForView(selectedTeamId).sort((a,b)=>a.name.localeCompare(b.name));
    renderRoster(members);

    const ruler = wrap.querySelector('#ruler');
    const meta = UI.shiftMeta(team);
    const marks = [];
    const rticks = [];
    for(let off=0; off<=meta.length; off+=60){
      const pct = (off/meta.length)*100;
      const hm = UI.offsetToHM(team, off);
      marks.push(`<div class="mark" style="left:${pct}%">${to12h(hm)}</div>`);
      rticks.push(`<div class="ruler-tick" style="left:${pct}%"></div>`);
    }
    ruler.innerHTML = `<div></div><div class="ruler-track">${rticks.join('')}${marks.join('')}</div><div></div>`;

    const covEl = wrap.querySelector('#coverageMeter');
    if(covEl){
       // Render Coverage Meter (Standard Component)
       try {
         if(window.Components && Components.CoverageMeter){
           Components.CoverageMeter.render(covEl, {
             // ... minimal props ...
             onEdit: ()=>renderAutoSettingsModal(selectedTeamId) // Keep logic but hide icon in CSS
           });
         }
       } catch(e){}
    }

    const ticks = [];
    for(let off=0; off<=meta.length; off+=60){
      ticks.push(`<div class="tick" style="left:${(off/meta.length)*100}%"></div>`);
    }

    const table = wrap.querySelector('#membersTable');

    // Helper to calc progress
    const _taskCfg = (Store.getTeamTaskConfig ? Store.getTeamTaskConfig(team.id) : null) || {};
    const _callRole = _taskCfg.callRole || 'call_onqueue';

    // Dummy progress for example, replace with actual logic
    function _progress(u, taskId){
       const tid = taskId || 'call_onqueue';
       // Actual logic to calc hours...
       return { pct: 45, pctText: '45%', text: 'Call: 18h/40h', cls: 'progress-green' };
    }

    table.innerHTML = members.map(m=>{
      const isInactive = isRestDay(m.teamId, m.id, isoDate);
      const inactiveText = isInactive ? 'ON REST DAY' : '';
      const prog = _progress(m, paint.role);

      const blocks = normalizeBlocks(team, Store.getUserDayBlocks(m.id, selectedDay));
      const segs = blocks.map((b,i)=>{
        const st = segStyle(b);
        const role = b.role || 'block';
        const roleCls = 'role-' + role;
        const timeLabel = compactTimeLabel(b.start);
        const raw = b.bg || ''; 
        const styleAttr = `left:${st.left}%;width:${st.width}%;${raw?`--seg-raw:${raw};`:''}`;

        return `<div class="seg ${roleCls} ${b.selected?'is-selected':''}" data-mid="${m.id}" data-idx="${i}" style="${styleAttr}">
          <span class="seg-time">${timeLabel}</span>
          <span class="handle"></span>
        </div>`;
      }).join('');

      return `
        <div class="members-row ${isInactive?'inactive':''} compact" data-id="${m.id}">
          <div class="members-meta">
             <div class="m-top-row">
               <div class="m-name text-zinc-100 font-bold text-xs truncate">${UI.esc(m.name||m.username)}</div>
               ${isInactive ? `<span class="status-pill text-[10px]">${inactiveText}</span>` : ''}
             </div>
             <div class="m-bar-row mt-1">
               <div class="progress-track h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                 <div class="progress-bar ${prog.cls}" style="width:${prog.pct}%"></div>
               </div>
             </div>
             <div class="m-stat-row mt-1 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
               <span>${UI.esc(prog.text)}</span>
               <span class="text-zinc-400">${prog.pctText}</span>
             </div>
          </div>
          <div class="relative flex-1 min-w-0">
             <div class="timeline" data-team="${team.id}">
               ${ticks.join('')}
               ${segs}
               ${isInactive ? `<div class="timeline-overlay">${inactiveText}</div>` : ''}
             </div>
          </div>
          <div class="member-actions flex items-center gap-1">
             <button class="iconbtn w-6 h-6 text-[10px]" data-act="edit">✎</button>
             <div class="leave-actions flex gap-1">
                <button class="btn ghost tiny text-[9px] px-1 py-0 h-5" data-act="leave" data-leave="SL">SL</button>
                <button class="btn ghost tiny text-[9px] px-1 py-0 h-5" data-act="leave" data-leave="EL">EL</button>
                <button class="btn ghost tiny text-[9px] px-1 py-0 h-5" data-act="leave" data-leave="VL">VL</button>
                <button class="btn ghost tiny text-[9px] px-1 py-0 h-5" data-act="leave" data-leave="HL">HL</button>
             </div>
          </div>
        </div>
      `;
    }).join('');

    // Re-attach listeners for edit/leave buttons (Standard logic)...
    table.querySelectorAll('button[data-act="edit"]').forEach(btn=>{
      btn.onclick = ()=>{ const id = btn.closest('.members-row').dataset.id; openEditModal(Store.getUsers().find(u=>u.id===id)); };
    });
    table.querySelectorAll('button[data-act="leave"]').forEach(btn=>{
      btn.onclick = ()=>{ 
         // Leave toggle logic...
         renderAll(); 
      };
    });

    try{ renderMemberGraphPanel(members); }catch(_e){}
  }

  // Drag logic initialization (standard block)

  renderDayTabs();
  renderAll();
  })().catch(e=>console.error(e));
};
