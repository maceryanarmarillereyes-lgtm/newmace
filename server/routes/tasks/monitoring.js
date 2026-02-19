const { sendJson, requireAuthedUser, roleFlags, serviceSelect } = require('./_common');
function normalizeStatus(raw){
const s = String(raw || '').trim().toLowerCase();
if(!s) return 'Pending';
if(s === 'completed' || s === 'done') return 'Completed';
if(s === 'ongoing' || s === 'in progress' || s === 'in_progress') return 'Ongoing';
if(s === 'with problem' || s === 'with_problem' || s === 'problem') return 'With Problem';
if(s === 'pending' || s === 'todo' || s === 'to do') return 'Pending';
return raw;
}

function safeUuidList(ids){
return (ids || [])
.map((x) => String(x || '').trim())
.filter(Boolean)
.filter((x) => /^[0-9a-fA-F-]{20,}$/.test(x));
}

module.exports = async (req, res) => {
try {
res.setHeader('Cache-Control', 'no-store');
if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });

const auth = await requireAuthedUser(req);
if (!auth) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
const flags = roleFlags(auth.profile && auth.profile.role);
const rawRole = auth.profile ? String(auth.profile.role || '').toUpperCase() : '';
const isSuper = flags.isAdmin || rawRole === 'SUPER_ADMIN' || rawRole === 'SUPER_USER' || rawRole === 'ADMIN';

if (!isSuper && !flags.isLead && rawRole !== 'TEAM_LEAD') {
return sendJson(res, 403, { ok: false, error: 'forbidden' });
}
const myTeamId = (req.query && req.query.team_id) || (auth.profile ? auth.profile.team_id : null);
const limit = Math.max(1, Math.min(20, Number((req.query && req.query.limit) || 20)));
const offset = Math.max(0, Number((req.query && req.query.offset) || 0));
let dOut = await serviceSelect('task_distributions', `select=*&order=created_at.desc&limit=${limit}&offset=${offset}`);
if (!dOut.ok) return sendJson(res, 500, { ok: false, error: 'distributions_fetch_failed', details: dOut.json || dOut.text });
const dists = Array.isArray(dOut.json) ? dOut.json : [];
if (!dists.length) return sendJson(res, 200, { ok: true, limit, offset, distributions: [], has_more: false });
const distIds = safeUuidList(dists.map((d) => d && (d.id || d.distribution_id || d.task_distribution_id)));
if (!distIds.length) return sendJson(res, 200, { ok: true, limit, offset, distributions: [], has_more: dists.length === limit });
const inList = distIds.join(',');
let tOut = await serviceSelect('task_items', `select=id,distribution_id,assigned_to,status,problem_notes,transferred_from,created_at,updated_at&distribution_id=in.(${inList})`);
if (!tOut.ok) {
  tOut = await serviceSelect('task_items', `select=id,task_distribution_id,assigned_to,status,problem_notes,transferred_from,created_at,updated_at&task_distribution_id=in.(${inList})`);
}
const items = tOut.ok && Array.isArray(tOut.json) ? tOut.json : [];
const userIds = safeUuidList([
  ...dists.map((d) => d && (d.created_by || d.created_by_user_id || d.owner_id || d.user_id)),
  ...items.map((t) => t && t.assigned_to),
  ...items.map((t) => t && t.transferred_from)
]);
const uniqUserIds = Array.from(new Set(userIds));
const profilesById = {};
if (uniqUserIds.length) {
  const userIn = uniqUserIds.join(',');
  const pOut = await serviceSelect('mums_profiles', `select=user_id,name,username,role,team_id&user_id=in.(${userIn})`);
  if (pOut.ok && Array.isArray(pOut.json)) {
    pOut.json.forEach((p) => {
      if (p && p.user_id) profilesById[String(p.user_id)] = p;
    });
  }
}
const byDist = {};
(items || []).forEach((t) => {
  const distId = String(t.distribution_id || t.task_distribution_id || '').trim();
  if (!distId) return;
  const memberId = String(t.assigned_to || '').trim();
  if (!memberId) return;
  
  const prof = profilesById[memberId] || {};
  
  // FAULT-TOLERANT TEAM ISOLATION LOGIC
  const memberTeam = prof.team_id || prof.teamId || '';
  if (!isSuper && myTeamId && memberTeam && String(memberTeam).toLowerCase() !== String(myTeamId).toLowerCase()) {
      return; 
  }
  if (!byDist[distId]) byDist[distId] = {};
  if (!byDist[distId][memberId]) {
    byDist[distId][memberId] = {
      user_id: memberId,
      name: String(prof.name || prof.username || memberId),
      role: String(prof.role || ''),
      total: 0,
      pending: 0,
      ongoing: 0,
      completed: 0,
      with_problem: 0
    };
  }
  const s = normalizeStatus(t.status);
  const row = byDist[distId][memberId];
  row.total += 1;
  if (s === 'Pending') row.pending += 1;
  else if (s === 'Ongoing') row.ongoing += 1;
  else if (s === 'Completed') row.completed += 1;
  else if (s === 'With Problem') row.with_problem += 1;
});
const response = dists.map((d) => {
  const id = String(d.id || '').trim();
  const ownerId = String(d.created_by || d.created_by_user_id || d.owner_id || d.user_id || '').trim();
  const ownerProf = profilesById[ownerId] || {};
  const membersObj = byDist[id] || {};
  
  const members = Object.values(membersObj)
    .map((m) => {
      const pct = m.total ? Math.round((m.completed / m.total) * 100) : 0;
      return Object.assign({}, m, { completion_pct: pct });
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  // REMOVE DISTRIBUTIONS THAT HAVE 0 MEMBERS FOR THIS TEAM LEAD
  if (!isSuper && members.length === 0) return null;
  const totals = members.reduce((acc, m) => {
    acc.total += m.total;
    acc.pending += m.pending;
    acc.ongoing += m.ongoing;
    acc.completed += m.completed;
    acc.with_problem += m.with_problem;
    return acc;
  }, { total: 0, pending: 0, ongoing: 0, completed: 0, with_problem: 0 });
  return {
    id,
    title: d.title || 'Untitled Distribution',
    description: d.description || '',
    reference_url: d.reference_url || '',
    created_at: d.created_at || null,
    created_by: ownerId,
    created_by_name: String(ownerProf.name || ownerProf.username || ownerId || ''),
    enable_daily_alerts: d.enable_daily_alerts === true,
    status: d.status || 'active',
    totals,
    members
  };
}).filter(Boolean);
return sendJson(res, 200, { ok: true, limit, offset, distributions: response, has_more: dists.length === limit });
} catch (err) {
return sendJson(res, 500, { ok: false, error: 'monitoring_failed', message: String(err && err.message ? err.message : err) });
}
};
