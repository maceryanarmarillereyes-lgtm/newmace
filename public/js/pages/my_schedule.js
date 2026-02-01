(window.Pages=window.Pages||{}, window.Pages.my_schedule = function(root){
  // Enterprise My Schedule (Phase 1)
  // Rollback-safe: self-contained renderer; does not mutate global routing.

  const UI = window.UI || {};
  const Store = window.Store || {};
  const Auth = window.Auth || {};
  const Config = window.Config || {};

  const me = (Auth.getUser ? (Auth.getUser()||{}) : {});
  const role = String(me.role||'');
  const ROLES = (Config.ROLES || {});
  const isSA = role === (ROLES.SUPER_ADMIN||'SUPER_ADMIN');
  const isAdmin = isSA || role === (ROLES.ADMIN||'ADMIN') || role === (ROLES.SUPER_USER||'SUPER_USER');
  const isLead = role === (ROLES.TEAM_LEAD||'TEAM_LEAD');
  const canEditSelf = isAdmin || isLead;

  // Time helpers
  const tzManila = (Config && Config.TZ) || 'Asia/Manila';
  const localTZ = (()=>{ try{ return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local'; }catch(_){ return 'Local'; } })();

  const todayISO = (UI.manilaTodayISO ? UI.manilaTodayISO() : (new Date()).toISOString().slice(0,10));
  const todayWD = (UI.weekdayFromISO ? UI.weekdayFromISO(todayISO) : (new Date()).getDay());

  // Build a Sunday-start week (Sun..Sat) based on Manila calendar date.
  const weekStartSunISO = (UI.addDaysISO ? UI.addDaysISO(todayISO, -todayWD) : todayISO);
  const isoForDay = (dayIdx)=> UI.addDaysISO ? UI.addDaysISO(weekStartSunISO, dayIdx) : weekStartSunISO;

  const team = (Config.teamById && me.teamId!=null) ? (Config.teamById(me.teamId) || null) : null;
  const teamLabel = (Config.teamLabel && me.teamId!=null) ? Config.teamLabel(me.teamId) : (team ? (team.label||team.id) : (me.teamId||'—'));

  const tasks = (Store.getTeamTasks && me.teamId!=null) ? (Store.getTeamTasks(me.teamId) || []) : [];
  const taskLabel = (id)=>{
    const t = tasks.find(x=>x && String(x.id)===String(id));
    // Also support Config.SCHEDULES ids.
    const cs = (Config.SCHEDULES && Config.SCHEDULES[String(id)]) ? Config.SCHEDULES[String(id)] : null;
    return (t && t.label) ? t.label : (cs && cs.label) ? cs.label : (id||'');
  };
  const taskIcon = (id)=>{
    const cs = (Config.SCHEDULES && Config.SCHEDULES[String(id)]) ? Config.SCHEDULES[String(id)] : null;
    return (cs && cs.icon) ? cs.icon : '';
  };

  const taskColor = (id)=>{
    try{
      if(Store.getTeamTaskColor && me.teamId!=null){
        const c = Store.getTeamTaskColor(me.teamId, id);
        if(c) return c;
      }
    }catch(_){ }
    const t = tasks.find(x=>x && String(x.id)===String(id));
    return (t && t.color) ? t.color : '';
  };

  const hm = (m)=>{
    const pad = (n)=>String(n).padStart(2,'0');
    const mm = Math.max(0, Math.min(23*60+59, Number(m)||0));
    return `${pad(Math.floor(mm/60))}:${pad(mm%60)}`;
  };

  // Manila (UTC+8) moment -> local time label
  function manilaHMtoLocal(isoDate, startHM, endHM){
    try{
      const v = UI.isoToYMD ? UI.isoToYMD(isoDate) : null;
      if(!v) return '';
      const s = UI.parseHM ? UI.parseHM(startHM) : 0;
      const e = UI.parseHM ? UI.parseHM(endHM) : 0;
      const wrap = e <= s;

      const toUTC = (mins, dayOffset)=>{
        const hh = Math.floor(mins/60);
        const mm = mins % 60;
        // Manila is UTC+8 (no DST)
        return Date.UTC(v.y, v.m-1, v.d + (dayOffset||0), hh - 8, mm, 0);
      };

      const sMs = toUTC(s, 0);
      const eMs = toUTC(e, wrap ? 1 : 0);

      const fmt = (ms)=> new Date(ms).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
      const a = fmt(sMs);
      const b = fmt(eMs);
      return `${a}–${b}`;
    }catch(_){
      return '';
    }
  }

  function shiftColor(teamId){
    const t = String(teamId||'');
    if(t==='morning') return 'morning';
    if(t==='mid') return 'mid';
    if(t==='night') return 'night';
    // Fallback: infer by label
    const l = String(teamLabel||'').toLowerCase();
    if(l.includes('morning')) return 'morning';
    if(l.includes('mid')) return 'mid';
    if(l.includes('night')) return 'night';
    return 'mid';
  }

  // Audit lookup: best-effort mapping from weekly audit to blocks.
  function currentWeekStartMondayISO(){
    try{
      const wd = UI.weekdayFromISO ? UI.weekdayFromISO(todayISO) : todayWD;
      const delta = (wd===0) ? -6 : (1 - wd);
      return UI.addDaysISO ? UI.addDaysISO(todayISO, delta) : todayISO;
    }catch(_){ return todayISO; }
  }

  function findAuditForBlock(dayIdx, block){
    try{
      if(!Store.getWeekAudit || !Store.getAudit) return null;
      const weekStartISO = currentWeekStartMondayISO();
      const teamId = me.teamId || '';
      const list = Store.getWeekAudit(teamId, weekStartISO) || [];
      if(!list.length) return null;
      const start = String(block.start||'');
      const end = String(block.end||'');
      const day = UI.DAYS ? UI.DAYS[dayIdx] : String(dayIdx);
      const needle1 = `${start}-${end}`;
      const needle2 = `${day}`;
      // Find the most recent audit entry that likely corresponds to this block.
      const hit = list.find(a=>a && a.targetId===me.id && String(a.detail||'').includes(needle1) && String(a.detail||'').includes(needle2));
      if(hit) return hit;
      // Secondary: match start-end only
      const hit2 = list.find(a=>a && a.targetId===me.id && String(a.detail||'').includes(needle1));
      return hit2 || null;
    }catch(_){ return null; }
  }

  // Read blocks
  function getBlocks(dayIdx){
    try{
      return (Store.getUserDayBlocks && me.id!=null) ? (Store.getUserDayBlocks(me.id, dayIdx)||[]) : [];
    }catch(_){ return []; }
  }

  function normalizeBlock(b){
    const o = Object.assign({}, b||{});
    o.start = String(o.start||'00:00');
    o.end = String(o.end||'00:00');
    o.schedule = String(o.schedule||o.role||o.label||'');
    o.notes = (o.notes==null) ? '' : String(o.notes);
    return o;
  }

  // Render (idempotent)
  let selectedDay = todayWD;
  let interval = null;
  let storeListener = null;

  function computeNowParts(){
    return (UI.manilaNow ? UI.manilaNow() : { hh:new Date().getHours(), mm:new Date().getMinutes(), isoDate: todayISO });
  }

  function computeTodaySummary(){
    const parts = computeNowParts();
    const nowMin = (UI.minutesOfDay ? UI.minutesOfDay(parts) : (parts.hh*60 + parts.mm));
    const dayIdx = (UI.weekdayFromISO ? UI.weekdayFromISO(parts.isoDate) : todayWD);
    const blocks = getBlocks(dayIdx).map(normalizeBlock).slice().sort((a,b)=>UI.parseHM(a.start)-UI.parseHM(b.start));

    const inBlock = (b)=>{
      const s = UI.parseHM(b.start);
      const e = UI.parseHM(b.end);
      if(e > s) return nowMin >= s && nowMin < e;
      return (nowMin >= s) || (nowMin < e);
    };

    const active = blocks.find(inBlock) || null;
    const after = blocks.filter(b=>UI.parseHM(b.start) > nowMin);
    const next = after.length ? after[0] : (blocks[0] || null);

    let countdownLabel = '—';
    try{
      const nowMs = (UI.parseManilaDateTimeLocal ? UI.parseManilaDateTimeLocal(parts.iso || (parts.isoDate+'T'+pad2(parts.hh)+':'+pad2(parts.mm)+':'+pad2(parts.ss||0))) : 0) || Date.now();

      const fmt = (sec)=> (UI.formatDuration ? UI.formatDuration(sec) : `${Math.round(sec/60)}m`);

      if(active){
        const sM = UI.parseHM(active.start);
        const eM = UI.parseHM(active.end);
        const wrap = eM <= sM;
        let endDate = parts.isoDate;
        if(wrap && nowMin >= sM) endDate = addDaysISO(parts.isoDate, 1);
        // If we are in the post-midnight segment of a wrap block, endDate stays today.
        const endMs = (UI.parseManilaDateTimeLocal ? UI.parseManilaDateTimeLocal(`${endDate}T${active.end}`) : 0) || nowMs;
        const leftSec = Math.max(0, Math.floor((endMs - nowMs)/1000));
        countdownLabel = `Ends in ${fmt(leftSec)}`;
      }else if(next){
        const startM = UI.parseHM(next.start);
        let startDate = parts.isoDate;
        if(startM < nowMin) startDate = addDaysISO(parts.isoDate, 1);
        const startMs = (UI.parseManilaDateTimeLocal ? UI.parseManilaDateTimeLocal(`${startDate}T${next.start}`) : 0) || nowMs;
        const leftSec = Math.max(0, Math.floor((startMs - nowMs)/1000));
        countdownLabel = `Starts in ${fmt(leftSec)}`;
      }
    }catch(_){ }

    return { parts, dayIdx, blocks, active, next, countdownLabel };
  }

  function blockPill(b){
    const id = b.schedule || b.role || '';
      const color = taskColor(id) || '';
    const label = taskLabel(id);
    const icon = taskIcon(id);
    return `<span class="mysx-pill">${UI.esc(icon)} ${UI.esc(label||'Block')}</span>`;
  }

  function render(){
    const now = computeNowParts();
    const today = computeTodaySummary();
    const sc = shiftColor(me.teamId);

    const week = Array.from({length:7}, (_,d)=>{
      const iso = isoForDay(d);
      const blocks = getBlocks(d).map(normalizeBlock).slice().sort((a,b)=>UI.parseHM(a.start)-UI.parseHM(b.start));
      return { dayIdx:d, iso, dayLabel:(UI.DAYS?UI.DAYS[d]:String(d)), blocks };
    });

    const localNote = (localTZ && localTZ !== tzManila) ? `Local time (${UI.esc(localTZ)}) shown alongside Manila.` : `Times shown in Manila.`;

    // KPI values
    const totalWeekBlocks = week.reduce((n,d)=>n + d.blocks.length, 0);
    const todayBlocks = week[todayWD] ? week[todayWD].blocks : [];

    const roleBadge = `<span class="ux-chip"><span class="dot"></span>${UI.esc(role||'')}${teamLabel ? ` • ${UI.esc(teamLabel)}` : ''}</span>`;

    root.innerHTML = `
      <div class="mysx">
        <div class="mysx-header">
          <div class="mysx-title">
            <div class="ux-h1">My Schedule</div>
            <div class="small muted">${UI.esc(todayISO)} • ${UI.esc(UI.DAYS ? UI.DAYS[todayWD] : '')} • ${UI.esc(localNote)}</div>
          </div>
          <div class="ux-row" style="justify-content:flex-end">
            ${roleBadge}
            <a class="btn" href="/my_attendance">Attendance</a>
            <a class="btn" href="/mailbox">Mailbox</a>
          </div>
        </div>

        <div class="mysx-kpis">
          <div class="mysx-kpi">
            <div class="small muted">Shift</div>
            <div class="big">${UI.esc(teamLabel||'—')}</div>
            <div class="small muted">${UI.esc(team ? (team.teamStart||'') : '')}–${UI.esc(team ? (team.teamEnd||'') : '')}</div>
          </div>

          <div class="mysx-kpi">
            <div class="small muted">Today</div>
            <div class="big">${todayBlocks.length} block${todayBlocks.length===1?'':'s'}</div>
            <div class="small muted">${today.active ? `Active: ${UI.esc(taskLabel(today.active.schedule||''))}` : (todayBlocks.length ? 'No active block' : 'No blocks')}</div>
          </div>

          <div class="mysx-kpi">
            <div class="small muted">Countdown</div>
            <div class="big" id="mysxCountdown">${UI.esc(today.countdownLabel)}</div>
            <div class="small muted">Auto-updates in real time</div>
          </div>

          <div class="mysx-kpi">
            <div class="small muted">This week</div>
            <div class="big">${totalWeekBlocks} total</div>
            <div class="small muted">${UI.esc(weekStartSunISO)} → ${UI.esc(isoForDay(6))}</div>
          </div>
        </div>

        <div class="mysx-sections">
          <div class="mysx-cal" aria-label="Weekly schedule calendar">
            <div class="mysx-cal-head">
              <div>
                <div class="mysx-section-title">Weekly Calendar</div>
                <div class="small muted">Drag to reschedule ${canEditSelf ? '(your blocks only)' : '(view-only)'} • Hover a block for details</div>
              </div>
              <div class="ux-row" style="justify-content:flex-end">
                <div class="small muted">Focus day</div>
                <div class="mysx-cal-tabs" id="mysxTabs">
                  ${week.map(d=>{
                    const active = (d.dayIdx===selectedDay) ? 'active' : '';
                    const dot = d.blocks.length ? '<span class="dot" aria-hidden="true"></span>' : '';
                    return `<button class="mysx-tab ${active}" type="button" data-day="${d.dayIdx}" aria-label="${UI.esc(d.dayLabel)}">${UI.esc(d.dayLabel.slice(0,3))}${dot}</button>`;
                  }).join('')}
                </div>
              </div>
            </div>

            <div class="mysx-cal-grid" id="mysxCal" data-shift="${UI.esc(sc)}" aria-label="Shift calendar grid">
              <div class="mysx-ruler" aria-hidden="true">
                ${renderRuler(team)}
              </div>

              <div class="mysx-days" id="mysxDays" aria-label="Day columns">
                ${week.map(d=>renderDayColumn(d, team, canEditSelf)).join('')}
              </div>
            </div>

            <div class="mysx-cal-foot">
              <div class="small muted">Tip: On mobile, swipe left/right on the calendar to change focus day.</div>
              <div class="ux-row" style="justify-content:flex-end">
                <a class="btn" href="/master_schedule">Master Schedule</a>
                ${canEditSelf ? '<a class="btn" href="/members">Edit Team Schedules</a>' : ''}
              </div>
            </div>
          </div>

          <div class="ux-card pad" aria-label="Today details">
            <div class="mysx-section-title">Today</div>
            <div class="small muted" style="margin-top:6px">${UI.esc(UI.DAYS ? UI.DAYS[today.dayIdx] : '')} • ${UI.esc(today.parts.isoDate||todayISO)} (Manila)</div>

            <div class="mysx-today" style="margin-top:12px">
              ${renderTodayTimeline(today, canEditSelf)}
            </div>

            <details class="mysx-details" style="margin-top:12px">
              <summary class="mysx-summary">Audit trail (best-effort)</summary>
              <div class="small muted" style="margin-top:10px">Shows the latest schedule audit events recorded for this week (Team Lead actions).</div>
              <div style="margin-top:10px">${renderAuditList(today.dayIdx)}</div>
            </details>

          </div>
        </div>

        <div id="mysxTooltip" class="mysx-tooltip" role="tooltip" aria-hidden="true"></div>
      </div>
    `;

    bindTabs();
    bindCalendarInteractions();
    bindSwipe();
    startCountdownLoop();
  }

  function renderRuler(team){
    // Ruler ticks along the team shift.
    try{
      if(!team || !UI.shiftMeta) return '<div class="small muted" style="padding:12px">—</div>';
      const meta = UI.shiftMeta(team);
      const ticks = [];
      const step = 60; // 1 hour
      for(let m=0; m<=meta.length; m+=step){
        const mins = (meta.start + m) % (24*60);
        ticks.push(`<div class="mysx-tick" style="top:${(m/meta.length)*100}%"><span>${UI.esc(hm(mins))}</span></div>`);
      }
      return ticks.join('');
    }catch(_){
      return '';
    }
  }

  function renderDayColumn(dayModel, team, editable){
    const d = dayModel;
    const isFocus = (d.dayIdx === selectedDay);
    const focusCls = isFocus ? 'focus' : '';
    const aria = `${d.dayLabel} column`;

    const blocksHtml = d.blocks.map((b, idx)=>{
      const style = blockStyle(team || {id: me.teamId}, b);
      const id = b.schedule || b.role || '';
      const color = taskColor(id) || '';
      const local = manilaHMtoLocal(d.iso, b.start, b.end);
      const audit = findAuditForBlock(d.dayIdx, b);
      const auditLine = audit ? `Assigned by ${audit.actorName||'—'} • ${formatTs(audit.ts)}` : '';

      const tooltip = `${taskLabel(id)}\n${b.start}–${b.end} (Manila)\n${local ? (local+' ('+localTZ+')') : ''}${auditLine ? ('\n'+auditLine) : ''}${b.notes ? ('\nNotes: '+b.notes) : ''}`;

      return `
        <div
          class="mysx-block schedule-block shift-${shiftColor(me.teamId)} ${editable?'drag':''}"
          style="--task-color:${UI.esc(color)};top:${style.top}%;height:${style.height}%;"
          role="button"
          tabindex="0"
          data-day="${d.dayIdx}"
          data-idx="${idx}"
          data-start="${UI.esc(b.start)}"
          data-end="${UI.esc(b.end)}"
          data-schedule="${UI.esc(id)}"
          aria-label="${UI.esc(taskLabel(id))} ${UI.esc(b.start)} to ${UI.esc(b.end)}"
          ${editable ? 'draggable="true"' : ''}
          title="${UI.esc(tooltip)}"
        >
          <div class="mysx-block-top">
            <div class="mysx-block-name"><span class="task-color" style="background:${UI.esc(color)}"></span><span class="task-label">${UI.esc(taskLabel(id)||'Block')}</span></div>
            <div class="mysx-block-time">${UI.esc(b.start)}–${UI.esc(b.end)}</div>
          </div>
          <div class="mysx-block-sub">${local ? `<span class="mysx-local">${UI.esc(local)} <span class="mysx-tz">${UI.esc(localTZ)}</span></span>` : `<span class="mysx-local muted">${UI.esc(tzManila)}</span>`}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="mysx-day ${focusCls}" data-day="${d.dayIdx}" aria-label="${UI.esc(aria)}">
        <div class="mysx-day-head">
          <div class="mysx-day-name">${UI.esc(d.dayLabel.slice(0,3))}</div>
          <div class="mysx-day-date">${UI.esc(d.iso)}</div>
        </div>
        <div class="mysx-day-body" data-daybody="${d.dayIdx}">
          ${blocksHtml || '<div class="mysx-empty small muted">—</div>'}
        </div>
      </div>
    `;
  }

  function blockMetrics(teamObj, b){
    const meta = (UI.shiftMeta && teamObj) ? UI.shiftMeta(teamObj) : { start:0, length:24*60, wraps:false };
    // Use shift-relative offsets so blocks align with the rendered ruler (shift hours), not 24h clock.
    let startOff = 0;
    let endOff = 0;
    try{
      startOff = UI.offsetFromShiftStart ? UI.offsetFromShiftStart(teamObj, b.start) : UI.parseHM(b.start);
      endOff = UI.offsetFromShiftStart ? UI.offsetFromShiftStart(teamObj, b.end) : UI.parseHM(b.end);
    }catch(_){
      startOff = UI.parseHM(b.start);
      endOff = UI.parseHM(b.end);
    }
    startOff = clamp(startOff, 0, meta.length);
    endOff = clamp(endOff, 0, meta.length);
    let dur = endOff - startOff;
    // Safety: never render negative/zero blocks; keep minimum visible height.
    if(dur <= 0) dur = Math.min(15, meta.length);

    const topPct = Math.round((startOff/(meta.length||1))*10000)/100;
    const hPct = Math.max(3.5, Math.round((dur/(meta.length||1))*10000)/100);
    return { startOff, endOff, dur, topPct, hPct, meta };
  }

  function blockStyle(teamObj, b){
    const m = blockMetrics(teamObj, b);
    return { top: m.topPct, height: m.hPct };
  }

  function clamp(n, a, b){ return Math.max(a, Math.min(b, Number(n)||0)); }

  function formatTs(ts){
    try{
      return new Date(Number(ts||0)).toLocaleString('en-CA', { timeZone: tzManila, month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false });
    }catch(_){ return ''; }
  }

  function renderTodayTimeline(today, editable){
    const blocks = today.blocks || [];
    if(!blocks.length){
      return `<div class="mysx-emptycard">
        <div class="mysx-emptytitle">No schedule blocks for today</div>
        <div class="small muted">If this looks wrong, contact your Team Lead or check Master Schedule.</div>
      </div>`;
    }

    return `<div class="mysx-timeline">
      ${blocks.map(b=>{
        const active = today.active && (b.start===today.active.start) && (b.end===today.active.end) && (b.schedule===today.active.schedule);
        const cls = active ? 'active' : '';
        const id = b.schedule || '';
        const local = manilaHMtoLocal(today.parts.isoDate, b.start, b.end);
        const audit = findAuditForBlock(today.dayIdx, b);
        return `
          <div class="mysx-tl ${cls}">
            <div class="mysx-tl-left">
              <div class="mysx-tl-time">${UI.esc(b.start)}–${UI.esc(b.end)}</div>
              <div class="mysx-tl-task">${UI.esc(taskLabel(id)||'Block')} ${active ? '<span class="badge ok" style="margin-left:8px">Current</span>' : ''}</div>
              <div class="small muted">${local ? `Local: ${UI.esc(local)} (${UI.esc(localTZ)})` : ''}</div>
              ${audit ? `<div class="small muted">Assigned by ${UI.esc(audit.actorName||'—')} • ${UI.esc(formatTs(audit.ts))}</div>` : ''}
              ${b.notes ? `<div class="small" style="margin-top:6px">${UI.esc(b.notes)}</div>` : ''}
            </div>
            <div class="mysx-tl-right">
              ${blockPill(b)}
            </div>
          </div>
        `;
      }).join('')}
    </div>`;
  }

  function renderAuditList(dayIdx){
    try{
      const weekStartISO = currentWeekStartMondayISO();
      const list = Store.getWeekAudit ? (Store.getWeekAudit(me.teamId||'', weekStartISO)||[]) : [];
      const mine = list.filter(a=>a && a.targetId===me.id).slice(0, 20);
      if(!mine.length) return `<div class="small muted">No audit entries recorded for your schedule yet this week.</div>`;
      return `<div class="mysx-audit">
        ${mine.map(a=>{
          return `<div class="mysx-audit-row">
            <div class="mysx-audit-main">
              <div class="mysx-audit-action">${UI.esc(a.action||'')}</div>
              <div class="small muted">${UI.esc(a.detail||'')}</div>
              <div class="small muted">Actor: ${UI.esc(a.actorName||'—')}</div>
            </div>
            <div class="mysx-audit-ts small muted">${UI.esc(formatTs(a.ts))}</div>
          </div>`;
        }).join('')}
      </div>`;
    }catch(_){
      return `<div class="small muted">Audit unavailable.</div>`;
    }
  }

  function bindTabs(){
    const tabs = root.querySelector('#mysxTabs');
    if(!tabs) return;
    tabs.querySelectorAll('button.mysx-tab').forEach(btn=>{
      btn.onclick = ()=>{
        selectedDay = Number(btn.dataset.day||0);
        render();
      };
    });
  }

  function bindCalendarInteractions(){
    const cal = root.querySelector('#mysxCal');
    if(!cal) return;

    // Tooltip (richer than title): show same content near cursor.
    const tip = root.querySelector('#mysxTooltip');
    const showTip = (ev, text)=>{
      if(!tip) return;
      tip.textContent = text;
      tip.setAttribute('aria-hidden','false');
      tip.style.opacity = '1';
      const x = (ev && (ev.clientX||0)) + 12;
      const y = (ev && (ev.clientY||0)) + 12;
      tip.style.left = x+'px';
      tip.style.top = y+'px';
    };
    const hideTip = ()=>{
      if(!tip) return;
      tip.setAttribute('aria-hidden','true');
      tip.style.opacity = '0';
    };

    cal.querySelectorAll('.mysx-block').forEach(el=>{
      el.addEventListener('mouseenter', (ev)=>{ try{ showTip(ev, el.getAttribute('title')||''); }catch(_){ } });
      el.addEventListener('mousemove', (ev)=>{ try{ showTip(ev, el.getAttribute('title')||''); }catch(_){ } });
      el.addEventListener('mouseleave', ()=>{ hideTip(); });
      el.addEventListener('focus', (ev)=>{ try{ showTip(ev, el.getAttribute('title')||''); }catch(_){ } });
      el.addEventListener('blur', ()=>{ hideTip(); });
    });

    if(!canEditSelf) return;

    // Drag and drop reschedule (self only)
    let drag = null;

    cal.querySelectorAll('.mysx-block[draggable="true"]').forEach(el=>{
      el.addEventListener('dragstart', (ev)=>{
        try{
          drag = {
            fromDay: Number(el.dataset.day||0),
            idx: Number(el.dataset.idx||0),
          };
          ev.dataTransfer.setData('text/plain', JSON.stringify(drag));
          ev.dataTransfer.effectAllowed = 'move';
        }catch(_){ }
      });
    });

    cal.querySelectorAll('.mysx-day-body').forEach(body=>{
      body.addEventListener('dragover', (ev)=>{
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
      });
      body.addEventListener('drop', async (ev)=>{
        ev.preventDefault();
        try{
          const data = JSON.parse(ev.dataTransfer.getData('text/plain')||'{}');
          const toDay = Number(body.closest('.mysx-day')?.dataset.day||0);
          if(data.fromDay==null || data.idx==null) return;
          if(Number.isNaN(toDay)) return;

          // Compute new time based on drop Y within the shift column.
          const rect = body.getBoundingClientRect();
          const rel = clamp((ev.clientY - rect.top) / Math.max(1, rect.height), 0, 1);

          const teamObj = team;
          const meta = (teamObj && UI.shiftMeta) ? UI.shiftMeta(teamObj) : { start:0, length:24*60 };
          const minutesFromShiftStart = Math.round(rel * meta.length);
          const snapped = UI.snapMinutes ? UI.snapMinutes(minutesFromShiftStart, 60) : (Math.round(minutesFromShiftStart/60)*60);

          const fromBlocks = getBlocks(data.fromDay).map(normalizeBlock);
          const moving = fromBlocks[data.idx];
          if(!moving) return;

          const dur = (()=>{
            const s = UI.parseHM(moving.start);
            const e = UI.parseHM(moving.end);
            const wrap = e <= s;
            return wrap ? ((24*60 - s) + e) : (e - s);
          })();

          const newStartMin = (meta.start + snapped) % (24*60);
          const newEndMin = (newStartMin + dur) % (24*60);

          const nextBlock = Object.assign({}, moving, { start: hm(newStartMin), end: hm(newEndMin) });

          const ok = await UI.confirm({
            title:'Reschedule block',
            message:`Move "${taskLabel(nextBlock.schedule)}" to ${UI.DAYS[toDay]} at ${nextBlock.start}–${nextBlock.end} (Manila)?`,
            okText:'Move',
            cancelText:'Cancel'
          });
          if(!ok) return;

          // Apply
          fromBlocks.splice(data.idx, 1);
          const toBlocks = getBlocks(toDay).map(normalizeBlock);
          toBlocks.push(nextBlock);
          toBlocks.sort((a,b)=>UI.parseHM(a.start)-UI.parseHM(b.start));

          if(Store.setUserDayBlocks){
            Store.setUserDayBlocks(me.id, me.teamId, data.fromDay, fromBlocks);
            Store.setUserDayBlocks(me.id, me.teamId, toDay, toBlocks);
          }

          // Audit
          try{
            if(Store.addAudit){
              const weekStartISO = currentWeekStartMondayISO();
              Store.addAudit({
                id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('a-'+Date.now()+Math.random().toString(16).slice(2)),
                ts: Date.now(),
                teamId: me.teamId || '',
                weekStartISO,
                actorId: me.id,
                actorName: me.name||me.username||'User',
                action: 'MY_SCHEDULE_DRAG',
                targetId: me.id,
                targetName: me.name||me.username||'User',
                detail: `${UI.DAYS[data.fromDay]} ${moving.start}-${moving.end} → ${UI.DAYS[toDay]} ${nextBlock.start}-${nextBlock.end}`
              });
            }
          }catch(_){ }

          // Re-render
          selectedDay = toDay;
          render();
        }catch(e){
          try{ console.error(e); }catch(_){ }
          try{ UI.toast && UI.toast('Could not reschedule block.'); }catch(_){ }
        }
      });
    });
  }

  function bindSwipe(){
    const cal = root.querySelector('#mysxCal');
    if(!cal) return;
    let startX = null;
    let startY = null;

    cal.addEventListener('touchstart', (ev)=>{
      const t = ev.touches && ev.touches[0];
      if(!t) return;
      startX = t.clientX; startY = t.clientY;
    }, { passive:true });

    cal.addEventListener('touchend', (ev)=>{
      if(startX==null) return;
      const t = ev.changedTouches && ev.changedTouches[0];
      if(!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      startX = null; startY = null;
      if(Math.abs(dx) < 50) return;
      if(Math.abs(dy) > 60) return;
      // Swipe left/right changes focus day
      if(dx < 0) selectedDay = (selectedDay + 1) % 7;
      else selectedDay = (selectedDay + 6) % 7;
      render();
    }, { passive:true });
  }

  function startCountdownLoop(){
    try{ if(interval) clearInterval(interval); }catch(_){ }
    interval = setInterval(()=>{
      try{
        const el = root.querySelector('#mysxCountdown');
        if(!el) return;
        const today = computeTodaySummary();
        el.textContent = today.countdownLabel;
      }catch(_){ }
    }, 1000);
  }

  // Subscribe to realtime store events so schedule stays consistent.
  function bindStore(){
    try{ if(storeListener) window.removeEventListener('mums:store', storeListener); }catch(_){ }
    let raf = null;
    storeListener = (ev)=>{
      try{
        const key = String(ev?.detail?.key||'');
        // Re-render on schedule, tasks, audit, or team config changes.
        if(key==='*' || key.includes('weekly') || key.includes('team_config') || key.includes('ums_audit') || key.includes('ums_schedule_notifs') || key.includes('mums_mailbox')){
          if(raf) cancelAnimationFrame(raf);
          raf = requestAnimationFrame(()=>{ try{ render(); }catch(_){ } });
        }
      }catch(_){ }
    };
    window.addEventListener('mums:store', storeListener);
  }

  // Initial mount
  try{
    render();
    bindStore();
  }catch(err){
    try{ console.error(err); }catch(_){ }
    root.innerHTML = `<div class="card pad"><div class="h1">My Schedule</div><div class="muted">Failed to render schedule. Please reload.</div></div>`;
  }

  // Cleanup on route swap
  try{
    const prev = root._cleanup;
    root._cleanup = ()=>{
      try{ if(prev) prev(); }catch(_){ }
      try{ if(interval) clearInterval(interval); }catch(_){ }
      try{ interval = null; }catch(_){ }
      try{ if(storeListener) window.removeEventListener('mums:store', storeListener); }catch(_){ }
      try{ storeListener = null; }catch(_){ }
    };
  }catch(_){ }
});
