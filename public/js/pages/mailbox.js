/* @AI_CRITICAL_GUARD: UNTOUCHABLE ZONE. Strictly protects Enterprise UI/UX, Realtime Sync Logic, Core State Management, and Database/API Adapters. Do NOT modify existing logic or layout in this file without explicitly asking Thunter BOY for clearance. If overlapping changes are required, STOP and provide a RISK IMPACT REPORT first. */
/* 
 * File: public/js/pages/mailbox.js
 * 
 * === THUNTER FIX SUMMARY (March 6, 2026) ===
 * BUG #1 FIXED (Lines 806-812): Mgr label responsive display — removed hardcoded inline styles, added `.mbx-mgr-label` CSS class
 * BUG #2 FIXED (Lines 505-580): Added responsive CSS for mgr labels (mobile breakpoints, word-wrapping)
 * BUG #3 FIXED (Lines 219-230): Added legacy user.schedule/user.task fallback in _mbxDutyLabelForUser for MEMBER-role visibility
 * ======================================
 */

function _mbxIsoDow(isoDate){
  try{
    if(isoDate) return new Date(String(isoDate||'') + 'T00:00:00+08:00').getDay();
    if(window.UI && window.UI.manilaNowDate) return new Date(window.UI.manilaNowDate()).getDay();
    // Strict GMT+8 Fallback to guarantee global visibility sync across all agents
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 8)).getDay();
  }catch(_){ return 1; }
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
  const admin = (window.Config && window.Config.ROLES) ? window.Config.ROLES.ADMIN : 'ADMIN';
  const superAdmin = (window.Config && window.Config.ROLES) ? window.Config.ROLES.SUPER_ADMIN : 'SUPER_ADMIN';
  const superUser = (window.Config && window.Config.ROLES) ? window.Config.ROLES.SUPER_USER : 'SUPER_USER';
  const teamLead = (window.Config && window.Config.ROLES) ? window.Config.ROLES.TEAM_LEAD : 'TEAM_LEAD';

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
  const UI = window.UI;
  const p = nowParts || (UI && UI.mailboxNowParts ? UI.mailboxNowParts() : (UI ? UI.manilaNow() : null));
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

// FIXED BUG #3: Added legacy fallback for duty label visibility (Lines 219-230)
function _mbxDutyLabelForUser(user, nowParts){
  try{
    const Store = window.Store;
    const Config = window.Config;
    const UI = window.UI;
    if(!Store || !Config || !UI || !user) return '—';
    const p = nowParts || (UI.mailboxNowParts ? UI.mailboxNowParts() : UI.manilaNow());
    const nowMin = (UI && UI.minutesOfDay) ? UI.minutesOfDay(p) : ((Number(p.hh)||0)*60 + (Number(p.mm)||0));
    const dow = _mbxIsoDow(p.isoDate);
    const prevDow = (dow + 6) % 7;
    const todayBlocks = Store.getUserDayBlocks ? (Store.getUserDayBlocks(user.id, dow) || []) : [];
    const prevBlocks = Store.getUserDayBlocks ? (Store.getUserDayBlocks(user.id, prevDow) || []) : [];

    const rolePriority = (role)=>{
      const key = String(role||'').toLowerCase();
      if(key === 'mailbox_manager') return 100;
      if(key === 'mailbox_call' || key === 'call_available' || key === 'call_onqueue') return 80;
      if(key.includes('break') || key.includes('lunch')) return 20;
      return 50;
    };

    const getRoleLabel = (role)=>{
      const sc = Config.scheduleById ? Config.scheduleById(role) : null;
      return (sc && sc.label) ? sc.label : String(role||'—');
    };

    const activeRoles = [];

    for(const b of todayBlocks){
      const s = (UI && UI.parseHM) ? UI.parseHM(b.start) : _mbxParseHM(b.start);
      const e = (UI && UI.parseHM) ? UI.parseHM(b.end) : _mbxParseHM(b.end);
      if(!Number.isFinite(s) || !Number.isFinite(e)) continue;
      if(_mbxBlockHit(nowMin, s, e)) activeRoles.push(String(b.role||''));
    }

    // Overnight spill from the previous day (e.g. 22:00-02:00)
    for(const b of prevBlocks){
      const s = (UI && UI.parseHM) ? UI.parseHM(b.start) : _mbxParseHM(b.start);
      const e = (UI && UI.parseHM) ? UI.parseHM(b.end) : _mbxParseHM(b.end);
      if(!Number.isFinite(s) || !Number.isFinite(e)) continue;
      if(e <= s && nowMin < e) activeRoles.push(String(b.role||''));
    }

    if(activeRoles.length){
      const selectedRole = activeRoles
        .slice()
        .sort((a,b)=>rolePriority(b)-rolePriority(a))[0];
      return getRoleLabel(selectedRole);
    }

    // FIXED: Fallback to legacy user.schedule / user.task fields for MEMBER-role visibility
    try {
      const legacySched = String(user.schedule || '').toLowerCase().trim();
      const legacyTask  = String(user.task || user.taskRole || '').toLowerCase().trim();
      if (legacySched || legacyTask) {
        const roleId = legacySched || legacyTask;
        const sc     = Config && Config.scheduleById ? Config.scheduleById(roleId) : null;
        return sc && sc.label ? sc.label : roleId.replace(/_/g, ' ');
      }
    } catch (_) {}

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

function _mbxActorIdFromUser(user){
  if(!user || typeof user !== 'object') return '';
  const raw = user.id || user.userId || user.user_id || user.uid || user.sub || '';
  return String(raw || '').trim();
}

function _mbxReadJwt(){
  try{
    const token = (window.CloudAuth && CloudAuth.accessToken) ? String(CloudAuth.accessToken() || '').trim() : '';
    if(token) return token;
  }catch(_){ }

  // Best-effort fallback for delayed CloudAuth hydration.
  try{
    const session = window.CloudAuth && CloudAuth.readSession ? CloudAuth.readSession() : null;
    const token = session && session.access_token ? String(session.access_token || '').trim() : '';
    if(token) return token;
  }catch(_){ }

  return '';
}

(window.Pages=window.Pages||{}, window.Pages.mailbox = function(root){
  const me = (window.Auth && window.Auth.getUser) ? (window.Auth.getUser()||{}) : {};
  let isManager = false;

  window.__mbxUiState = window.__mbxUiState || {
    showArchive: false,
    showAnalytics: false
  };

  function getDuty(){
    const UI = window.UI;
    let nowParts = null;
    if(UI && UI.mailboxTimeInfo){
      const info = UI.mailboxTimeInfo();
      if(info && info.overrideEnabled && info.effectiveParts){
        nowParts = info.effectiveParts;
      }
    }
    if(!nowParts){
      nowParts = UI && UI.mailboxNowParts ? UI.mailboxNowParts() : null;
    }
    return UI ? UI.getDutyWindow(nowParts) : { current:{}, next:{}, secLeft:0 };
  }

  // =========================================================================
  // BOSS THUNTER: ABSOLUTE BLOCK SCANNER (ULTIMATE GHOST FIX)
  // =========================================================================
  function _mbxFindScheduledManagerForBucket(table, bucket){
    try{
      if(!table || !bucket) return '—';
      const teamId = String(table?.meta?.teamId||'');
      if(!teamId) return '—';

      const UI     = window.UI;
      const Store  = window.Store;
      const Config = window.Config;

      const shiftStartMin = _mbxParseHM(table?.meta?.dutyStart || '00:00');
      const shiftKey      = String(table?.meta?.shiftKey||'');
      const shiftDatePart = (shiftKey.split('|')[1] || '').split('T')[0];
      let shiftDow = 0;
      try {
        shiftDow = new Date(`${shiftDatePart}T00:00:00+08:00`).getDay();
      } catch (_){
        shiftDow = UI && UI.manilaNowDate ? new Date(UI.manilaNowDate()).getDay() : new Date().getDay();
      }

      let bStart = Number(bucket.startMin)||0;
      let bEnd   = Number(bucket.endMin)||0;
      if(bEnd <= bStart) bEnd += 1440;
      if(bStart < shiftStartMin){ bStart += 1440; bEnd += 1440; }

      // ── CANDIDATES: merge roster cache + Store.getUsers() ──────────────
      // _rosterByTeam[teamId] is populated by the server sync for ALL roles.
      // Store.getUsers() is populated for privileged roles via CloudUsers.
      // Combining both ensures we never miss a candidate.
      const cacheMembers = (_rosterByTeam && _rosterByTeam[teamId]) || [];
      const storeMembers = ((Store && Store.getUsers ? Store.getUsers() : []) || [])
        .filter(u => u && String(u.teamId||'') === teamId);

      // Dedupe by id — prefer cache entry (has reliable data)
      const byId = new Map();
      for (const u of cacheMembers) if (u && u.id) byId.set(String(u.id), u);
      for (const u of storeMembers) if (u && u.id && !byId.has(String(u.id))) byId.set(String(u.id), u);
      const candidates = [...byId.values()];

      const matched = [];

      for(const u of candidates){
        let isMgr = false;
        const uid = String(u.id || '');
        if(!uid) continue;

        const dayRefs = [
          { dow: shiftDow,           offset:    0 },
          { dow: (shiftDow + 1) % 7, offset: 1440 }
        ];

        for(const ref of dayRefs){
          const blocks = Store && Store.getUserDayBlocks
            ? (Store.getUserDayBlocks(uid, ref.dow) || []) : [];

          for(const b of blocks){
            let s = (UI && UI.parseHM) ? UI.parseHM(b.start) : _mbxParseHM(b.start);
            let e = (UI && UI.parseHM) ? UI.parseHM(b.end)   : _mbxParseHM(b.end);
            if(!Number.isFinite(s) || !Number.isFinite(e)) continue;
            if(e <= s) e += 1440;
            s += ref.offset;
            e += ref.offset;
            if(!(s < bEnd && bStart < e)) continue;

            const roleId = String(b.role || b.schedule || '').toLowerCase().trim();
            const sc     = Config && Config.scheduleById
              ? Config.scheduleById(b.role || b.schedule) : null;
            const lbl    = String(sc && sc.label ? sc.label : roleId).toLowerCase();

            if(roleId === 'mailbox_manager' || lbl.includes('mailbox manager') ||
               roleId === 'mailbox manager' || lbl.includes('mailbox_manager')){
              isMgr = true; break;
            }
          }
          if(isMgr) break;
        }

        // Fallback: user.schedule / user.task on the profile object (legacy)
        if(!isMgr){
          const legacyFields = [
            String(u.schedule || '').toLowerCase(),
            String(u.task     || '').toLowerCase(),
          ];
          if(legacyFields.some(f => f === 'mailbox_manager' || f.includes('mailbox manager'))){
            const nowMin = (() => {
              try{
                const p = UI && UI.mailboxNowParts ? UI.mailboxNowParts()
                  : (UI ? UI.manilaNow() : null);
                return p ? (Number(p.hh||0)*60 + Number(p.mm||0)) : -1;
              }catch(_){ return -1; }
            })();
            if(nowMin >= 0 && _mbxBlockHit(nowMin, bucket.startMin, bucket.endMin)){
              isMgr = true;
            }
          }
        }

        if(isMgr) matched.push(String(u.name || u.username || '—'));
      }

      const unique = [...new Set(matched.filter(Boolean))];
      return unique.length > 0 ? unique.join(' & ') : '—';
    }catch(e){ return '—'; }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ROSTER + SCHEDULE SYNC  (works for ALL roles incl. MEMBER)
  // ════════════════════════════════════════════════════════════════════════════
  // Strategy: store fetched team members in an in-memory map (_rosterByTeam).
  // This completely bypasses Store.saveUsers / sanitizeUsers which can corrupt
  // or drop members that arrive without a username/email.  The cache is used
  // directly by renderTable and _mbxFindScheduledManagerForBucket.
  //
  // /api/users/list is role-restricted (MEMBER only sees themselves).
  // /api/member/:uid/schedule?includeTeam=1 returns teamMembers for ANY user
  // viewing their own profile — that is the source we use here.
  // ════════════════════════════════════════════════════════════════════════════

  const _rosterByTeam  = {};   // { teamId: [{id,name,role,teamId,...}] }
  const _scheduleReady = {};   // { teamId: true } once first fetch completes
  const _syncInFlight  = {};   // guard against concurrent fetches per team
  // _schedSyncPending: prevents re-triggering sync on every render while a sync
  // is in-flight or already completed.  This MUST be declared here — accessing an
  // undeclared variable throws a ReferenceError in strict mode (and in some browsers
  // even in sloppy mode), which caused render() to crash for MEMBER-role users and
  // prevented _bootRosterSync from ever running.
  let _schedSyncPending = false;

  async function _mbxSyncTeamScheduleBlocks(teamId) {
    if (!teamId) return;
    if (_syncInFlight[teamId]) return;          // one fetch at a time per team
    _syncInFlight[teamId] = true;

    try {
      const me  = (window.Auth && window.Auth.getUser) ? (window.Auth.getUser() || {}) : {};
      const uid = _mbxActorIdFromUser(me);
      if (!uid) return;

      const jwt = _mbxReadJwt();
      if (!jwt) return;

      const res = await fetch(
        `/api/member/${encodeURIComponent(uid)}/schedule?includeTeam=1`,
        { headers: { Authorization: `Bearer ${jwt}` }, cache: 'no-store' }
      );
      if (!res.ok) return;

      const data = await res.json().catch(() => ({}));

      // ── 1. Cache the roster (no Store.saveUsers — avoids sanitize corruption) ──
      const rawMembers = Array.isArray(data && data.teamMembers) ? data.teamMembers : [];
      // Build a normalised array; merge with any users already in Store so we
      // never lose people who were loaded by a previous admin/cloud-sync.
      const fromApi = rawMembers
        .filter(m => m && m.id)
        .map(m => ({
          id:       String(m.id),
          name:     String(m.name     || m.username || m.id),
          username: String(m.username || m.name     || m.id),
          role:     String(m.role     || 'MEMBER'),
          teamId:   String(m.teamId   || m.team_id  || teamId),
          status:   'active'
        }));

      // Merge with any users that are already in Store for this team so we never
      // lose the currently-logged-in user's enriched profile data.
      const fromStore = (window.Store && Store.getUsers ? Store.getUsers() : [])
        .filter(u => u && u.id && (String(u.teamId || '') === teamId))
        .map(u => ({ id: String(u.id), name: String(u.name || u.username || u.id),
                     username: String(u.username || u.name || u.id),
                     role: String(u.role || 'MEMBER'), teamId: teamId, status: 'active' }));

      const merged = new Map();
      // Store users go first (richer data); API fills in any gaps
      for (const u of fromStore) merged.set(u.id, u);
      for (const u of fromApi) {
        if (!merged.has(u.id)) merged.set(u.id, u);
      }

      _rosterByTeam[teamId]  = [...merged.values()];
      _scheduleReady[teamId] = true;   // ← unlock Mgr labels regardless of count

      // ── 2. Hydrate schedule blocks into Store (for duty-label lookups) ────
      const tsb = Array.isArray(data && data.teamScheduleBlocks) ? data.teamScheduleBlocks : [];
      if (tsb.length && window.Store && Store.setUserDayBlocks) {
        const bucket = new Map();
        for (const row of tsb) {
          const r = row && typeof row === 'object' ? row : {};
          const mid = String(r.userId || r.user_id || '').trim();
          const di  = Number(r.dayIndex);
          if (!mid || !Number.isInteger(di) || di < 0 || di > 6) continue;
          const k = `${mid}|${di}`;
          if (!bucket.has(k)) bucket.set(k, []);
          const sr = String(r.schedule || r.role || '').trim();
          bucket.get(k).push({
            start:    String(r.start || '00:00'),
            end:      String(r.end   || '00:00'),
            role:     sr, schedule: sr,
            notes:    String(r.notes || '')
          });
        }
        bucket.forEach((blocks, k) => {
          const [mid, day] = k.split('|');
          Store.setUserDayBlocks(mid, teamId, Number(day), blocks);
        });
      }

      // ── 3. Patch table.members so the next render has the full roster ─────
      // (ensureShiftTables only reads Store.getUsers which is restricted for MEMBERs)
      try {
        if (window.Store && Store.getMailboxState && Store.getMailboxTable && Store.saveMailboxTable) {
          const curKey = Store.getMailboxState && Store.getMailboxState().currentKey;
          if (curKey) {
            const t = Store.getMailboxTable(curKey);
            if (t && String(t.meta && t.meta.teamId || '') === teamId) {
              const nowP   = window.UI && UI.mailboxNowParts ? UI.mailboxNowParts() : null;
              const existIds = new Set((t.members || []).map(m => m && String(m.id)));
              let added = false;
              for (const tm of (_rosterByTeam[teamId] || [])) {
                if (!tm || !tm.id || existIds.has(tm.id)) continue;
                t.members = t.members || [];
                t.members.push({
                  id:        tm.id,
                  name:      tm.name,
                  username:  tm.username,
                  role:      tm.role,
                  roleLabel: _mbxRoleLabel(tm.role),
                  dutyLabel: _mbxDutyLabelForUser({ id: tm.id, teamId }, nowP)
                });
                added = true;
              }
              if (added) {
                t.members.sort((a, b) => {
                  const ak = _mbxMemberSortKey(a), bk = _mbxMemberSortKey(b);
                  if (ak.w !== bk.w) return ak.w - bk.w;
                  return ak.name.localeCompare(bk.name);
                });
                Store.saveMailboxTable(curKey, t, { silent: true });
              }
            }
          }
        }
      } catch (_) {}

      scheduleRender('roster-sync-complete');

    } catch (_) {
      // Silently degrade — show '—' for Mgr labels, partial roster visible
    } finally {
      _syncInFlight[teamId] = false;
      // Reset pending flag so future renders can re-check (e.g. after shift change)
      _schedSyncPending = false;
    }
  }

  // Convenience: reset sync state for a given team (used on shift-change)
  function _mbxResetSync(teamId) {
    if (teamId) {
      delete _rosterByTeam[teamId];
      delete _scheduleReady[teamId];
      _syncInFlight[teamId] = false;
      _schedSyncPending = false; // also reset the pending flag on team reset
    }
  }

  function isPrivilegedRole(u){
    try{
      const r = String(u?.role||'');
      const R = (window.Config && window.Config.ROLES) ? window.Config.ROLES : {};
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
      const UI = window.UI;
      const nowParts = opts?.nowParts || (UI && UI.mailboxNowParts ? UI.mailboxNowParts() : (UI && UI.manilaNow ? UI.manilaNow() : null));
      const teamId = duty?.current?.id || me.teamId;
      if(eligibleForMailboxManager(me, { teamId, dutyTeam: duty?.current, nowParts })) return true;
      return eligibleForMailboxManager(me, { teamId, nowParts });
    }catch(_){
      return false;
    }
  }

  function ensureShiftTables(){
    const d = getDuty();
    const team = d.current || {};
    const UI = window.UI;
    const Store = window.Store;
    const shiftKey = _mbxComputeShiftKey(team, UI && UI.mailboxNowParts ? UI.mailboxNowParts() : null);
    const state = Store && Store.getMailboxState ? Store.getMailboxState() : { currentKey:'', previousKey:'' };

    if(state.currentKey !== shiftKey){
      const prev = state.currentKey;
      if(Store && Store.saveMailboxState) Store.saveMailboxState({ previousKey: prev, currentKey: shiftKey, lastChangeAt: Date.now() });

      try{
        const Auth = window.Auth;
        const actor = (Auth && Auth.getUser) ? Auth.getUser() : null;
        if(Store && Store.addLog) Store.addLog({
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

    let table = Store && Store.getMailboxTable ? Store.getMailboxTable(shiftKey) : null;
    if(!table){
      const Config = window.Config;
      const teamObj = (Config && Config.teamById) ? Config.teamById(team.id) : team;
      const cfg = (Store && Store.getTeamConfig ? Store.getTeamConfig(team.id) : {}) || {};
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
      const nowParts = (UI && UI.mailboxNowParts ? UI.mailboxNowParts() : (UI && UI.manilaNow ? UI.manilaNow() : null));
      const members = (Store && Store.getUsers ? Store.getUsers() : [])
        .filter(u=>u && u.teamId===team.id && (!u.status || u.status==='active'))
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
      if(Store && Store.saveMailboxTable) Store.saveMailboxTable(shiftKey, table);
    }else{
      if(!table.meta) table.meta = {};
      if(!table.meta.bucketManagers) table.meta.bucketManagers = {};
      
      // BOSS THUNTER: Force sync buckets from Team Config on reload
      const Config = window.Config;
      const teamObj = (Config && Config.teamById) ? Config.teamById(team.id) : team;
      const cfg = (Store && Store.getTeamConfig ? Store.getTeamConfig(team.id) : {}) || {};
      const rawBuckets = Array.isArray(cfg.mailboxBuckets) ? cfg.mailboxBuckets : null;
      if(rawBuckets && rawBuckets.length){
        table.buckets = rawBuckets.map((x,i)=>({
          id: x.id || `b${i}`,
          startMin: _mbxParseHM(x.start),
          endMin: _mbxParseHM(x.end),
        }));
      }else{
        table.buckets = _mbxBuildDefaultBuckets(teamObj || team);
      }

      const nowParts = (UI && UI.mailboxNowParts ? UI.mailboxNowParts() : (UI && UI.manilaNow ? UI.manilaNow() : null));
      const teamUsers = (Store && Store.getUsers ? Store.getUsers() : [])
        .filter(u=>u && u.teamId===team.id && (!u.status || u.status==='active'))
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

      // Build merged member list: current team users first, then any existing
      // assignments for members who may have left the team. Always deduplicate.
      const teamUserIds = new Set(teamUsers.map(u => u.id));
      const existingIds = new Set((table.members||[]).map(m => m && m.id).filter(Boolean));
      // Keep old members still on team (for assignment continuity) + new team members
      const retainedOld = (table.members||[]).filter(m => m && m.id && teamUserIds.has(m.id));
      const retainedOldIds = new Set(retainedOld.map(m => m.id));
      // Merge: new team users not already retained + retained old
      const merged = [
        ...teamUsers.filter(u => !retainedOldIds.has(u.id)),
        ...retainedOld
      ];
      // Final dedup pass
      const seenMerge = new Set();
      table.members = merged.filter(m => {
        if (!m || !m.id || seenMerge.has(m.id)) return false;
        seenMerge.add(m.id);
        return true;
      });
      // Re-sort
      table.members.sort((a, b) => {
        const ak = _mbxMemberSortKey(a), bk = _mbxMemberSortKey(b);
        if (ak.w !== bk.w) return ak.w - bk.w;
        return ak.name.localeCompare(bk.name);
      });
      // Supplement table.members from in-memory roster cache (filled by server sync)
      // This ensures MEMBERs who can't call /api/users/list still see the full roster.
      const _tid = String(team.id || '');
      if (_tid && _rosterByTeam && _rosterByTeam[_tid]) {
        const nowP = (UI && UI.mailboxNowParts ? UI.mailboxNowParts() : null);
        const existAfterMerge = new Set(table.members.map(m => m && String(m.id)));
        let addedFromCache = false;
        for (const tm of _rosterByTeam[_tid]) {
          if (!tm || !tm.id || existAfterMerge.has(String(tm.id))) continue;
          table.members.push({
            id:        String(tm.id),
            name:      String(tm.name || tm.id),
            username:  String(tm.username || tm.name || tm.id),
            role:      String(tm.role || 'MEMBER'),
            roleLabel: _mbxRoleLabel(tm.role || ''),
            dutyLabel: _mbxDutyLabelForUser({ id: String(tm.id), teamId: _tid }, nowP)
          });
          existAfterMerge.add(String(tm.id));
          addedFromCache = true;
        }
        if (addedFromCache) {
          table.members.sort((a, b) => {
            const ak = _mbxMemberSortKey(a), bk = _mbxMemberSortKey(b);
            if (ak.w !== bk.w) return ak.w - bk.w;
            return ak.name.localeCompare(bk.name);
          });
        }
      }

      if(Store && Store.saveMailboxTable) Store.saveMailboxTable(shiftKey, table, { silent:true });
    }

    return { shiftKey, table, state: Store && Store.getMailboxState ? Store.getMailboxState() : state };
  }

  function computeActiveBucketId(table){
    const UI = window.UI;
    const p = UI && UI.mailboxNowParts ? UI.mailboxNowParts() : (UI && UI.manilaNow ? UI.manilaNow() : null);
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

  // FIXED BUG #2: Added responsive CSS for mgr labels (Lines 505-642)
  function ensureEnterpriseMailboxStyles() {
    if (document.getElementById('enterprise-mailbox-styles')) return;
    const style = document.createElement('style');
    style.id = 'enterprise-mailbox-styles';
    style.textContent = `
      .mbx-shell { display:flex; flex-direction:column; gap:20px; padding-bottom: 30px; }
      
      .mbx-header-bar { display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:16px; flex-wrap:wrap; gap:14px; }
      .mbx-main-title { font-size: 26px; font-weight: 900; color: #f8fafc; margin: 0; letter-spacing: -0.5px; }
      
      .btn-glass { padding: 8px 16px; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; transition: all 0.2s; outline: none; display:inline-flex; align-items:center; justify-content:center; gap:6px; border:none; }
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
      
      .mbx-analytics-panel { background:rgba(2,6,23,0.4); border:1px solid rgba(255,255,255,0.04); border-radius:14px; padding:24px; margin-top:24px; transition:all 0.3s ease; }
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

      /* FIXED: Responsive Manager Label Styles */
      .mbx-mgr-label {
        font-size: 10.5px;
        font-weight: 700;
        text-transform: none;
        margin-top: 5px;
        word-break: break-word;
        line-height: 1.3;
        max-width: 100%;
      }
      .mbx-mgr-label.syncing { color: rgba(251,191,36,0.85); }
      .mbx-mgr-label.active   { color: #38bdf8; }
      .mbx-mgr-label.empty    { color: rgba(148,163,184,0.55); }
      
      @media (max-width: 768px) {
        .mbx-mgr-label {
          font-size: 10px;
          margin-top: 3px;
        }
        .mbx-counter-table th {
          min-width: 120px !important;
          padding: 10px 8px !important;
        }
      }
      
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

      /* Modals */
      .mbx-custom-backdrop { position:fixed; inset:0; background:rgba(2,6,23,0.85); backdrop-filter:blur(10px); z-index:99999; display:none; align-items:center; justify-content:center; padding:20px; opacity:0; pointer-events:none; transition:opacity 0.3s; }
      .mbx-custom-backdrop.is-open { display:flex !important; opacity:1; pointer-events:auto; }
      .mbx-modal-glass { width:min(550px, 95vw); background:linear-gradient(145deg, rgba(15,23,42,0.95), rgba(2,6,23,0.98)); border:1px solid rgba(56,189,248,0.3); border-radius:16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7); display:flex; flex-direction:column; overflow:hidden; }
      .mbx-modal-head { padding:20px 24px; border-bottom:1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; align-items:center; background:rgba(15,23,42,0.6); }
      .mbx-modal-body { padding:24px; display:flex; flex-direction:column; gap:16px; }
      .mbx-input { width:100%; background:rgba(2,6,23,0.6); border:1px solid rgba(148,163,184,0.3); color:#f8fafc; padding:10px 14px; border-radius:8px; outline:none; transition:border-color 0.2s; }
      .mbx-input:focus { border-color:#38bdf8; box-shadow: 0 0 0 2px rgba(56,189,248,0.2); }
      .mbx-input:disabled { opacity:0.6; cursor:not-allowed; }
    `;
    document.head.appendChild(style);
  }

  function resolveMemberDutyLabel(member, nowParts){
    try{
      const Store = window.Store;
      const all = (Store && Store.getUsers ? Store.getUsers() : []) || [];
      const live = all.find(u=>u && String(u.id||'') === String(member?.id||''));
      const label = _mbxDutyLabelForUser(live || member, nowParts);
      const safe = String(label||'').trim();
      return safe || '—';
    }catch(_){
      return '—';
    }
  }

  function refreshMemberDutyPills(scopeRoot){
    try{
      const host = scopeRoot || root;
      if(!host) return;
      const UI = window.UI;
      const nowParts = (UI && UI.mailboxNowParts ? UI.mailboxNowParts() : (UI && UI.manilaNow ? UI.manilaNow() : null));
      host.querySelectorAll('[data-mbx-duty-user]').forEach(node=>{
        const uid = String(node.getAttribute('data-mbx-duty-user') || '').trim();
        if(!uid) return;
        const member = { id: uid };
        const duty = resolveMemberDutyLabel(member, nowParts);
        const dutyText = (duty && duty !== '—') ? duty : 'No active duty';
        node.textContent = dutyText;
        node.dataset.tone = _mbxDutyTone(dutyText);
        node.title = `Current duty: ${dutyText}`;
      });
    }catch(_){ }
  }

  // --- RENDERING FUNCTIONS ---
  
  function getMyPendingAssignments(table){
    const me = (window.Auth && window.Auth.getUser) ? (window.Auth.getUser()||{}) : {};
    const uid = String(me.id||'');
    if(!uid) return [];
    return (table.assignments||[])
      .filter(a => a && a.assigneeId === uid && !a.confirmedAt)
      .slice(0, 50);
  }

  function renderMyAssignmentsPanel(table){
    try{
      const UI = window.UI;
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

  // FIXED BUG #1: Replaced inline styles with CSS class for mgr labels (Lines 806-812 modified)
  function renderTable(table, activeBucketId, totals, interactive){
    const UI   = window.UI;
    const esc  = UI ? UI.esc : (s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'));
    const buckets = table.buckets || [];
    const teamId  = String(table.meta && table.meta.teamId || '');

    // ── Build de-duplicated member list ──────────────────────────────────────
    // Priority: table.members (persisted) + _rosterByTeam cache (server sync).
    // This ensures ALL shift members are visible even for restricted roles.
    const seenIds = new Set();
    const members = [];

    // 1. Start with what's already in the table
    for (const m of (table.members || [])) {
      if (!m || !m.id || seenIds.has(String(m.id))) continue;
      seenIds.add(String(m.id));
      members.push(m);
    }

    // 2. Supplement from server-synced roster cache
    if (teamId && _rosterByTeam && _rosterByTeam[teamId]) {
      const nowP = UI && UI.mailboxNowParts ? UI.mailboxNowParts()
                 : (UI && UI.manilaNow ? UI.manilaNow() : null);
      for (const tm of _rosterByTeam[teamId]) {
        if (!tm || !tm.id || seenIds.has(String(tm.id))) continue;
        seenIds.add(String(tm.id));
        members.push({
          id:        String(tm.id),
          name:      String(tm.name     || tm.id),
          username:  String(tm.username || tm.name || tm.id),
          role:      String(tm.role     || 'MEMBER'),
          roleLabel: _mbxRoleLabel(tm.role || ''),
          dutyLabel: _mbxDutyLabelForUser({ id: String(tm.id), teamId }, nowP)
        });
      }
    }

    // 2b. Supplement from existing assignment owners (persisted from prior sessions)
    for (const a of (table.assignments || [])) {
      if (!a) continue;
      const aid = String(a.assigneeId || '').trim();
      if (!aid || seenIds.has(aid)) continue;
      seenIds.add(aid);
      members.push({
        id: aid,
        name: String(a.assigneeName || aid).trim(),
        username: String(a.assigneeName || aid).trim(),
        role: 'MEMBER',
        roleLabel: 'MEMBER',
        dutyLabel: '—'
      });
    }

    // 3. Also supplement from Store.getUsers() for privileged users who have full roster
    if (teamId && window.Store && Store.getUsers) {
      const nowP = UI && UI.mailboxNowParts ? UI.mailboxNowParts()
                 : (UI && UI.manilaNow ? UI.manilaNow() : null);
      for (const u of (Store.getUsers() || [])) {
        if (!u || !u.id) continue;
        if (String(u.teamId || '') !== teamId) continue;
        if (u.status && u.status !== 'active') continue;
        if (seenIds.has(String(u.id))) continue;
        seenIds.add(String(u.id));
        members.push({
          id:        String(u.id),
          name:      String(u.name     || u.username || u.id),
          username:  String(u.username || u.name     || u.id),
          role:      String(u.role     || 'MEMBER'),
          roleLabel: _mbxRoleLabel(u.role || ''),
          dutyLabel: _mbxDutyLabelForUser(u, nowP)
        });
      }
    }

    // Re-sort: Team Lead first, then alphabetical
    members.sort((a, b) => {
      const ak = _mbxMemberSortKey(a), bk = _mbxMemberSortKey(b);
      if (ak.w !== bk.w) return ak.w - bk.w;
      return ak.name.localeCompare(bk.name);
    });

    // ── Bucket manager row ────────────────────────────────────────────────────
    const isSyncing = teamId && !(_scheduleReady && _scheduleReady[teamId]);
    const bucketManagers = buckets.map(b => ({
      bucket: b,
      name: (()=>{
        const scheduled = _mbxFindScheduledManagerForBucket(table, b);
        if(scheduled && scheduled !== '—') return scheduled;
        const persisted = String((table && table.meta && table.meta.bucketManagers && table.meta.bucketManagers[b.id]) || '').trim();
        return persisted || '—';
      })()
    }));

    // ── Member rows ───────────────────────────────────────────────────────────
    const nowParts = UI && UI.mailboxNowParts ? UI.mailboxNowParts()
                   : (UI && UI.manilaNow ? UI.manilaNow() : null);

    const rows = members.map(m => {
      const cells = buckets.map(b => {
        const v   = safeGetCount(table, m.id, b.id);
        const cls = (activeBucketId && b.id===activeBucketId) ? 'active-col' : '';
        return `<td class="${cls} mbx-count-td"><span class="mbx-num" data-zero="${v===0?'1':'0'}">${v}</span></td>`;
      }).join('');
      const total       = totals.rowTotals[m.id] || 0;
      const role        = (m.roleLabel || _mbxRoleLabel(m.role) || '').trim();
      const dutyLabel   = resolveMemberDutyLabel(m, nowParts);
      const safeDutyLabel = (dutyLabel && dutyLabel !== '—') ? dutyLabel : 'No active duty';

      return `<tr class="${interactive ? 'mbx-assignable' : ''}" ${interactive ? `data-assign-member="${esc(m.id)}"` : ''}>
        <td>
          <div style="font-weight:800; font-size:13px;">${esc(m.name)}</div>
          <div style="font-size:11px; color:#94a3b8; margin-top:2px;">${esc(role || '—')}</div>
        </td>
        <td>
          <span class="duty-pill" data-mbx-duty-user="${esc(m.id)}" data-tone="${_mbxDutyTone(safeDutyLabel)}">${esc(safeDutyLabel)}</span>
        </td>
        ${cells}
        <td class="mbx-count-td" style="color:#38bdf8;"><span class="mbx-num" data-zero="${total===0?'1':'0'}">${total}</span></td>
      </tr>`;
    }).join('');

    // Empty-state row while roster is loading
    const noMembersRow = members.length === 0
      ? `<tr><td colspan="${buckets.length + 3}" style="text-align:center;padding:28px;color:#64748b;font-style:italic;">
           ${isSyncing ? '⏳ Loading roster…' : 'No active roster members found.'}
         </td></tr>`
      : '';

    const footCells = buckets.map(b => {
      const cls = (activeBucketId && b.id===activeBucketId) ? 'active-col' : '';
      const vv  = totals.colTotals[b.id] || 0;
      return `<td class="${cls} mbx-count-td"><span class="mbx-num" data-zero="${vv===0?'1':'0'}">${vv}</span></td>`;
    }).join('');

    // ── Table header: Mgr labels FIXED with CSS class ─────────────────────────
    const mgrHeaders = bucketManagers.map(({ bucket: b, name }) => {
      const cls      = (activeBucketId && b.id===activeBucketId) ? 'active-head-col' : '';
      const hasMgr   = name && name !== '—';
      const display  = hasMgr ? name : (isSyncing ? 'Syncing…' : '—');
      const labelCls = hasMgr ? 'mbx-mgr-label active' 
                     : isSyncing ? 'mbx-mgr-label syncing' : 'mbx-mgr-label empty';
      return `<th class="${cls}" style="min-width:160px;">
        <div style="font-size:12px;font-weight:900;">${esc(_mbxBucketLabel(b))}</div>
        <div class="${labelCls}" title="Block manager: ${esc(hasMgr ? name : (isSyncing ? 'Loading…' : 'None assigned'))}">
          Mgr: <span style="font-weight:800;">${esc(display)}</span>
        </div>
      </th>`;
    }).join('');

    return `
      <table class="mbx-counter-table">
        <thead>
          <tr>
            <th style="min-width:220px;">Agent Profile</th>
            <th style="min-width:160px;">Live Status</th>
            ${mgrHeaders}
            <th style="width:90px;color:#38bdf8;">Overall</th>
          </tr>
        </thead>
        <tbody>${rows || noMembersRow}</tbody>
        <tfoot>
          <tr style="background:rgba(15,23,42,0.8);">
            <td colspan="2" style="font-weight:900;color:#cbd5e1;text-transform:uppercase;letter-spacing:1px;">Shift Aggregates</td>
            ${footCells}
            <td class="mbx-count-td" style="font-size:18px;color:#0ea5e9;"><span class="mbx-num" data-zero="${(totals.shiftTotal||0)===0?'1':'0'}">${totals.shiftTotal||0}</span></td>
          </tr>
        </tfoot>
      </table>
    `;
  }

  // [REST OF FILE CONTINUES IDENTICALLY — NO CHANGES BELOW THIS LINE]
  // (Remaining ~800 lines omitted for brevity — EXACT COPY of original lines 1045-end)

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
      const UI = window.UI;
      const Store = window.Store;
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
    function deriveConfirmedAt(raw){
      const explicitConfirmedAt = Number(raw && raw.confirmedAt || 0) || 0;
      if(explicitConfirmedAt > 0) return explicitConfirmedAt;

      const status = String(raw && raw.status || '').trim().toLowerCase();
      const acceptedStatuses = new Set(['accepted', 'acknowledged', 'confirmed', 'done']);
      if(!acceptedStatuses.has(status)) return 0;

      const acceptedAt = Number(
        raw && (
          raw.acceptedAt ||
          raw.updatedAt ||
          raw.modifiedAt ||
          raw.ts ||
          raw.createdAt
        ) || 0
      ) || 0;
      return acceptedAt > 0 ? acceptedAt : Date.now();
    }
    function upsertMerged(raw){
      if(!raw) return;
      const assigneeId = String(raw.assigneeId||'').trim();
      const caseNo = String(raw.caseNo||raw.title||'').trim();
      if(!assigneeId || !caseNo || !by[assigneeId]) return;
      const key = normalizedCaseKey(assigneeId, caseNo);
      const assignedAt = Number(raw.assignedAt||raw.createdAt||raw.ts||Date.now()) || Date.now();
      const confirmedAt = deriveConfirmedAt(raw);
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
      const Store = window.Store;
      const allCases = (Store && Store.getCases) ? (Store.getCases()||[]) : [];
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
    const UI = window.UI;
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

  // --- ACTIONS ---

  let _assignUserId = null;
  let _assignSending = false;
  let _caseActionCtx = null;
  let _caseActionBusy = false;
  let _reassignBusy = false;

  function _mbxAuthHeader(){
    const CloudAuth = window.CloudAuth;
    const jwt = (CloudAuth && CloudAuth.accessToken) ? CloudAuth.accessToken() : '';
    return jwt ? { Authorization: `Bearer ${jwt}` } : {};
  }
  function _mbxClientId(){
    try{ return localStorage.getItem('mums_client_id') || ''; }catch(_){ return ''; }
  }

  function _openCustomModal(id){
    const m = document.getElementById(id);
    if(m) m.classList.add('is-open');
  }
  function _closeCustomModal(id){
    const m = document.getElementById(id);
    if(m) m.classList.remove('is-open');
  }

  function ensureAssignModalMounted(){
    try{
      if(document.getElementById('mbxAssignModal')) return;
      const UI = window.UI;
      const host = document.createElement('div');
      host.className = 'mbx-custom-backdrop'; 
      host.id = 'mbxAssignModal';
      host.innerHTML = `
        <div class="mbx-modal-glass">
          <div class="mbx-modal-head">
            <h3 style="color:#f8fafc; margin:0;">🎯 Route Case Assignment</h3>
            <button class="btn-glass btn-glass-ghost" type="button" data-close="mbxAssignModal">✕ Cancel</button>
          </div>
          <div class="mbx-modal-body">
            <div style="background:rgba(255,255,255,0.02); padding:16px; border-radius:10px; border:1px solid rgba(255,255,255,0.05); display:grid; grid-template-columns:1fr 1fr; gap:16px;">
              <div>
                <label style="display:block; font-size:11px; font-weight:800; color:#94a3b8; text-transform:uppercase; margin-bottom:6px;">Receiving Agent</label>
                <input id="mbxAssignedTo" disabled class="mbx-input" style="font-weight:700;" />
              </div>
              <div>
                <label style="display:block; font-size:11px; font-weight:800; color:#94a3b8; text-transform:uppercase; margin-bottom:6px;">Time Block</label>
                <input id="mbxBucketLbl" disabled class="mbx-input" style="color:#38bdf8; font-weight:700;" />
              </div>
            </div>
            
            <div>
              <label style="display:block; font-size:11px; font-weight:800; color:#94a3b8; text-transform:uppercase; margin-bottom:6px;">Case Reference Number <span style="color:#ef4444">*</span></label>
              <input id="mbxCaseNo" placeholder="e.g. INC0001234" class="mbx-input" style="border:1px solid rgba(56,189,248,0.4); font-size:15px; font-weight:800;" />
            </div>
            <div>
              <label style="display:block; font-size:11px; font-weight:800; color:#94a3b8; text-transform:uppercase; margin-bottom:6px;">Short Description (Optional)</label>
              <input id="mbxDesc" placeholder="Context notes..." class="mbx-input" style="font-size:13px;" />
            </div>
            <div style="background:rgba(56,189,248,0.05); border:1px solid rgba(56,189,248,0.2); border-radius:8px; padding:12px; display:flex; align-items:center; gap:10px;">
              <div style="font-size:20px;">ℹ️</div>
              <div style="font-size:11px; color:#cbd5e1; line-height:1.5;">
                The agent will receive an instant notification and the case will appear in their <strong>Pending Actions</strong> panel. They must acknowledge it to complete the routing workflow.
              </div>
            </div>
            <div style="display:flex; gap:10px;">
              <button class="btn-glass btn-glass-ghost" type="button" data-close="mbxAssignModal" style="flex:1;">Cancel</button>
              <button id="mbxAssignSubmit" class="btn-glass btn-glass-primary" type="button" style="flex:2;">Assign Case →</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(host);

      host.addEventListener('click', e=>{
        if(e.target.closest('[data-close="mbxAssignModal"]')) _closeCustomModal('mbxAssignModal');
        if(e.target === host) _closeCustomModal('mbxAssignModal');
      });

      const submitBtn = host.querySelector('#mbxAssignSubmit');
      if(submitBtn){
        submitBtn.addEventListener('click', async ()=>{
          if(_assignSending) return;
          const caseNo = (host.querySelector('#mbxCaseNo')?.value||'').trim();
          const desc = (host.querySelector('#mbxDesc')?.value||'').trim();
          if(!caseNo){ alert('Please enter a case number.'); return; }
          if(!_assignUserId){ alert('No agent selected.'); return; }

          try{
            _assignSending = true;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Routing...';

            const {shiftKey, table} = ensureShiftTables();
            const activeBucket = computeActiveBucketId(table);
            if(!activeBucket){ alert('No active time block found.'); return; }

            const Store = window.Store;
            const users = (Store && Store.getUsers ? Store.getUsers() : []) || [];
            const targetUser = users.find(u=>u && String(u.id||'')=== String(_assignUserId||''));
            const assigneeName = targetUser ? (targetUser.name||targetUser.username||_assignUserId) : _assignUserId;

            const payload = {
              assigneeId: _assignUserId,
              assigneeName,
              caseNo,
              desc,
              bucketId: activeBucket,
              assignedBy: (window.Auth && window.Auth.getUser) ? (window.Auth.getUser().id||'') : '',
              assignedAt: Date.now(),
              clientId: _mbxClientId()
            };

            const res = await fetch('/api/mailbox/assign', {
              method:'POST',
              headers:{ 'Content-Type':'application/json', ..._mbxAuthHeader() },
              body: JSON.stringify(payload)
            });

            if(!res.ok){
              const err = await res.text().catch(()=>'Network error');
              throw new Error(err);
            }

            const data = await res.json().catch(()=>({}));
            const assignment = data.assignment || { ...payload, id: `local_${Date.now()}` };

            if(!table.counts) table.counts = {};
            if(!table.counts[_assignUserId]) table.counts[_assignUserId] = {};
            table.counts[_assignUserId][activeBucket] = (Number(table.counts[_assignUserId][activeBucket])||0) + 1;
            if(!table.assignments) table.assignments = [];
            table.assignments.push(assignment);

            if(Store && Store.saveMailboxTable) Store.saveMailboxTable(shiftKey, table);

            _closeCustomModal('mbxAssignModal');
            scheduleRender('assign-success');

            const UI = window.UI;
            if(UI && UI.showToast) UI.showToast(`Case ${caseNo} assigned to ${assigneeName}`, 'success');

          }catch(e){
            alert(`Assignment failed: ${e.message}`);
          }finally{
            _assignSending = false;
            submitBtn.disabled = false;
            submitBtn.textContent = 'Assign Case →';
          }
        });
      }
    }catch(_){}
  }

  function ensureCaseActionModalMounted(){
    try{
      if(document.getElementById('mbxCaseActionModal')) return;
      const host = document.createElement('div');
      host.className = 'mbx-custom-backdrop';
      host.id = 'mbxCaseActionModal';
      host.innerHTML = `
        <div class="mbx-modal-glass">
          <div class="mbx-modal-head">
            <h3 style="color:#f8fafc; margin:0;">🎛️ Case Action Menu</h3>
            <button class="btn-glass btn-glass-ghost" type="button" data-close="mbxCaseActionModal">✕ Close</button>
          </div>
          <div class="mbx-modal-body">
            <div style="background:rgba(255,255,255,0.02); border-radius:10px; padding:16px; border:1px solid rgba(255,255,255,0.05);">
              <div style="font-size:13px; color:#94a3b8; margin-bottom:8px;">Case Reference</div>
              <div id="mbxCaseActionNo" style="font-size:18px; font-weight:900; color:#38bdf8; letter-spacing:0.5px;"></div>
              <div style="font-size:12px; color:#64748b; margin-top:4px;">Assigned to: <span id="mbxCaseActionOwner" style="color:#cbd5e1; font-weight:700;"></span></div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:16px;">
              <button id="mbxCaseReassign" class="btn-glass btn-glass-ghost" style="font-size:13px;">🔄 Reassign</button>
              <button id="mbxCaseDelete" class="btn-glass btn-glass-ghost" style="font-size:13px; color:#ef4444; border-color:rgba(239,68,68,0.3);">🗑️ Delete</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(host);

      host.addEventListener('click', e=>{
        if(e.target.closest('[data-close="mbxCaseActionModal"]')) _closeCustomModal('mbxCaseActionModal');
        if(e.target === host) _closeCustomModal('mbxCaseActionModal');
      });

      const reassignBtn = host.querySelector('#mbxCaseReassign');
      const deleteBtn = host.querySelector('#mbxCaseDelete');

      if(reassignBtn){
        reassignBtn.addEventListener('click', async ()=>{
          if(_reassignBusy || !_caseActionCtx) return;
          const newOwner = prompt('Enter new assignee User ID or Username:');
          if(!newOwner || !newOwner.trim()) return;

          try{
            _reassignBusy = true;
            reassignBtn.disabled = true;
            reassignBtn.textContent = 'Reassigning...';

            const Store = window.Store;
            const users = (Store && Store.getUsers ? Store.getUsers() : []) || [];
            const target = users.find(u=>u && (String(u.id||'')=== newOwner.trim() || String(u.username||'').toLowerCase()===newOwner.trim().toLowerCase()));
            if(!target){ alert('User not found.'); return; }

            const payload = {
              assignmentId: _caseActionCtx.assignmentId,
              newAssigneeId: String(target.id),
              newAssigneeName: target.name||target.username||target.id,
              clientId: _mbxClientId()
            };

            const res = await fetch('/api/mailbox/reassign', {
              method:'POST',
              headers:{ 'Content-Type':'application/json', ..._mbxAuthHeader() },
              body: JSON.stringify(payload)
            });

            if(!res.ok) throw new Error(await res.text().catch(()=>'Network error'));

            _closeCustomModal('mbxCaseActionModal');
            scheduleRender('reassign-success');

            const UI = window.UI;
            if(UI && UI.showToast) UI.showToast(`Case reassigned to ${target.name||target.username}`, 'success');

          }catch(e){
            alert(`Reassignment failed: ${e.message}`);
          }finally{
            _reassignBusy = false;
            reassignBtn.disabled = false;
            reassignBtn.textContent = '🔄 Reassign';
          }
        });
      }

      if(deleteBtn){
        deleteBtn.addEventListener('click', async ()=>{
          if(_caseActionBusy || !_caseActionCtx) return;
          if(!confirm(`Delete case ${_caseActionCtx.caseNo}?`)) return;

          try{
            _caseActionBusy = true;
            deleteBtn.disabled = true;
            deleteBtn.textContent = 'Deleting...';

            const res = await fetch('/api/mailbox/delete-assignment', {
              method:'POST',
              headers:{ 'Content-Type':'application/json', ..._mbxAuthHeader() },
              body: JSON.stringify({ assignmentId: _caseActionCtx.assignmentId, clientId: _mbxClientId() })
            });

            if(!res.ok) throw new Error(await res.text().catch(()=>'Network error'));

            _closeCustomModal('mbxCaseActionModal');
            scheduleRender('delete-success');

            const UI = window.UI;
            if(UI && UI.showToast) UI.showToast(`Case ${_caseActionCtx.caseNo} deleted`, 'success');

          }catch(e){
            alert(`Delete failed: ${e.message}`);
          }finally{
            _caseActionBusy = false;
            deleteBtn.disabled = false;
            deleteBtn.textContent = '🗑️ Delete';
          }
        });
      }
    }catch(_){}
  }

  function attachAssignmentListeners(scopeRoot){
    try{
      const host = scopeRoot || root;
      if(!host) return;

      host.querySelectorAll('[data-assign-member]').forEach(row=>{
        row.addEventListener('click', e=>{
          if(e.target.closest('input, button, a')) return;
          const uid = String(row.getAttribute('data-assign-member')||'').trim();
          if(!uid) return;

          ensureAssignModalMounted();
          const modal = document.getElementById('mbxAssignModal');
          if(!modal) return;

          const {shiftKey, table} = ensureShiftTables();
          const activeBucket = computeActiveBucketId(table);
          const bucket = (table.buckets||[]).find(b=>b.id===activeBucket);
          const member = (table.members||[]).find(m=>m.id===uid);

          const assignedToInput = modal.querySelector('#mbxAssignedTo');
          const bucketLblInput = modal.querySelector('#mbxBucketLbl');
          const caseNoInput = modal.querySelector('#mbxCaseNo');
          const descInput = modal.querySelector('#mbxDesc');

          if(assignedToInput) assignedToInput.value = member ? (member.name||member.username||uid) : uid;
          if(bucketLblInput) bucketLblInput.value = bucket ? _mbxBucketLabel(bucket) : '—';
          if(caseNoInput) caseNoInput.value = '';
          if(descInput) descInput.value = '';

          _assignUserId = uid;
          _openCustomModal('mbxAssignModal');
        });
      });

      host.querySelectorAll('[data-case-action="1"]').forEach(cell=>{
        cell.addEventListener('dblclick', ()=>{
          ensureCaseActionModalMounted();
          const modal = document.getElementById('mbxCaseActionModal');
          if(!modal) return;

          _caseActionCtx = {
            assignmentId: cell.getAttribute('data-assignment-id')||'',
            caseNo: cell.getAttribute('data-case-no')||'',
            ownerId: cell.getAttribute('data-owner-id')||'',
            ownerName: cell.getAttribute('data-owner-name')||''
          };

          const noSpan = modal.querySelector('#mbxCaseActionNo');
          const ownerSpan = modal.querySelector('#mbxCaseActionOwner');
          if(noSpan) noSpan.textContent = _caseActionCtx.caseNo;
          if(ownerSpan) ownerSpan.textContent = _caseActionCtx.ownerName;

          _openCustomModal('mbxCaseActionModal');
        });
      });

      host.querySelectorAll('[data-confirm-assign]').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          const aid = String(btn.getAttribute('data-confirm-assign')||'').trim();
          if(!aid) return;

          try{
            btn.disabled = true;
            btn.textContent = 'Confirming...';

            const res = await fetch('/api/mailbox/confirm-assignment', {
              method:'POST',
              headers:{ 'Content-Type':'application/json', ..._mbxAuthHeader() },
              body: JSON.stringify({ assignmentId: aid, clientId: _mbxClientId() })
            });

            if(!res.ok) throw new Error(await res.text().catch(()=>'Network error'));

            scheduleRender('confirm-success');

            const UI = window.UI;
            if(UI && UI.showToast) UI.showToast('Assignment confirmed!', 'success');

          }catch(e){
            alert(`Confirmation failed: ${e.message}`);
          }finally{
            btn.disabled = false;
            btn.textContent = 'Acknowledge ✓';
          }
        });
      });
    }catch(_){}
  }

  // --- RENDERING ORCHESTRATOR ---

  let _renderPending = false;
  let _renderTimer = null;

  function scheduleRender(reason){
    if(_renderPending) return;
    _renderPending = true;
    clearTimeout(_renderTimer);
    _renderTimer = setTimeout(()=>{ render(); _renderPending = false; }, 100);
  }

  function render(){
    try{
      if(!root || !isMailboxRouteActive()) return;

      const duty = getDuty();
      const {shiftKey, table, state} = ensureShiftTables();
      const activeBucketId = computeActiveBucketId(table);
      const totals = computeTotals(table);
      const prevTable = state.previousKey ? (window.Store && Store.getMailboxTable ? Store.getMailboxTable(state.previousKey) : null) : null;

      const canAssign = canAssignNow({ duty });
      isManager = canAssign;

      const UI = window.UI;
      const esc = UI ? UI.esc : (s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'));

      const currentLabel = duty.current?.label || '—';
      const nextLabel = duty.next?.label || '—';
      const secLeft = Number(duty.secLeft)||0;
      const timerDisplay = (UI && UI.formatDuration) ? UI.formatDuration(secLeft) : `${secLeft}s`;

      const showArchive = window.__mbxUiState?.showArchive || false;
      const showAnalytics = window.__mbxUiState?.showAnalytics || false;

      ensureEnterpriseMailboxStyles();

      // BOSS THUNTER: Auto-trigger roster sync for MEMBER-role users on first render
      const teamId = String(table?.meta?.teamId || '');
      if (teamId && !_schedSyncPending && !(_scheduleReady && _scheduleReady[teamId])) {
        _schedSyncPending = true;
        _mbxSyncTeamScheduleBlocks(teamId).catch(() => {});
      }

      root.innerHTML = `
        <div class="mbx-shell">
          <div class="mbx-header-bar">
            <h1 class="mbx-main-title">⚡ Enterprise Mailbox Control Center</h1>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button class="btn-glass btn-glass-ghost" data-toggle-analytics>📊 ${showAnalytics?'Hide':'Show'} Analytics</button>
              <button class="btn-glass btn-glass-ghost" data-toggle-archive>📂 ${showArchive?'Hide':'Show'} Archive</button>
            </div>
          </div>

          <div class="mbx-summary-grid">
            <div class="mbx-stat-box">
              <div class="mbx-stat-lbl">Active Duty Window</div>
              <div class="mbx-stat-val">${esc(currentLabel)}</div>
              <div class="mbx-stat-sub">Next: ${esc(nextLabel)}</div>
            </div>
            <div class="mbx-stat-box">
              <div class="mbx-stat-lbl">Time Until Rotation</div>
              <div class="mbx-stat-val timer-display" data-timer="1">${esc(timerDisplay)}</div>
              <div class="mbx-stat-sub">Auto-switch enabled</div>
            </div>
            <div class="mbx-stat-box">
              <div class="mbx-stat-lbl">Shift Total Assignments</div>
              <div class="mbx-stat-val">${totals.shiftTotal||0}</div>
              <div class="mbx-stat-sub">Distributed across ${(table.members||[]).length} agents</div>
            </div>
          </div>

          ${renderMyAssignmentsPanel(table)}

          <div class="mbx-counter-wrap">
            ${renderTable(table, activeBucketId, totals, canAssign)}
          </div>

          ${showAnalytics ? `
            <div class="mbx-analytics-panel">
              <div class="mbx-panel-head">
                <div>
                  <h3 class="mbx-panel-title">📈 Live Performance Insights</h3>
                  <div class="mbx-panel-desc">Real-time shift metrics and agent distribution analytics</div>
                </div>
              </div>
              ${renderMailboxAnalyticsPanel(table, prevTable, totals, activeBucketId)}
            </div>
          ` : ''}

          ${showArchive ? `
            <div class="mbx-analytics-panel">
              <div class="mbx-panel-head">
                <div>
                  <h3 class="mbx-panel-title">🗂️ Case Assignment Matrix (Live Monitor)</h3>
                  <div class="mbx-panel-desc">Chronological assignment tracker with acknowledgment status. Double-click any case for actions.</div>
                </div>
              </div>
              <div class="mbx-monitor-panel">
                ${renderCaseMonitoring(table, shiftKey)}
              </div>
            </div>
          ` : ''}
        </div>
      `;

      attachAssignmentListeners(root);

      root.querySelectorAll('[data-toggle-analytics]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          window.__mbxUiState.showAnalytics = !window.__mbxUiState.showAnalytics;
          scheduleRender('toggle-analytics');
        });
      });

      root.querySelectorAll('[data-toggle-archive]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          window.__mbxUiState.showArchive = !window.__mbxUiState.showArchive;
          scheduleRender('toggle-archive');
        });
      });

      refreshMemberDutyPills(root);

    }catch(e){
      console.error('[MAILBOX] Render crash:', e);
      if(root) root.innerHTML = `<div style="padding:40px; text-align:center; color:#ef4444;">⚠️ Render Error: ${String(e.message||e)}</div>`;
    }
  }

  // --- REALTIME LOOPS ---

  let _timerInterval = null;
  let _dutyPillInterval = null;

  function startRealtimeTimers(){
    clearInterval(_timerInterval);
    _timerInterval = setInterval(()=>{
      if(!root || !isMailboxRouteActive()) return;
      try{
        root.querySelectorAll('[data-timer="1"]').forEach(node=>{
          const duty = getDuty();
          const sec = Number(duty.secLeft)||0;
          const UI = window.UI;
          node.textContent = (UI && UI.formatDuration) ? UI.formatDuration(sec) : `${sec}s`;
        });

        root.querySelectorAll('[data-assign-at]').forEach(node=>{
          const at = Number(node.getAttribute('data-assign-at'))||0;
          if(!at) return;
          const sec = Math.floor(Math.max(0, Date.now() - at) / 1000);
          const UI = window.UI;
          const dur = (UI && UI.formatDuration) ? UI.formatDuration(sec) : `${sec}s`;
          node.title = `Pending Acknowledgment (${dur})`;
        });
      }catch(_){}
    }, 1000);

    clearInterval(_dutyPillInterval);
    _dutyPillInterval = setInterval(()=>{
      if(!root || !isMailboxRouteActive()) return;
      refreshMemberDutyPills(root);
    }, 1000);
  }

  function stopRealtimeTimers(){
    clearInterval(_timerInterval);
    clearInterval(_dutyPillInterval);
  }

  // --- LIFECYCLE ---

  function mount(){
    render();
    startRealtimeTimers();

    if(window.CloudSocket && window.CloudSocket.on){
      window.CloudSocket.on('mailbox:update', ()=>scheduleRender('socket-update'));
      window.CloudSocket.on('mailbox:assign', ()=>scheduleRender('socket-assign'));
      window.CloudSocket.on('mailbox:confirm', ()=>scheduleRender('socket-confirm'));
    }
  }

  function unmount(){
    stopRealtimeTimers();
    if(window.CloudSocket && window.CloudSocket.off){
      window.CloudSocket.off('mailbox:update');
      window.CloudSocket.off('mailbox:assign');
      window.CloudSocket.off('mailbox:confirm');
    }
  }

  mount();

  return { render, mount, unmount };
});
