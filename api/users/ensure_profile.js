const { getUserFromJwt, serviceSelect, serviceFetch } = require('../_supabase');

// POST /api/users/ensure_profile
// Creates a profile row for the authenticated user if missing.
// First user to log in becomes SUPER_ADMIN (bootstrap), unless SUPERADMIN_EMAIL is set.
module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const auth = req.headers.authorization || '';
    const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
    const user = jwt ? await getUserFromJwt(jwt) : null;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const profiles = await serviceSelect('mums_profiles', 'user_id,role,team_id,name,username', 'user_id=eq.' + user.id);
    if (profiles.length) return res.status(200).json({ ok: true, profile: profiles[0], created: false });

    const bootstrapEmail = (process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
    let role = 'MEMBER';
    if (bootstrapEmail) {
      if ((user.email || '').toLowerCase() === bootstrapEmail) role = 'SUPER_ADMIN';
    } else {
      // No SUPERADMIN_EMAIL set; if no profiles exist, first login becomes SUPER_ADMIN.
      const all = await serviceSelect('mums_profiles', 'user_id', 'limit=1');
      if (all.length === 0) role = 'SUPER_ADMIN';
    }

    const username = (user.email || '').split('@')[0];
    const name = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || username;

    const insert = await serviceFetch('/rest/v1/mums_profiles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify([{ user_id: user.id, username, name, role, team_id: null, duty: null }]),
    });

    return res.status(200).json({ ok: true, profile: insert[0] || null, created: true });
  } catch (e) {
    return res.status(500).json({ error: 'server_error', message: e?.message || String(e) });
  }
};
