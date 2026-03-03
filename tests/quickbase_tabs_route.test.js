const assert = require('assert');
const Module = require('module');

function loadRouteWithMocks(mocks) {
  const routePath = require.resolve('../server/routes/quickbase_tabs');
  delete require.cache[routePath];
  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === './tasks/_common') {
      return {
        sendJson: mocks.sendJson,
        serviceSelect: mocks.serviceSelect,
        serviceUpsert: mocks.serviceUpsert
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require('../server/routes/quickbase_tabs');
  } finally {
    Module._load = originalLoad;
  }
}

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k] = v; },
    end(payload) { this.body = payload; return this; }
  };
}

async function run() {
  const table = new Map();
  const route = loadRouteWithMocks({
    sendJson(res, code, payload) {
      res.statusCode = code;
      res.body = JSON.stringify(payload);
      return res;
    },
    async serviceSelect(_name, query) {
      const userMatch = String(query).match(/user_id=eq\.([^&]+)/);
      const tabMatch = String(query).match(/tab_id=eq\.([^&]+)/);
      const userId = userMatch ? decodeURIComponent(userMatch[1]) : '';
      const tabId = tabMatch ? decodeURIComponent(tabMatch[1]) : '';
      const rows = Array.from(table.values()).filter((r) => r.user_id === userId && (!tabId || r.tab_id === tabId));
      return { ok: true, json: rows };
    },
    async serviceUpsert(_name, rows) {
      rows.forEach((row) => {
        table.set(`${row.user_id}:${row.tab_id}`, {
          ...row,
          created_at: table.get(`${row.user_id}:${row.tab_id}`)?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      });
      return { ok: true, json: rows.map((r) => table.get(`${r.user_id}:${r.tab_id}`)) };
    }
  });

  const upsert1 = { method: 'POST', body: { user_id: 'u1', tab_id: 'tab-a', tab_name: 'Tab A', settings_json: { qid: '101' } }, query: {} };
  const upsert2 = { method: 'POST', body: { user_id: 'u1', tab_id: 'tab-b', tab_name: 'Tab B', settings_json: { qid: '202' } }, query: {} };

  await route(upsert1, makeRes(), {});
  await route(upsert2, makeRes(), {});

  const listReq = { method: 'GET', query: { user_id: 'u1' } };
  const listRes = makeRes();
  await route(listReq, listRes, {});

  const payload = JSON.parse(listRes.body || '{}');
  assert.strictEqual(payload.ok, true);
  assert.strictEqual(payload.rows.length, 2);
  const byTab = Object.fromEntries(payload.rows.map((r) => [r.tab_id, r]));
  assert.strictEqual(byTab['tab-a'].settings_json.qid, '101');
  assert.strictEqual(byTab['tab-b'].settings_json.qid, '202');

  console.log('quickbase tabs route isolation test passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
