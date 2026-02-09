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
  let selectedTeamId = isLead ? me.teamId : ((teams[0] && teams[0].id) || '');

  function normalizeToMonday(iso){
    const wd = UI.weekdayFromISO(String(iso||UI.manilaTodayISO()));
    if(wd == null) return iso;
    const delta = (wd === 0) ? -6 : (1 - wd);
    return UI.addDaysISO(String(iso||UI.manilaTodayISO()), delta);
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
        render();
      });
    }
  }

  render();
});
