// Cloud authentication and profile access via Supabase REST APIs.
// This keeps the frontend dependency-free (no bundled supabase-js) and works on Vercel.

const CloudAuth = (() => {
  const SESSION_KEY = 'mums_sb_session_v1';

  const env = () => (window.EnvRuntime ? window.EnvRuntime.env() : {});
  const enabled = () => {
    const e = env();
    return Boolean(e.SUPABASE_URL && e.SUPABASE_ANON_KEY);
  };

  const getEmailFromUserInput = (usernameOrEmail) => {
    const u = (usernameOrEmail || '').trim();
    if (!u) return '';
    if (u.includes('@')) return u;
    const domain = (env().USERNAME_EMAIL_DOMAIN || 'mums.local').replace(/^@/, '');
    return `${u}@${domain}`;
  };

  const saveSession = (session) => {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
  };

  const loadSession = () => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const clearSession = () => {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
  };

  const accessToken = () => {
    const s = loadSession();
    return s?.access_token || '';
  };

  const supabaseFetch = async (path, opts = {}) => {
    const e = env();
    const url = `${e.SUPABASE_URL}${path}`;
    const headers = Object.assign(
      {
        apikey: e.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      opts.headers || {}
    );
    const t = accessToken();
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch(url, { ...opts, headers });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text };
    }
    return { res, json, text };
  };

  const login = async (usernameOrEmail, password) => {
    if (!enabled()) return { ok: false, error: 'Cloud auth is not configured.' };
    const e = env();
    const email = getEmailFromUserInput(usernameOrEmail);
    const body = { email, password: String(password || '') };
    const tokenUrl = `${e.SUPABASE_URL}/auth/v1/token?grant_type=password`;
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        apikey: e.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${e.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text };
    }
    if (!res.ok) {
      return { ok: false, error: json?.error_description || json?.msg || 'Login failed.' };
    }
    saveSession(json);

    // Ensure profile exists (bootstrap first user)
    await fetch('/api/users/ensure_profile', {
      method: 'POST',
      headers: { Authorization: `Bearer ${json.access_token}` },
    });

    return { ok: true, session: json };
  };

  const logout = async () => {
    clearSession();
    return { ok: true };
  };

  const getProfile = async () => {
    if (!enabled()) return null;
    const s = loadSession();
    const userId = s?.user?.id;
    if (!userId) return null;
    const { res, json } = await supabaseFetch(`/rest/v1/mums_profiles?user_id=eq.${encodeURIComponent(userId)}&select=*`);
    if (!res.ok) return null;
    return Array.isArray(json) ? json[0] : null;
  };

  return {
    enabled,
    getEmailFromUserInput,
    loadSession,
    accessToken,
    login,
    logout,
    getProfile,
  };
})();

window.CloudAuth = CloudAuth;
