module.exports = async (_req, res) => {
  try {
<<<<<<< HEAD
    // Keep payload LIMITED to public values needed by the frontend.
    const out = {
      SUPABASE_URL: process.env.SUPABASE_URL || '',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
      USERNAME_EMAIL_DOMAIN: process.env.USERNAME_EMAIL_DOMAIN || 'mums.local'
    };

    res.setHeader('Cache-Control', 'no-store');
=======
    const out = {
      SUPABASE_URL: process.env.SUPABASE_URL || '',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',

      // Public config (safe to expose)
      USERNAME_EMAIL_DOMAIN: process.env.USERNAME_EMAIL_DOMAIN || 'mums.local',

      // Local-dev websocket relay; keep empty in production to avoid ws://localhost errors
      REALTIME_RELAY_URL: process.env.REALTIME_RELAY_URL || '',

      // Optional remote patch feed (if enabled)
      REMOTE_PATCH_URL: process.env.REMOTE_PATCH_URL || '',

      // Client poll intervals / TTLs
      MAILBOX_OVERRIDE_POLL_MS: Number(process.env.MAILBOX_OVERRIDE_POLL_MS || 2000),
      PRESENCE_TTL_SECONDS: Number(process.env.PRESENCE_TTL_SECONDS || 25),
      PRESENCE_POLL_MS: Number(process.env.PRESENCE_POLL_MS || 3000),
      SYNC_POLL_MS: Number(process.env.SYNC_POLL_MS || 2000),

      // If false, the client will skip Supabase realtime and use polling only
      SYNC_ENABLE_SUPABASE_REALTIME: String(process.env.SYNC_ENABLE_SUPABASE_REALTIME || 'true')
    };

>>>>>>> 6d0188b85578d391a5251805aa5311d13aaacb9b
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify(out));
  } catch (err) {
    res.statusCode = 500;
<<<<<<< HEAD
    res.setHeader('Cache-Control', 'no-store');
=======
>>>>>>> 6d0188b85578d391a5251805aa5311d13aaacb9b
    res.end(JSON.stringify({ error: 'env_failed', message: String(err && err.message ? err.message : err) }));
  }
};
