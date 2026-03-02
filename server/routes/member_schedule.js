/* @AI_CRITICAL_GUARD: UNTOUCHABLE ZONE. Do not modify existing UI/UX, layouts, or core logic in this file without explicitly asking Thunter BOY for clearance. If changes are required here, STOP and provide a RISK IMPACT REPORT first. */
const { getUserFromJwt, getProfileForUserId, serviceSelect } = require('../lib/supabase');

const PRIVILEGED_ROLES = new Set(['SUPER_ADMIN', 'SUPER_USER', 'ADMIN', 'TEAM_LEAD']);

function safeString(v, maxLen = 120) {
  const s = v == null ? '' : String(v);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function normalizeRole(v) {
  return safeString(v, 40).trim().toUpperCase() || 'MEMBER';
}

function normalizeTaskType(taskIdOrLabel) {
  return String(taskIdOrLabel || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isHexColor(color) {
  return /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(String(color || '').trim());
}

function normalizePaletteEntry(taskType, color) {
  const taskKey = normalizeTaskType(taskType);
  if (!taskKey || !isHexColor(color)) return null;
  return { key: `task_${taskKey}`, value: String(color).trim().toLowerCase() };
}

function normalizeScheduleBlock(dayIndex, raw) {
  const b = raw && typeof raw === 'object' ? raw : {};
  return {
    dayIndex,
    start: safeString(b.start || b.s || '00:00', 10),
    end: safeString(b.end || b.e || '00:00', 10),
    schedule: safeString(b.schedule || b.task || b.role || b.label || '', 80),
    notes: safeString(b.notes || '', 500)
  };
}

function flattenScheduleBlocks(scheduleDoc, memberId) {
  const root = scheduleDoc && typeof scheduleDoc === 'object' ? scheduleDoc : {};
  const member = root[memberId] && typeof root[memberId] === 'object' ? root[memberId] : {};
  const days = member.days && typeof member.days === 'object' ? member.days : {};

  const out = [];
  for (let day = 0; day <= 6; day++) {
    const list = Array.isArray(days[String(day)]) ? days[String(day)] : [];
    for (const raw of list) out.push(normalizeScheduleBlock(day, raw));
  }
  return out;
}

async function selectDocByKey(key) {
  const q = `select=key,value&key=eq.${encodeURIComponent(String(key || ''))}&limit=1`;
  const out = await serviceSelect('mums_documents', q);
  if (!out.ok) return { ok: false, value: null, error: out.json || out.text };
  const row = Array.isArray(out.json) ? out.json[0] : null;
  return { ok: true, value: row ? row.value : null };
}

async function getScheduleDoc() {
  const primary = await selectDocByKey('mums_schedule_blocks');
  if (primary.ok && primary.value && typeof primary.value === 'object') return primary.value;

  const fallback = await selectDocByKey('ums_weekly_schedules');
  if (fallback.ok && fallback.value && typeof fallback.value === 'object') return fallback.value;

  return {};
}

async function getPaletteFromTable(teamId) {
  const q = `select=task_type_id,base_hex_color&team_id=eq.${encodeURIComponent(teamId)}&limit=500`;
  const out = await serviceSelect('mums_team_task_colors', q);
  if (!out.ok) return null;

  const rows = Array.isArray(out.json) ? out.json : [];
  if (!rows.length) return {};

  const palette = {};
  for (const row of rows) {
    const e = normalizePaletteEntry(row && row.task_type_id, row && row.base_hex_color);
    if (!e) continue;
    palette[e.key] = e.value;
  }
  return palette;
}

function getPaletteFromTeamConfigDoc(teamConfigDoc, teamId) {
  const all = teamConfigDoc && typeof teamConfigDoc === 'object' ? teamConfigDoc : {};
  const cfg = all[teamId] && typeof all[teamId] === 'object' ? all[teamId] : {};
  const tasks = Array.isArray(cfg.tasks) ? cfg.tasks : [];
  const palette = {};
  for (const task of tasks) {
    const id = task && (task.id || task.taskId || task.label || task.name);
    const color = task && (task.color || task.colour || task.baseHexColor || task.base_hex_color);
    const e = normalizePaletteEntry(id, color);
    if (!e) continue;
    palette[e.key] = e.value;
  }
  return palette;
}

async function getTeamThemePalette(teamId) {
  const safeTeamId = safeString(teamId, 80);
  if (!safeTeamId) return {};

  const fromTable = await getPaletteFromTable(safeTeamId);
  if (fromTable && Object.keys(fromTable).length) return fromTable;

  const cfgDoc = await selectDocByKey('mums_team_config');
  if (!cfgDoc.ok || !cfgDoc.value) return fromTable || {};

  const fromDoc = getPaletteFromTeamConfigDoc(cfgDoc.value, safeTeamId);
  if (Object.keys(fromDoc).length) return fromDoc;

  return fromTable || {};
}

function mapTeamMemberProfile(profile) {
  const p = profile && typeof profile === 'object' ? profile : {};
  return {
    id: safeString(p.user_id, 120),
    teamId: safeString(p.team_id, 80),
    role: normalizeRole(p.role),
    name: safeString(p.name || p.username || p.user_id, 120),
    avatarUrl: safeString(p.avatar_url || p.avatar || '', 500)
  };
}


function flattenScheduleBlocksForMembers(scheduleDoc, memberIds) {
  const ids = Array.isArray(memberIds) ? memberIds.map((v) => safeString(v, 120)).filter(Boolean) : [];
  if (!ids.length) return [];
  const out = [];
  for (const memberId of ids) {
    const rows = flattenScheduleBlocks(scheduleDoc, memberId);
    for (const row of rows) out.push({ userId: memberId, ...row });
  }
  return out;
}

async function getTeamMembers(teamId) {
  const safeTeamId = safeString(teamId, 80);
  if (!safeTeamId) return [];
  const q = `select=user_id,name,username,team_id,role,avatar_url,deleted_at&team_id=eq.${encodeURIComponent(safeTeamId)}&order=name.asc&limit=500`;
  const out = await serviceSelect('mums_profiles', q);
  if (!out.ok) return [];
  const rows = Array.isArray(out.json) ? out.json : [];
  return rows
    .filter((row) => !(row && row.deleted_at))
    .map(mapTeamMemberProfile)
    .filter((row) => !!row.id);
}

module.exports = async (req, res, routeParams) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');

    if (String(req.method || 'GET').toUpperCase() !== 'GET') {
      res.statusCode = 405;
      return res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    }

    const auth = safeString(req.headers && req.headers.authorization, 2000);
    const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
    const actor = await getUserFromJwt(jwt);
    if (!actor || !actor.id) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
    }

    const memberIdRaw = (routeParams && routeParams.memberId) || (req.query && (req.query.memberId || req.query.id));
    const memberId = safeString(memberIdRaw, 120);
    if (!memberId) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok: false, error: 'member_id_required' }));
    }

    const actorProfile = await getProfileForUserId(actor.id);
    const actorRole = normalizeRole(actorProfile && actorProfile.role);
    const actorTeamId = safeString(actorProfile && actorProfile.team_id, 80);

    const targetProfile = await getProfileForUserId(memberId);
    if (!targetProfile || !targetProfile.user_id) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ ok: false, error: 'member_not_found' }));
    }

    const targetTeamId = safeString(targetProfile.team_id, 80);

    const isSelf = String(actor.id) === String(memberId);
    const isPrivileged = PRIVILEGED_ROLES.has(actorRole);
    const sameTeam = !!targetTeamId && targetTeamId === actorTeamId;
    if (!isSelf && !isPrivileged && !sameTeam) {
      res.statusCode = 403;
      return res.end(JSON.stringify({ ok: false, error: 'forbidden' }));
    }

    const includeTeam = String((req.query && req.query.includeTeam) || '').trim().toLowerCase();
    const wantsTeamMembers = includeTeam === '1' || includeTeam === 'true' || includeTeam === 'yes';
    // Team tab on "My Schedule" should always show the full team roster for the
    // member being viewed. Some profiles can have stale/missing actor.team_id,
    // so we must allow "self" requests to resolve members by targetTeamId.
    const canViewTeamMembers = !!targetTeamId && (isSelf || actorTeamId === targetTeamId || isPrivileged);

    const [scheduleDoc, palette, teamMembers] = await Promise.all([
      getScheduleDoc(),
      getTeamThemePalette(targetTeamId),
      (wantsTeamMembers && canViewTeamMembers) ? getTeamMembers(targetTeamId) : Promise.resolve([])
    ]);

    const scheduleBlocks = flattenScheduleBlocks(scheduleDoc, memberId);
    const teamMemberIds = teamMembers.map((member) => safeString(member && member.id, 120)).filter(Boolean);
    const teamScheduleBlocks = (wantsTeamMembers && canViewTeamMembers)
      ? flattenScheduleBlocksForMembers(scheduleDoc, teamMemberIds)
      : [];
    res.statusCode = 200;
    return res.end(JSON.stringify({
      ok: true,
      memberId,
      teamId: targetTeamId,
      teamThemePalette: palette || {},
      teamMembers,
      scheduleBlocks,
      teamScheduleBlocks
    }));
  } catch (err) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, error: 'Server error', details: String(err && (err.message || err) || 'unknown') }));
  }
};
