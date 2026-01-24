const { getUserFromJwt, getProfileForUserId, serviceFetch } = require('../_supabase');

// POST /api/users/create
// Body: { username, name, password, role, team_id, duty }
// Creator Permission B:
// - SUPER_ADMIN can create any user
// - TEAM_LEAD can create only users in their own team_id
module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const auth = req.headers.authorization || '';
    const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
    const authedUser = await getUserFromJwt(jwt);
    if (!authedUser) return res.status(401).json({ error: 'Unauthorized' });

    const creatorProfile = await getProfileForUserId(authedUser.id);
    if (!creatorProfile) return res.status(403).json({ error: 'Profile missing' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const username = (body.username || '').trim();
    const name = (body.name || '').trim();
    const password = (body.password || '').trim();
    const role = (body.role || 'MEMBER').trim();
    const team_id = (body.team_id || '').trim();
    const duty = (body.duty || '').trim();

    if (!username || !name || !password) {
      return res.status(400).json({ error: 'Missing required fields: username, name, password' });
    }

    const creatorRole = String(creatorProfile.role || '').toUpperCase();
    if (creatorRole !== 'SUPER_ADMIN' && creatorRole !== 'TEAM_LEAD') {
      return res.status(403).json({ error: 'Insufficient permission' });
    }

    // TEAM_LEAD is restricted to their own team
    if (creatorRole === 'TEAM_LEAD') {
      if (!creatorProfile.team_id) return res.status(403).json({ error: 'Team lead has no team_id' });
      if (team_id && team_id !== creatorProfile.team_id) {
        return res.status(403).json({ error: 'Team lead can only create users for their own team' });
      }
    }

    const domain = process.env.USERNAME_EMAIL_DOMAIN || 'mums.local';
    const email = username.includes('@') ? username : `${username}@${domain}`;

    // 1) Create Supabase Auth user
    const createAuth = await serviceFetch('/auth/v1/admin/users', {
      method: 'POST',
      body: {
        email,
        password,
        email_confirm: true,
        user_metadata: { username, name }
      }
    });

    if (!createAuth.res.ok) {
      return res.status(createAuth.res.status).json({ error: 'Failed to create auth user', details: createAuth.json });
    }
    const newUser = createAuth.json;

    // 2) Create profile row
    const profileRow = {
      user_id: newUser.id,
      username,
      name,
      role,
      team_id: team_id || (creatorRole === 'TEAM_LEAD' ? creatorProfile.team_id : null),
      duty: duty || null,
      created_by_user_id: authedUser.id
    };

    const insert = await serviceFetch('/rest/v1/mums_profiles', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: profileRow
    });

    if (!insert.res.ok) {
      // Rollback auth user to avoid orphan accounts
      await serviceFetch(`/auth/v1/admin/users/${newUser.id}`, { method: 'DELETE' });
      return res.status(insert.res.status).json({ error: 'Failed to create profile', details: insert.json });
    }

    return res.status(200).json({ ok: true, user: newUser, profile: insert.json?.[0] });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
};
