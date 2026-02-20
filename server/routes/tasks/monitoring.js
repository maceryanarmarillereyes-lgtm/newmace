const { sendJson, requireAuthedUser, roleFlags, serviceSelect } = require('./_common');
module.exports = async (req, res) => {
try {
const auth = await requireAuthedUser(req);
if (!auth) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

// AUTH AUTHORITY: Force Super status for Supervisory roles
const userRole = String(auth.profile?.role || '').toUpperCase();
const flags = roleFlags(userRole);
const isSuper = flags.isAdmin || flags.isLead || ['TEAM_LEAD', 'ADMIN', 'SUPER_ADMIN', 'SUPER_USER'].includes(userRole);
const limit = Number(req.query.limit) || 20;
const offset = Number(req.query.offset) || 0;
// 1. Fetch Batch Cards
const dOut = await serviceSelect('task_distributions', `select=*&order=created_at.desc&limit=${limit}&offset=${offset}`);
const dists = dOut.ok && Array.isArray(dOut.json) ? dOut.json : [];
if (!dists.length) return sendJson(res, 200, { ok: true, distributions: [], has_more: false });
const distIds = dists.map(d => d.id).filter(Boolean);
// 2. BULLETPROOF FETCH: SELECT * avoids 42703 missing column errors entirely
const itemPromises = distIds.map(async (id) => {
  const out = await serviceSelect('task_items', `select=*&distribution_id=eq.${id}`);
  return out.ok && Array.isArray(out.json) ? out.json : [];
});
const nestedItems = await Promise.all(itemPromises);
const allItems = nestedItems.flat();
// 3. Profiles Hydration
const userIds = [...new Set(allItems.map(i => i.assigned_to).filter(Boolean))];
const profileMap = {};
if (userIds.length) {
  const pOut = await serviceSelect('mums_profiles', `select=user_id,name,username,team_id&user_id=in.(${userIds.join(',')})`);
  if (pOut.ok) (pOut.json || []).forEach(p => { profileMap[p.user_id] = p; });
}
// 4. Aggregation Loop
const response = dists.map(d => {
  const items = allItems.filter(i => i.distribution_id === d.id);
  const memberBuckets = {};
  items.forEach(it => {
    const uid = it.assigned_to;
    if(!uid) return;
    const prof = profileMap[uid] || {};
    // FORCE VISIBILITY: Supervisory roles bypass team isolation
    if(!isSuper){
      const myTeamId = auth.profile?.team_id;
      if(myTeamId && prof.team_id && String(prof.team_id).toLowerCase() !== String(myTeamId).toLowerCase()) return;
    }
    if(!memberBuckets[uid]) memberBuckets[uid] = { user_id: uid, name: prof.name || prof.username || uid, total:0, completed:0, pending:0, with_problem:0, items:[] };
    
    const m = memberBuckets[uid];
    const s = String(it.status || '').toLowerCase();
    m.total++;
    if(s.includes('complete') || s === 'done') m.completed++;
    else if(s.includes('problem')) m.with_problem++;
    else m.pending++;
    // DYNAMIC MAPPING: Fallback through possible columns to avoid UI crash
    m.items.push({ 
      id: it.id, 
      case_number: it.case_number || it.case_no || it.task_description || it.description || 'N/A', 
      site: it.site || 'N/A', 
      status: it.status 
    });
  });
  const members = Object.values(memberBuckets).map(m => ({
    ...m,
    completion_pct: m.total ? Math.round((m.completed / m.total) * 100) : 0
  })).sort((a,b) => a.name.localeCompare(b.name));
  if(!isSuper && !members.length) return null;
  return {
    id: d.id, title: d.title, created_at: d.created_at, created_by_name: d.created_by_name || 'System',
    totals: members.reduce((acc, m) => { acc.total += m.total; acc.pending += m.pending; acc.with_problem += m.with_problem; return acc; }, {total:0,pending:0,with_problem:0}),
    members
  };
}).filter(Boolean);
return sendJson(res, 200, { ok: true, distributions: response, has_more: dists.length === limit });
} catch (err) { return sendJson(res, 500, { ok: false, message: err.message }); }
};
