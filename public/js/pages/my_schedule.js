(window.Pages=window.Pages||{}, window.Pages.my_schedule = function(root){
  const me = (window.Auth && Auth.getUser) ? (Auth.getUser()||{}) : {};
  const isSuper = String(me.role||'')===String(window.Config?.ROLES?.SUPER_ADMIN||'SUPER_ADMIN');

  const now = UI.manilaNow();
  const today = UI.manilaNowDate();
  const todayIdx = today.getDay();

  const team = (window.Config && Config.teamById) ? Config.teamById(me.teamId) : { id:me.teamId, label:me.teamId, teamStart:'', teamEnd:'', dutyStart:'', dutyEnd:'' };

  const weekly = (window.Store && Store.getWeekly) ? (Store.getWeekly()||{}) : {};
  const u = weekly[me.id] || {};
  const getBlocks = (dayIdx)=>{
    try{ return (window.Store && Store.getUserDayBlocks) ? (Store.getUserDayBlocks(me.id, dayIdx)||[]) : (((u.days||{})[String(dayIdx)])||[]); }
    catch(_){ return []; }
  };

  const tasks = (window.Store && Store.getTeamTasks) ? Store.getTeamTasks(me.teamId) : [];
  const taskLabel = (id)=>{
    const t = tasks.find(x=>x && x.id===id);
    return (t && t.label) ? t.label : (id||'');
  };

  const fmt = (ms)=>{
    try{
      return new Date(Number(ms||0)).toLocaleString('en-CA', { year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' });
    }catch(_){ return ''; }
  };

  const toMin = (hhmm)=>{
    const s = String(hhmm||'').trim();
    const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s);
    if(!m) return null;
    return (Number(m[1])*60) + Number(m[2]);
  };

  const nowMin = (Number(now.hh||0) * 60) + Number(now.mm||0);
  const shiftStart = toMin(team.teamStart);
  const shiftEnd = toMin(team.teamEnd);

  const inShift = ()=>{
    if(shiftStart===null || shiftEnd===null) return false;
    if(shiftStart === shiftEnd) return true;
    if(shiftStart < shiftEnd) return (nowMin >= shiftStart && nowMin < shiftEnd);
    // overnight
    return (nowMin >= shiftStart || nowMin < shiftEnd);
  };

  const blocksToday = getBlocks(todayIdx).slice().sort((a,b)=>(toMin(a.start)||0)-(toMin(b.start)||0));
  const nextBlock = ()=>{
    for(const b of blocksToday){
      const s = toMin(b.start);
      const e = toMin(b.end);
      if(s===null || e===null) continue;
      // current or upcoming
      if(nowMin <= e) return b;
    }
    return null;
  };

  const attendance = (window.Store && Store.getUserAttendance) ? (Store.getUserAttendance(me.id)||[]) : [];
  attendance.sort((a,b)=>(b.ts||0)-(a.ts||0));
  const last = attendance[0];

  // Build a week model for an enterprise-style view.
  const week = Array.from({length:7}, (_,d)=>{
    const blocks = getBlocks(d).slice().sort((a,b)=>(toMin(a.start)||0)-(toMin(b.start)||0));
    const first = blocks[0];
    const lastB = blocks[blocks.length-1];
    return {
      dayIdx: d,
      dayLabel: UI.DAYS[d] || String(d),
      blocks,
      count: blocks.length,
      range: (first && lastB) ? `${first.start||''}–${lastB.end||''}` : '—',
    };
  });

  // UI
  const statusBadge = isSuper ? '<span class="badge muted">All Teams</span>'
    : (inShift() ? '<span class="badge ok">On shift</span>' : '<span class="badge muted">Off shift</span>');

  const renderTimeline = ()=>{
    if(!blocksToday.length){
      return `<div class="mys-empty">
        <div class="mys-empty-title">No schedule blocks for today</div>
        <div class="small muted">If this looks incorrect, contact your Team Lead or check Master Schedule.</div>
      </div>`;
    }
    return `<div class="mys-timeline">
      ${blocksToday.map(b=>{
        const s = toMin(b.start);
        const e = toMin(b.end);
        const isPast = (e!==null && nowMin > e);
        const isNow = (s!==null && e!==null && nowMin >= s && nowMin <= e);
        const cls = isNow ? 'now' : (isPast ? 'past' : 'up');
        return `
          <div class="mys-item ${cls}">
            <div class="mys-dot" aria-hidden="true"></div>
            <div class="mys-item-main">
              <div class="mys-item-top">
                <div class="mys-time">${UI.esc((b.start||'') + ' – ' + (b.end||''))}</div>
                ${isNow ? '<span class="badge ok">Current</span>' : (isPast ? '<span class="badge muted">Completed</span>' : '<span class="badge warn">Upcoming</span>')}
              </div>
              <div class="mys-task">${UI.esc(taskLabel(b.schedule||b.label||''))}</div>
              ${b.notes ? `<div class="small muted">${UI.esc(b.notes)}</div>` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>`;
  };

  const renderWeek = ()=>{
    return `
      <div class="card pad mys-week">
        <div class="row" style="justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
          <div>
            <div class="mys-card-title">This Week</div>
            <div class="small muted">Overview of your assigned schedule blocks (Sun–Sat).</div>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <a class="btn" href="#master_schedule">View Master Schedule</a>
          </div>
        </div>

        <div class="mys-week-grid">
          ${week.map(d=>{
            const isToday = d.dayIdx===todayIdx;
            const pill = d.count ? `<span class="badge ok">${d.count} block${d.count>1?'s':''}</span>` : `<span class="badge muted">0 blocks</span>`;
            const topLine = d.count ? UI.esc(d.range) : '—';
            return `
              <div class="mys-week-card ${isToday?'today':''}">
                <div class="mys-week-head">
                  <div class="mys-week-day">${UI.esc(d.dayLabel)}</div>
                  ${pill}
                </div>
                <div class="mys-week-range">${topLine}</div>
                <div class="mys-week-list">
                  ${(d.blocks.slice(0,3)).map(b=>`<div class="mys-week-row"><span class="mys-week-time">${UI.esc((b.start||'') + '–' + (b.end||''))}</span><span class="mys-week-task">${UI.esc(taskLabel(b.schedule||b.label||''))}</span></div>`).join('')}
                  ${d.blocks.length>3 ? `<div class="small muted" style="margin-top:8px">+ ${d.blocks.length-3} more</div>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  };

  const nb = nextBlock();
  const nextUp = nb ? `
    <div class="mys-kpi">
      <div class="small muted">Next up</div>
      <div class="mys-kpi-main">${UI.esc(taskLabel(nb.schedule||nb.label||''))}</div>
      <div class="small muted">${UI.esc((nb.start||'') + ' – ' + (nb.end||''))}</div>
    </div>
  ` : `
    <div class="mys-kpi">
      <div class="small muted">Next up</div>
      <div class="mys-kpi-main">—</div>
      <div class="small muted">No more blocks today</div>
    </div>
  `;

  root.innerHTML = `
    <div class="mys-header">
      <div>
        <div class="mys-title">My Schedule</div>
        <div class="small muted">${UI.esc(now.isoDate)} • ${UI.esc(UI.DAYS[todayIdx]||'')}</div>
      </div>
      <div class="row" style="gap:10px;flex-wrap:wrap;justify-content:flex-end">
        ${statusBadge}
        <a class="btn" href="#my_attendance">My Attendance</a>
      </div>
    </div>

    <div class="mys-kpis">
      <div class="card pad mys-kpi-card">
        <div class="small muted">Team</div>
        <div class="mys-kpi-main">${UI.esc(isSuper ? 'All Teams' : (team.label||team.id||'—'))}</div>
        <div class="small muted">${isSuper ? 'Full visibility' : UI.esc((team.teamStart||'') + '–' + (team.teamEnd||''))}</div>
      </div>
      <div class="card pad mys-kpi-card">
        <div class="small muted">Today</div>
        <div class="mys-kpi-main">${blocksToday.length} block${blocksToday.length!==1?'s':''}</div>
        <div class="small muted">${blocksToday.length ? UI.esc(blocksToday[0].start + '–' + blocksToday[blocksToday.length-1].end) : '—'}</div>
      </div>
      <div class="card pad mys-kpi-card">
        ${nextUp}
      </div>
      <div class="card pad mys-kpi-card">
        <div class="small muted">Latest attendance</div>
        <div class="mys-kpi-main">${last ? UI.esc(last.mode||'') : '—'}</div>
        <div class="small muted">${last ? UI.esc(fmt(last.ts)) : 'No attendance record yet'}</div>
      </div>
    </div>

    <div class="grid2" style="margin-top:10px">
      <div class="card pad">
        <div class="row" style="justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
          <div>
            <div class="mys-card-title">Today</div>
            <div class="small muted">Your assigned blocks for the current day.</div>
          </div>
          <div class="small muted">${UI.esc(isSuper ? '—' : ('Shift key: ' + (me.teamId||'' ) + '|' + now.isoDate + 'T' + String(team.teamStart||'').trim()))}</div>
        </div>
        <div style="margin-top:12px">
          ${renderTimeline()}
        </div>
      </div>

      <div class="card pad">
        <div class="mys-card-title">Attendance details</div>
        <div class="small muted">Latest recorded work mode and reason.</div>
        <div style="margin-top:12px">
          ${last ? `
            <div class="kv"><div class="small muted">Recorded at</div><div>${UI.esc(fmt(last.ts))}</div></div>
            <div class="kv"><div class="small muted">Mode</div><div><span class="badge ${last.mode==='WFH'?'warn':'ok'}">${UI.esc(last.mode||'')}</span></div></div>
            <div class="kv"><div class="small muted">Reason</div><div class="small">${UI.esc(last.reason||'—')}</div></div>
            <div class="kv"><div class="small muted">Shift Key</div><div class="small muted">${UI.esc(last.shiftKey||'')}</div></div>
          ` : `
            <div class="mys-empty">
              <div class="mys-empty-title">No attendance record found yet</div>
              <div class="small muted">When you submit attendance, the latest entry will appear here automatically.</div>
              <div style="margin-top:12px"><a class="btn primary" href="#my_attendance">Go to Attendance</a></div>
            </div>
          `}
        </div>
      </div>
    </div>

    ${renderWeek()}
  `;
});
