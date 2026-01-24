function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function envFromProcess() {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
    PRESENCE_TTL_SECONDS: Number(process.env.PRESENCE_TTL_SECONDS || 25)
  };
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });

    const env = envFromProcess();
    const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
    const anon = String(env.SUPABASE_ANON_KEY || '');
    if (!url || !anon) return sendJson(res, 500, { error: 'supabase_env_missing' });

    const ttl = env.PRESENCE_TTL_SECONDS;
    const cutoff = new Date(Date.now() - ttl * 1000).toISOString();

    const endpoint = `${url}/rest/v1/mums_presence?select=client_id,user_id,name,role,team_id,route,last_seen&last_seen=gte.${encodeURIComponent(cutoff)}&order=last_seen.desc`;

    const r = await fetch(endpoint, {
      headers: {
        'apikey': anon,
        'Authorization': `Bearer ${anon}`
      }
    });

    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return sendJson(res, 500, { error: 'supabase_list_failed', status: r.status, details: t });
    }

    const rows = await r.json();
    return sendJson(res, 200, { ok: true, ttlSeconds: ttl, rows });
  } catch (err) {
    return sendJson(res, 500, { error: 'list_failed', message: String(err && err.message ? err.message : err) });
  }
};
