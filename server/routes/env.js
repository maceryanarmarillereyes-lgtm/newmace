module.exports = async (_req, res) => {
  try {
    // Keep payload LIMITED to public values needed by the frontend.
    const out = {
      SUPABASE_URL: process.env.SUPABASE_URL || '',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
      USERNAME_EMAIL_DOMAIN: process.env.USERNAME_EMAIL_DOMAIN || 'mums.local'
    };

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify(out));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: 'env_failed', message: String(err && err.message ? err.message : err) }));
  }
};
