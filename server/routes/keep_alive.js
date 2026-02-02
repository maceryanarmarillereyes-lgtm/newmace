// Supabase keep-alive endpoint
// - Harmless write into `heartbeat` table to prevent Supabase project pausing on free plans.
// - Uses server-side service role key.

const { serviceInsert, serviceFetch } = require('../lib/supabase');

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function nowIso() {
  return new Date().toISOString();
}

function missingTable(out) {
  const t = String(out && out.text ? out.text : '');
  const j = out && out.json ? JSON.stringify(out.json) : '';
  const blob = (t + ' ' + j).toLowerCase();
  return /heartbeat/.test(blob) && (/does not exist/.test(blob) || /relation/.test(blob) || /not found/.test(blob));
}

const HEARTBEAT_SQL = [
  'create table if not exists public.heartbeat (',
  '  id uuid primary key default gen_random_uuid(),',
  '  timestamp timestamptz default now()',
  ');',
  'alter table public.heartbeat disable row level security;'
].join('\n');

async function tryRpcCreateTable() {
  // Best-effort: many projects will NOT have any SQL-exec RPC installed.
  // We try a few common function names; if none exist, caller will return manual setup instructions.
  const candidates = ['exec_sql', 'execute_sql', 'mums_exec_sql', 'sql'];
  for (const fn of candidates) {
    try {
      const out = await serviceFetch(`/rest/v1/rpc/${encodeURIComponent(fn)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { sql: HEARTBEAT_SQL }
      });
      if (out && out.ok) return { ok: true, via: fn };
    } catch (_) {
      // ignore
    }
  }
  return { ok: false };
}

module.exports = async (req, res) => {
  // Accept GET or POST. Always respond 200 with ok flag.
  try {
    const ts = nowIso();
    let out = await serviceInsert('heartbeat', [{ timestamp: ts }]);

    if (!out.ok && missingTable(out)) {
      // Attempt auto-create via SQL RPC (best-effort)
      const created = await tryRpcCreateTable();
      if (created.ok) {
        out = await serviceInsert('heartbeat', [{ timestamp: ts }]);
      }

      if (!out.ok) {
        console.warn('[keep_alive] heartbeat table missing; manual setup required');
        return sendJson(res, 200, {
          ok: false,
          error: 'heartbeat_table_missing',
          need_manual_setup: true,
          sql: HEARTBEAT_SQL
        });
      }
    }

    if (!out.ok) {
      console.warn('[keep_alive] insert failed', out && out.status, out && out.text);
      return sendJson(res, 200, {
        ok: false,
        error: 'insert_failed',
        status: out.status,
        message: out.text || null
      });
    }

    console.log('[keep_alive] ok', ts);
    return sendJson(res, 200, {
      ok: true,
      ts,
      inserted: Array.isArray(out.json) ? out.json.length : 1
    });
  } catch (e) {
    console.warn('[keep_alive] error', e);
    return sendJson(res, 200, { ok: false, error: 'exception', message: String(e && (e.message || e) || 'unknown') });
  }
};
