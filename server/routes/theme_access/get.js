/* @AI_CRITICAL_GUARD: UNTOUCHABLE ZONE. Do not modify existing UI/UX, layouts, or core logic in this file without explicitly asking Thunter BOY for clearance. If changes are required here, STOP and provide a RISK IMPACT REPORT first. */
const { getUserFromJwt } = require('../../lib/supabase');
const { readThemeAccessMeta } = require('../../lib/theme_access');

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');

    const auth = req.headers.authorization || '';
    const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
    const u = await getUserFromJwt(jwt);
    if (!u) return sendJson(res, 401, { ok: false, error: 'unauthorized', message: 'Missing or invalid bearer token.' });

    const out = await readThemeAccessMeta();
    if (!out.ok) {
      return sendJson(res, out.status || 500, {
        ok: false,
        error: 'db_error',
        message: 'Failed to read theme access settings.',
        details: out.details
      });
    }

    return sendJson(res, 200, { ok: true, meta: out.meta });
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: 'server_error', message: String(e?.message || e) });
  }
};
