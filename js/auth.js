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
    },

    // Require login (async; redirects if not logged in)
    async requireUser() {
      const u = this.getUser();
      if (!u) window.location.href = './login.html';
      return u;
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
