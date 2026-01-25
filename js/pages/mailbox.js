
function eligibleForMailboxManager(user){
  if(!user) return false;
  const r = String(user.role||'');
  const admin = (window.Config && Config.ROLES) ? Config.ROLES.ADMIN : 'ADMIN';
  const superAdmin = (window.Config && Config.ROLES) ? Config.ROLES.SUPER_ADMIN : 'SUPER_ADMIN';
  const superUser = (window.Config && Config.ROLES) ? Config.ROLES.SUPER_USER : 'SUPER_USER';
  // Primary: mailbox_manager schedule; fallback: admins for support/testing.
  return user.schedule === 'mailbox_manager' || r===superAdmin || r===superUser || r===admin;
}

function _mbxMinutesOfDayFromParts(p){
  return (Number(p.hh)||0) * 60 + (Number(p.mm)||0);
}
function _mbxParseHM(hm){
  const [h,m] = String(hm||'0:0').split(':').map(Number);
  return (Math.max(0,Math.min(23,h||0))*60) + Math.max(0,Math.min(59,m||0));
}
function _mbxFmt12(min){
  min = ((min% (24*60)) + (24*60)) % (24*60);
  let h = Math.floor(min/60);
  const m = min%60;
  const ampm = h>=12 ? 'PM' : 'AM';
  h = h%12; if(h===0) h=12;
  return `${h}:${String(m).padStart(2,'0')} ${ampm}`;
}
function _mbxBucketLabel(b){
  return `${_mbxFmt12(b.startMin)} - ${_mbxFmt12(b.endMin)}`;
}
function _mbxInBucket(nowMin, b){
  // b.endMin may be <= startMin for wrap buckets; support.
  const start = b.startMin, end = b.endMin;
  if(end > start) return nowMin >= start && nowMin < end;
  return (nowMin >= start) || (nowMin < end);
}
function _mbxBuildDefaultBuckets(team){
  // Split the duty window into 3 buckets by default.
  const start = _mbxParseHM(team?.dutyStart || '00:00');
  const end = _mbxParseHM(team?.dutyEnd || '00:00');
  const wraps = end <= start;
  const total = wraps ? (24*60 - start + end) : (end - start);
  const seg = Math.max(1, Math.floor(total / 3));
  const buckets = [];
  for(let i=0;i<3;i++){
    const s = (start + i*seg) % (24*60);
    const e = (i===2) ? end : ((start + (i+1)*seg) % (24*60));
    buckets.push({ id:`b${i}`, startMin:s, endMin:e });
  }
  return buckets;
}

function _mbxComputeShiftKey(team, nowParts){
  const p = nowParts || (window.UI && UI.mailboxNowParts ? UI.mailboxNowParts() : (UI ? UI.manilaNow() : null));
  const nowMin = _mbxMinutesOfDayFromParts(p||{hh:0,mm:0});
  const start = _mbxParseHM(team?.dutyStart || '00:00');
  const end = _mbxParseHM(team?.dutyEnd || '00:00');
  const wraps = end <= start;

  // Anchor the shift start date for cross-midnight windows.
  let shiftDateISO = p && p.isoDate ? p.isoDate : (UI && UI.manilaNow ? UI.manilaNow().isoDate : '');
  if(wraps && nowMin < end){
    try{ shiftDateISO = UI.addDaysISO(shiftDateISO, -1); }catch(_){}
  }
  return `${team.id}|${shiftDateISO}T${team.dutyStart||'00:00'}`;
}

function _mbxRoleLabel(role){
  return String(role||'').replaceAll('_',' ').trim();
}

// Reuse the same duty computation used by the sidebar profile card:
// determine the user's active duty role based on today's day blocks.
function _mbxDutyLabelForUser(user, nowParts){
  try{
    const Store = window.Store;
    const Config = window.Config;
    const UI = window.UI;
    if(!Store || !Config || !UI || !user) return '—';
    const p = nowParts || (UI.mailboxNowParts ? UI.mailboxNowParts() : UI.manilaNow());
    const nowMin = UI.minutesOfDay(p);
    const dow = (new Date(UI.manilaNowDate()).getDay()); // 0=Sun..6=Sat (Manila)
    const blocks = Store.getUserDayBlocks ? (Store.getUserDayBlocks(user.id, dow) || []) : [];
    for(const b of blocks){
      const s = UI.parseHM(b.start);
      const e = UI.parseHM(b.end);
      if(!Number.isFinite(s) || !Number.isFinite(e)) continue;
      const wraps = e <= s;
      const hit = (!wraps && nowMin >= s && nowMin < e) || (wraps && (nowMin >= s || nowMin < e));
      if(hit){
        const sc = Config.scheduleById ? Config.scheduleById(b.role) : null;
        return (sc && sc.label) ? sc.label : String(b.role||'—');
      }
    }
    return '—';
  }catch(_){
    return '—';
  }
}

function _mbxMemberSortKey(u){
  const Config = window.Config;
  const TL = (Config && Config.ROLES) ? Config.ROLES.TEAM_LEAD : 'TEAM_LEAD';
  const w = (String(u?.role||'') === TL) ? 0 : 1;
  return { w, name: String(u?.name||u?.username||'').toLowerCase() };
}

(window.Pages=window.Pages||{}, window.Pages.mailbox = function(root){
  const me = (window.Auth && Auth.getUser) ? (Auth.getUser()||{}) : {};
  const isManager = eligibleForMailboxManager(me);

  function getDuty(){
    return UI.getDutyWindow(UI.mailboxNowParts ? UI.mailboxNowParts() : null);
  }

  function ensureShiftTables(){
    const d = getDuty();
    const team = d.current;
    const shiftKey = _mbxComputeShiftKey(team, UI.mailboxNowParts ? UI.mailboxNowParts() : null);
    const state = Store.getMailboxState ? Store.getMailboxState() : { currentKey:'', previousKey:'' };

    if(state.currentKey !== shiftKey){
      const prev = state.currentKey;
      Store.saveMailboxState && Store.saveMailboxState({ previousKey: prev, currentKey: shiftKey, lastChangeAt: Date.now() });

      // Audit: shift transition
      try{
        const actor = (window.Auth && Auth.getUser) ? Auth.getUser() : null;
        Store.addLog && Store.addLog({
          ts: Date.now(),
          teamId: team.id,
          actorId: actor?.id || '',
          actorName: actor ? (actor.name||actor.username) : '',
          action:'MAILBOX_SHIFT_CHANGE',
          targetId: shiftKey,
          targetName: team.label || team.id,
          msg:`Mailbox shift changed to ${team.label||team.id}`,
          detail:`Previous: ${prev||'—'}`
        });
      }catch(_){}
    }

    // Ensure table exists
    let table = Store.getMailboxTable ? Store.getMailboxTable(shiftKey) : null;
    if(!table){
      const teamObj = (window.Config && Config.teamById) ? Config.teamById(team.id) : team;
      const cfg = (Store.getTeamConfig ? Store.getTeamConfig(team.id) : {}) || {};
      const rawBuckets = Array.isArray(cfg.mailboxBuckets) ? cfg.mailboxBuckets : null;
      let buckets;
      if(rawBuckets && rawBuckets.length){
        buckets = rawBuckets.map((x,i)=>({
          id: x.id || `b${i}`,
          startMin: _mbxParseHM(x.start),
          endMin: _mbxParseHM(x.end),
        }));
      }else{
        buckets = _mbxBuildDefaultBuckets(teamObj || team);
      }
      // members (active users in this team, sorted)
      const nowParts = (UI.mailboxNowParts ? UI.mailboxNowParts() : UI.manilaNow());
      const members = (Store.getUsers ? Store.getUsers() : [])
        .filter(u=>u && u.teamId===team.id && u.status==='active')
        .map(u=>({
          id: u.id,
          name: u.name||u.username||'—',
          username: u.username||'',
          role: u.role||'',
          roleLabel: _mbxRoleLabel(u.role||''),
          dutyLabel: _mbxDutyLabelForUser(u, nowParts)
        }))
        .sort((a,b)=>{
          const ak=_mbxMemberSortKey(a), bk=_mbxMemberSortKey(b);
          if(ak.w!==bk.w) return ak.w-bk.w;
          return ak.name.localeCompare(bk.name);
        });

      table = {
        meta: {
          shiftKey,
          teamId: team.id,
          teamLabel: team.label || team.id,
          dutyStart: team.dutyStart || '',
          dutyEnd: team.dutyEnd || '',
          // bucketId -> { id, name, at } of mailbox manager who handled assignments in that bucket
          bucketManagers: {},
          createdAt: Date.now()
        },
        buckets,
        members,
        counts: {}, // counts[userId][bucketId] => n
        assignments: [] // {id, caseNo, desc, assigneeId, bucketId, assignedAt, actorId, actorName}
      };
      Store.saveMailboxTable && Store.saveMailboxTable(shiftKey, table);
    }else{
      // Back-compat: ensure meta.bucketManagers exists
      if(!table.meta) table.meta = {};
      if(!table.meta.bucketManagers) table.meta.bucketManagers = {};
      // Keep members list in sync with team roster changes (non-destructive).
      const nowParts = (UI.mailboxNowParts ? UI.mailboxNowParts() : UI.manilaNow());
      const teamUsers = (Store.getUsers ? Store.getUsers() : [])
        .filter(u=>u && u.teamId===team.id && u.status==='active')
        .map(u=>({
          id: u.id,
          name: u.name||u.username||'—',
          username: u.username||'',
          role: u.role||'',
          roleLabel: _mbxRoleLabel(u.role||''),
          dutyLabel: _mbxDutyLabelForUser(u, nowParts)
        }))
        .sort((a,b)=>{
          const ak=_mbxMemberSortKey(a), bk=_mbxMemberSortKey(b);
          if(ak.w!==bk.w) return ak.w-bk.w;
          return ak.name.localeCompare(bk.name);
        });

      const existingIds = new Set((table.members||[]).map(m=>m.id));
      const nextMembers = teamUsers.concat((table.members||[]).filter(m=>m && !teamUsers.find(x=>x.id===m.id)));
      // also drop inactive users from view but keep counts (audit)
      table.members = nextMembers.filter(m=>existingIds.has(m.id) || teamUsers.find(x=>x.id===m.id));
      Store.saveMailboxTable && Store.saveMailboxTable(shiftKey, table, { silent:true });
    }

    return { shiftKey, table, state: Store.getMailboxState ? Store.getMailboxState() : state };
  }

  function computeActiveBucketId(table){
    const p = UI.mailboxNowParts ? UI.mailboxNowParts() : UI.manilaNow();
    const nowMin = _mbxMinutesOfDayFromParts(p);
    const b = (table.buckets||[]).find(x=>_mbxInBucket(nowMin, x));
    return b ? b.id : ((table.buckets||[])[0]?.id || '');
  }

  function safeGetCount(table, userId, bucketId){
    const c = (table.counts && table.counts[userId]) ? table.counts[userId] : null;
    const v = c ? (Number(c[bucketId])||0) : 0;
    return v;
  }

  function computeTotals(table){
    const buckets = table.buckets || [];
    const members = table.members || [];
    const colTotals = {};
    for(const b of buckets) colTotals[b.id] = 0;
    const rowTotals = {};
    let shiftTotal = 0;

    for(const m of members){
      let rt = 0;
      for(const b of buckets){
        const v = safeGetCount(table, m.id, b.id);
        colTotals[b.id] += v;
        rt += v;
      }
      rowTotals[m.id] = rt;
      shiftTotal += rt;
    }
    return { colTotals, rowTotals, shiftTotal };
  }

  function render(){
    const { shiftKey, table, state } = ensureShiftTables();
    const prevKey = state.previousKey || '';
    const prevTable = prevKey ? (Store.getMailboxTable ? Store.getMailboxTable(prevKey) : null) : null;

    const activeBucketId = computeActiveBucketId(table);
    const totals = computeTotals(table);

    const duty = getDuty();

    root.innerHTML = `
      <div class="mbx-head">
        <div>
          <h2 style="margin:0">Mailbox</h2>
          <div class="small muted">Dynamic shift counter with assignment tracking, audit logs, and realtime notifications.</div>
        </div>
        <div class="mbx-actions">
          <button class="btn" id="mbxExportCsv">Export CSV</button>
          <button class="btn" id="mbxExportXlsx">Export XLSX</button>
          <button class="btn" id="mbxExportPdf">Export PDF</button>
        </div>
      </div>

      <div class="duty" style="margin-top:10px">
        <div class="box">
          <div class="small">Current Shift</div>
          <div id="mbCurDutyLbl" style="font-size:18px;font-weight:800;margin:4px 0">${UI.esc(duty.current.label)}</div>
          <div class="small">Team: ${UI.esc(duty.current.id)}</div>
        </div>
        <div class="box mid">
          <div class="row" style="justify-content:center;gap:8px;align-items:center">
            <div class="small">Manila Time</div>
            <span class="badge override" id="mbOverridePill" title="Mailbox time override is enabled (Super Admin testing)" style="display:none">OVERRIDE</span>
          </div>
          <div class="timer" id="dutyTimer">--:--:--</div>
          <div class="small">Until shift ends</div>
          <div class="small muted" id="mbOverrideNote" style="margin-top:4px;display:none">Countdown is in override mode</div>
        </div>
        <div class="box">
          <div class="small">Permissions</div>
          <div style="font-size:18px;font-weight:800;margin:4px 0">${isManager ? 'Mailbox Manager' : 'View only'}</div>
          <div class="small muted">${isManager ? 'Double-click a member row to assign a case.' : 'Assignments are restricted to mailbox managers/admins.'}</div>
        </div>
      </div>

      ${renderMyAssignmentsPanel(table)}

      <div class="mbx-card" style="margin-top:12px">
        <div class="mbx-card-head">
          <div class="mbx-title">
            <div class="mbx-shift-title">${UI.esc(table.meta.teamLabel)}</div>
            <div class="small muted">MAILBOX COUNTER • Shift key: <span class="mono">${UI.esc(shiftKey)}</span></div>
          </div>
          <div class="mbx-tools">
            <div class="small muted">Active mailbox time:</div>
            <span class="badge">${UI.esc((_mbxBucketLabel((table.buckets||[]).find(b=>b.id===activeBucketId)||table.buckets?.[0]||{startMin:0,endMin:0})))}</span>
          </div>
        </div>

        <div class="mbx-table-wrap" id="mbxTableWrap">
          ${renderTable(table, activeBucketId, totals, true)}
        </div>
      </div>

      <div class="mbx-card" style="margin-top:12px">
        <div class="mbx-card-head">
          <div class="mbx-title">
            <div class="mbx-shift-title">Previous Shift</div>
            <div class="small muted">${prevTable ? UI.esc(prevTable.meta.teamLabel)+' • '+UI.esc(prevKey) : 'No previous shift table yet.'}</div>
          </div>
          <div class="mbx-tools">
            <button class="btn" id="mbxTogglePrev">${prevTable ? 'Show' : '—'}</button>
          </div>
        </div>
        <div id="mbxPrevWrap" style="display:none">
          ${prevTable ? renderTable(prevTable, '', computeTotals(prevTable), false) : ''}
        </div>
      </div>


      <div class="mbx-card" style="margin-top:12px">
        <div class="mbx-card-head">
          <div class="mbx-title">
            <div class="mbx-shift-title">Case Monitoring</div>
            <div class="small muted">Assigned cases by member for the current shift (auto-sorted by fewest cases first). Confirmed cases turn gray.</div>
          </div>
          <div class="mbx-tools">
            <span class="badge" id="mbxPendingMine" style="display:none">Pending: 0</span>
          </div>
        </div>
        <div class="mbx-monitor-wrap">
          ${renderCaseMonitoring(table)}
        </div>
      </div>

      <div class="modal" id="mbxAssignModal">
        <div class="panel" style="max-width:560px">
          <div class="head">
            <div>
              <div class="announce-title">Assign Case</div>
              <div class="small muted">Assign a case to a member and record it against the active mailbox time bucket.</div>
            </div>
            <button class="btn ghost" type="button" data-close="mbxAssignModal">✕</button>
          </div>
          <div class="body" style="display:grid;gap:10px">
            <div class="grid2">
              <div>
                <label class="small">Assigned To</label>
                <input class="input" id="mbxAssignedTo" disabled />
              </div>
              <div>
                <label class="small">Mailbox Time</label>
                <input class="input" id="mbxBucketLbl" disabled />
              </div>
            </div>
            <div class="grid2">
              <div>
                <label class="small">Case #</label>
                <input class="input" id="mbxCaseNo" placeholder="e.g., INC123456" />
              </div>
              <div>
                <label class="small">Short Description</label>
                <input class="input" id="mbxDesc" placeholder="Short description (optional)" />
              </div>
            </div>
            <div class="err" id="mbxAssignErr" style="display:none"></div>
            <div class="row" style="justify-content:flex-end;gap:8px;flex-wrap:wrap">
              <button class="btn" type="button" data-close="mbxAssignModal">Cancel</button>
              <button class="btn primary" type="button" id="mbxSendAssign">Send</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // toggle prev
    const tBtn = UI.el('#mbxTogglePrev');
    if(tBtn){
      tBtn.disabled = !prevTable;
      tBtn.onclick = ()=>{
        const w = UI.el('#mbxPrevWrap');
        if(!w) return;
        const open = w.style.display !== 'none';
        w.style.display = open ? 'none' : 'block';
        tBtn.textContent = open ? 'Show' : 'Hide';
      };
    }

    // binds
    root.querySelectorAll('[data-close="mbxAssignModal"]').forEach(b=>b.onclick=()=>UI.closeModal('mbxAssignModal'));

    // export
    UI.el('#mbxExportCsv').onclick = ()=>exportCSV(table);
    UI.el('#mbxExportXlsx').onclick = ()=>exportXLSX(table);
    UI.el('#mbxExportPdf').onclick = ()=>exportPDF(table);

    // confirm my assignments
    try{
      root.querySelectorAll('[data-confirm-assign]').forEach(btn=>{
        btn.onclick = ()=>{
          const id = btn.getAttribute('data-confirm-assign');
          if(id) confirmAssignment(shiftKey, id);
        };
      });
      const pending = getMyPendingAssignments(table).length;
      const pill = UI.el('#mbxPendingMine');
      if(pill){
        pill.style.display = pending ? 'inline-flex' : 'none';
        pill.textContent = `Pending: ${pending}`;
      }
    }catch(_){}


    // dblclick on member row
    const wrap = UI.el('#mbxTableWrap');
    if(wrap){
      wrap.ondblclick = (e)=>{
        const row = e.target.closest('tr[data-assign-member]');
        if(!row) return;
        const uid = row.dataset.assignMember;
        if(!uid) return;
        if(!isManager){
          UI.toast('You do not have permission to assign cases.', 'warn');
          return;
        }
        openAssignModal(uid);
      };
}

    // timer init + override pill
    startTimerLoop();
  }

  function renderTable(table, activeBucketId, totals, interactive){
    const buckets = table.buckets || [];
    const members = table.members || [];

    // Mailbox Manager (per time bucket) shown above the time range.
    function getBucketManagerName(bucketId){
      // 1) Persisted explicit map
      try{
        const bm = table && table.meta && table.meta.bucketManagers;
        if(bm && bm[bucketId] && bm[bucketId].name) return String(bm[bucketId].name);
      }catch(_){ }

      // 2) Most recent assignment actor within bucket
      try{
        const a = (table.assignments||[]).find(x=>x.bucketId===bucketId && (x.actorName||''));
        if(a && a.actorName) return String(a.actorName);
      }catch(_){ }

      // 3) Team mailbox_manager schedule (if configured)
      try{
        const all = (Store.getUsers ? Store.getUsers() : []) || [];
        const teamId = table && table.meta ? table.meta.teamId : '';
        const mm = all.find(u => (u.teamId||'')===teamId && String(u.schedule||'').toLowerCase()==='mailbox_manager');
        if(mm) return String(mm.name||mm.username||'');
      }catch(_){ }

      return '—';
    }

    const rows = members.map(m=>{
      const cells = buckets.map(b=>{
        const v = safeGetCount(table, m.id, b.id);
        const cls = (activeBucketId && b.id===activeBucketId) ? 'active-col' : '';
        return `<td class="${cls} mbx-count-td"><span class="mbx-num">${v}</span></td>`;
      }).join('');
      const total = totals.rowTotals[m.id] || 0;

      const duty = (m.dutyLabel && m.dutyLabel !== '—') ? m.dutyLabel : '—';
      const role = (m.roleLabel || _mbxRoleLabel(m.role) || '').trim();

      return `<tr class="mbx-tr ${interactive ? 'mbx-assignable' : ''}" ${interactive ? `data-assign-member="${m.id}"` : ''} title="${interactive ? 'Double-click anywhere on this row to assign a case' : ''}">
        <td class="mbx-name">
          <div class="mbx-member-grid">
            <div class="mbx-name-col">
              <div class="mbx-name-main">${UI.esc(m.name)}</div>
              <div class="mbx-name-sub">${UI.esc(role || '—')}</div>
            </div>
            <div class="mbx-duty-col ${duty==='—' ? 'muted' : ''}">${UI.esc(duty)}</div>
          </div>
        </td>
        ${cells}
        <td class="mbx-total mbx-count-td"><span class="mbx-num">${total}</span></td>
      </tr>`;
    }).join('');

    const footCells = buckets.map(b=>{
      const cls = (activeBucketId && b.id===activeBucketId) ? 'active-col' : '';
      return `<td class="${cls} mbx-count-td"><span class="mbx-num">${totals.colTotals[b.id]||0}</span></td>`;
    }).join('');

    return `
      <table class="table mbx-table">
        <thead>
          <tr>
            <th style="min-width:260px">Member</th>
            ${buckets.map(b=>{
              const cls = (activeBucketId && b.id===activeBucketId) ? 'active-col' : '';
              const mgr = getBucketManagerName(b.id);
              // Show only the assigned user's name (no label). If none yet, keep blank.
              const mgrLabel = mgr ? UI.esc(mgr) : '';
              return `<th class="${cls} mbx-time-th"><div class="mbx-th"><div class="mbx-th-top">${mgrLabel}</div><div class="mbx-th-time">${UI.esc(_mbxBucketLabel(b))}</div></div></th>`;
            }).join('')}
            <th style="width:110px" class="mbx-time-th">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td class="mbx-foot">TOTAL</td>
            ${footCells}
            <td class="mbx-foot mbx-count-td"><span class="mbx-num">${totals.shiftTotal||0}</span></td>
          </tr>
        </tfoot>
      </table>
    `;
  }

  // Assignment modal
  let _assignUserId = null;
  function openAssignModal(userId){
    const { table } = ensureShiftTables();
    const u = (table.members||[]).find(x=>x.id===userId) || (Store.getUsers?Store.getUsers().find(x=>x.id===userId):null);
    if(!u) return;

    const activeId = computeActiveBucketId(table);
    const bucket = (table.buckets||[]).find(b=>b.id===activeId) || table.buckets?.[0];
    _assignUserId = userId;

    UI.el('#mbxAssignedTo').value = u.name || u.username || '—';
    UI.el('#mbxBucketLbl').value = bucket ? _mbxBucketLabel(bucket) : '—';
    UI.el('#mbxCaseNo').value = '';
    UI.el('#mbxDesc').value = '';
    const err = UI.el('#mbxAssignErr');
    if(err){ err.style.display='none'; err.textContent=''; }

    UI.el('#mbxSendAssign').onclick = ()=>sendAssignment();
    UI.openModal('mbxAssignModal');
    setTimeout(()=>{ try{ UI.el('#mbxCaseNo').focus(); }catch(_){ } }, 60);
  }

  function sendAssignment(){
    const { shiftKey, table } = ensureShiftTables();
    const uid = _assignUserId;
    if(!uid) return;
    const activeId = computeActiveBucketId(table);
    const bucket = (table.buckets||[]).find(b=>b.id===activeId) || table.buckets?.[0];
    const caseNo = String(UI.el('#mbxCaseNo').value||'').trim();
    const desc = String(UI.el('#mbxDesc').value||'').trim();

    const err = (msg)=>{
      const el = UI.el('#mbxAssignErr');
      if(!el) return alert(msg);
      el.textContent = msg;
      el.style.display='block';
    };

    if(!caseNo) return err('Case # is required.');
    // Prevent duplicates (within current + previous shift tables)
    const state = Store.getMailboxState ? Store.getMailboxState() : {};
    const curKey = state.currentKey || shiftKey;
    const prevKey = state.previousKey || '';
    const tablesToCheck = [curKey, prevKey].filter(Boolean).map(k=>Store.getMailboxTable ? Store.getMailboxTable(k) : null).filter(Boolean);
    const dup = tablesToCheck.some(t => (t.assignments||[]).some(a => String(a.caseNo||'').toLowerCase() === caseNo.toLowerCase()));
    if(dup) return err('Duplicate Case # detected. Please verify and use a unique case number.');

    // Update count
    if(!table.counts) table.counts = {};
    if(!table.counts[uid]) table.counts[uid] = {};
    table.counts[uid][bucket.id] = (Number(table.counts[uid][bucket.id])||0) + 1;

    // Save assignment
    const actor = (window.Auth && Auth.getUser) ? (Auth.getUser()||{}) : {};

    // Track mailbox manager handling this time bucket for header display.
    try{
      if(!table.meta) table.meta = {};
      if(!table.meta.bucketManagers) table.meta.bucketManagers = {};
      table.meta.bucketManagers[bucket.id] = {
        id: actor.id || '',
        name: actor.name || actor.username || '',
        at: Date.now()
      };
    }catch(_){ }

    const assignment = {
      id: 'mbx_' + Math.random().toString(16).slice(2) + '_' + Date.now(),
      caseNo,
      desc,
      assigneeId: uid,
      bucketId: bucket.id,
      assignedAt: Date.now(),
      actorId: actor.id || '',
      actorName: actor.name || actor.username || '',
      confirmedAt: 0,
      confirmedById: ''
    };
    table.assignments = Array.isArray(table.assignments) ? table.assignments : [];
    table.assignments.unshift(assignment);

    Store.saveMailboxTable && Store.saveMailboxTable(shiftKey, table);

    // Audit log
    try{
      Store.addLog && Store.addLog({
        ts: assignment.assignedAt,
        teamId: table.meta.teamId,
        actorId: actor.id || '',
        actorName: actor.name||actor.username||'',
        action:'MAILBOX_CASE_ASSIGN',
        targetId: caseNo,
        targetName: caseNo,
        msg:`Mailbox case assigned to ${(Store.getUsers?Store.getUsers().find(x=>x.id===uid)?.name: '') || ''}`.trim(),
        detail:`${caseNo} • ${desc} • bucket ${_mbxBucketLabel(bucket)}`
      });
    }catch(_){}

    // Realtime notification to member
    try{
      const assignee = (Store.getUsers?Store.getUsers().find(x=>x.id===uid):null) || {};
      const notif = {
        id: 'notif_mbx_' + Math.random().toString(16).slice(2) + '_' + Date.now(),
        ts: assignment.assignedAt,
        type: 'MAILBOX_ASSIGN',
        teamId: table.meta.teamId,
        fromId: actor.id || '',
        fromName: actor.name||actor.username||'Mailbox Manager',
        title: `Mailbox case assigned: ${caseNo}`,
        body: `${desc ? (desc + '\n\n') : ''}Mailbox time: ${_mbxBucketLabel(bucket)}\nShift: ${table.meta.teamLabel}\nAssigned to: ${assignee.name||assignee.username||''}`,
        recipients: [uid],
        acks: {}
      };
      Store.addNotif && Store.addNotif(notif);
      // ping schedule notif listeners
      try{ localStorage.setItem('ums_schedule_notifs', String(Date.now())); }catch(_){}
      try{ ('BroadcastChannel' in window) && new BroadcastChannel('ums_schedule_updates').postMessage({ type:'notify', notifId:notif.id }); }catch(_){}
    }catch(_){}

    UI.closeModal('mbxAssignModal');
    UI.toast('Case assigned.');
    render(); // re-render table with updated totals
  }

  // Exports
  function exportCSV(table){
    const buckets = table.buckets || [];
    const members = table.members || [];
    const totals = computeTotals(table);

    const header = ['Shift', table.meta.teamLabel, 'ShiftKey', table.meta.shiftKey, 'ExportedAt', new Date().toISOString()];
    const head2 = ['Member'].concat(buckets.map(b=>_mbxBucketLabel(b))).concat(['Total']);
    const rows = [header, [], head2];

    for(const m of members){
      const r = [m.name];
      for(const b of buckets){
        r.push(String(safeGetCount(table, m.id, b.id)));
      }
      r.push(String(totals.rowTotals[m.id]||0));
      rows.push(r);
    }
    const tRow = ['TOTAL'];
    for(const b of buckets) tRow.push(String(totals.colTotals[b.id]||0));
    tRow.push(String(totals.shiftTotal||0));
    rows.push(tRow);

    rows.push([]);
    rows.push(['Assignments']);
    rows.push(['Timestamp','Case #','Assigned To','Mailbox Time','Description','Assigned By']);
    for(const a of (table.assignments||[]).slice().reverse()){
      const assignee = (Store.getUsers?Store.getUsers().find(x=>x.id===a.assigneeId):null) || {};
      const b = buckets.find(x=>x.id===a.bucketId) || {};
      rows.push([String(a.assignedAt||''), a.caseNo||'', assignee.name||assignee.username||'', _mbxBucketLabel(b||{startMin:0,endMin:0}), a.desc||'', a.actorName||'']);
    }

    UI.downloadCSV(`mailbox_${table.meta.shiftKey.replace(/[^\w\-|T]/g,'_')}.csv`, rows);
  }

  function exportXLSX(table){
    // Lightweight Excel export using HTML workbook (opens in Excel). Saved as .xlsx for convenience.
    const buckets = table.buckets || [];
    const members = table.members || [];
    const totals = computeTotals(table);

    const esc = (s)=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const th = `<tr><th>Member</th>${buckets.map(b=>`<th>${esc(_mbxBucketLabel(b))}</th>`).join('')}<th>Total</th></tr>`;
    const trs = members.map(m=>{
      const tds = buckets.map(b=>`<td>${safeGetCount(table,m.id,b.id)}</td>`).join('');
      return `<tr><td>${esc(m.name)}</td>${tds}<td>${totals.rowTotals[m.id]||0}</td></tr>`;
    }).join('');
    const tfoot = `<tr><td><b>TOTAL</b></td>${buckets.map(b=>`<td><b>${totals.colTotals[b.id]||0}</b></td>`).join('')}<td><b>${totals.shiftTotal||0}</b></td></tr>`;

    const assignRows = (table.assignments||[]).slice().reverse().map(a=>{
      const assignee = (Store.getUsers?Store.getUsers().find(x=>x.id===a.assigneeId):null) || {};
      const b = buckets.find(x=>x.id===a.bucketId) || {};
      return `<tr>
        <td>${new Date(a.assignedAt||0).toLocaleString()}</td>
        <td>${esc(a.caseNo||'')}</td>
        <td>${esc(assignee.name||assignee.username||'')}</td>
        <td>${esc(_mbxBucketLabel(b||{startMin:0,endMin:0}))}</td>
        <td>${esc(a.desc||'')}</td>
        <td>${esc(a.actorName||'')}</td>
      </tr>`;
    }).join('');

    const html = `
      <html><head><meta charset="utf-8" /></head><body>
      <h3>Mailbox Counter — ${esc(table.meta.teamLabel)}</h3>
      <div>ShiftKey: ${esc(table.meta.shiftKey)}</div>
      <table border="1" cellspacing="0" cellpadding="4">${th}${trs}${tfoot}</table>
      <br/>
      <h4>Assignments</h4>
      <table border="1" cellspacing="0" cellpadding="4">
        <tr><th>Timestamp</th><th>Case #</th><th>Assigned To</th><th>Mailbox Time</th><th>Description</th><th>Assigned By</th></tr>
        ${assignRows}
      </table>
      </body></html>
    `;
    const blob = new Blob([html], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mailbox_${table.meta.shiftKey.replace(/[^\w\-|T]/g,'_')}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  }

  function exportPDF(table){
    // Print-to-PDF (browser). Opens a print-friendly window.
    const w = window.open('', '_blank');
    if(!w) return UI.toast('Popup blocked. Allow popups to export PDF.', 'warn');
    const buckets = table.buckets || [];
    const members = table.members || [];
    const totals = computeTotals(table);

    const esc = (s)=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const th = `<tr><th>Member</th>${buckets.map(b=>`<th>${esc(_mbxBucketLabel(b))}</th>`).join('')}<th>Total</th></tr>`;
    const trs = members.map(m=>{
      const tds = buckets.map(b=>`<td>${safeGetCount(table,m.id,b.id)}</td>`).join('');
      return `<tr><td>${esc(m.name)}</td>${tds}<td>${totals.rowTotals[m.id]||0}</td></tr>`;
    }).join('');
    const tfoot = `<tr><td><b>TOTAL</b></td>${buckets.map(b=>`<td><b>${totals.colTotals[b.id]||0}</b></td>`).join('')}<td><b>${totals.shiftTotal||0}</b></td></tr>`;

    w.document.write(`
      <html><head><meta charset="utf-8"/>
      <title>Mailbox Counter</title>
      <style>
        body{ font-family: Arial, sans-serif; padding: 18px; }
        h2{ margin:0 0 6px; }
        .meta{ color:#555; font-size:12px; margin-bottom:12px; }
        table{ border-collapse: collapse; width:100%; font-size:12px; }
        th,td{ border:1px solid #222; padding:6px; text-align:left; }
        th{ background:#eee; }
        @media print{ button{display:none} }
      </style></head><body>
      <h2>Mailbox Counter — ${esc(table.meta.teamLabel)}</h2>
      <div class="meta">ShiftKey: ${esc(table.meta.shiftKey)} • Exported: ${new Date().toLocaleString()}</div>
      <table>${th}${trs}${tfoot}</table>
      <script>setTimeout(()=>{ window.print(); }, 250);<\/script>
      </body></html>
    `);
    w.document.close();
  }

  // Timer loop (reuses duty timer + ensures active bucket highlight in-place)
  let _timer = null;
  function startTimerLoop(){
    try{ if(_timer) clearInterval(_timer); }catch(_){}
    const tick = ()=>{
      const d = getDuty();
      const el = UI.el('#dutyTimer');
      if(el) el.textContent = UI.formatDuration(d.secLeft);

      const curLbl = UI.el('#mbCurDutyLbl');
      if(curLbl) curLbl.textContent = d.current.label;

      // override indicator
      try{
        const me = (window.Auth && Auth.getUser) ? (Auth.getUser()||{}) : {};
        const isSA = (me.role === (window.Config&&Config.ROLES?Config.ROLES.SUPER_ADMIN:'SUPER_ADMIN'));
        const ov = (isSA && window.Store && Store.getMailboxTimeOverride) ? Store.getMailboxTimeOverride() : null;
        const on = !!(ov && ov.enabled && ov.ms);
        const pill = UI.el('#mbOverridePill');
        const note = UI.el('#mbOverrideNote');
        if(pill) pill.style.display = on ? 'inline-flex' : 'none';
        if(note) note.style.display = on ? 'block' : 'none';
      }catch(_){ }

      // shift transition detect + re-render on change
      const { state } = ensureShiftTables();
      // highlight active bucket by toggling classes without full re-render (best effort)
      try{
        const { table } = ensureShiftTables();
        const active = computeActiveBucketId(table);
        const ths = root.querySelectorAll('.mbx-table thead th');
        const idxMap = {};
        (table.buckets||[]).forEach((b,i)=>idxMap[b.id]=i);
        const activeIdx = idxMap[active];
        // columns: Member is 0, buckets start at 1
        const bucketStartCol = 1;
        root.querySelectorAll('.mbx-table .active-col').forEach(n=>n.classList.remove('active-col'));
        if(activeIdx !== undefined){
          const col = bucketStartCol + activeIdx;
          root.querySelectorAll(`.mbx-table tr`).forEach(tr=>{
            const cell = tr.children && tr.children[col];
            if(cell) cell.classList.add('active-col');
          });
        }
      }catch(_){ }

      // If current shiftKey changed, rebuild
      const curKey = (Store.getMailboxState ? Store.getMailboxState().currentKey : '');
      if(curKey && root._lastShiftKey && curKey !== root._lastShiftKey){
        render();
      }
      root._lastShiftKey = curKey || root._lastShiftKey;
    };
    tick();
    _timer = setInterval(()=>{ try{ tick(); }catch(e){ console.error('Mailbox tick', e); } }, 1000);
  }


  // --- Case monitoring + confirmations (enterprise ops) ---
  function getMyPendingAssignments(table){
    const me = (window.Auth && Auth.getUser) ? (Auth.getUser()||{}) : {};
    const uid = String(me.id||'');
    if(!uid) return [];
    return (table.assignments||[])
      .filter(a => a && a.assigneeId === uid && !a.confirmedAt)
      .slice(0, 50);
  }

  function confirmAssignment(shiftKey, assignmentId){
    const me = (window.Auth && Auth.getUser) ? (Auth.getUser()||{}) : {};
    const uid = String(me.id||'');
    if(!uid) return;

    const table = (Store.getMailboxTable ? Store.getMailboxTable(shiftKey) : null);
    if(!table || !Array.isArray(table.assignments)) return;

    const a = table.assignments.find(x=>x && x.id===assignmentId);
    if(!a) return;
    if(String(a.assigneeId||'') !== uid){
      UI.toast('You can only confirm your own assigned cases.', 'warn');
      return;
    }
    if(a.confirmedAt) return;

    a.confirmedAt = Date.now();
    a.confirmedById = uid;

    Store.saveMailboxTable && Store.saveMailboxTable(shiftKey, table);

    // Audit log
    try{
      Store.addLog && Store.addLog({
        ts: a.confirmedAt,
        teamId: table.meta.teamId,
        actorId: uid,
        actorName: me.name||me.username||'',
        action:'MAILBOX_CASE_CONFIRM',
        targetId: a.caseNo,
        targetName: a.caseNo,
        msg:`Mailbox case confirmed by ${(me.name||me.username||'')}`.trim(),
        detail:`${a.caseNo} • confirmed`
      });
    }catch(_){}

    UI.toast('Case confirmed.');
    render();
  }

  function renderMyAssignmentsPanel(table){
    try{
      const list = getMyPendingAssignments(table);
      if(!list.length) return '';
      const buckets = table.buckets || [];
      const byId = Object.fromEntries(buckets.map(b=>[b.id,b]));
      const esc = UI.esc;
      const items = list.map(a=>{
        const b = byId[a.bucketId] || {};
        return `<div class="mbx-mine-item">
          <div>
            <div class="mbx-mine-title">${esc(a.caseNo||'')}</div>
            <div class="small muted">${esc(_mbxBucketLabel(b))}${a.desc ? ' • '+esc(a.desc) : ''}</div>
          </div>
          <button class="btn sm" data-confirm-assign="${esc(a.id)}">Confirm</button>
        </div>`;
      }).join('');
      return `
        <div class="mbx-card" style="margin-top:12px">
          <div class="mbx-card-head">
            <div class="mbx-title">
              <div class="mbx-shift-title">My Assigned Cases</div>
              <div class="small muted">Confirm each case when completed. Confirmed cases will be marked gray in monitoring.</div>
            </div>
            <div class="mbx-tools"><span class="badge">${list.length} pending</span></div>
          </div>
          <div class="mbx-mine-wrap">${items}</div>
        </div>
      `;
    }catch(_){ return ''; }
  }

  function buildCaseMonitoringMatrix(table){
    const members = (table.members||[]).slice();
    const by = {};
    for(const m of members){ by[m.id] = []; }
    for(const a of (table.assignments||[])){
      if(!a || !by[a.assigneeId]) continue;
      by[a.assigneeId].push(a);
    }
    const cols = members.map(m=>{
      const list = by[m.id] || [];
      return { id:m.id, name:m.name, count:list.length, list:list.slice().reverse() };
    });
    cols.sort((a,b)=>{
      if(a.count !== b.count) return a.count - b.count;
      return String(a.name||'').localeCompare(String(b.name||''));
    });
    const maxLen = Math.max(0, ...cols.map(c=>c.list.length));
    const rows = [];
    for(let i=0;i<maxLen;i++){
      rows.push(cols.map(c=>c.list[i] || null));
    }
    return { cols, rows };
  }

  function renderCaseMonitoring(table){
    const esc = UI.esc;
    const m = buildCaseMonitoringMatrix(table);
    if(!m.cols.length){
      return `<div class="small muted" style="padding:14px">No members found for this shift.</div>`;
    }
    const head = `<tr>
      <th class="mono" style="width:56px;text-align:center">No</th>
      ${m.cols.map(c=>`<th class="mbx-mon-head"><div class="mbx-mon-name">${esc(c.name)} <span class="muted">(${c.count})</span></div></th>`).join('')}
    </tr>`;

    const body = m.rows.map((row, idx)=>{
      const tds = row.map(a=>{
        if(!a) return `<td class="mbx-mon-cell empty"></td>`;
        const cls = a.confirmedAt ? 'mbx-mon-cell confirmed' : 'mbx-mon-cell';
        return `<td class="${cls}">${esc(a.caseNo||'')}</td>`;
      }).join('');
      return `<tr><td class="mono" style="text-align:center">${idx+1}</td>${tds}</tr>`;
    }).join('');

    return `
      <div class="mbx-mon-scroll">
        <table class="mbx-mon-table">
          <thead>${head}</thead>
          <tbody>${body || `<tr><td colspan="${m.cols.length+1}" class="small muted" style="padding:14px">No assignments yet for this shift.</td></tr>`}</tbody>
        </table>
      </div>
    `;
  }

  render();

  root._cleanup = ()=>{
    try{ if(_timer) clearInterval(_timer); }catch(_){ }
  };
});
