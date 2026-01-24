module.exports = async (_req, res) => {
  try {
    const out = {
      SUPABASE_URL: process.env.SUPABASE_URL || '',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
      PRESENCE_TTL_SECONDS: Number(process.env.PRESENCE_TTL_SECONDS || 25),
      PRESENCE_POLL_MS: Number(process.env.PRESENCE_POLL_MS || 3000)
    };
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify(out));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'env_failed', message: String(err && err.message ? err.message : err) }));
  }
};
