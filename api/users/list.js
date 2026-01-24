const { getUserFromJwt, serviceSelect } = require('../_supabase');

// GET /api/users/list
// Returns all profiles. Authorization required.
module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const auth = req.headers.authorization || '';
    const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
    const user = await getUserFromJwt(jwt);
    if (!user) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }

    // Profiles table
    const rows = await serviceSelect('mums_profiles', 'select=id,user_id,username,name,role,team_id,duty,is_active,created_at,updated_at&order=name.asc');
    res.status(200).json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
};
