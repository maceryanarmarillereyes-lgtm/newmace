const { getUserFromJwt, getProfileForUserId, serviceSelect, serviceUpsert } = require('../../lib/supabase');

// POST /api/mailbox/assign
// Body: { shiftKey, assigneeId, caseNo, desc? }
//
// Rules:
// - SUPER_ADMIN / SUPER_USER / ADMIN / TEAM_LEAD may assign anytime (any shift/team).
// - MEMBER may assign ONLY when they are on-duty as Mailbox Manager during the active duty window
//   and only for their own duty team.
// - Server re-checks active duty window + active mailbox bucket at commit time (prevents privilege drift).
// - Writes are performed with service role (members cannot write mums_mailbox_tables via sync/push).
// - Appends an enterprise audit log entry to `ums_activity_logs` (mums_documents).

const ADMIN_ROLES = new Set(['SUPER_ADMIN','SUPER_USER','ADMIN','TEAM_LEAD']);

// Manila time helpers (no DST; UTC+08:00).
function manilaNowParts(){
  const d = new Date(Date.now() + 8*60*60*1000);
  const hh = d.getUTCHours();
  const mm = d.getUTCMinutes();
  const isoDate = d.toISOString().slice(0,10);
  const dayIndex = d.getUTCDay(); // 0=Sun
  return { hh, mm, isoDate, dayIndex, nowMin: hh*60+mm, nowMs: Date.now() };
}
function parseHM(hm){
  const s = String(hm||'0:0').split(':');
  const h = Math.max(0, Math.min(23, parseInt(s[0]||'0',10)||0));
  const m = Math.max(0, Math.min(59, parseInt(s[1]||'0',10)||0));
  return h*60+m;
}
function blockHit(nowMin, startMin, endMin){
  const wraps = endMin <= startMin;
  return (!wraps && nowMin>=startMin && nowMin<endMin) || (wraps && (nowMin>=startMin || nowMin<endMin));
}
function currentDutyTeamId(nowMin){
  const morning = { id:'morning', s:parseHM('06:00'), e:parseHM('15:00') };
  const mid     = { id:'mid',     s:parseHM('15:00'), e:parseHM('22:00') };
  const night   = { id:'night',   s:parseHM('22:00'), e:parseHM('06:00') };
  if(blockHit(nowMin, morning.s, morning.e)) return 'morning';
  if(blockHit(nowMin, mid.s, mid.e)) return 'mid';
  if(blockHit(nowMin, night.s, night.e)) return 'night';
  // Fallback (shouldn't happen)
  return 'morning';
}

async function getDocValue(key){
  const q = `select=key,value&key=eq.${encodeURIComponent(key)}&limit=1`;
  const out = await serviceSelect('mums_documents', q);
  if(!out.ok) return { ok:false, error:'select_failed', details: out.json || out.text };
  const row = Array.isArray(out.json) ? out.json[0] : null;
  return { ok:true, value: row ? row.value : null };
}

function computeActiveBucketId(table, nowMin){
  const buckets = Array.isArray(table && table.buckets) ? table.buckets : [];
  if(!buckets.length) return '';
  for(const b of buckets){
    const s = parseHM(b.start);
    const e = parseHM(b.end);
    if(blockHit(nowMin, s, e)) return String(b.id||'');
  }
  return String(buckets[0].id||'');
}

function isMailboxManagerOnDuty(weekly, userId, nowParts){
  try{
    const u = weekly && weekly[userId];
    if(!u) return false;
    const days = (u.days || {});
    const roleSet = new Set(['mailbox_manager','mailbox_call']);
    const nowMin = nowParts.nowMin;
    const dow = nowParts.dayIndex;
    const dows = [dow];

    // For cross-midnight duty window (night shift), include previous day blocks when after midnight.
    const dutyTeamId = currentDutyTeamId(nowMin);
    if(dutyTeamId === 'night'){
      const end = parseHM('06:00');
      if(nowMin < end) dows.push((dow+6)%7);
    }

    for(const di of dows){
      const list = Array.isArray(days[String(di)]) ? days[String(di)] : [];
      for(const b of list){
        if(!b) continue;
        if(!roleSet.has(String(b.role||''))) continue;
        const s = parseHM(b.start);
        const e = parseHM(b.end);
        if(blockHit(nowMin, s, e)) return true;
      }
    }
  }catch(_){}
  return false;
}

function safeString(x, max=240){
  const s = (x==null) ? '' : String(x);
  return s.length>max ? s.slice(0,max) : s;
}

function makeAssignmentId(){
  return 'mbx_srv_' + Math.random().toString(16).slice(2) + '_' + Date.now().toString(36);
}

function pruneLogs(list){
  const arr = Array.isArray(list) ? list : [];
  const cutoff = Date.now() - (183*24*60*60*1000); // ~6 months
  return arr.filter(x => x && x.ts && Number(x.ts) >= cutoff).slice(0, 2500);
}

async function upsertDoc(key, value, actor, profile, clientId){
  const row = {
    key,
    value,
    updated_at: new Date().toISOString(),
    updated_by_user_id: actor.id,
    updated_by_name: profile && profile.name ? profile.name : null,
    updated_by_client_id: clientId || null
  };
  const up = await serviceUpsert('mums_documents', [row], 'key');
  if(!up.ok) return { ok:false, error:'upsert_failed', details: up.json || up.text };
  return { ok:true, json: up.json };
}

module.exports = async (req, res) => {
  try{
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    if(req.method !== 'POST'){
      res.statusCode = 405;
      return res.end(JSON.stringify({ ok:false, error:'Method not allowed' }));
    }

    const auth = req.headers.authorization || '';
    const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
    const actor = await getUserFromJwt(jwt);
    if(!actor){
      res.statusCode = 401;
      return res.end(JSON.stringify({ ok:false, error:'Unauthorized' }));
    }
    const profile = await getProfileForUserId(actor.id);
    const role = safeString(profile && profile.role ? profile.role : 'MEMBER', 40);

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const shiftKey = safeString(body.shiftKey, 120);
    const assigneeId = safeString(body.assigneeId, 80);
    const caseNo = safeString(body.caseNo, 120);
    const desc = safeString(body.desc, 260);
    const clientId = safeString(body.clientId, 120) || null;

    if(!shiftKey || !assigneeId || !caseNo){
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok:false, error:'Missing required fields' }));
    }

    const now = manilaNowParts();
    const dutyTeamId = currentDutyTeamId(now.nowMin);

    // Member gating
    if(!ADMIN_ROLES.has(role)){
      // Must be a member mailbox manager on duty and assigned to current duty team.
      const teamId = safeString(profile && (profile.team_id || profile.teamId) ? (profile.team_id || profile.teamId) : '', 40);
      if(!teamId || teamId !== dutyTeamId){
        res.statusCode = 403;
        return res.end(JSON.stringify({ ok:false, error:'Forbidden (not in duty team)' }));
      }

      const weeklyDoc = await getDocValue('ums_weekly_schedules');
      if(!weeklyDoc.ok){
        res.statusCode = 500;
        return res.end(JSON.stringify({ ok:false, error:'Failed to read schedules', details: weeklyDoc.details }));
      }
      const weekly = weeklyDoc.value || {};
      const onDuty = isMailboxManagerOnDuty(weekly, actor.id, now);
      if(!onDuty){
        res.statusCode = 403;
        return res.end(JSON.stringify({ ok:false, error:'Forbidden (Mailbox Manager duty not active)' }));
      }
    }

    // Load mailbox tables
    const tablesDoc = await getDocValue('mums_mailbox_tables');
    if(!tablesDoc.ok){
      res.statusCode = 500;
      return res.end(JSON.stringify({ ok:false, error:'Failed to read mailbox tables', details: tablesDoc.details }));
    }
    const allTables = (tablesDoc.value && typeof tablesDoc.value === 'object') ? tablesDoc.value : {};
    const table = allTables[shiftKey];
    if(!table || typeof table !== 'object'){
      res.statusCode = 404;
      return res.end(JSON.stringify({ ok:false, error:'Mailbox table not found', shiftKey }));
    }

    // Member: enforce that assignment is within the active duty shift table.
    if(!ADMIN_ROLES.has(role)){
      const tableTeam = safeString(table && table.meta && table.meta.teamId ? table.meta.teamId : '', 40);
      if(tableTeam && tableTeam !== dutyTeamId){
        res.statusCode = 403;
        return res.end(JSON.stringify({ ok:false, error:'Forbidden (shiftKey not current duty shift)' }));
      }
    }

    // Duplicate guard (caseNo across current + previous shift tables if available)
    const lower = caseNo.toLowerCase();
    try{
      const stateDoc = await getDocValue('mums_mailbox_state');
      const st = stateDoc.ok && stateDoc.value && typeof stateDoc.value === 'object' ? stateDoc.value : {};
      const curKey = safeString(st.currentKey || shiftKey, 120);
      const prevKey = safeString(st.previousKey || '', 120);
      const toCheck = [curKey, prevKey].filter(Boolean).map(k=>allTables[k]).filter(t=>t && Array.isArray(t.assignments));
      const dup = toCheck.some(t => t.assignments.some(a => String(a && a.caseNo || '').toLowerCase() === lower));
      if(dup){
        res.statusCode = 409;
        return res.end(JSON.stringify({ ok:false, error:'Duplicate case number', code:'DUPLICATE_CASE' }));
      }
    }catch(_){}

    // Compute active bucket server-side (prevents client drift)
    const bucketId = computeActiveBucketId(table, now.nowMin);
    const buckets = Array.isArray(table.buckets) ? table.buckets : [];
    const bucket = buckets.find(b=>String(b.id||'')===bucketId) || buckets[0] || {};
    const bucketLabel = safeString((bucket.start||'') + '-' + (bucket.end||''), 40);

    // Build assignment
    const assignment = {
      id: makeAssignmentId(),
      caseNo,
      desc,
      assigneeId,
      bucketId: bucketId || safeString(bucket.id, 40),
      assignedAt: Date.now(),
      actorId: actor.id,
      actorName: (profile && profile.name) ? profile.name : (actor.email || ''),
      actorRole: role,
      confirmedAt: 0,
      confirmedById: ''
    };

    // Apply patch with minimal risk of clobbering
    const next = JSON.parse(JSON.stringify(table)); // deep-ish clone for safety
    next.assignments = Array.isArray(next.assignments) ? next.assignments : [];
    next.assignments.unshift(assignment);

    next.counts = (next.counts && typeof next.counts === 'object') ? next.counts : {};
    next.counts[assigneeId] = (next.counts[assigneeId] && typeof next.counts[assigneeId] === 'object') ? next.counts[assigneeId] : {};
    next.counts[assigneeId][assignment.bucketId] = (Number(next.counts[assigneeId][assignment.bucketId]) || 0) + 1;

    // Track current bucket manager for visibility
    next.meta = (next.meta && typeof next.meta === 'object') ? next.meta : {};
    next.meta.bucketManagers = (next.meta.bucketManagers && typeof next.meta.bucketManagers === 'object') ? next.meta.bucketManagers : {};
    next.meta.bucketManagers[assignment.bucketId] = {
      id: actor.id,
      name: assignment.actorName,
      at: Date.now(),
      role
    };

    // Write back mailbox tables doc
    allTables[shiftKey] = next;

    // Upsert with a small conflict-avoidance retry: if a race causes us to lose our new assignment,
    // re-merge against the latest value once.
    let wrote = false;
    for(let attempt=0; attempt<2; attempt++){
      const up = await upsertDoc('mums_mailbox_tables', allTables, actor, profile, clientId);
      if(!up.ok){
        res.statusCode = 500;
        return res.end(JSON.stringify({ ok:false, error:'Failed to update mailbox tables', details: up.details }));
      }
      // Verify our assignment exists (best effort)
      const verify = await getDocValue('mums_mailbox_tables');
      if(verify.ok){
        const vAll = (verify.value && typeof verify.value === 'object') ? verify.value : {};
        const vTable = vAll[shiftKey];
        const ok = !!(vTable && Array.isArray(vTable.assignments) && vTable.assignments.some(a=>a && a.id===assignment.id));
        if(ok){
          wrote = true;
          // Keep verified version as truth
          allTables[shiftKey] = vTable;
          break;
        }
        // Merge and retry (prepend if missing)
        try{
          const latest = vTable && typeof vTable === 'object' ? vTable : next;
          const merged = JSON.parse(JSON.stringify(latest));
          merged.assignments = Array.isArray(merged.assignments) ? merged.assignments : [];
          if(!merged.assignments.some(a=>a && a.id===assignment.id)) merged.assignments.unshift(assignment);
          // counts and bucket manager
          merged.counts = (merged.counts && typeof merged.counts === 'object') ? merged.counts : {};
          merged.counts[assigneeId] = (merged.counts[assigneeId] && typeof merged.counts[assigneeId] === 'object') ? merged.counts[assigneeId] : {};
          if(!merged.counts[assigneeId][assignment.bucketId]){
            merged.counts[assigneeId][assignment.bucketId] = (Number(latest?.counts?.[assigneeId]?.[assignment.bucketId])||0) + 1;
          }
          merged.meta = (merged.meta && typeof merged.meta === 'object') ? merged.meta : {};
          merged.meta.bucketManagers = (merged.meta.bucketManagers && typeof merged.meta.bucketManagers === 'object') ? merged.meta.bucketManagers : {};
          merged.meta.bucketManagers[assignment.bucketId] = merged.meta.bucketManagers[assignment.bucketId] || next.meta.bucketManagers[assignment.bucketId];
          vAll[shiftKey] = merged;
          Object.assign(allTables, vAll);
        }catch(_){}
      }
    }
    if(!wrote){
      // We still proceed; realtime reconciliation will resolve.
      wrote = true;
    }

    // Append audit log entry (document-based)
    try{
      const logsDoc = await getDocValue('ums_activity_logs');
      const prevLogs = (logsDoc.ok && Array.isArray(logsDoc.value)) ? logsDoc.value : [];
      const logEntry = {
        ts: assignment.assignedAt,
        teamId: safeString(next?.meta?.teamId, 40),
        actorId: actor.id,
        actorName: assignment.actorName,
        action: 'MAILBOX_CASE_ASSIGN',
        targetId: caseNo,
        targetName: caseNo,
        msg: `Mailbox case assigned to ${assigneeId}`.trim(),
        detail: `${caseNo}${desc ? (' • '+desc) : ''} • bucket ${bucketLabel} • shiftKey ${shiftKey} • actorRole ${role}`,
        shiftKey,
        bucketId: assignment.bucketId,
        assigneeId,
        actorRole: role
      };
      const nextLogs = pruneLogs([logEntry, ...prevLogs]);
      await upsertDoc('ums_activity_logs', nextLogs, actor, profile, clientId);
    }catch(_){}

    res.statusCode = 200;
    return res.end(JSON.stringify({ ok:true, shiftKey, table: allTables[shiftKey], assignmentId: assignment.id }));
  }catch(e){
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok:false, error:'Server error', details: String(e?.message||e) }));
  }
};
