// Cloud user directory sync helpers.
// Uses Vercel API routes (server-side Supabase service key) so no secrets are in the client.

const CloudUsers = (() => {
  const authHeader = () => {
    const jwt = window.CloudAuth && CloudAuth.accessToken ? CloudAuth.accessToken() : '';
    return jwt ? { Authorization: `Bearer ${jwt}` } : {};
  };

  const list = async () => {
    const res = await fetch('/api/users/list', { headers: { ...authHeader() } });
    if (!res.ok) {
      return { ok: false, message: `Failed to load users (${res.status})` };
    }
    return { ok: true, users: await res.json() };
  };

  const refreshIntoLocalStore = async () => {
    const out = await list();
    if (!out.ok) return out;
    // Normalize to the existing local store user shape used by the offline app.
    const users = (out.users || []).map((p) => ({
      id: p.user_id || p.id,
      username: p.username || (p.email ? p.email.split('@')[0] : ''),
      name: p.name || p.username || 'User',
      role: p.role || 'MEMBER',
      teamId: p.team_id || null,
      duty: p.duty || '—',
      // Passwords are never stored client-side when using cloud auth.
      password: null,
      _cloud: true
    }));
    if (window.Store && Store.setUsers) {
      Store.setUsers(users, { source: 'supabase' });
    }
    return { ok: true, users };
  };

  const create = async (payload) => {
    const res = await fetch('/api/users/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: data.message || `Failed (${res.status})`, data };
    return { ok: true, data };
  };

  return { list, create, refreshIntoLocalStore };
})();

window.CloudUsers = CloudUsers;
