const { getUserFromJwt, serviceSelect } = require('../../lib/supabase');

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function toMs(v) {
  const t = Date.parse(String(v || ''));
  return Number.isFinite(t) ? t : 0;
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
      return sendJson(res, 500, { ok: false, error: 'supabase_select_failede_list_failed', status: out.status, details: out.json || out.text });
    }

    const rowsRaw = Array.isArray(out.json) ? out.json : [];

// De-duplicate by user_id (or client_id fallback), selecting the newest by last_seen.
// This prevents flicker when the same user has multiple tabs/devices.
const bestByKey = new Map();
for (const r of rowsRaw) {
  if (!r) continue;
  const key = String(r.user_id || r.userId || r.client_id || '').trim();
  if (!key) continue;
  const ts = toMs(r.last_seen || r.lastSeen);
  const prev = bestByKey.get(key);
  if (!prev || toMs(prev.last_seen || prev.lastSeen) < ts) {
    bestByKey.set(key, r);
  }
}
const rows = Array.from(bestByKey.values()).sort((a, b) => toMs(b.last_seen || b.lastSeen) - toMs(a.last_seen || a.lastSeen));

// Override presence role/team/name using mums_profiles (authoritative source of truth).
    // This prevents older clients (or multiple tabs) from causing role/shift flicker.
    try {
      const ids = rows.map((r) => String(r.user_id || '').trim()).filter(Boolean);
      if (ids.length) {
        const q = `select=user_id,name,role,team_id,team_override,avatar_url&user_id=in.(${ids.join(',')})`;
        const profOut = await serviceSelect('mums_profiles', q);
        if (profOut.ok && Array.isArray(profOut.json)) {
          const profilesById = {};
          for (const p of profOut.json) {
            if (p && p.user_id) profilesById[String(p.user_id)] = p;
          }
          for (const r of rows) {
            const p = profilesById[String(r.user_id || '')];
            if (!p) continue;
            const roleUpper = String(p.role || r.role || '').toUpperCase();
            const isDevAccess = (roleUpper === 'SUPER_ADMIN' || roleUpper === 'SUPER_USER');
            let teamOverride = !!(p.team_override ?? p.teamOverride ?? false);
            if (isDevAccess && (p.team_override === undefined && p.teamOverride === undefined)) {
              // Back-compat: infer override from team_id presence
              teamOverride = !!(p.team_id != null);
            }
            r.name = p.name || r.name;
            r.role = p.role || r.role;
            // SUPER roles default to Developer Access unless overridden.
            r.team_id = (isDevAccess && !teamOverride) ? null : (p.team_id != null ? p.team_id : r.team_id);
            r.team_override = teamOverride;
            r.avatar_url = p.avatar_url || r.avatar_url || '';
          }
        }
      }
    } catch (_) {}

    return sendJson(res, 200, { ok: true, ttlSeconds: ttl, rows });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: 'list_failed', message: String(err && err.message ? err.message : err) });
  }
};
