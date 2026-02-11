
function _mbxIsoDow(isoDate){
  try{ return new Date(String(isoDate||'') + 'T00:00:00+08:00').getDay(); }catch(_){ return (new Date()).getDay(); }
}
function _mbxToSegments(startMin, endMin){
  if(!Number.isFinite(startMin) || !Number.isFinite(endMin)) return [];
  if(endMin > startMin) return [[startMin, endMin]];
  return [[startMin, 24*60],[0, endMin]];
}
function _mbxSegmentsOverlap(aSegs, bSegs){
  for(const a of (aSegs||[])){
    for(const b of (bSegs||[])){
      if(a[0] < b[1] && b[0] < a[1]) return true;
    }
  }
  return false;
}
function _mbxBlockHit(nowMin, s, e){
  const wraps = e <= s;
  return (!wraps && nowMin >= s && nowMin < e) || (wraps && (nowMin >= s || nowMin < e));
}
function _mbxInDutyWindow(nowMin, team){
  if(!team) return false;
  const s = _mbxParseHM(team.dutyStart||'00:00');
  const e = _mbxParseHM(team.dutyEnd||'00:00');
  return _mbxBlockHit(nowMin, s, e);
}

function eligibleForMailboxManager(user, opts){
  if(!user) return false;
  opts = opts || {};
  const r = String(user.role||'');
  const admin = (window.Config && Config.ROLES) ? Config.ROLES.ADMIN : 'ADMIN';
  const superAdmin = (window.Config && Config.ROLES) ? Config.ROLES.SUPER_ADMIN : 'SUPER_ADMIN';
  const superUser = (window.Config && Config.ROLES) ? Config.ROLES.SUPER_USER : 'SUPER_USER';
  const teamLead = (window.Config && Config.ROLES) ? Config.ROLES.TEAM_LEAD : 'TEAM_LEAD';

  // Admins always permitted (support/testing).
  if(r===superAdmin || r===superUser || r===admin || r===teamLead) return true;

  // Enforce team scope when provided (Morning/Mid/Night duty teams).
  if(opts.teamId && String(user.teamId||'') !== String(opts.teamId||'')) return false;

  const UI = window.UI;
  const Store = window.Store;
  const nowParts = opts.nowParts || (UI && UI.mailboxNowParts ? UI.mailboxNowParts() : (UI ? UI.manilaNow() : null));
  if(!UI || !Store || !nowParts) return false;

  const nowMin = _mbxMinutesOfDayFromParts(nowParts);

  // If we know the current duty team window, only grant capability during duty hours.
  if(opts.dutyTeam && !_mbxInDutyWindow(nowMin, opts.dutyTeam)) return false;

  const roleSet = new Set(['mailbox_manager','mailbox_call']);
  const dow = _mbxIsoDow(nowParts.isoDate);
  const dows = [dow];

  // For cross-midnight duty windows, include previous day blocks (wrap blocks that span midnight).
  try{
    if(opts.dutyTeam){
      const s = _mbxParseHM(opts.dutyTeam.dutyStart||'00:00');
      const e = _mbxParseHM(opts.dutyTeam.dutyEnd||'00:00');
      const wraps = e <= s;
      if(wraps && nowMin < e){
        dows.push((dow+6)%7);
      }
    }else{
      dows.push((dow+6)%7);
    }
  }catch(_){}

  for(const di of dows){
    const blocks = Store.getUserDayBlocks ? (Store.getUserDayBlocks(user.id, di) || []) : [];
    for(const b of blocks){
      const rr = String(b?.role||'');
      if(!roleSet.has(rr)) continue;
      const s = (UI.parseHM ? UI.parseHM(b.start) : _mbxParseHM(b.start));
      const e = (UI.parseHM ? UI.parseHM(b.end) : _mbxParseHM(b.end));
      if(!Number.isFinite(s) || !Number.isFinite(e)) continue;
      if(_mbxBlockHit(nowMin, s, e)) return true;
    }
  }

  // Legacy fields (rare): allow only inside duty window when possible.
  try{
    const legacy = String(user.schedule||'').toLowerCase();
    if(legacy==='mailbox_manager' || legacy==='mailbox_call'){
      if(opts.dutyTeam) return _mbxInDutyWindow(nowMin, opts.dutyTeam);
      return true;
    }
  }catch(_){}
  try{
    const t = String(user.task||user.taskId||user.taskRole||user.primaryTask||'').toLowerCase();
    if(t==='mailbox_manager' || t==='mailbox manager'){
      if(opts.dutyTeam) return _mbxInDutyWindow(nowMin, opts.dutyTeam);
      return true;
    }
  }catch(_){}
  return false;
}


function _mbxMinutesOfDayFromParts(p){
  return (Number(p.hh)||0) * 60 + (Number(p.mm)||0);
}
function _mbxParseHM(hm){
  const raw = String(hm||'').trim();
  if(!raw) return 0;
  let mer = '';
  let base = raw;
  const merMatch = raw.match(/\b(am|pm)\b/i);
  if(merMatch){
    mer = merMatch[1].toLowerCase();
    base = raw.replace(/\b(am|pm)\b/i, '').trim();
  }
  const parts = base.split(':');
  let h = Number(parts[0]);
  let m = Number(parts[1]);
  if(!Number.isFinite(h)) h = 0;
  if(!Number.isFinite(m)) m = 0;
  h = Math.max(0, Math.min(23, h));
  m = Math.max(0, Math.min(59, m));
  if(mer){
    h = h % 12;
    if(mer === 'pm') h += 12;
  }
  return (h * 60) + m;
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
  let isManager = false;

  function getDuty(){
    let nowParts = null;
    if(UI && UI.mailboxTimeInfo){
      const info = UI.mailboxTimeInfo();
      if(info && info.overrideEnabled && info.effectiveParts){
        nowParts = info.effectiveParts;
      }
    }
    if(!nowParts){
      nowParts = UI.mailboxNowParts ? UI.mailboxNowParts() : null;
    }
    return UI.getDutyWindow(nowParts);
  }

  // Mailbox Manager visibility + permissions are driven by scheduled task blocks.
  // These helpers resolve who is assigned as Mailbox Manager for the current duty window/bucket.
  function _mbxFindOnDutyMailboxManagerName(teamId, dutyTeam, nowParts, table, activeBucketId){
    try{
      const all = (Store.getUsers ? Store.getUsers() : []) || [];
      const candidates = all.filter(u=>u && u.teamId===teamId && u.status==='active');
      const nowMin = _mbxMinutesOfDayFromParts(nowParts||{hh:0,mm:0});
      const dow = _mbxIsoDow(nowParts && nowParts.isoDate);
      const dows = [dow];
      try{
        const s = _mbxParseHM(dutyTeam?.dutyStart || '00:00');
        const e = _mbxParseHM(dutyTeam?.dutyEnd || '00:00');
        const wraps = e <= s;
        if(wraps && nowMin < e) dows.push((dow+6)%7);
      }catch(_){}
      const roleOrder = ['mailbox_manager','mailbox_call'];
      for(const role of roleOrder){
        for(const u of candidates){
          for(const di of dows){
            const bl = Store.getUserDayBlocks ? (Store.getUserDayBlocks(u.id, di) || []) : [];
            for(const b of bl){
              if(String(b?.role||'') !== role) continue;
              const s = (UI.parseHM ? UI.parseHM(b.start) : _mbxParseHM(b.start));
              const e = (UI.parseHM ? UI.parseHM(b.end) : _mbxParseHM(b.end));
              if(!Number.isFinite(s) || !Number.isFinite(e)) continue;
              if(_mbxBlockHit(nowMin, s, e)) return String(u.name||u.username||'—');
            }
          }
        }
      }
    }catch(_){}

    // Fallback: last known bucket manager for the active bucket (from assignments)
    try{
      const bm = table?.meta?.bucketManagers?.[activeBucketId];
      if(bm && bm.name) return String(bm.name);
    }catch(_){}
    return '—';
  }

  function _mbxFindScheduledManagerForBucket(table, bucket){
    try{
      if(!table || !bucket) return '—';
      const teamId = String(table?.meta?.teamId||'');
      if(!teamId) return '—';
      const shiftKey = String(table?.meta?.shiftKey||'');
      const datePart = (shiftKey.split('|')[1] || '').split('T')[0];
      const shiftStartISO = datePart || (UI.mailboxNowParts ? UI.mailboxNowParts().isoDate : (UI.manilaNow ? UI.manilaNow().isoDate : ''));
      const startDow = _mbxIsoDow(shiftStartISO);
      const nextDow = (startDow + 1) % 7;
      const dows = [startDow, nextDow];

      const bucketStartMin = Number(bucket.startMin)||0;
      const all = (Store.getUsers ? Store.getUsers() : []) || [];
      const candidates = all
        .filter(u=>u && u.teamId===teamId && u.status==='active')
        .slice()
        .sort((a,b)=>{
          const an = String(a?.name||a?.username||'').toLowerCase();
          const bn = String(b?.name||b?.username||'').toLowerCase();
          if(an && bn && an !== bn) return an.localeCompare(bn);
          return String(a?.id||'').localeCompare(String(b?.id||''));
        });

      const roleOrder = ['mailbox_manager','mailbox_call'];
      const matches = [];
      for(const role of roleOrder){
        for(const u of candidates){
          for(const di of dows){
            const bl = Store.getUserDayBlocks ? (Store.getUserDayBlocks(u.id, di) || []) : [];
            for(const b of bl){
              if(String(b?.role||'') !== role) continue;
              const s = (UI.parseHM ? UI.parseHM(b.start) : _mbxParseHM(b.start));
              const e = (UI.parseHM ? UI.parseHM(b.end) : _mbxParseHM(b.end));
              if(!Number.isFinite(s) || !Number.isFinite(e)) continue;
              if(!_mbxBlockHit(bucketStartMin, s, e)) continue;
              const blockSegs = _mbxToSegments(s, e);
              if(!_mbxSegmentsOverlap(bucketSegs, blockSegs)) continue;
              matches.push({
                role,
                roleIdx: roleOrder.indexOf(role),
                startMin: s,
                name: String(u.name||u.username||'—'),
                id: String(u.id||'')
              });
            }
          }
        }
      }
      if(matches.length){
        matches.sort((a,b)=>{
          if(a.roleIdx !== b.roleIdx) return a.roleIdx - b.roleIdx;
          if(a.startMin !== b.startMin) return a.startMin - b.startMin;
          const an = a.name.toLowerCase();
          const bn = b.name.toLowerCase();
          if(an && bn && an !== bn) return an.localeCompare(bn);
          return a.id.localeCompare(b.id);
        });
        return matches[0].name || '—';
      }
    }catch(_){}
    return '—';
  }

  function isPrivilegedRole(u){
    try{
      const r = String(u?.role||'');
      const R = (window.Config && Config.ROLES) ? Config.ROLES : {};
      return r === (R.SUPER_ADMIN||'SUPER_ADMIN') ||
             r === (R.SUPER_USER||'SUPER_USER') ||
             r === (R.ADMIN||'ADMIN') ||
             r === (R.TEAM_LEAD||'TEAM_LEAD');
    }catch(_){ return false; }
  }

  function canAssignNow(opts){
    try{
      if(isPrivilegedRole(me)) return true;
      const duty = opts?.duty || getDuty();
      const nowParts = opts?.nowParts || (UI.mailboxNowParts ? UI.mailboxNowParts() : (UI.manilaNow ? UI.manilaNow() : null));
      const teamId = duty?.current?.id || me.teamId;
      if(eligibleForMailboxManager(me, { teamId, dutyTeam: duty?.current, nowParts })) return true;
      // Fallback: rely on schedule blocks even if duty window metadata drifts.
      return eligibleForMailboxManager(me, { teamId, nowParts });
    }catch(_){
      return false;
    }
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

	  // Route stability guard: the Mailbox page must never overwrite other views.
	  // This prevents background sync listeners (override sync, storage, etc.) from re-rendering
	  // the Mailbox UI when the active route is not /mailbox.
	  function isMailboxRouteActive(){
	    try{
	      if(typeof window._currentPageId === 'string') return window._currentPageId === 'mailbox';
	    }catch(_){ }
	    try{
	      const p = String(location.pathname||'').replace(/^\/+/, '').split('/')[0];
	      const h = String(location.hash||'').replace(/^#\/?/, '').split('/')[0];
	      return p === 'mailbox' || h === 'mailbox';
	    }catch(_){
	      return false;
	    }
	  }

  function render(){
	  if(!isMailboxRouteActive()) return;
    const { shiftKey, table, state } = ensureShiftTables();
    const prevKey = state.previousKey || '';
    const prevTable = prevKey ? (Store.getMailboxTable ? Store.getMailboxTable(prevKey) : null) : null;

    const activeBucketId = computeActiveBucketId(table);
    const totals = computeTotals(table);

    const duty = getDuty();
    const nowParts = (UI.mailboxNowParts ? UI.mailboxNowParts() : (UI.manilaNow ? UI.manilaNow() : null));
    isManager = canAssignNow({ duty, nowParts });
    const mbxMgrName = _mbxFindOnDutyMailboxManagerName(duty.current.id, duty.current, nowParts, table, activeBucketId);


    
// ===== CODE UNTOUCHABLES =====
// Global Override Label must be visible to ALL roles when:
// - scope === 'global'
// - enabled === true
// - override is synced via startMailboxOverrideSync() (cloud localStorage key exists)
// Exception: Only change if required by documented UX specification updates.
// ==============================
const globalOverrideLabelHtml = (function(){
  try{
    const raw = localStorage.getItem('mums_mailbox_time_override_cloud');
    if(!raw) return '';
    const o = JSON.parse(raw);
    if(!o || typeof o !== 'object') return '';
    if(!o.enabled) return '';
    if(String(o.scope||'') !== 'global') return '';
    const ms = Number(o.ms)||0;
    if(!Number.isFinite(ms) || ms <= 0) return '';
    return (window.UI && UI.overrideLabel) ? UI.overrideLabel(o) : '';
  }catch(_){
    return '';
  }
})();

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
            ${globalOverrideLabelHtml}
            <span class="badge override" id="mbOverridePill" title="Mailbox time override is enabled" style="display:none">OVERRIDE</span>
            <!-- ===== CODE UNTOUCHABLES =====
                 Global override banner must be visible to all roles when scope is global.
                 Editing remains Super Admin-only (enforced in backend).
                 Exception: Only change if required by documented UX/security requirements.
                 ============================== -->
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

      ${renderMailboxAnalyticsPanel(table, prevTable, totals, activeBucketId)}

      <div class="mbx-card" style="margin-top:12px">
        <div class="mbx-card-head">
          <div class="mbx-title">
            <div class="mbx-shift-title">${UI.esc(table.meta.teamLabel)}</div>
            <div class="small muted">MAILBOX COUNTER • Shift key: <span class="mono">${UI.esc(shiftKey)}</span></div>
          </div>
          <div class="mbx-tools">
            <span class="badge" id="mbxMgrBadge" title="Mailbox Manager">${UI.esc(mbxMgrName)}</span>
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
          ${renderCaseMonitoring(table, shiftKey)}
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


    // Ensure Assign Case modal is mounted outside the mailbox root so it survives re-renders.
    ensureAssignModalMounted();

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
        if(!canAssignNow()){
          UI.toast('You do not have permission to assign cases right now.', 'warn');
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
    function _mbxHeaderFontPx(name){
      const n = String(name||'').trim();
      const len = n.length;
      if(len <= 12) return 10;
      if(len <= 16) return 9;
      if(len <= 22) return 8;
      return 7;
    }
    function getBucketManagerName(bucket){
      // Scheduled mailbox manager for this bucket (authoritative).
      try{
        const scheduled = _mbxFindScheduledManagerForBucket(table, bucket);
        if(scheduled && scheduled !== '—') return String(scheduled);
      }catch(_){ }

      // 2) Active mailbox manager for the current bucket (fallback for live view)
      try{
        if(activeBucketId && bucket?.id === activeBucketId){
          const duty = getDuty();
          const nowParts = (UI.mailboxNowParts ? UI.mailboxNowParts() : (UI.manilaNow ? UI.manilaNow() : null));
          const live = _mbxFindOnDutyMailboxManagerName(duty?.current?.id, duty?.current, nowParts, table, activeBucketId);
          if(live && live !== '—') return String(live);
        }
      }catch(_){ }

      // 3) Persisted explicit map (from assignment actors)
      try{
        const bm = table && table.meta && table.meta.bucketManagers;
        if(bm && bm[bucket.id] && bm[bucket.id].name) return String(bm[bucket.id].name);
      }catch(_){ }

      // 4) Most recent assignment actor within bucket
      try{
        const a = (table.assignments||[]).find(x=>x.bucketId===bucket.id && (x.actorName||''));
        if(a && a.actorName) return String(a.actorName);
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
              const mgr = getBucketManagerName(b);
              // Show only the assigned user's name (no label). If none yet, keep blank.
              const mgrLabel = mgr ? UI.esc(mgr) : '';
              const fs = _mbxHeaderFontPx(mgr);
              return `<th class="${cls} mbx-time-th"><div class="mbx-th"><div class="mbx-th-top" style="font-size:${fs}px" title="${mgr ? UI.esc(mgr) : 'Mailbox Manager'}">${mgrLabel}</div><div class="mbx-th-time">${UI.esc(_mbxBucketLabel(b))}</div></div></th>`;
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
  let _assignSending = false;

  function _mbxAuthHeader(){
    const jwt = (window.CloudAuth && CloudAuth.accessToken) ? CloudAuth.accessToken() : '';
    return jwt ? { Authorization: `Bearer ${jwt}` } : {};
  }
  function _mbxClientId(){
    try{ return localStorage.getItem('mums_client_id') || ''; }catch(_){ return ''; }
  }

  function ensureAssignModalMounted(){
    try{
      if(document.getElementById('mbxAssignModal')) return;
      const host = document.createElement('div');
      host.className = 'modal';
      host.id = 'mbxAssignModal';
      host.innerHTML = `
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
              <button class="btn primary" type="button" id="mbxSendAssign">
                <span class="mbx-spinner" id="mbxAssignSpin" style="display:none" aria-hidden="true"></span>
                <span id="mbxAssignSendLbl">Send</span>
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(host);

      host.querySelectorAll('[data-close="mbxAssignModal"]').forEach(b=>{
        b.onclick = ()=>{ if(!_assignSending) UI.closeModal('mbxAssignModal'); };
      });
      host.addEventListener('click', (e)=>{
        try{ if(e && e.target === host && !_assignSending) UI.closeModal('mbxAssignModal'); }catch(_){ }
      });
    }catch(e){ console.error('Failed to mount Assign Case modal', e); }
  }

  function setAssignSubmitting(on){
    _assignSending = !!on;
    try{
      const btn = UI.el('#mbxSendAssign');
      const spin = UI.el('#mbxAssignSpin');
      const lbl = UI.el('#mbxAssignSendLbl');
      if(btn) btn.disabled = !!on;
      if(spin) spin.style.display = on ? 'inline-block' : 'none';
      if(lbl) lbl.textContent = on ? 'Sending…' : 'Send';
    }catch(_){ }
  }

  async function mbxPost(path, body){
    const res = await fetch(path, {
      method:'POST',
      headers: { 'Content-Type':'application/json', ..._mbxAuthHeader() },
      body: JSON.stringify(body || {}),
      cache:'no-store'
    });
    const data = await res.json().catch(()=>({}));
    return { res, data };
  }
  function openAssignModal(userId){
    ensureAssignModalMounted();
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

  
  async function sendAssignment(){
    const { shiftKey, table } = ensureShiftTables();
    const uid = _assignUserId;
    if(!uid) return;
    if(_assignSending) return;

    const caseNo = String(UI.el('#mbxCaseNo').value||'').trim();
    const desc = String(UI.el('#mbxDesc').value||'').trim();

    const err = (msg)=>{
      const el = UI.el('#mbxAssignErr');
      if(!el) return alert(msg);
      el.textContent = msg;
      el.style.display='block';
    };

    // Frontend validation
    if(!caseNo) return err('Case # is required.');

    // Permission UX (server enforces final RBAC)
    try{
      const actorNow = (window.Auth && Auth.getUser) ? (Auth.getUser()||{}) : {};
      if(!isPrivilegedRole(actorNow)){
        const duty = getDuty();
        const nowParts = (UI.mailboxNowParts ? UI.mailboxNowParts() : (UI.manilaNow ? UI.manilaNow() : null));
        if(!eligibleForMailboxManager(actorNow, { teamId: duty?.current?.id, dutyTeam: duty?.current, nowParts })){
          UI.toast('Mailbox Manager permission is not active for this duty window.', 'warn');
          return;
        }
      }
    }catch(_){}

    // Duplicate guard (best effort)
    try{
      const state = Store.getMailboxState ? Store.getMailboxState() : {};
      const curKey = state.currentKey || shiftKey;
      const prevKey = state.previousKey || '';
      const tablesToCheck = [curKey, prevKey].filter(Boolean)
        .map(k=>Store.getMailboxTable ? Store.getMailboxTable(k) : null)
        .filter(Boolean);
      const dup = tablesToCheck.some(t => (t.assignments||[]).some(a => String(a.caseNo||'').toLowerCase() === caseNo.toLowerCase()));
      if(dup) return err('Duplicate Case # detected. Please verify and use a unique case number.');
    }catch(_){}

    setAssignSubmitting(true);
    try{
      const { res, data } = await mbxPost('/api/mailbox/assign', {
        shiftKey,
        assigneeId: uid,
        caseNo,
        desc,
        clientId: _mbxClientId() || undefined
      });

      if(res.status === 401){
        setAssignSubmitting(false);
        UI.toast('Session expired. Please log in again.', 'warn');
        try{ window.Auth && Auth.forceLogout && Auth.forceLogout('Session expired. Please log in again.'); }catch(_){}
        return;
      }

      if(!res.ok || !data || !data.ok){
        const msg = (data && (data.message || data.error)) ? String(data.message||data.error) : `Failed (${res.status})`;
        setAssignSubmitting(false);
        return err(msg);
      }

      try{
        if(data.table) Store.saveMailboxTable && Store.saveMailboxTable(shiftKey, data.table, { fromRealtime:true });
      }catch(_){}

      setAssignSubmitting(false);
      UI.closeModal('mbxAssignModal');
      UI.toast('Case assigned.');
      scheduleRender('assign-success');
    }catch(e){
      setAssignSubmitting(false);
      return err(String(e?.message||e));
    }
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

// ===== CODE UNTOUCHABLES =====
// Prevent recursive render/tick loops:
// - Never call render() synchronously from inside tick().
// - Always schedule render via scheduleRender() to avoid call stack overflow.
// - If mailbox override is missing/invalid, fall back to system Manila time.
// Exception: Only change if required by documented UI lifecycle refactors.
// ==============================
let _inTick = false;
let _renderPending = false;
let _lastActiveBucketId = '';

function scheduleRender(reason){
	  if(!isMailboxRouteActive()) return;
  if(_renderPending) return;
  _renderPending = true;

  // Use requestAnimationFrame to avoid synchronous render recursion and to coalesce rapid updates.
  // ===== CODE UNTOUCHABLES =====
  // Do NOT replace this with setTimeout(0) without also preserving the _renderPending guard.
  // Exception: Only change if required by documented UI scheduling changes.
  // ==============================
  const run = ()=>{
    _renderPending = false;
    try{ render(); }catch(e){ console.error('Mailbox scheduled render failed', reason, e); }
  };

  try{
    requestAnimationFrame(run);
  }catch(_){
    setTimeout(run, 0);
  }
}

// Re-render when global override sync updates arrive.
// Visible to all roles when override_scope === 'global'.
// IMPORTANT: listeners must be removed when leaving the Mailbox view so they cannot
// overwrite other pages (e.g., Dashboard) during background sync.
const onMailboxStoreEvent = (e)=>{
  try{
    const k = e && e.detail ? String(e.detail.key||'') : '';
    if(
      k === 'mailbox_override_cloud' ||
      k === 'mailbox_time_override' ||
      k === 'mums_mailbox_time_override_cloud' ||
      k === 'mums_mailbox_time_override' ||
      k === 'mums_mailbox_tables' ||
      k === 'mums_mailbox_state' ||
      k === 'ums_weekly_schedules' ||
      k === 'mums_schedule_blocks' ||
      k === 'ums_users' ||
      k === 'mums_team_config' ||
      k === 'ums_activity_logs'
    ){
      scheduleRender('mailbox-sync');
    }
  }catch(_){ }
};
try{ window.addEventListener('mums:store', onMailboxStoreEvent); }catch(_){ }

// Cross-tab sync: if another tab changes override storage, refresh immediately.
const onMailboxStorageEvent = (e)=>{
  try{
    if(!e || e.storageArea !== localStorage) return;
    const k = String(e.key||'');
    if(
      k === 'mums_mailbox_time_override_cloud' || k === 'mums_mailbox_time_override' ||
      k === 'mums_mailbox_tables' || k === 'mums_mailbox_state' ||
      k === 'ums_weekly_schedules' || k === 'mums_schedule_blocks' || k === 'ums_users' ||
      k === 'mums_team_config' || k === 'ums_activity_logs'
    ){
      // Override keys still use the explicit override sync helper for cloud reconciliation.
      try{
        if(k === 'mums_mailbox_time_override_cloud' || k === 'mums_mailbox_time_override'){
          if(window.Store && Store.startMailboxOverrideSync) Store.startMailboxOverrideSync({ force:true });
        }
      }catch(_){ }
      scheduleRender('storage-sync');
    }
  }catch(_){ }
};
try{ window.addEventListener('storage', onMailboxStorageEvent); }catch(_){ }

  function startTimerLoop(){
    try{ if(_timer) clearInterval(_timer); }catch(_){}
    const tick = ()=>{
      if(_inTick) return;
      _inTick = true;
      try{
      const d = getDuty();
      const el = UI.el('#dutyTimer');
      if(el) el.textContent = UI.formatDuration(d.secLeft);

      const curLbl = UI.el('#mbCurDutyLbl');
      if(curLbl) curLbl.textContent = d.current.label;

      // override indicator
      try{
        const me = (window.Auth && Auth.getUser) ? (Auth.getUser()||{}) : {};
        const isSA = (me.role === (window.Config&&Config.ROLES?Config.ROLES.SUPER_ADMIN:'SUPER_ADMIN'));
        const ov = (window.Store && Store.getMailboxTimeOverride) ? Store.getMailboxTimeOverride() : null;
        const scope = ov ? String(ov.scope||'') : '';
        const validMs = !!(ov && ov.enabled && Number.isFinite(Number(ov.ms)) && Number(ov.ms) > 0);
        const visible = !!(validMs && (scope === 'global' || isSA));
        const pill = UI.el('#mbOverridePill');
        const note = UI.el('#mbOverrideNote');

        if(pill){
          pill.textContent = (scope === 'global') ? 'GLOBAL OVERRIDE' : 'OVERRIDE';
          pill.style.display = visible ? 'inline-flex' : 'none';
        }
        if(note){
          if(visible && scope === 'global'){
            // Compute effective mailbox time to display in banner.
            let eff = validMs ? Number(ov.ms) : 0;
            if(!ov.freeze){
              const setAt = Number(ov.setAt)||Date.now();
              eff = eff + Math.max(0, Date.now() - setAt);
            }
            const p = UI.manilaParts(new Date(eff || Date.now()));
            const pad = (n)=>String(n).padStart(2,'0');
            note.textContent = `Global Override Active — Effective Mailbox Time: ${pad(p.hh)}:${pad(p.mm)}:${pad(p.ss)}`;
            note.style.display = 'block';
          } else {
            note.textContent = 'Countdown is in override mode';
            note.style.display = visible ? 'block' : 'none';
          }
        }
      }catch(_){ }

      // Update pending assignment timers in monitoring table (if present).
      try{
        const timerEls = root.querySelectorAll('[data-assign-at]');
        if(timerEls && timerEls.length){
          const now = Date.now();
          timerEls.forEach(el=>{
            const ts = Number(el.getAttribute('data-assign-at')||0);
            if(!ts) return;
            const sec = Math.floor(Math.max(0, now - ts) / 1000);
            const label = (UI && UI.formatDuration) ? UI.formatDuration(sec) : `${sec}s`;
            el.setAttribute('title', label);
          });
        }
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

  // If current shiftKey changed, rebuild (scheduled to avoid recursive tick/render loops)
  const curKey = (Store.getMailboxState ? Store.getMailboxState().currentKey : '');
  if(curKey && root._lastShiftKey && curKey !== root._lastShiftKey){
    scheduleRender('shift-change');
  }
  root._lastShiftKey = curKey || root._lastShiftKey;

  // If active bucket changed (time advanced OR override state changed), re-render.
  try{
    const t = (Store.getMailboxTable && curKey) ? Store.getMailboxTable(curKey) : null;
    const bid = t ? computeActiveBucketId(t) : '';
    if(bid && bid !== _lastActiveBucketId){
      _lastActiveBucketId = bid;
      scheduleRender('active-bucket-change');
    }
  }catch(_){ }

  // Safety: if global override is missing/invalid, UI.mailboxNowParts will fall back to Manila time.
}finally{
  _inTick = false;
}
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

  
  async function confirmAssignment(shiftKey, assignmentId){
    const me = (window.Auth && Auth.getUser) ? (Auth.getUser()||{}) : {};
    const uid = String(me.id||'');
    if(!uid) return;

    // UI guard: only confirm own assignment from the "My Assigned Cases" panel.
    const table = (Store.getMailboxTable ? Store.getMailboxTable(shiftKey) : null);
    const a = table && Array.isArray(table.assignments) ? table.assignments.find(x=>x && x.id===assignmentId) : null;
    if(!a) return;
    if(String(a.assigneeId||'') !== uid){
      UI.toast('You can only confirm your own assigned cases.', 'warn');
      return;
    }
    if(a.confirmedAt) return;

    try{
      const { res, data } = await mbxPost('/api/mailbox/confirm', {
        shiftKey,
        assignmentId,
        clientId: _mbxClientId() || undefined
      });

      if(res.status === 401){
        UI.toast('Session expired. Please log in again.', 'warn');
        try{ window.Auth && Auth.forceLogout && Auth.forceLogout('Session expired. Please log in again.'); }catch(_){}
        return;
      }

      if(!res.ok || !data || !data.ok){
        const msg = (data && (data.message || data.error)) ? String(data.message||data.error) : `Failed (${res.status})`;
        UI.toast(msg, 'warn');
        return;
      }

      try{
        if(data.table) Store.saveMailboxTable && Store.saveMailboxTable(shiftKey, data.table, { fromRealtime:true });
      }catch(_){}

      UI.toast('Case confirmed.');
      scheduleRender('confirm-success');
    }catch(e){
      UI.toast('Confirm failed: ' + String(e?.message||e), 'warn');
    }
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


  // --- Mailbox Analytics Summary Panel (Enterprise) ---
  function _mbxFmtDur(ms){
    ms = Number(ms)||0;
    if(!Number.isFinite(ms) || ms <= 0) return '—';
    const s = Math.round(ms/1000);
    const h = Math.floor(s/3600);
    const m = Math.floor((s%3600)/60);
    const ss = s%60;
    if(h>0) return `${h}h ${m}m`;
    if(m>0) return `${m}m ${ss}s`;
    return `${ss}s`;
  }

  function renderMailboxAnalyticsPanel(table, prevTable, totals, activeBucketId){
    try{
      const esc = UI.esc;
      const users = (Store.getUsers ? Store.getUsers() : []) || [];
      const byId = Object.fromEntries(users.map(u=>[String(u.id), u]));
      const shiftTotal = Number(totals?.shiftTotal)||0;

      // Counts per role (assignee role)
      const roleCounts = {};
      const assigneeCounts = {};
      for(const a of (table.assignments||[])){
        if(!a) continue;
        const aid = String(a.assigneeId||'');
        if(!aid) continue;
        assigneeCounts[aid] = (assigneeCounts[aid]||0) + 1;
        const r = String(byId[aid]?.role || 'MEMBER');
        roleCounts[r] = (roleCounts[r]||0) + 1;
      }

      const roleRows = Object.entries(roleCounts)
        .sort((a,b)=>b[1]-a[1])
        .slice(0, 8)
        .map(([r,c])=>`<div class="mbx-ana-row"><div class="small">${esc(r)}</div><div class="badge">${c}</div></div>`)
        .join('') || `<div class="small muted">No assignments yet.</div>`;

      // Time block totals (current shift buckets)
      const bucketRows = (table.buckets||[]).map(b=>{
        const c = Number(totals?.colTotals?.[b.id])||0;
        const isActive = String(b.id) === String(activeBucketId||'');
        return `<div class="mbx-ana-row">
          <div class="small ${isActive?'':'muted'}">${esc(_mbxBucketLabel(b))}${isActive?' <span class="badge sm">Active</span>':''}</div>
          <div class="badge">${c}</div>
        </div>`;
      }).join('') || `<div class="small muted">No buckets.</div>`;

      // Avg response time (confirmed only)
      let rtSum = 0, rtN = 0;
      for(const a of (table.assignments||[])){
        if(!a || !a.confirmedAt || !a.assignedAt) continue;
        const dt = Number(a.confirmedAt) - Number(a.assignedAt);
        if(dt>0 && dt < 7*24*60*60*1000){ rtSum += dt; rtN += 1; }
      }
      const avgRT = rtN ? _mbxFmtDur(rtSum/rtN) : '—';

      // Distribution (top assignees)
      const top = Object.entries(assigneeCounts).sort((a,b)=>b[1]-a[1]).slice(0, 8);
      const distRows = top.map(([id,c])=>{
        const name = byId[id]?.name || byId[id]?.username || id.slice(0,6);
        const pct = shiftTotal ? Math.round((c/shiftTotal)*100) : 0;
        const w = Math.max(2, Math.min(100, pct));
        return `<div style="padding:6px 0">
          <div class="row" style="justify-content:space-between;gap:10px">
            <div class="small">${esc(name)}</div>
            <div class="small muted">${c} (${pct}%)</div>
          </div>
          <div class="mbx-ana-bar"><span style="width:${w}%"></span></div>
        </div>`;
      }).join('') || `<div class="small muted">No distribution yet.</div>`;

      // Shift totals (current + previous when available)
      const prevTotal = prevTable ? (computeTotals(prevTable).shiftTotal||0) : 0;
      const shiftRows = `
        <div class="mbx-ana-row"><div class="small">Current shift</div><div class="badge">${shiftTotal}</div></div>
        <div class="mbx-ana-row"><div class="small muted">Previous shift</div><div class="badge">${prevTable ? prevTotal : '—'}</div></div>
        <div class="mbx-ana-row"><div class="small muted">Avg response time</div><div class="badge">${esc(avgRT)}</div></div>
      `;

      return `
        <div class="mbx-card" style="margin-top:12px">
          <div class="mbx-card-head">
            <div class="mbx-title">
              <div class="mbx-shift-title">Mailbox Analytics</div>
              <div class="small muted">Live summary for the current shift table (auto-updates via realtime sync).</div>
            </div>
            <div class="mbx-tools"><span class="badge">${shiftTotal} cases</span></div>
          </div>
          <div class="mbx-analytics">
            <div class="mbx-analytics-grid">
              <div class="mbx-ana-box">
                <div class="small muted" style="margin-bottom:6px">Shift</div>
                ${shiftRows}
              </div>
              <div class="mbx-ana-box">
                <div class="small muted" style="margin-bottom:6px">Cases per role</div>
                ${roleRows}
              </div>
              <div class="mbx-ana-box">
                <div class="small muted" style="margin-bottom:6px">Cases per time block</div>
                ${bucketRows}
              </div>
            </div>
            <div class="mbx-ana-box">
              <div class="small muted" style="margin-bottom:6px">Assignment distribution (top)</div>
              ${distRows}
            </div>
          </div>
        </div>
      `;
    }catch(e){
      return '';
    }
  }

  function buildCaseMonitoringMatrix(table, shiftKey){
    const members = (table.members||[]).slice();
    const by = {};
    for(const m of members){ by[m.id] = []; }

    // Collapse duplicate assignments for the same assignee+case number.
    // Keep the most recent record and prefer a confirmed record when present.
    const pick = new Map();
    for(const a of (table.assignments||[])){
      if(!a) continue;
      const aid = String(a.assigneeId||'').trim();
      const caseNo = String(a.caseNo||'').trim();
      if(!aid || !caseNo) continue;
      const key = `${aid}|${caseNo.toLowerCase()}`;
      const prev = pick.get(key);
      if(!prev){
        pick.set(key, a);
        continue;
      }
      const prevConfirmed = Number(prev.confirmedAt||0) > 0;
      const curConfirmed = Number(a.confirmedAt||0) > 0;
      if(curConfirmed && !prevConfirmed){
        pick.set(key, a);
        continue;
      }
      const prevTs = Number(prev.assignedAt||prev.ts||0);
      const curTs = Number(a.assignedAt||a.ts||0);
      if(curTs >= prevTs) pick.set(key, a);
    }

    for(const a of pick.values()){
      if(!a || !by[a.assigneeId]) continue;
      by[a.assigneeId].push(a);
    }

    const cols = members.map(m=>{
      const list = by[m.id] || [];
      return { id:m.id, name:m.name, count:list.length, list:list.slice().sort((a,b)=>(Number(b.assignedAt||b.ts||0)-Number(a.assignedAt||a.ts||0))) };
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

  function renderCaseMonitoring(table, shiftKey){
    const esc = UI.esc;
    const m = buildCaseMonitoringMatrix(table, shiftKey);
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
        const assignedAt = Number(a.assignedAt||0);
        const sec = assignedAt ? Math.floor(Math.max(0, Date.now() - assignedAt) / 1000) : 0;
        const timer = assignedAt ? ((UI && UI.formatDuration) ? UI.formatDuration(sec) : `${sec}s`) : '';
        const statusIcon = a.confirmedAt
          ? `<span class="mbx-mon-status mbx-mon-done" title="Accepted" aria-label="Accepted">✓</span>`
          : `<span class="mbx-mon-status mbx-mon-wait" data-assign-at="${esc(assignedAt)}" title="${esc(timer)}" aria-label="Waiting for acknowledgement">
              <span class="mbx-mon-wait-dot" aria-hidden="true"></span>
            </span>`;
        return `<td class="${cls}"><span class="mbx-mon-case">${esc(a.caseNo||'')}</span>${statusIcon}</td>`;
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
	  try{ window.removeEventListener('mums:store', onMailboxStoreEvent); }catch(_){ }
	  try{ window.removeEventListener('storage', onMailboxStorageEvent); }catch(_){ }
  };
});
