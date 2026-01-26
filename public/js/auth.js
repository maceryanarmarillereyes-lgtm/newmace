(function(){
  // NOTE: Local mode is kept for offline/dev fallback. In production,
  // CloudAuth (Supabase) should be enabled via env variables.

  let currentUser = null;

  function emitAuth(type){
    try { window.dispatchEvent(new CustomEvent('mums:auth', { detail: { type } })); } catch (_) {}
  }

  const Auth = {
    getUser() {
      if (currentUser) return currentUser;
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

            // Pull profile(s) into the local Store so getUser() can resolve role/username/name
            try {
              if (window.CloudUsers && CloudUsers.refreshIntoLocalStore) {
                await CloudUsers.refreshIntoLocalStore();
              }
            } catch (e) {}

            u = this.getUser();
            if (u) return u;

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

        currentUser = out.user;
        try {
          window.Store && Store.setSession && Store.setSession({ userId: out.user.id, at: Date.now(), mode: 'supabase' });
        } catch (_) {}

        // Populate local cache for legacy pages still using Store users list.
        try {
          window.CloudUsers && CloudUsers.refreshIntoLocalStore && (await CloudUsers.refreshIntoLocalStore());
        } catch (_) {}

        emitAuth('login');
        return { ok: true, user: out.user };
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
