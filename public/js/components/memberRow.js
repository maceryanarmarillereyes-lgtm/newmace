(function(){
  // Member row UI component for Members > Assign Tasks
  // Render-only (returns HTML string). Event wiring stays in the page controller.
  window.Components = window.Components || {};

  function esc(s){
    try{ return (window.UI && UI.esc) ? UI.esc(s) : String(s==null?'':s); }
    catch(e){ return String(s==null?'':s); }
  }

  function isActiveLeave(leave, type){
    try{
      return !!(leave && String(leave.type||'').toUpperCase() === String(type||'').toUpperCase());
    }catch(e){
      return false;
    }
  }

  const MemberRow = {
    render(args){
      try{
        const id = String(args.id||'');
        const name = String(args.name||'');
        const memberTeamId = String(args.memberTeamId||args.teamId||'');
        const memberTeamLabel = String(args.memberTeamLabel||'');
        const timelineTeamId = String(args.timelineTeamId||'');
        const isoDate = String(args.isoDate||'');

        const ws = args.weeklyStats || { mailboxH:0, backOfficeH:0, callAvailableH:0, caseAssigned:0 };
        const ticksHtml = String(args.ticksHtml||'');
        const segsHtml = String(args.segsHtml||'');

        const isInactive = !!args.isInactive;
        const inactiveText = String(args.inactiveText||'');
        const canEdit = !!args.canEdit;
        const leave = args.leave || null;
        const dayLocked = !!args.dayLocked;

        const teamClass = 'team-' + memberTeamId;
        const rowClass = isInactive ? 'inactive' : '';

        const leaveActions = canEdit ? `
          <div class="leave-actions" aria-label="Leave actions">
            <button class="btn ghost tiny leavebtn ${isActiveLeave(leave,'SICK')?'active':''}" data-act="leave" data-leave="SICK" type="button" title="Sick Leave (SL)">SL</button>
            <button class="btn ghost tiny leavebtn ${isActiveLeave(leave,'EMERGENCY')?'active':''}" data-act="leave" data-leave="EMERGENCY" type="button" title="Emergency Leave (EL)">EL</button>
            <button class="btn ghost tiny leavebtn ${isActiveLeave(leave,'VACATION')?'active':''}" data-act="leave" data-leave="VACATION" type="button" title="Vacation Leave (VL)">VL</button>
            <button class="btn ghost tiny leavebtn ${isActiveLeave(leave,'HOLIDAY')?'active':''}" data-act="leave" data-leave="HOLIDAY" type="button" title="Holiday Leave (HL)">HL</button>
          </div>
        ` : '';

        const editBtn = canEdit
          ? `<button class="iconbtn" data-act="edit" type="button" title="Edit schedule" ${isInactive?'disabled':''}>✎</button>`
          : '<span class="small muted">View</span>';

        return `
          <div class="members-row ${rowClass}" data-id="${esc(id)}" data-inactive="${isInactive?'1':'0'}" data-iso="${esc(isoDate)}">
            <div class="members-meta ${teamClass}">
              <div class="m-name">
                <label class="m-selwrap" title="Select member">
                  <input class="m-select" type="checkbox" data-act="mselect" />
                </label>
                <div class="m-name-text">${esc(name)}${isInactive ? ` <span class="status-pill">${esc(inactiveText)}</span>`:''}</div>
              </div>
            </div>

            <div>
              <div class="member-task-stats" aria-label="Weekly workload">Mailbox: ${esc(ws.mailboxH)}h • Back Office: ${esc(ws.backOfficeH)}h • Call: ${esc(ws.callAvailableH)}h • Cases: ${esc(ws.caseAssigned)}</div>
              <div class="timeline-wrap">
                <div class="timeline" data-team="${esc(timelineTeamId)}">
                ${ticksHtml}
                ${segsHtml}
                ${isInactive ? `<div class="timeline-overlay">${esc(inactiveText)}</div>`:''}
              </div>
                ${dayLocked ? `<div class="locked-below" aria-label="Locked day"><span class="lk-ic">🔒</span><span class="lk-tx">LOCKED</span></div>`:''}
              </div>
            </div>

            <div class="row" style="justify-content:flex-end;flex-direction:column;align-items:flex-end;gap:8px">
              ${editBtn}
              ${leaveActions}
            </div>
          </div>
        `;      }catch(e){
        console.error('MemberRow.render error', e);
        return '';
      }
    }
  };

  window.Components.MemberRow = MemberRow;
})();
