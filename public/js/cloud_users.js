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
    const body = await res.json().catch(() => null);
    // Accept either an array response (legacy) or { ok, rows }.
    const users = Array.isArray(body) ? body : (body && Array.isArray(body.rows) ? body.rows : []);
    return { ok: true, users };
  };

  const me = async () => {
    const res = await fetch('/api/users/me', { headers: { ...authHeader() } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: data.message || data.error || `Failed (${res.status})`, data };
    return { ok: true, profile: data.profile || null, created: !!data.created, updated: !!data.updated };
  };

  const updateMe = async (patch) => {
    const res = await fetch('/api/users/update_me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(patch || {})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: data.message || data.error || `Failed (${res.status})`, data };
    return { ok: true, data };
  };

  const uploadAvatar = async (dataUrl) => {
    const res = await fetch('/api/users/upload_avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ dataUrl })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: data.message || data.error || `Failed (${res.status})`, data };
    return { ok: true, url: data.url, data };
  };

  const removeAvatar = async () => {
    const res = await fetch('/api/users/remove_avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: data.message || data.error || `Failed (${res.status})`, data };
    return { ok: true, data };
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
      photoDataUrl: p.avatar_url || '',
      // Passwords are never stored client-side when using cloud auth.
      password: null,
      _cloud: true
    }));
    // Persist into the app's local Store so Auth.getUser() can resolve role/team/name.
    // Older builds use Store.saveUsers()/Store.importUsers() (there is no Store.setUsers).
    try {
      if (window.Store) {
        if (typeof Store.importUsers === 'function') {
          Store.importUsers(users);
        } else if (typeof Store.saveUsers === 'function') {
          Store.saveUsers(users);
        } else {
          // Very old fallback: write directly.
          try { localStorage.setItem('ums_users', JSON.stringify(users)); } catch (_) {}
          try { localStorage.setItem('ums_users_backup', JSON.stringify(users)); } catch (_) {}
          try { localStorage.setItem('ums_users_rev', String(Date.now())); } catch (_) {}
        }
      }
    } catch (_) {}
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
  const ensureProfile = async (payload) => {
    const res = await fetch('/api/users/ensure_profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(payload || {})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: data.message || data.error || `Failed (${res.status})`, data };
    return { ok: true, profile: data.profile || null, created: !!data.created, updated: !!data.updated };
  };

  return { list, me, updateMe, uploadAvatar, removeAvatar, create, refreshIntoLocalStore, ensureProfile };
})();

window.CloudUsers = CloudUsers;
