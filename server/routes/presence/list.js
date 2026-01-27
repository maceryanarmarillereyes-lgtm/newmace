const { getUserFromJwt, serviceSelect } = require('../../lib/supabase');

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function envFromProcess() {
  return {
    PRESENCE_TTL_SECONDS: Number(process.env.PRESENCE_TTL_SECONDS || 25)
  };
}

// GET /api/presence/list
// Returns online roster for authenticated users.
module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });

    const auth = String(req.headers.authorization || '');
    const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
    const authed = await getUserFromJwt(jwt);
    if (!authed) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    const env = envFromProcess();
    const ttl = Number.isFinite(env.PRESENCE_TTL_SECONDS) ? env.PRESENCE_TTL_SECONDS : 25;
    const cutoff = new Date(Date.now() - ttl * 1000).toISOString();

    const select = 'client_id,user_id,name,role,team_id,route,last_seen';
    const q = `select=${select}&last_seen=gte.${encodeURIComponent(cutoff)}&order=last_seen.desc&limit=300`;

    const out = await serviceSelect('mums_presence', q);
    if (!out.ok) {
      return sendJson(res, 500, { ok: false, error: 'supabase_list_failed', status: out.status, details: out.json || out.text });
    }

    const rows = Array.isArray(out.json) ? out.json : [];
    // Dedupe by user_id so multiple client_id rows for the same user don't cause
    // flicker (the query is already ordered by last_seen DESC, so first wins).
    const seen = new Set();
    const deduped = [];
    for (const r of rows) {
      const key = String(r && (r.user_id || r.client_id) || '').trim();
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(r);
    }
    return sendJson(res, 200, { ok: true, ttlSeconds: ttl, rows: deduped });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: 'list_failed', message: String(err && err.message ? err.message : err) });
  }
};
