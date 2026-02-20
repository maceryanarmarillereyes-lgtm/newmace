/* File: public/js/pages/mailbox.js */

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

  if(r===superAdmin || r===superUser || r===admin || r===teamLead) return true;
  if(opts.teamId && String(user.teamId||'') !== String(opts.teamId||'')) return false;

  const UI = window.UI;
  const Store = window.Store;
  const nowParts = opts.nowParts || (UI && UI.mailboxNowParts ? UI.mailboxNowParts() : (UI ? UI.manilaNow() : null));
  if(!UI || !Store || !nowParts) return false;

  const nowMin = _mbxMinutesOfDayFromParts(nowParts);

  if(opts.dutyTeam && !_mbxInDutyWindow(nowMin, opts.dutyTeam)) return false;

  const roleSet = new Set(['mailbox_manager','mailbox_call']);
  const dow = _mbxIsoDow(nowParts.isoDate);
  const dows = [dow];

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
  const start = b.startMin, end = b.endMin;
  if(end > start) return nowMin >= start && nowMin < end;
  return (nowMin >= start) || (nowMin < end);
}
function _mbxBuildDefaultBuckets(team){
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

  let shiftDateISO = p && p.isoDate ? p.isoDate : (UI && UI.manilaNow ? UI.manilaNow().isoDate : '');
  if(wraps && nowMin < end){
    try{ shiftDateISO = UI.addDaysISO(shiftDateISO, -1); }catch(_){}
  }
  return `${team.id}|${shiftDateISO}T${team.dutyStart||'00:00'}`;
}

function _mbxRoleLabel(role){
  return String(role||'').replaceAll('_',' ').trim();
}

function _mbxDutyLabelForUser(user, nowParts){
  try{
    const Store = window.Store;
    const Config = window.Config;
    const UI = window.UI;
    if(!Store || !Config || !UI || !user) return '—';
    const p = nowParts || (UI.mailboxNowParts ? UI.mailboxNowParts() : UI.manilaNow());
    const nowMin = UI.minutesOfDay(p);
    const dow = (new Date(UI.manilaNowDate()).getDay()); 
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

function _mbxDutyTone(label){
  const t = String(label||'').toLowerCase();
  if(!t || t === '—' || t === 'n/a') return 'idle';
  if(t.includes('mailbox manager')) return 'manager';
  if(t.includes('mailbox call')) return 'call';
  if(t.includes('break') || t.includes('lunch')) return 'break';
  return 'active';
}

(window.Pages=window.Pages||{}, window.Pages.mailbox = function(root){
  const me = (window.Auth && Auth.getUser) ? (Auth.getUser()||{}) : {};
  let isManager = false;

  // Persistent UI State
  root._uiState = root._uiState || {
    showArchive: false,
    showAnalytics: false
  };

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

  // STRICT SCHEDULE EVALUATION FOR MAILBOX MANAGERS PER BUCKET
  function _mbxFindScheduledManagerForBucket(table, bucket){
    try{
      if(!table || !bucket) return '—';
      const teamId = String(table?.meta?.teamId||'');
      if(!teamId) return '—';
      
      const shiftKey = String(table?.meta?.shiftKey||'');
      const datePart = (shiftKey.split('|')[1] || '').split('T')[0];
      const shiftStartISO = datePart || (UI.mailboxNowParts ? UI.mailboxNowParts().isoDate : (UI.manilaNow ? UI.manilaNow().isoDate : ''));

      const bucketStartMin = Number(bucket.startMin)||0;
      const shiftStartMin = _mbxParseHM(table.meta.dutyStart || '00:00');

      let targetDateISO = shiftStartISO;
      if (bucketStartMin < shiftStartMin && bucketStartMin <= 1440) {
         targetDateISO = UI.addDaysISO(shiftStartISO, 1);
      }
      const targetDow = _mbxIsoDow(targetDateISO);

      const all = (window.Store && Store.getUsers ? Store.getUsers() : []) || [];
      const candidates = all.filter(u=>u && u.teamId===teamId && u.status==='active');

      const roleOrder = ['mailbox_manager','mailbox_call'];

      for(const role of roleOrder){
        for(const u of candidates){
          const bl = window.Store && Store.getUserDayBlocks ? (Store.getUserDayBlocks(u.id, targetDow) || []) : [];
          for(const b of bl){
            if(String(b?.role||'') !== role) continue;
            const s = (window.UI && UI.parseHM ? UI.parseHM(b.start) : _mbxParseHM(b.start));
            const e = (window.UI && UI.parseHM ? UI.parseHM(b.end) : _mbxParseHM(b.end));
            if(!Number.isFinite(s) || !Number.isFinite(e)) continue;

            const wraps = e <= s;
            const hit = (!wraps && bucketStartMin >= s && bucketStartMin < e) || (wraps && (bucketStartMin >= s || bucketStartMin < e));
            if(hit) return String(u.name||u.username||'—');
          }
        }
      }
    }catch(e){ console.error("Schedule Evaluation Error", e); }
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
          bucketManagers: {},
          createdAt: Date.now()
        },
        buckets,
        members,
        counts: {}, 
        assignments: [] 
      };
      Store.saveMailboxTable && Store.saveMailboxTable(shiftKey, table);
    }else{
      if(!table.meta) table.meta = {};
      if(!table.meta.bucketManagers) table.meta.bucketManagers = {};
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

  function ensureEnterpriseMailboxStyles() {
    if (document.getElementById('enterprise-mailbox-styles')) return;
    const style = document.createElement('style');
    style.id = 'enterprise-mailbox-styles';
    style.textContent = `
      .mbx-shell { display:flex; flex-direction:column; gap:20px; padding-bottom: 30px; }
      .mbx-header-bar { display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:16px; flex-wrap:wrap; gap:14px; }
      .mbx-main-title { font-size: 26px; font-weight: 900; color: #f8fafc; margin: 0; letter-spacing: -0.5px; }
      .btn-glass { padding: 8px 16px; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; transition: all 0.2s; outline: none; display:inline-flex; align-items:center; justify-content:center; gap:6px; }
      .btn-glass-ghost { background: rgba(255,255,255,0.05); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.1); }
      .btn-glass-ghost:hover { background: rgba(255,255,255,0.1); color: #f8fafc; border-color: rgba(255,255,255,0.2); }
      .btn-glass-primary { background: linear-gradient(145deg, #0ea5e9, #0284c7); color: #fff; border: 1px solid rgba(56,189,248,0.4); box-shadow: 0 4px 12px rgba(14,165,233,0.3); }
      .btn-glass-primary:hover:not(:disabled) { background: linear-gradient(145deg, #38bdf8, #0ea5e9); transform: translateY(-1px); box-shadow: 0 6px 16px rgba(14,165,233,0.4); }
      .mbx-summary-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:16px; }
      .mbx-stat-box { background:linear-gradient(145deg, rgba(30,41,59,0.4), rgba(15,23,42,0.6)); border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:20px; box-shadow: 0 8px 24px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.02); display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; transition:transform 0.2s; }
      .mbx-stat-box:hover { transform: translateY(-2px); border-color: rgba(56,189,248,0.3); }
      .mbx-stat-lbl { font-size:11px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px; }
      .mbx-stat-val { font-size:24px; font-weight:900; color:#f8fafc; letter-spacing:-0.5px; }
      .mbx-stat-sub { font-size:12px; color:#64748b; margin-top:4px; font-weight:600; }
      .timer-display { font-variant-numeric: tabular-nums; font-family: 'Courier New', Courier, monospace; color:#38bdf8; text-shadow: 0 0 10px rgba(56,189,248,0.3); }
      .mbx-analytics-panel { background:rgba(2,6,23,0.4); border:1px solid rgba(255,255,255,0.04); border-radius:14px; padding:24px; margin-top:24px; transition:max-height 0.3s ease; }
      .mbx-panel-head { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:12px; margin-bottom:16px; }
      .mbx-panel-title { font-size:18px; font-weight:800; color:#f8fafc; margin:0; }
      .mbx-panel-desc { font-size:12px; color:#94a3b8; margin-top:4px; }
      .mbx-analytics-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap:20px; }
      @media (max-width: 900px) { .mbx-analytics-grid { grid-template-columns: 1fr; } }
      .mbx-ana-card { background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.03); border-radius:10px; padding:16px; }
      .mbx-ana-row { display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.02); }
      .mbx-ana-row:last-child { border-bottom:none; }
      .mbx-ana-badge { background:rgba(56,189,248,0.1); color:#38bdf8; padding:4px 10px; border-radius:999px; font-size:12px; font-weight:800; }
      .mbx-ana-bar-wrap { height:6px; background:rgba(2,6,23,0.8); border-radius:999px; overflow:hidden; margin-top:6px; }
      .mbx-ana-bar-fill { height:100%; background:linear-gradient(90deg, #0ea5e9, #38bdf8); border-radius:999px; }
      .mbx-counter-wrap { border:1px solid rgba(255,255,255,0.06); border-radius:12px; overflow-x:auto; box-shadow: inset 0 2px 10px rgba(0,0,0,0.2); background:rgba(2,6,23,0.5); }
      .mbx-counter-table { width:100%; border-collapse:collapse; min-width:800px; }
      .mbx-counter-table th { background:rgba(15,23,42,0.95); padding:14px 12px; font-size:11px; font-weight:800; color:#cbd5e1; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid rgba(255,255,255,0.08); position:sticky; top:0; z-index:10; backdrop-filter:blur(8px); }
      .mbx-counter-table th.active-head-col { background:rgba(14,165,233,0.15); color:#38bdf8; border-bottom-color:#38bdf8; }
      .mbx-counter-table td { padding:12px; border-bottom:1px solid rgba(255,255,255,0.02); font-size:13px; color:#e2e8f0; vertical-align:middle; }
      .mbx-counter-table tr:hover { background:rgba(255,255,255,0.03); }
      .mbx-counter-table tr.mbx-assignable { cursor:pointer; }
      .mbx-counter-table td.active-col { background:rgba(14,165,233,0.05); }
      .mbx-count-td { text-align:center; font-weight:800; font-size:15px; }
      .mbx-num[data-zero="1"] { opacity:0.3; }
      .duty-pill { display:inline-block; padding:4px 12px; border-radius:999px; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; }
      .duty-pill[data-tone="idle"] { background:rgba(148,163,184,0.1); color:#94a3b8; }
      .duty-pill[data-tone="active"] { background:rgba(16,185,129,0.1); color:#34d399; border:1px solid rgba(16,185,129,0.2); }
      .duty-pill[data-tone="manager"] { background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid rgba(56,189,248,0.3); }
      .duty-pill[data-tone="call"] { background:rgba(245,158,11,0.15); color:#fbbf24; border:1px solid rgba(245,158,11,0.3); }
      .duty-pill[data-tone="break"] { background:rgba(239,68,68,0.1); color:#fca5a5; }
      .mbx-monitor-panel { border:1px solid rgba(255,255,255,0.06); border-radius:12px; background:rgba(15,23,42,0.4); overflow-x:auto; }
      .mbx-mon-table { width:100%; border-collapse:collapse; min-width:800px; }
      .mbx-mon-table th { background:rgba(15,23,42,0.9); padding:12px 10px; font-size:12px; font-weight:800; color:#cbd5e1; border-bottom:1px solid rgba(255,255,255,0.08); text-align:center; }
      .mbx-mon-table td { padding:10px; border:1px solid rgba(255,255,255,0.02); text-align:center; vertical-align:middle; transition:background 0.2s;}
      .mbx-mon-cell { cursor:pointer; }
      .mbx-mon-cell:hover { background:rgba(56,189,248,0.1) !important; box-shadow:inset 0 0 0 1px rgba(56,189,248,0.3); }
      .mbx-mon-cell.confirmed { background:rgba(16,185,129,0.05); }
      .mbx-case-badge { display:inline-flex; align-items:center; gap:6px; background:rgba(2,6,23,0.8); padding:4px 10px; border-radius:6px; border:1px solid rgba(255,255,255,0.05); font-size:12px; font-weight:700; color:#f8fafc; }
      .mbx-stat-wait { color:#fcd34d; animation: mbxPulse 1.5s infinite; }
      .mbx-stat-done { color:#10b981; }
      @keyframes mbxPulse { 0% { opacity:1; } 50% { opacity:0.5; } 100% { opacity:1; } }
    `;
    document.head.appendChild(style);
  }

  // --- MISSING FUNCTIONS RESTORED ---
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
        return `
        <div style="background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); border-radius:10px; padding:16px; display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; box-shadow:0 4px 12px rgba(245,158,11,0.05);">
          <div>
            <div style="font-size:15px; font-weight:900; color:#fcd34d; margin-bottom:4px;">${esc(a.caseNo||'')}</div>
            <div style="font-size:12px; color:#fbbf24;">${esc(_mbxBucketLabel(b))}${a.desc ? ' • '+esc(a.desc) : ''}</div>
          </div>
          <button class="btn-glass btn-glass-action" data-confirm-assign="${esc(a.id)}">Acknowledge ✓</button>
        </div>`;
      }).join('');
      
      return `
        <div class="mbx-analytics-panel" style="background:rgba(15,23,42,0.8); border-color:rgba(245,158,11,0.3);">
          <div class="mbx-panel-head">
            <div>
              <h3 class="mbx-panel-title" style="color:#fcd34d;">⚠️ Action Required: My Pending Cases</h3>
              <div class="mbx-panel-desc" style="color:#fbbf24; opacity:0.8;">Acknowledge tasks assigned to you to update the live matrix.</div>
            </div>
            <div class="mbx-ana-badge" style="background:rgba(245,158,11,0.2); color:#fcd34d; font-size:14px; border:1px solid rgba(245,158,11,0.4);">${list.length} Pending</div>
          </div>
          <div>${items}</div>
        </div>
      `;
    }catch(_){ return ''; }
  }

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
  // --- END RESTORED FUNCTIONS ---

  function render(){
	  if(!isMailboxRouteActive()) return;
    ensureEnterpriseMailboxStyles();
    
    const { shiftKey, table, state } = ensureShiftTables();
    const prevKey = state.previousKey || '';
    const prevTable = prevKey ? (Store.getMailboxTable ? Store.getMailboxTable(prevKey) : null) : null;

    const activeBucketId = computeActiveBucketId(table);
    const totals = computeTotals(table);

    const duty = getDuty();
    const nowParts = (UI.mailboxNowParts ? UI.mailboxNowParts() : (UI.manilaNow ? UI.manilaNow() : null));
    isManager = canAssignNow({ duty, nowParts });
    
    const mbxMgrName = _mbxFindScheduledManagerForBucket(table, (table.buckets||[]).find(b=>b.id===activeBucketId));

    const globalOverrideLabelHtml = (function(){
      try{
        const raw = localStorage.getItem('mums_mailbox_time_override_cloud');
        if(!raw) return '';
        const o = JSON.parse(raw);
        if(!o || typeof o !== 'object') return '';
        if(!o.enabled) return '';
        if(String(o.scope||'') !== 'global') return '';
        return (window.UI && UI.overrideLabel) ? UI.overrideLabel(o) : '';
      }catch(_){ return ''; }
    })();

    const showAnalytics = root._uiState.showAnalytics;
    const showArchive = root._uiState.showArchive;

    root.innerHTML = `
      <div class="mbx-shell">
        <div class="mbx-header-bar">
          <div>
            <h2 class="mbx-main-title">Mailbox Command</h2>
            <div class="mbx-panel-desc" style="margin-top:4px;">Dynamic shift assignment tracking, workload balancing, and live audit logs.</div>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="btn-glass btn-glass-ghost" id="mbxExportCsv">📥 CSV</button>
            <button class="btn-glass btn-glass-ghost" id="mbxExportXlsx">📊 XLSX</button>
            <button class="btn-glass btn-glass-ghost" id="mbxExportPdf">📄 PDF</button>
          </div>
        </div>

        <div class="mbx-summary-grid">
          <div class="mbx-stat-box" style="border-left: 3px solid #38bdf8;">
            <div class="mbx-stat-lbl">Active Roster Shift</div>
            <div id="mbCurDutyLbl" class="mbx-stat-val">${UI.esc(duty.current.label)}</div>
            <div class="mbx-stat-sub">Team Code: ${UI.esc(duty.current.id)}</div>
          </div>
          
          <div class="mbx-stat-box" style="border-left: 3px solid #f59e0b; position:relative; overflow:hidden;">
            ${globalOverrideLabelHtml}
            <span class="mbx-ana-badge" id="mbOverridePill" title="Mailbox time override is enabled" style="display:none; position:absolute; top:10px; right:10px; background:rgba(245,158,11,0.2); color:#fcd34d;">OVERRIDE</span>
            <div class="mbx-stat-lbl">Manila Time (Countdown)</div>
            <div class="mbx-stat-val timer-display" id="dutyTimer">--:--:--</div>
            <div class="mbx-stat-sub">Remaining in shift</div>
            <div class="mbx-stat-sub" id="mbOverrideNote" style="display:none; color:#fca5a5;"></div>
          </div>

          <div class="mbx-stat-box" style="border-left: 3px solid ${isManager ? '#10b981' : '#64748b'};">
            <div class="mbx-stat-lbl">Your Authority Level</div>
            <div class="mbx-stat-val" style="color:${isManager ? '#34d399' : '#e2e8f0'};">${isManager ? 'Mailbox Manager' : 'View Only Access'}</div>
            <div class="mbx-stat-sub">${isManager ? 'Double-click any member row below to assign cases.' : 'Assignments are locked to managers.'}</div>
          </div>
        </div>

        ${renderMyAssignmentsPanel(table)}

        <div class="mbx-analytics-panel" style="padding:0; overflow:hidden;">
          <div class="mbx-panel-head" style="padding:20px 24px ${showAnalytics ? '16px' : '20px'}; margin:0;">
            <div>
              <h3 class="mbx-panel-title">Mailbox Analytics</h3>
              <div class="mbx-panel-desc">Live summary for the current shift table.</div>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
               <span class="mbx-ana-badge" style="font-size:14px; background:transparent; border:1px solid rgba(56,189,248,0.3);">Total Cases: ${totals?.shiftTotal||0}</span>
               <button class="btn-glass btn-glass-ghost" id="mbxToggleAnalytics" style="padding:4px 12px; font-size:11px;">
                  ${showAnalytics ? 'Hide Analytics ▴' : 'Show Analytics ▾'}
               </button>
            </div>
          </div>
          <div id="mbxAnalyticsBody" style="display:${showAnalytics ? 'block' : 'none'}; padding:0 24px 24px 24px;">
            ${renderMailboxAnalyticsPanel(table, prevTable, totals, activeBucketId)}
          </div>
        </div>

        <div class="mbx-analytics-panel" style="padding:0; overflow:hidden;">
          <div class="mbx-panel-head" style="padding:20px 24px 16px 24px; margin:0; background:rgba(15,23,42,0.6);">
            <div>
              <h3 class="mbx-panel-title">${UI.esc(table.meta.teamLabel)} <span style="font-weight:400; opacity:0.8;">| Shift Counter</span></h3>
              <div class="mbx-panel-desc">Real-time assignment distribution map for the active roster.</div>
            </div>
            <div style="text-align:right;">
              <span class="mbx-ana-badge" style="background:rgba(255,255,255,0.05); color:#cbd5e1; border:1px solid rgba(255,255,255,0.1);">
                Active Manager: <strong style="color:#f8fafc;">${UI.esc(mbxMgrName)}</strong>
              </span>
              <div class="mbx-panel-desc" style="margin-top:6px; font-weight:700;">
                Active Block: <span style="color:#38bdf8;">${UI.esc((_mbxBucketLabel((table.buckets||[]).find(b=>b.id===activeBucketId)||table.buckets?.[0]||{startMin:0,endMin:0})))}</span>
              </div>
            </div>
          </div>
          <div class="mbx-counter-wrap" id="mbxTableWrap" style="border:none; border-radius:0;">
            ${renderTable(table, activeBucketId, totals, true)}
          </div>
        </div>

        <div class="mbx-analytics-panel" style="padding:0; overflow:hidden;">
          <div class="mbx-panel-head" style="padding:20px 24px 16px 24px; margin:0; background:rgba(15,23,42,0.6);">
            <div>
              <h3 class="mbx-panel-title">Case Monitoring Matrix</h3>
              <div class="mbx-panel-desc">Double-click any assigned case to open Transfer/Delete controls.</div>
            </div>
            <span class="mbx-ana-badge" id="mbxPendingMine" style="display:none; background:rgba(245,158,11,0.15); color:#fcd34d;">Pending: 0</span>
          </div>
          <div class="mbx-monitor-wrap mbx-monitor-panel" style="border:none; border-radius:0;">
            ${renderCaseMonitoring(table, shiftKey)}
          </div>
        </div>

        <div class="mbx-analytics-panel" style="background:rgba(15,23,42,0.3); border-color:transparent;">
          <div class="mbx-panel-head" style="border-bottom:none; margin-bottom:0;">
            <div>
              <h3 class="mbx-panel-title" style="font-size:16px; color:#cbd5e1;">Historical: Previous Shift</h3>
              <div class="mbx-panel-desc">${prevTable ? UI.esc(prevTable.meta.teamLabel)+' • '+UI.esc(prevKey) : 'No previous shift record.'}</div>
            </div>
            <button class="btn-glass btn-glass-ghost" id="mbxTogglePrev">${prevTable ? (showArchive ? 'Hide Archive' : 'Show Archive') : '—'}</button>
          </div>
          <div id="mbxPrevWrap" style="display:${showArchive ? 'block' : 'none'}; margin-top:16px;">
            <div class="mbx-counter-wrap">
              ${prevTable ? renderTable(prevTable, '', computeTotals(prevTable), false) : ''}
            </div>
          </div>
        </div>

      </div>
    `;

    refreshMemberDutyPills(root);
    ensureAssignModalMounted();
    ensureCaseActionMenuMounted();
    ensureReassignModalMounted();

    const tBtn = UI.el('#mbxTogglePrev');
    if(tBtn){
      tBtn.disabled = !prevTable;
      tBtn.onclick = ()=>{
        root._uiState.showArchive = !root._uiState.showArchive;
        render();
      };
    }

    const aBtn = UI.el('#mbxToggleAnalytics');
    if(aBtn){
      aBtn.onclick = () => {
        root._uiState.showAnalytics = !root._uiState.showAnalytics;
        render();
      };
    }

    UI.el('#mbxExportCsv').onclick = ()=>exportCSV(table);
    UI.el('#mbxExportXlsx').onclick = ()=>exportXLSX(table);
    UI.el('#mbxExportPdf').onclick = ()=>exportPDF(table);

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

    const monitorWrap = root.querySelector('.mbx-monitor-wrap');
    if(monitorWrap){
      monitorWrap.ondblclick = (e)=>{
        const cell = e && e.target ? e.target.closest('td[data-case-action="1"]') : null;
        if(!cell) return;
        if(!canAssignNow()){
          UI.toast('You do not have permission to manage cases right now.', 'warn');
          return;
        }
        openCaseActionMenu({
          shiftKey,
          assignmentId: String(cell.getAttribute('data-assignment-id') || ''),
          caseNo: String(cell.getAttribute('data-case-no') || ''),
          ownerId: String(cell.getAttribute('data-owner-id') || ''),
          ownerName: String(cell.getAttribute('data-owner-name') || '')
        });
      };
    }

    startTimerLoop();
  }

  function renderMailboxAnalyticsPanel(table, prevTable, totals, activeBucketId){
    try{
      const esc = UI.esc;
      const users = (Store.getUsers ? Store.getUsers() : []) || [];
      const byId = Object.fromEntries(users.map(u=>[String(u.id), u]));
      const shiftTotal = Number(totals?.shiftTotal)||0;

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
        .map(([r,c])=>`<div class="mbx-ana-row"><div style="font-weight:600; color:#e2e8f0; font-size:12px;">${esc(r)}</div><div class="mbx-ana-badge">${c}</div></div>`)
        .join('') || `<div class="small muted">No assignments yet.</div>`;

      const bucketRows = (table.buckets||[]).map(b=>{
        const c = Number(totals?.colTotals?.[b.id])||0;
        const isActive = String(b.id) === String(activeBucketId||'');
        return `<div class="mbx-ana-row">
          <div style="font-weight:600; color:${isActive ? '#38bdf8' : '#94a3b8'}; font-size:12px;">
             ${esc(_mbxBucketLabel(b))} ${isActive?' <span style="background:rgba(56,189,248,0.2); color:#7dd3fc; padding:2px 6px; border-radius:4px; font-size:9px; margin-left:6px;">ACTIVE</span>':''}
          </div>
          <div class="mbx-ana-badge" style="background:rgba(255,255,255,0.05); color:#e2e8f0;">${c}</div>
        </div>`;
      }).join('') || `<div class="small muted">No buckets.</div>`;

      let rtSum = 0, rtN = 0;
      for(const a of (table.assignments||[])){
        if(!a || !a.confirmedAt || !a.assignedAt) continue;
        const dt = Number(a.confirmedAt) - Number(a.assignedAt);
        if(dt>0 && dt < 7*24*60*60*1000){ rtSum += dt; rtN += 1; }
      }
      const avgRT = rtN ? _mbxFmtDur(rtSum/rtN) : '—';

      const top = Object.entries(assigneeCounts).sort((a,b)=>b[1]-a[1]).slice(0, 8);
      const distRows = top.map(([id,c])=>{
        const name = byId[id]?.name || byId[id]?.username || id.slice(0,6);
        const pct = shiftTotal ? Math.round((c/shiftTotal)*100) : 0;
        const w = Math.max(2, Math.min(100, pct));
        return `<div style="padding:8px 0;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
            <div style="font-weight:700; color:#e2e8f0; font-size:12px;">${esc(name)}</div>
            <div style="font-weight:900; color:#38bdf8; font-size:12px;">${c} <span style="opacity:0.6; font-size:10px;">(${pct}%)</span></div>
          </div>
          <div class="mbx-ana-bar-wrap"><div class="mbx-ana-bar-fill" style="width:${w}%"></div></div>
        </div>`;
      }).join('') || `<div class="small muted">No distribution yet.</div>`;

      const prevTotal = prevTable ? (computeTotals(prevTable).shiftTotal||0) : 0;
      const shiftRows = `
        <div class="mbx-ana-row"><div style="font-weight:600; color:#e2e8f0; font-size:12px;">Current shift</div><div class="mbx-ana-badge" style="background:rgba(16,185,129,0.15); color:#34d399;">${shiftTotal}</div></div>
        <div class="mbx-ana-row"><div style="font-weight:600; color:#94a3b8; font-size:12px;">Previous shift</div><div class="mbx-ana-badge" style="background:rgba(255,255,255,0.05); color:#94a3b8;">${prevTable ? prevTotal : '—'}</div></div>
        <div class="mbx-ana-row"><div style="font-weight:600; color:#94a3b8; font-size:12px;">Avg Response</div><div class="mbx-ana-badge" style="background:rgba(255,255,255,0.05); color:#cbd5e1;">${esc(avgRT)}</div></div>
      `;

      return `
        <div class="mbx-analytics-grid">
          <div class="mbx-ana-card">
            <div style="font-size:11px; font-weight:800; color:#94a3b8; text-transform:uppercase; margin-bottom:12px;">Shift Tracking</div>
            ${shiftRows}
          </div>
          <div class="mbx-ana-card">
            <div style="font-size:11px; font-weight:800; color:#94a3b8; text-transform:uppercase; margin-bottom:12px;">Assignments per Role</div>
            ${roleRows}
          </div>
          <div class="mbx-ana-card">
            <div style="font-size:11px; font-weight:800; color:#94a3b8; text-transform:uppercase; margin-bottom:12px;">Top Distribution</div>
            ${distRows}
          </div>
        </div>
      `;
    }catch(e){ return ''; }
  }

  function buildCaseMonitoringMatrix(table, shiftKey){
    const members = (table.members||[]).slice();
    const by = {};
    const memberById = {};
    for(const m of members){ by[m.id] = []; memberById[m.id] = m; }

    const mergedByCase = new Map();
    function normalizedCaseKey(assigneeId, caseNo){
      return `${String(assigneeId||'').trim()}|${String(caseNo||'').trim().toLowerCase()}`;
    }
    function upsertMerged(raw){
      if(!raw) return;
      const assigneeId = String(raw.assigneeId||'').trim();
      const caseNo = String(raw.caseNo||raw.title||'').trim();
      if(!assigneeId || !caseNo || !by[assigneeId]) return;
      const key = normalizedCaseKey(assigneeId, caseNo);
      const assignedAt = Number(raw.assignedAt||raw.createdAt||raw.ts||Date.now()) || Date.now();
      const confirmedAt = Number(raw.confirmedAt||0) || 0;
      const existing = mergedByCase.get(key);
      if(!existing){
        mergedByCase.set(key, {
          id: String(raw.id || `merged_${assigneeId}_${caseNo}`),
          caseNo,
          assigneeId,
          assignedAt,
          confirmedAt,
          assigneeName: String(raw.assigneeName || memberById[assigneeId]?.name || assigneeId || '').slice(0,120)
        });
        return;
      }
      existing.assignedAt = Math.max(Number(existing.assignedAt||0), assignedAt);
      existing.confirmedAt = Math.max(Number(existing.confirmedAt||0), confirmedAt);
      if(String(existing.id||'').startsWith('fallback_') && raw.id){
        existing.id = String(raw.id);
      }
      if(!existing.assigneeName){
        existing.assigneeName = String(raw.assigneeName || memberById[assigneeId]?.name || assigneeId || '').slice(0,120);
      }
    }

    for(const a of (table.assignments||[])) upsertMerged(a);

    try{
      const allCases = (window.Store && Store.getCases) ? (Store.getCases()||[]) : [];
      const key = String(shiftKey||'').trim();
      for(const c of allCases){
        if(!c || String(c.shiftKey||'').trim() !== key) continue;
        upsertMerged({
          id: String(c.id || ''),
          caseNo: String(c.caseNo||c.title||'').trim(),
          assigneeId: String(c.assigneeId||'').trim(),
          assigneeName: String(c.assigneeName || c.assignee || '').trim(),
          assignedAt: Number(c.createdAt||c.ts||Date.now()) || Date.now(),
          confirmedAt: Number(c.confirmedAt||0) || 0
        });
      }
    }catch(_){ }

    for(const a of mergedByCase.values()){
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
      return `<div style="padding:30px; text-align:center; color:#94a3b8; font-weight:600;">No members found for this shift.</div>`;
    }
    const head = `<tr>
      <th style="width:40px; text-align:center; background:rgba(15,23,42,0.95); position:sticky; top:0; z-index:10; border-bottom:1px solid rgba(255,255,255,0.08); padding:14px 10px; color:#64748b;">#</th>
      ${m.cols.map(c=>`
        <th style="background:rgba(15,23,42,0.95); position:sticky; top:0; z-index:10; border-bottom:1px solid rgba(255,255,255,0.08); padding:14px 10px;">
           <div style="font-weight:800; font-size:12px; color:#e2e8f0; white-space:nowrap;">${esc(c.name)}</div>
           <div style="font-size:10px; color:#38bdf8; font-weight:900; margin-top:4px;">${c.count} CASES</div>
        </th>`).join('')}
    </tr>`;

    const body = m.rows.map((row, idx)=>{
      const tds = row.map(a=>{
        if(!a) return `<td style="border:1px solid rgba(255,255,255,0.02); background:transparent;"></td>`;
        
        const isConfirmed = !!a.confirmedAt;
        const cls = isConfirmed ? 'mbx-mon-cell confirmed' : 'mbx-mon-cell';
        const assignedAt = Number(a.assignedAt||0);
        const sec = assignedAt ? Math.floor(Math.max(0, Date.now() - assignedAt) / 1000) : 0;
        const timer = assignedAt ? ((UI && UI.formatDuration) ? UI.formatDuration(sec) : `${sec}s`) : '';
        
        const statusHtml = isConfirmed
          ? `<span class="mbx-stat-done" title="Acknowledged">✓</span>`
          : `<span class="mbx-stat-wait" data-assign-at="${esc(assignedAt)}" title="Pending Acknowledgment (${esc(timer)})">⏳</span>`;
          
        const aid = esc(String(a.id||''));
        const caseNo = esc(String(a.caseNo||''));
        const ownerId = esc(String(a.assigneeId||''));
        const ownerName = esc(String(a.assigneeName||''));
        
        return `
          <td class="${cls}" data-case-action="1" data-assignment-id="${aid}" data-case-no="${caseNo}" data-owner-id="${ownerId}" data-owner-name="${ownerName}" title="Double-click to open Action Menu" style="border:1px solid rgba(255,255,255,0.04);">
             <div class="mbx-case-badge ${isConfirmed ? '' : 'glow'}">
                <span style="letter-spacing:0.5px;">${caseNo}</span>
                ${statusHtml}
             </div>
          </td>`;
      }).join('');
      return `<tr><td style="text-align:center; font-size:11px; font-weight:800; color:#64748b; border:1px solid rgba(255,255,255,0.02);">${idx+1}</td>${tds}</tr>`;
    }).join('');

    return `
      <style>
        .mbx-case-badge.glow { border-color:rgba(245,158,11,0.4); box-shadow:0 0 10px rgba(245,158,11,0.1); }
      </style>
      <table class="mbx-mon-table" style="min-width:100%;">
        <thead>${head}</thead>
        <tbody>${body || `<tr><td colspan="${m.cols.length+1}" style="padding:40px; text-align:center; color:#64748b; font-weight:600;">No assignments have been distributed yet.</td></tr>`}</tbody>
      </table>
    `;
  }

  let _inTick = false;
  let _renderPending = false;
  let _lastActiveBucketId = '';

  function scheduleRender(reason){
	  if(!isMailboxRouteActive()) return;
    if(_renderPending) return;
    _renderPending = true;

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

  const onMailboxStoreEvent = (e)=>{
    try{
      const k = e && e.detail ? String(e.detail.key||'') : '';
      if(
        k === 'mailbox_override_cloud' || k === 'mailbox_time_override' ||
        k === 'mums_mailbox_time_override_cloud' || k === 'mums_mailbox_time_override' ||
        k === 'mums_mailbox_tables' || k === 'mums_mailbox_state' ||
        k === 'ums_weekly_schedules' || k === 'mums_schedule_blocks' ||
        k === 'ums_users' || k === 'mums_team_config' ||
        k === 'ums_activity_logs' || k === 'ums_cases'
      ){
        scheduleRender('mailbox-sync');
      }
    }catch(_){ }
  };
  try{ window.addEventListener('mums:store', onMailboxStoreEvent); }catch(_){ }

  const onMailboxStorageEvent = (e)=>{
    try{
      if(!e || e.storageArea !== localStorage) return;
      const k = String(e.key||'');
      if(
        k === 'mums_mailbox_time_override_cloud' || k === 'mums_mailbox_time_override' ||
        k === 'mums_mailbox_tables' || k === 'mums_mailbox_state' ||
        k === 'ums_weekly_schedules' || k === 'mums_schedule_blocks' || k === 'ums_users' ||
        k === 'mums_team_config' || k === 'ums_activity_logs' || k === 'ums_cases'
      ){
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

      try{
        refreshMemberDutyPills(root);
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

      const { state } = ensureShiftTables();
      try{
        const { table } = ensureShiftTables();
        const active = computeActiveBucketId(table);
        const idxMap = {};
        (table.buckets||[]).forEach((b,i)=>idxMap[b.id]=i);
        const activeIdx = idxMap[active];
        root.querySelectorAll('.mbx-counter-table th.active-head-col').forEach(n=>n.classList.remove('active-head-col'));
        if(activeIdx !== undefined){
          const timeHeads = root.querySelectorAll('.mbx-counter-table thead tr:last-child th');
          if(timeHeads && timeHeads[activeIdx + 2]) timeHeads[activeIdx + 2].classList.add('active-head-col');
        }
      }catch(_){ }

      const curKey = (Store.getMailboxState ? Store.getMailboxState().currentKey : '');
      if(curKey && root._lastShiftKey && curKey !== root._lastShiftKey){
        scheduleRender('shift-change');
      }
      root._lastShiftKey = curKey || root._lastShiftKey;

      try{
        const t = (Store.getMailboxTable && curKey) ? Store.getMailboxTable(curKey) : null;
        const bid = t ? computeActiveBucketId(t) : '';
        if(bid && bid !== _lastActiveBucketId){
          _lastActiveBucketId = bid;
          scheduleRender('active-bucket-change');
        }
      }catch(_){ }

      }finally{
        _inTick = false;
      }
    };
    tick();
    _timer = setInterval(()=>{ try{ tick(); }catch(e){ console.error('Mailbox tick', e); } }, 1000);
  }

  render();

  root._cleanup = ()=>{
	  try{ if(_timer) clearInterval(_timer); }catch(_){ }
	  try{ window.removeEventListener('mums:store', onMailboxStoreEvent); }catch(_){ }
	  try{ window.removeEventListener('storage', onMailboxStorageEvent); }catch(_){ }
  };
});