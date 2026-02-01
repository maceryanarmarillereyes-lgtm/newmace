const { serviceInsert, serviceFetch } = require('../lib/supabase');

// /api/keep_alive
// Purpose: Prevent Supabase projects from pausing due to inactivity by performing a lightweight write.
// NOTE: This endpoint is safe to call anonymously (no auth required). It returns 200 even on failure so
//       schedulers (GitHub Actions / external uptime pings) don't spam retries.

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(payload));
}

function looksLikeMissingTable(resultText) {
  const t = String(resultText || '').toLowerCase();
  // Common PostgREST missing relation errors
  return (
    t.includes('could not find the table') ||
    t.includes('relation') && t.includes('does not exist') ||
    t.includes('pgrst') && t.includes('not found')
  );
}

async function tryCreateHeartbeatTableViaRpc(sql) {
  // Supabase does not provide a built-in "exec SQL" RPC by default.
  // If your project defines one (e.g., mums_exec_sql / exec_sql), this will attempt it.
  const rpcNames = ['mums_exec_sql', 'exec_sql', 'run_sql', 'sql'];

  for (const fn of rpcNames) {
    try {
      const out = await serviceFetch(`/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql })
      });

      // If the function exists, it should return 200-299.
      if (out && out.ok) {
        console.log('[keep_alive] heartbeat table created via RPC:', fn);
        return { ok: true, via: fn };
      }
    } catch (e) {
      // ignore and continue
    }
  }

  return { ok: false };
}

module.exports = async (req, res) => {
  try {
    if (req.method && !['GET', 'POST'].includes(req.method)) {
      return json(res, 405, { ok: false, error: 'method_not_allowed' });
    }

    const ts = new Date().toISOString();

    // 1) Primary action: lightweight insert
    let out = await serviceInsert('heartbeat', [{ timestamp: ts }]);

    if (out.ok) {
      console.log('[keep_alive] ok:', ts);
      return json(res, 200, { ok: true, inserted: true, timestamp: ts, status: out.status });
    }

    const text = out.text || '';
    console.warn('[keep_alive] insert failed:', out.status, text);

    // 2) Best-effort auto-create (only works if the Supabase project includes an exec-sql RPC)
    if (out.status === 404 || looksLikeMissingTable(text)) {
      const ddl = `
        create extension if not exists pgcrypto;
        create table if not exists public.heartbeat (
          id uuid primary key default gen_random_uuid(),
          timestamp timestamptz not null default now()
        );
        grant insert on table public.heartbeat to anon, authenticated;
        grant select on table public.heartbeat to anon, authenticated;
      `;

      const created = await tryCreateHeartbeatTableViaRpc(ddl);
      if (created.ok) {
        out = await serviceInsert('heartbeat', [{ timestamp: ts }]);
        if (out.ok) {
          console.log('[keep_alive] ok (after create):', ts);
          return json(res, 200, { ok: true, inserted: true, created_table: true, created_via: created.via, timestamp: ts, status: out.status });
        }
      }

      // Still missing: provide actionable instructions but keep 200 to avoid retry storms.
      return json(res, 200, {
        ok: false,
        inserted: false,
        error: 'heartbeat_table_missing',
        message: 'Heartbeat table is missing. Create it in Supabase (SQL Editor / migrations) and re-test.',
        required_table: 'heartbeat',
        recommended_sql: ddl.trim(),
        status: out.status,
        detail: String(text).slice(0, 600)
      });
    }

    // Non-table error
    return json(res, 200, {
      ok: false,
      inserted: false,
      error: 'insert_failed',
      status: out.status,
      detail: String(text).slice(0, 600)
    });
  } catch (e) {
    console.error('[keep_alive] server_error:', e);
    return json(res, 200, { ok: false, inserted: false, error: 'server_error', message: String(e?.message || e) });
  }
};
