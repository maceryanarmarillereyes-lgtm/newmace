(window.Pages = window.Pages || {}, window.Pages.overall_stats = function(root){
  const me = (window.Auth && Auth.getUser) ? (Auth.getUser() || {}) : {};
  const canView = (window.Config && Config.can) ? Config.can(me, 'view_members') : false;
  if(!canView){
    root.innerHTML = '<div class="h1">OVER ALL STATS</div><div class="muted">You do not have access to this page.</div>';
    return;
  }

  const isLead = me.role === (Config && Config.ROLES ? Config.ROLES.TEAM_LEAD : 'TEAM_LEAD');
  const isAdmin = me.role === (Config && Config.ROLES ? Config.ROLES.ADMIN : 'ADMIN');
  const isSuper = me.role === (Config && Config.ROLES ? Config.ROLES.SUPER_ADMIN : 'SUPER_ADMIN');
  const teams = (Config && Config.TEAMS) ? Config.TEAMS.slice() : [];
  const pilotKey = 'mums_pilot_overall_stats';
  const storedPilot = localStorage.getItem(pilotKey);
  let pilotEnabled = !isLead || (storedPilot === null ? true : storedPilot === '1');
  let selectedTeamId = isLead ? me.teamId : ((teams[0] && teams[0].id) || '');
  let activePreset = 'current_week';
  let dateRange = presetRange(activePreset);
  let sortBy = 'name';
  let sortDir = 'asc';
  let searchQuery = '';
  let pageSize = 10;
  let pageOffset = 0;
  let loading = false;
  let lastResponse = null;

  function presetRange(preset){
    const today = UI.manilaTodayISO();
    const start = String(today || '').slice(0, 10);
    switch(preset){
      case 'previous_week': {
        const curStart = normalizeToMonday(today);
        return { start: UI.addDaysISO(curStart, -7), end: UI.addDaysISO(curStart, -1), label: 'Previous week' };
      }
      case 'last_month': {
        const d = new Date(`${today}T00:00:00Z`);
        const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
        const startISO = prev.toISOString().slice(0,10);
        const endISO = new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 0)).toISOString().slice(0,10);
        return { start: startISO, end: endISO, label: 'Last month' };
      }
      case 'this_month': {
        const d = new Date(`${today}T00:00:00Z`);
        const startISO = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0,10);
        const endISO = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0,10);
        return { start: startISO, end: endISO, label: 'This month' };
      }
      case 'last_30_days': {
        return { start: UI.addDaysISO(start, -29), end: start, label: 'Last 30 days' };
      }
      case 'last_7_days': {
        return { start: UI.addDaysISO(start, -6), end: start, label: 'Last 7 days' };
      }
      default: {
        const curStart = normalizeToMonday(today);
        return { start: curStart, end: UI.addDaysISO(curStart, 6), label: 'Current week' };
      }
    }
  }
  let selectedTeamId = isLead ? me.teamId : ((teams[0] && teams[0].id) || '');

  function normalizeToMonday(iso){
    const wd = UI.weekdayFromISO(String(iso||UI.manilaTodayISO()));
    if(wd == null) return iso;
    const delta = (wd === 0) ? -6 : (1 - wd);
    return UI.addDaysISO(String(iso||UI.manilaTodayISO()), delta);
  }

  function formatRangeLabel(range){
    if(!range) return 'Custom range';
    const fmt = (d)=>new Date(String(d||'')+'T00:00:00Z').toLocaleDateString('en-US', { month:'short', day:'2-digit', year:'numeric', timeZone: Config.TZ });
    return `${range.label || 'Custom range'} • ${fmt(range.start)}–${fmt(range.end)}`;
  }

  function formatDelta(value, prev){
    const delta = Number(value||0) - Number(prev||0);
    const sign = delta > 0 ? '+' : '';
    return `${sign}${Math.round(delta)}`;
  }

  function buildSparkline(values){
    const data = Array.isArray(values) ? values : [];
    if(!data.length) return '<span class="sparkline-empty">—</span>';
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const points = data.map((v,i)=>{
      const x = (i/(data.length-1 || 1)) * 100;
      const y = 100 - ((v - min) / (max - min || 1)) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
    return `<svg class="sparkline" viewBox="0 0 100 100" role="img" aria-label="Member workload trend">
      <polyline points="${points}" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>`;
  }

  function buildTrendChart(trends){
    const data = Array.isArray(trends) ? trends : [];
    if(!data.length) return '<div class="overall-trend-empty">No trend data</div>';
    const totals = data.map(d=>Number(d.totalHours||0));
    const max = Math.max(...totals, 1);
    const min = Math.min(...totals, 0);
    const points = totals.map((v,i)=>{
      const x = (i/(totals.length-1 || 1)) * 100;
      const y = 100 - ((v - min) / (max - min || 1)) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
    return `<svg class="overall-trend-chart" viewBox="0 0 100 100" role="img" aria-label="Total hours trend">
      <polyline points="${points}" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>`;
  }

  function buildCsv(rows){
    const header = ['Member','Mailbox Hours','Back Office Hours','Call Hours','Assigned Cases','Total Hours','Delta vs Previous'];
    const lines = [header.join(',')];
    (rows||[]).forEach(r=>{
      lines.push([
        `"${String(r.name||'').replace(/\"/g,'\"\"')}"`,
        r.mailboxH,
        r.backOfficeH,
        r.callH,
        r.caseCount,
        r.totalH,
        r.deltaTotal
      ].join(','));
    });
    return lines.join('\n');
  }

  function updatePilotState(enabled){
    pilotEnabled = !!enabled;
    localStorage.setItem(pilotKey, pilotEnabled ? '1' : '0');
    render();
  }

  async function fetchStats(){
    if(!pilotEnabled && isLead) return;
    loading = true;
    render();

    const params = new URLSearchParams();
    params.set('start_date', dateRange.start);
    params.set('end_date', dateRange.end);
    params.set('team_id', selectedTeamId || '');
    params.set('sort_by', sortBy);
    params.set('sort_dir', sortDir);
    params.set('search', searchQuery.trim());
    params.set('limit', String(pageSize));
    params.set('offset', String(pageOffset));
    params.set('preset', activePreset || 'custom');

    const headers = {};
    if(isLead) headers['x-mums-pilot'] = pilotEnabled ? 'overall_stats' : 'off';

    try{
      const res = await fetch(`/api/overall_stats?${params.toString()}`, { headers });
      const json = await res.json().catch(()=>({ ok:false }));
      if(!res.ok || !json.ok){
        throw new Error(json.error || 'Unable to load overall stats.');
      }
      lastResponse = json;
    }catch(e){
      lastResponse = { ok:false, error: e.message || String(e) };
    }finally{
      loading = false;
      render();
    }
  }

  function render(){
    const rangeLabel = formatRangeLabel(dateRange);
    const kpis = lastResponse && lastResponse.kpis ? lastResponse.kpis : null;
    const members = lastResponse && Array.isArray(lastResponse.members) ? lastResponse.members : [];
    const trends = lastResponse && Array.isArray(lastResponse.trends) ? lastResponse.trends : [];
    const meta = lastResponse && lastResponse.meta ? lastResponse.meta : {};
    const totalMembers = meta.total_members || members.length || 0;
    const page = Math.floor(pageOffset / pageSize) + 1;
    const totalPages = Math.max(1, Math.ceil(totalMembers / pageSize));

    if(isLead && !pilotEnabled){
      root.innerHTML = `
        <div class="overall-stats-page">
          <div class="ux-card pad overall-pilot-card">
            <div class="ux-h1">OVER ALL STATS (Pilot)</div>
            <div class="small muted">Enable the pilot toggle to access overall stats insights for your team.</div>
            <div class="overall-pilot-toggle">
              <label class="switch" aria-label="Enable Overall Stats pilot">
                <input type="checkbox" id="overallPilotToggle" />
                <span class="switch-ui"></span>
              </label>
              <span class="small">Pilot mode is disabled.</span>
            </div>
          </div>
        </div>
      `;
      const toggle = root.querySelector('#overallPilotToggle');
      if(toggle){
        toggle.addEventListener('change', ()=> updatePilotState(toggle.checked));
      }
      return;
    }
  const weekStartISO = normalizeToMonday(UI.manilaTodayISO());

  function isoForDay(dayIndex){
    const offset = Number(dayIndex) - 1;
    return UI.addDaysISO(weekStartISO, offset);
  }

  function isRestDay(teamId, userId, isoDate){
    const t = Store.getTeamMaster ? Store.getTeamMaster(teamId) : null;
    const m = t && t.members ? t.members[userId] : null;
    if(!m || !Array.isArray(m.restWeekdays) || !m.restWeekdays.length) return false;
    const wd = UI.weekdayFromISO(isoDate);
    if(wd == null) return false;
    return m.restWeekdays.includes(wd);
  }

  function getMembersForTeam(teamId){
    const users = Store.getUsers ? Store.getUsers() : [];
    return users.filter(u=>u.role === Config.ROLES.MEMBER && u.teamId === teamId)
      .sort((a,b)=>String(a.name||a.username).localeCompare(String(b.name||b.username)));
  }

  function leaveLabel(t){
    return ({
      SICK: 'On Sick Leave',
      EMERGENCY: 'On Emergency Leave',
      VACATION: 'On Vacation Leave',
      HOLIDAY: 'On Holiday Leave'
    }[t] || 'On Leave');
  }

  function weeklyStatsForMember(u, cases, weekStartMs){
    const totals = { mailbox:0, back:0, call:0 };
    let restDays = 0;
    for(let d=0; d<7; d++){
      const iso = isoForDay(d);
      if(isRestDay(u.teamId, u.id, iso)){
        restDays++;
        continue;
      }
      const bl = Store.getUserDayBlocks(u.id, d);
      const t = Config.teamById(u.teamId);
      for(const b of (bl||[])){
        const s = UI.offsetFromShiftStart(t, b.start);
        const e = UI.offsetFromShiftStart(t, b.end);
        const mins = Math.max(0, e - s);
        const r = b.role;
        if(r==='back_office') totals.back += mins;
        else if(r==='call_onqueue' || r==='call_available') totals.call += mins;
        else if(r==='mailbox_manager' || r==='mailbox_call') totals.mailbox += mins;
      }
    }
    const caseCount = cases.filter(c=>c.assigneeId===u.id && (c.createdAt||0) >= weekStartMs).length;
    return { totals, restDays, caseCount };
  }

  function render(){
    const team = Config.teamById(selectedTeamId) || {};
    const members = getMembersForTeam(selectedTeamId);
    const weekStartMs = UI.manilaWeekStartMondayMs();
    const cases = Store.getCases ? (Store.getCases() || []) : [];
    const todayISO = UI.manilaTodayISO();

    let totalMailbox = 0;
    let totalBack = 0;
    let totalCall = 0;
    let totalCases = 0;
    let restToday = 0;
    let leaveToday = 0;

    const rows = members.map(member=>{
      const stats = weeklyStatsForMember(member, cases, weekStartMs);
      totalMailbox += stats.totals.mailbox;
      totalBack += stats.totals.back;
      totalCall += stats.totals.call;
      totalCases += stats.caseCount;

      const leave = Store.getLeave ? Store.getLeave(member.id, todayISO) : null;
      const rest = isRestDay(member.teamId, member.id, todayISO);
      if(leave) leaveToday++;
      else if(rest) restToday++;

      let status = 'Active';
      if(leave) status = leaveLabel(leave.type);
      else if(rest) status = 'On Rest Day';

      return Object.assign({}, member, {
        mailboxH: Math.round(stats.totals.mailbox/60),
        backOfficeH: Math.round(stats.totals.back/60),
        callH: Math.round(stats.totals.call/60),
        caseCount: stats.caseCount,
        restDays: stats.restDays,
        status: status
      });
    });

    const formatHours = mins => `${Math.round(mins/60)}h`;
    const activeCount = Math.max(0, members.length - restToday - leaveToday);

    root.innerHTML = `
      <div class="overall-stats-page">
        <div class="overall-stats-header">
          <div>
            <div class="ux-h1">OVER ALL STATS</div>
            <div class="small muted">Unified visibility for member workload, services, and activity across the selected range.</div>
          </div>
          <div class="overall-stats-controls">
            <span class="ux-chip" aria-label="Active filter">${UI.esc(rangeLabel)}</span>
            ${isLead ? `
              <label class="overall-pilot-inline">
                <span class="small muted">Pilot</span>
                <span class="switch" aria-label="Toggle Overall Stats pilot">
                  <input type="checkbox" id="overallPilotInline" ${pilotEnabled ? 'checked' : ''} />
                  <span class="switch-ui"></span>
                </span>
              </label>
            ` : ''}
            <div class="small muted">Unified weekly visibility for member workload, services, and coverage.</div>
          </div>
          <div class="overall-stats-controls">
            <span class="ux-chip"><span class="dot"></span>Week of ${UI.esc(weekStartISO)}</span>
            ${(!isLead && (isAdmin || isSuper)) ? `
              <label class="overall-stats-team">
                <span class="small muted">Team</span>
                <select class="input" id="overallTeamSelect" aria-label="Select team">
                  ${teams.map(t=>`<option value="${UI.esc(t.id)}" ${t.id===selectedTeamId?'selected':''}>${UI.esc(t.label)}</option>`).join('')}
                </select>
              </label>
            ` : ''}
            <button class="btn" id="overallExportBtn" type="button">Export CSV</button>
          </div>
        </div>

        <div class="overall-filter-card ux-card pad" role="region" aria-label="Date filters">
          <div class="overall-filter-presets" role="group" aria-label="Preset ranges">
            ${[
              ['previous_week','Previous week'],
              ['current_week','Current week'],
              ['last_month','Last month'],
              ['this_month','This month']
            ].map(([id,label])=>`
              <button class="btn ${activePreset===id?'primary':''}" data-preset="${id}" type="button">${label}</button>
            `).join('')}
          </div>
          <div class="overall-filter-row">
            <div class="overall-filter-custom" role="group" aria-label="Custom range">
              <label class="small muted" for="overallStartDate">Start date</label>
              <input class="input" type="date" id="overallStartDate" value="${UI.esc(dateRange.start)}" aria-label="Start date" />
              <label class="small muted" for="overallEndDate">End date</label>
              <input class="input" type="date" id="overallEndDate" value="${UI.esc(dateRange.end)}" aria-label="End date" />
              <button class="btn primary" id="overallApplyRange" type="button">Apply</button>
              <button class="btn" id="overallClearRange" type="button">Clear</button>
            </div>
            <div class="overall-filter-shortcuts" role="group" aria-label="Quick shortcuts">
              <button class="btn" data-shortcut="last_7_days" type="button">Last 7 days</button>
              <button class="btn" data-shortcut="last_30_days" type="button">Last 30 days</button>
            </div>
          </div>
          <div class="overall-filter-row">
            <div class="overall-filter-search">
              <label class="small muted" for="overallSearch">Search member</label>
              <input class="input" id="overallSearch" placeholder="Search by name" value="${UI.esc(searchQuery)}" aria-label="Search member" />
            </div>
            <div class="overall-filter-sort">
              <label class="small muted" for="overallSort">Sort by</label>
              <select class="input" id="overallSort" aria-label="Sort by">
                <option value="name" ${sortBy==='name'?'selected':''}>Name</option>
                <option value="cases" ${sortBy==='cases'?'selected':''}>Assigned cases</option>
                <option value="mailbox" ${sortBy==='mailbox'?'selected':''}>Mailbox hours</option>
                <option value="back_office" ${sortBy==='back_office'?'selected':''}>Back office hours</option>
                <option value="call" ${sortBy==='call'?'selected':''}>Call hours</option>
                <option value="total" ${sortBy==='total'?'selected':''}>Total hours</option>
              </select>
              <button class="btn" id="overallSortDir" type="button" aria-label="Toggle sort direction">${sortDir==='asc'?'↑':'↓'}</button>
            </div>
            <div class="overall-filter-pagination">
              <label class="small muted" for="overallPageSize">Rows</label>
              <select class="input" id="overallPageSize" aria-label="Rows per page">
                ${[10,25,50].map(v=>`<option value="${v}" ${pageSize===v?'selected':''}>${v}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <div class="ux-grid overall-stats-metrics">
          ${kpis ? `
            <div class="ux-col-3">
              <div class="ux-card pad overall-stat-card">
                <div class="overall-stat-label">Total Assigned Cases</div>
                <div class="overall-stat-value">${UI.esc(String(kpis.cases || 0))}</div>
                <div class="overall-stat-sub">Δ ${UI.esc(formatDelta(kpis.cases || 0, kpis.prev_cases || 0))} vs prev</div>
              </div>
            </div>
            <div class="ux-col-3">
              <div class="ux-card pad overall-stat-card">
                <div class="overall-stat-label">Total Call Hours</div>
                <div class="overall-stat-value">${UI.esc(String(kpis.call_hours || 0))}h</div>
                <div class="overall-stat-sub">Δ ${UI.esc(formatDelta(kpis.call_hours || 0, kpis.prev_call_hours || 0))}h</div>
              </div>
            </div>
            <div class="ux-col-3">
              <div class="ux-card pad overall-stat-card">
                <div class="overall-stat-label">Total Mailbox Hours</div>
                <div class="overall-stat-value">${UI.esc(String(kpis.mailbox_hours || 0))}h</div>
                <div class="overall-stat-sub">Δ ${UI.esc(formatDelta(kpis.mailbox_hours || 0, kpis.prev_mailbox_hours || 0))}h</div>
              </div>
            </div>
            <div class="ux-col-3">
              <div class="ux-card pad overall-stat-card">
                <div class="overall-stat-label">Total Back Office Hours</div>
                <div class="overall-stat-value">${UI.esc(String(kpis.back_office_hours || 0))}h</div>
                <div class="overall-stat-sub">Δ ${UI.esc(formatDelta(kpis.back_office_hours || 0, kpis.prev_back_office_hours || 0))}h</div>
              </div>
            </div>
            <div class="ux-col-3">
              <div class="ux-card pad overall-stat-card">
                <div class="overall-stat-label">Total Hours (All)</div>
                <div class="overall-stat-value">${UI.esc(String(kpis.total_hours || 0))}h</div>
                <div class="overall-stat-sub">Δ ${UI.esc(formatDelta(kpis.total_hours || 0, kpis.prev_total_hours || 0))}h</div>
              </div>
            </div>
            <div class="ux-col-6">
              <div class="ux-card pad overall-stat-card overall-trend-card">
                <div class="overall-stat-label">Total Hours Trend</div>
                <div class="overall-trend-wrap" aria-live="polite">${buildTrendChart(trends)}</div>
              </div>
            </div>
          ` : `
            <div class="ux-col-12">
              <div class="ux-card pad overall-stat-card">
                <div class="overall-stat-label">Loading summary</div>
                <div class="overall-stat-value">${loading ? 'Loading…' : 'No data'}</div>
              </div>
            </div>
          `}
          </div>
        </div>

        <div class="ux-grid overall-stats-metrics">
          <div class="ux-col-3">
            <div class="ux-card pad overall-stat-card">
              <div class="overall-stat-label">Total Assigned Cases</div>
              <div class="overall-stat-value">${UI.esc(String(totalCases))}</div>
              <div class="overall-stat-sub">${UI.esc(String(members.length))} members</div>
            </div>
          </div>
          <div class="ux-col-3">
            <div class="ux-card pad overall-stat-card">
              <div class="overall-stat-label">Total Call Hours</div>
              <div class="overall-stat-value">${UI.esc(formatHours(totalCall))}</div>
              <div class="overall-stat-sub">On-queue + available</div>
            </div>
          </div>
          <div class="ux-col-3">
            <div class="ux-card pad overall-stat-card">
              <div class="overall-stat-label">Total Mailbox Hours</div>
              <div class="overall-stat-value">${UI.esc(formatHours(totalMailbox))}</div>
              <div class="overall-stat-sub">Mailbox manager + call</div>
            </div>
          </div>
          <div class="ux-col-3">
            <div class="ux-card pad overall-stat-card">
              <div class="overall-stat-label">Total Back Office Hours</div>
              <div class="overall-stat-value">${UI.esc(formatHours(totalBack))}</div>
              <div class="overall-stat-sub">Back office allocation</div>
            </div>
          </div>
          <div class="ux-col-3">
            <div class="ux-card pad overall-stat-card">
              <div class="overall-stat-label">Team Availability</div>
              <div class="overall-stat-value">${UI.esc(String(activeCount))} Active</div>
              <div class="overall-stat-sub">${UI.esc(String(restToday))} rest • ${UI.esc(String(leaveToday))} leave</div>
            </div>
          </div>
        </div>

        <div class="ux-card pad overall-stats-table-card">
          <div class="overall-stats-table-head">
            <div class="small muted">Member-level totals for ${UI.esc(dateRange.start)} to ${UI.esc(dateRange.end)}.</div>
            <div class="overall-table-meta">${UI.esc(String(totalMembers))} members • Page ${page} of ${totalPages}</div>
          </div>
          <div class="overall-table-wrap" role="region" aria-live="polite">
            ${loading ? '<div class="overall-loading">Loading overall stats…</div>' : ''}
            ${(!loading && lastResponse && lastResponse.error) ? `<div class="overall-error">Unable to load data: ${UI.esc(lastResponse.error)}</div>` : ''}
            <table class="table overall-stats-table" aria-label="Overall stats by member">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Mailbox Hours</th>
                  <th>Back Office Hours</th>
                  <th>Call Hours</th>
                  <th>Assigned Cases</th>
                  <th>Total Hours</th>
                  <th>Trend</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                ${members.map((r, idx)=>{
                  const teamLabel = (Config.teamById(r.teamId) || {}).label || r.teamLabel || r.teamId || '';
                  return `
                  <tr class="overall-row" data-row="${idx}">
                    <td>
                      <div class="overall-name">${UI.esc(r.name||r.username)}</div>
                      <div class="small muted">${UI.esc(teamLabel)}</div>
                    </td>
                    <td>${UI.esc(String(r.mailboxH||0))}h <span class="overall-delta">Δ ${UI.esc(String(r.deltaMailbox||0))}h</span></td>
                    <td>${UI.esc(String(r.backOfficeH||0))}h <span class="overall-delta">Δ ${UI.esc(String(r.deltaBackOffice||0))}h</span></td>
                    <td>${UI.esc(String(r.callH||0))}h <span class="overall-delta">Δ ${UI.esc(String(r.deltaCall||0))}h</span></td>
                    <td>${UI.esc(String(r.caseCount||0))} <span class="overall-delta">Δ ${UI.esc(String(r.deltaCases||0))}</span></td>
                    <td>${UI.esc(String(r.totalH||0))}h <span class="overall-delta">Δ ${UI.esc(String(r.deltaTotal||0))}h</span></td>
                    <td>${buildSparkline(r.sparkline)}</td>
                    <td><button class="btn ghost overall-detail-toggle" data-row="${idx}" type="button" aria-expanded="false" aria-controls="overall-detail-${idx}">View</button></td>
                  </tr>
                  <tr class="overall-detail-row" id="overall-detail-${idx}" hidden>
                    <td colspan="8">
                      <div class="overall-detail-panel" role="region" aria-label="Member detail">
                        <div class="overall-detail-header">
                          <div>
                            <div class="overall-detail-title">${UI.esc(r.name||r.username)}</div>
                            <div class="small muted">Previous range: ${UI.esc(meta.prev_start || '—')} → ${UI.esc(meta.prev_end || '—')}</div>
                          </div>
                          <div class="overall-detail-kpis">
                            <span>Cases: ${UI.esc(String(r.caseCount||0))} (Δ ${UI.esc(String(r.deltaCases||0))})</span>
                            <span>Total Hours: ${UI.esc(String(r.totalH||0))}h (Δ ${UI.esc(String(r.deltaTotal||0))}h)</span>
                          </div>
                        </div>
                        <div class="overall-detail-chart" aria-hidden="false">${buildSparkline(r.sparkline)}</div>
                        <div class="overall-detail-meta small muted">Includes mailbox, call, and back office totals within the selected range.</div>
                      </div>
                    </td>
                  </tr>
                `;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div class="overall-pagination">
            <button class="btn" id="overallPrevPage" ${page<=1?'disabled':''} type="button">Previous</button>
            <span class="small muted">Page ${page} of ${totalPages}</span>
            <button class="btn" id="overallNextPage" ${page>=totalPages?'disabled':''} type="button">Next</button>
          </div>
            <div class="small muted">Member-level weekly totals (rest day schedules are excluded).</div>
          </div>
          <table class="table overall-stats-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Mailbox Hours</th>
                <th>Back Office Hours</th>
                <th>Call Hours</th>
                <th>Assigned Cases</th>
                <th>Rest Days</th>
                <th>Status Today</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r=>`
                <tr>
                  <td><b>${UI.esc(r.name||r.username)}</b><div class="small muted">${UI.esc(team.label||r.teamId||'')}</div></td>
                  <td>${UI.esc(String(r.mailboxH))}h</td>
                  <td>${UI.esc(String(r.backOfficeH))}h</td>
                  <td>${UI.esc(String(r.callH))}h</td>
                  <td>${UI.esc(String(r.caseCount))}</td>
                  <td>${UI.esc(String(r.restDays))}</td>
                  <td>${UI.esc(r.status)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const teamSelect = root.querySelector('#overallTeamSelect');
    if(teamSelect){
      teamSelect.addEventListener('change', ()=>{
        selectedTeamId = teamSelect.value;
        pageOffset = 0;
        fetchStats();
      });
    }

    const exportBtn = root.querySelector('#overallExportBtn');
    if(exportBtn){
      exportBtn.addEventListener('click', ()=>{
        const csv = buildCsv(members);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `overall_stats_${dateRange.start}_${dateRange.end}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
    }

    root.querySelectorAll('[data-preset]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const preset = btn.getAttribute('data-preset');
        activePreset = preset;
        dateRange = presetRange(preset);
        pageOffset = 0;
        fetchStats();
      });
    });

    root.querySelectorAll('[data-shortcut]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const preset = btn.getAttribute('data-shortcut');
        activePreset = preset;
        dateRange = presetRange(preset);
        pageOffset = 0;
        fetchStats();
      });
    });

    const applyBtn = root.querySelector('#overallApplyRange');
    const clearBtn = root.querySelector('#overallClearRange');
    if(applyBtn){
      applyBtn.addEventListener('click', ()=>{
        const start = root.querySelector('#overallStartDate').value;
        const end = root.querySelector('#overallEndDate').value;
        if(start && end){
          activePreset = 'custom';
          dateRange = { start, end, label: 'Custom range' };
          pageOffset = 0;
          fetchStats();
        }
      });
    }
    if(clearBtn){
      clearBtn.addEventListener('click', ()=>{
        activePreset = 'current_week';
        dateRange = presetRange(activePreset);
        pageOffset = 0;
        fetchStats();
      });
    }

    const searchInput = root.querySelector('#overallSearch');
    if(searchInput){
      searchInput.addEventListener('input', ()=>{
        searchQuery = searchInput.value;
      });
      searchInput.addEventListener('change', ()=>{
        pageOffset = 0;
        fetchStats();
      });
    }

    const sortSel = root.querySelector('#overallSort');
    if(sortSel){
      sortSel.addEventListener('change', ()=>{
        sortBy = sortSel.value;
        pageOffset = 0;
        fetchStats();
      });
    }
    const sortDirBtn = root.querySelector('#overallSortDir');
    if(sortDirBtn){
      sortDirBtn.addEventListener('click', ()=>{
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        sortDirBtn.textContent = sortDir === 'asc' ? '↑' : '↓';
        pageOffset = 0;
        fetchStats();
      });
    }

    const pageSizeSel = root.querySelector('#overallPageSize');
    if(pageSizeSel){
      pageSizeSel.addEventListener('change', ()=>{
        pageSize = Number(pageSizeSel.value) || 10;
        pageOffset = 0;
        fetchStats();
      });
    }

    const prevBtn = root.querySelector('#overallPrevPage');
    const nextBtn = root.querySelector('#overallNextPage');
    if(prevBtn){
      prevBtn.addEventListener('click', ()=>{
        pageOffset = Math.max(0, pageOffset - pageSize);
        fetchStats();
      });
    }
    if(nextBtn){
      nextBtn.addEventListener('click', ()=>{
        pageOffset = pageOffset + pageSize;
        fetchStats();
      });
    }

    const pilotToggle = root.querySelector('#overallPilotInline');
    if(pilotToggle){
      pilotToggle.addEventListener('change', ()=>{
        updatePilotState(pilotToggle.checked);
      });
    }

    root.querySelectorAll('.overall-detail-toggle').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const row = btn.getAttribute('data-row');
        const detail = root.querySelector(`#overall-detail-${CSS.escape(row)}`);
        if(!detail) return;
        const open = !detail.hasAttribute('hidden');
        if(open){
          detail.setAttribute('hidden', '');
        }else{
          detail.removeAttribute('hidden');
        }
        btn.setAttribute('aria-expanded', open ? 'false' : 'true');
        btn.textContent = open ? 'View' : 'Hide';
      });
    });
  }

  fetchStats();
        render();
      });
    }
  }

  render();
});
