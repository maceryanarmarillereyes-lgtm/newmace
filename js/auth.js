// Authentication layer (LOCAL ONLY).
//
// This codebase is intentionally offline-first.
// - No online backend / hosting / hosting integrations.
// - All state persists in localStorage via Store.
//
// Compatibility:
// - Auth.hash(...) is synchronous (legacy local DB).
// - Auth.getUser() is synchronous.
// - Auth.requireUser() is async and redirects to login if session missing.

(function () {
  let currentUser = null;

  // Lightweight local hash (NOT cryptographically secure).
  // This app runs locally; credentials are for local/offline use only.
  function localHash(input) {
    const s = String(input ?? '');
    // djb2
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h) + s.charCodeAt(i);
      h |= 0;
    }
    return 'h' + (h >>> 0).toString(16);
  }

  function loadSessionUserSync() {
    try {
      const sess = window.Store && Store.getSession ? Store.getSession() : null;
      const userId = sess && sess.userId;
      if (!userId) return null;
      const u = window.Store && Store.getUserById ? Store.getUserById(userId) : null;
      if (!u) return null;
      currentUser = u;
      return currentUser;
    } catch (_) {
      return null;
    }
  }

  window.Auth = {
    hash: localHash,

    // Synchronous accessor used across the UI.
    getUser() {
      if (currentUser) return currentUser;
      return loadSessionUserSync();
    },

    // Require login (async; redirects if not logged in)
    async requireUser() {
      const u = this.getUser();
      if (!u) window.location.href = './login.html';
      return u;
    },
    async requireLogin() { return this.requireUser(); },

    // Login form (local-only)
    async login(identifier, password) {
      const idf = (identifier || '').trim();
      const pass = (password || '').trim();
      if (!idf || !pass) return { ok: false, message: 'Please enter username/email and password.' };

      const u = window.Store && Store.findUserByLogin ? Store.findUserByLogin(idf, pass) : null;
      if (!u) return { ok: false, message: 'User not found.' };

      currentUser = u;
      try {
        window.Store && Store.setSession && Store.setSession({ userId: u.id, at: Date.now(), mode: 'local' });
      } catch (_) {}
      return { ok: true, user: u };
    },

    async logout() {
      currentUser = null;
      try {
        window.Store && Store.setSession && Store.setSession(null);
      } catch (_) {}
      window.location.href = './login.html';
    }
  };
})();
