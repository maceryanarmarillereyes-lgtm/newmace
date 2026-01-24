function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

function envFromProcess() {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || ''
  };
}

async function upsertPresence(env, record) {
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const anon = String(env.SUPABASE_ANON_KEY || '');
  if (!url || !anon) throw new Error('Supabase env missing (SUPABASE_URL/SUPABASE_ANON_KEY)');

  const endpoint = `${url}/rest/v1/mums_presence?on_conflict=client_id`;
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anon,
      'Authorization': `Bearer ${anon}`,
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify([record])
  });

  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`supabase_upsert_failed (${r.status}): ${t}`);
  }
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

    const body = await readBody(req);

    const clientId = String(body.clientId || '').trim();
    const user = body.user || {};
    const userId = String(user.id || user.userId || '').trim();
    const name = String(user.name || '').trim();
    const role = String(user.role || '').trim();
    const teamId = String(user.teamId || '').trim();
    const route = String(body.route || '').trim();

    if (!clientId) return sendJson(res, 400, { error: 'missing_clientId' });
    if (!userId) return sendJson(res, 400, { error: 'missing_user' });

    const record = {
      client_id: clientId,
      user_id: userId,
      name: name || 'User',
      role: role || '',
      team_id: teamId || '',
      route: route || '',
      last_seen: new Date().toISOString()
    };

    await upsertPresence(envFromProcess(), record);

    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 500, { error: 'heartbeat_failed', message: String(err && err.message ? err.message : err) });
  }
};
