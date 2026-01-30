const { getUserFromJwt, getProfileForUserId, serviceSelect, serviceUpsert } = require('../../lib/supabase');

// POST /api/sync/push
// Body: { key, value, op: 'set'|'merge', removedIds?: string[], clientId?: string, ts?: number }
//
// Rules:
// - Reads are global (authenticated users can read all documents).
// - Writes are RBAC gated; MEMBER writes are restricted to safe collaborative keys.
// - The server performs merge semantics for list keys to avoid clobbering concurrent updates.

const WRITE_KEYS = new Set([
  'ums_announcements',
  'mums_team_reminders',
  'ums_weekly_schedules',
  'ums_master_schedule',
  'ums_schedule_locks',
  'ums_member_leaves',
  'ums_schedule_notifs',
  'mums_team_config',
  'mums_attendance',
  'mums_mailbox_tables',
  'mums_mailbox_state',
  'ums_cases',
  'ums_activity_logs',
  'mums_mailbox_time_override_cloud',
  'mums_user_events'
]);

const MEMBER_WRITE_KEYS = new Set([
  'mums_attendance',
  'mums_mailbox_state',
  'ums_cases'
]);

function isObject(x) {
  return x && typeof x === 'object' && !Array.isArray(x);
}

function idForItem(item) {
  if (!item || typeof item !== 'object') return '';
  return String(item.id || item.caseNo || item.case_no || item.uuid || item.key || '');
}

function mergeArrays(existing, incoming, removedIds) {
  const out = Array.isArray(existing) ? existing.slice() : [];
  const map = new Map();
  for (const it of out) {
    const id = idForItem(it);
    if (id) map.set(id, it);
  }

  // Apply removals first
  if (Array.isArray(removedIds) && removedIds.length) {
    const removed = new Set(removedIds.map((x) => String(x)));
    for (let i = out.length - 1; i >= 0; i--) {
      const id = idForItem(out[i]);
      if (id && removed.has(id)) out.splice(i, 1);
    }
  }

  // Upsert / merge incoming
  if (Array.isArray(incoming)) {
    for (const it of incoming) {
      const id = idForItem(it);
      if (!id) continue;
      const existingIt = map.get(id);
      if (existingIt) {
        // Shallow merge (incoming wins)
        Object.assign(existingIt, it);
      } else {
        out.push(it);
        map.set(id, it);
      }
    }
  }

  return out;
}

function mergeObjects(existing, incoming) {
  const base = isObject(existing) ? Object.assign({}, existing) : {};
  if (isObject(incoming)) {
    for (const k of Object.keys(incoming)) {
      base[k] = incoming[k];
    }
  }
  return base;
}

module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
      res.statusCode = 405;
      return res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    }

    const auth = req.headers.authorization || '';
    const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
    const u = await getUserFromJwt(jwt);
    if (!u) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
    }

    const profile = await getProfileForUserId(u.id);
    const role = profile && profile.role ? String(profile.role) : 'MEMBER';

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const key = String(body.key || '').trim();
    const op = String(body.op || 'set');
    const clientId = String(body.clientId || '').trim() || null;
    const removedIds = Array.isArray(body.removedIds) ? body.removedIds : [];
    const incomingValue = body.value;

    if (!key || !WRITE_KEYS.has(key)) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok: false, error: 'Invalid key' }));
    }

    if (role === 'MEMBER' && !MEMBER_WRITE_KEYS.has(key)) {
      res.statusCode = 403;
      return res.end(JSON.stringify({ ok: false, error: 'Forbidden (member write restricted)' }));
    }

    // Fetch current doc (for merge)
    let current = null;
    if (op === 'merge') {
      const cur = await serviceSelect('mums_documents', `select=key,value&key=eq.${encodeURIComponent(key)}&limit=1`);
      if (cur.ok && Array.isArray(cur.json) && cur.json[0]) current = cur.json[0].value;
    }

    let nextValue = incomingValue;
    if (op === 'merge') {
      if (Array.isArray(current) || Array.isArray(incomingValue)) {
        nextValue = mergeArrays(current, incomingValue, removedIds);
      } else if (isObject(current) || isObject(incomingValue)) {
        nextValue = mergeObjects(current, incomingValue);
      }
    }

    const row = {
      key,
      value: nextValue,
      updated_at: new Date().toISOString(),
      updated_by_user_id: u.id,
      updated_by_name: (profile && profile.name) ? profile.name : null,
      updated_by_client_id: clientId
    };

    const up = await serviceUpsert('mums_documents', [row], 'key');
    if (!up.ok) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ ok: false, error: 'Supabase upsert failed', details: up.json || up.text }));
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: false, error: 'Server error', details: String(e?.message || e) }));
  }
};
