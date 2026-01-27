(function(){
  const DBG = (window.MUMS_DEBUG || {
    enabled: false,
    log: function(){},
    warn: function(){},
    error: function(){},
    snapshot: function(){},
    redirect: function(target){ try{ window.location.href = target; } catch(_){} }
  });

  // NOTE: Local mode is kept for offline/dev fallback. In production,
  // CloudAuth (Supabase) should be enabled via env variables.

  let currentUser = null;

  function emitAuth(type){
    try { window.dispatchEvent(new CustomEvent('mums:auth', { detail: { type } })); } catch (_) {}
  }

  const Auth = {
    getUser() {
      // If currentUser is a minimal Supabase auth user, prefer the enriched Store user record.
      if (currentUser) {
        try {
          const cid = currentUser.id || currentUser.user_id;
          if (cid && window.Store && Store.getUserById) {
            const su = Store.getUserById(cid);
            const missing = (currentUser.role == null) || (currentUser.username == null) || (currentUser.name == null) || (currentUser.teamId == null);
            if (su && missing) { currentUser = su; return su; }
          }
        } catch (_) {}
        return currentUser;
      }
      try {
        const sess = window.Store && Store.getSession ? Store.getSession() : null;
        if (sess && sess.userId) {
          const u = window.Store && Store.getUserById ? Store.getUserById(sess.userId) : null;
          if (u) { currentUser = u; return u; }
        }
      } catch (_) {}
      return null;
    },// Require login (async; attempts to restore Supabase session before redirecting)
    async requireUser(opts) {
      opts = opts || {};
      const redirect = (opts.redirect !== false);

      // 1) Fast path
      let u = this.getUser();
      if (u) return u;

      // 2) Supabase/CloudAuth restore path (prevents login redirect loops)
      try {
        if (window.CloudAuth && CloudAuth.enabled && CloudAuth.enabled()) {
          const sbUser = CloudAuth.getUser ? CloudAuth.getUser() : null;

          // If we have a Supabase user but local Store profile cache isn't ready yet,
          // hydrate session and fetch profiles before deciding to redirect.
          if (sbUser && sbUser.id) {
            try {
              const sess = (window.Store && Store.getSession) ? Store.getSession() : null;
              if (!sess || String(sess.userId) !== String(sbUser.id) || sess.mode !== 'supabase') {
                Store.setSession && Store.setSession({ userId: sbUser.id, mode: 'supabase', ts: Date.now() });
              }
            } catch (e) {}

            // Try again after session hydration
            u = this.getUser();
            if (u) return u;

            // Ensure a mums_profiles row exists (and bootstrap SUPER_ADMIN if configured).
            try {
              window.CloudUsers && CloudUsers.ensureProfile && (await CloudUsers.ensureProfile());
            } catch (e) {}

            // Pull profile(s) into the local Store so getUser() can resolve role/username/name
            try {
              if (window.CloudUsers && CloudUsers.refreshIntoLocalStore) {
                await CloudUsers.refreshIntoLocalStore();

        // Also fetch /api/users/me to make the current user's role/team authoritative.
        // This protects against stale local Store data and prevents Super Admin from showing as MEMBER.
        try {
          const me = (window.CloudUsers && typeof CloudUsers.me === 'function') ? await CloudUsers.me() : null;
          if (me && me.ok && me.profile) {
            const p = me.profile;
            const uid = p.user_id || p.id || sbUser.id;
            if (window.Store && typeof Store.getUsers === 'function' && typeof Store.saveUsers === 'function') {
              const users = Array.isArray(Store.getUsers()) ? Store.getUsers() : [];
              const next = users.slice();
              const patch = {
                id: uid,
                username: p.username || (sbUser.email ? sbUser.email.split('@')[0] : ''),
                name: p.name || p.username || (sbUser.email || 'User'),
                role: p.role || 'MEMBER',
                teamId: p.team_id || null,
                duty: p.duty || '—',
                photoDataUrl: p.avatar_url || '',
                password: null,
                _cloud: true
              };
              const at = next.findIndex((u) => String(u.id) === String(uid));
              if (at >= 0) next[at] = Object.assign({}, next[at], patch);
              else next.push(patch);
              Store.saveUsers(next);
            }
          }
        } catch (_) {}

              }
            } catch (e) {}

            u = this.getUser();
            if (u) return u;

            try {
              const su = (window.Store && Store.getUserById) ? Store.getUserById(sbUser.id) : null;
              if (su) { currentUser = su; return su; }
            } catch (_) {}

            // Last-resort minimal user (keeps app usable; role may be limited until profile exists)
            u = {
              id: sbUser.id,
              username: (sbUser.email || '').split('@')[0] || 'user',
              email: sbUser.email || '',
              name: sbUser.email || 'User',
              role: 'MEMBER',
              teamId: null,
              duty: ''
            };
            currentUser = u;
            return u;
          }
        }
      } catch (e) {}

      // 3) No user → redirect (or return null)
      if (redirect) window.location.href = './login.html';
      return null;
    },
    async requireLogin() { return this.requireUser(); },


    async login(identifier, password) {
      const idf = (identifier || '').trim();
      const pass = (password || '').trim();
      if (!idf || !pass) return { ok: false, message: 'Please enter username/email and password.' };

      // Cloud-first
      if (window.CloudAuth && CloudAuth.isEnabled && CloudAuth.isEnabled()) {
        const out = await CloudAuth.signIn(idf, pass);
        if (!out.ok) return out;

        try {
          window.Store && Store.setSession && Store.setSession({ userId: out.user.id, at: Date.now(), mode: 'supabase' });
        } catch (_) {}

        // Login delay optimization:
        // Do NOT block login navigation on profile bootstrapping. The dashboard boot
        // (Auth.requireUser) will ensure mums_profiles exists and hydrate the Store.
        // Best-effort: start ensureProfile in the background and swallow errors.
        try {
          if (window.CloudUsers && CloudUsers.ensureProfile) {
            const p = CloudUsers.ensureProfile();
            if (p && p.catch) p.catch(function(){});
          }
        } catch (_) {}

        // Do not block the login flow on a full directory fetch.
        // Index boot will refresh the directory cache in the background.
        currentUser = out.user;

        emitAuth('login');
        return { ok: true, user: currentUser };
      }

      // Local fallback
      const u = window.Store && Store.findUserByLogin ? Store.findUserByLogin(idf, pass) : null;
      if (!u) return { ok: false, message: 'User not found.' };

      currentUser = u;
      try {
        window.Store && Store.setSession && Store.setSession({ userId: u.id, at: Date.now(), mode: 'local' });
      } catch (_) {}

      emitAuth('login');
      return { ok: true, user: u };
    },

    // Deterministic lightweight hash used for legacy local-user `passwordHash`
    // and client-side key derivation in offline mode.
    //
    // IMPORTANT: This is NOT intended to be a secure password hashing
    // mechanism. Supabase Auth handles real credentials.
    hash(input) {
      const str = String(input ?? '');
      // FNV-1a 32-bit
      let h = 0x811c9dc5;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      // Return fixed-width hex.
      return ('00000000' + h.toString(16)).slice(-8);
    },

    async logout() {
      currentUser = null;
      try {
        if (window.CloudAuth && CloudAuth.signOut) await CloudAuth.signOut();
      } catch (_) {}
      try {
        window.Store && Store.setSession && Store.setSession(null);
      } catch (_) {}
      emitAuth('logout');
      window.location.href = './login.html';
    }
  };

  window.Auth = Auth;
})();
