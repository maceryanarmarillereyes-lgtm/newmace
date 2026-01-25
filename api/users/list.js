const { getUserFromJwt, serviceSelect } = require('../_supabase');

// GET /api/users/list
// Role-aware listing (server-side):
// - SUPER_ADMIN: sees all users
// - TEAM_LEAD: sees only users in their team_id
// - MEMBER: sees only themselves
module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const auth = req.headers.authorization || '';
    const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
    const user = await getUserFromJwt(jwt);
    if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });

    // Identify current user's profile/role via service role (bypasses RLS)
    const meRows = await serviceSelect(
      'mums_profiles',
      `select=user_id,role,team_id&user_id=eq.${user.id}&limit=1`
    );
    const me = Array.isArray(meRows) ? meRows[0] : null;
    if (!me) return res.status(403).json({ ok: false, error: 'profile_not_found' });

    const myRole = (me.role || 'MEMBER').toUpperCase();
    let filter = '';
    if (myRole === 'TEAM_LEAD') {
      const team = me.team_id || '';
      filter = team ? `&team_id=eq.${encodeURIComponent(team)}` : '&team_id=is.null';
    } else if (myRole !== 'SUPER_ADMIN') {
      filter = `&user_id=eq.${user.id}`;
    }

    const select = 'id,user_id,username,name,role,team_id,duty,is_active,created_at,updated_at';
    const rows = await serviceSelect(
      'mums_profiles',
      `select=${select}${filter}&order=name.asc`
    );

    return res.status(200).json({ ok: true, rows });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
};
