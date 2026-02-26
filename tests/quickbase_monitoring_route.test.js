const assert = require('assert');
const Module = require('module');

function loadRouteWithMocks(mocks) {
  const routePath = require.resolve('../server/routes/quickbase/monitoring');
  delete require.cache[routePath];
  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === '../tasks/_common') {
      return {
        sendJson: mocks.sendJson,
        requireAuthedUser: mocks.requireAuthedUser
      };
    }
    if (request === '../../lib/quickbase') {
      return {
        listQuickbaseFields: mocks.listQuickbaseFields,
        queryQuickbaseRecords: mocks.queryQuickbaseRecords
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require('../server/routes/quickbase/monitoring');
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
  const calls = [];

  const route = loadRouteWithMocks({
    async requireAuthedUser() { return { id: 'u-1' }; },
    sendJson(res, code, payload) {
      res.statusCode = code;
      res.body = JSON.stringify(payload);
      return res;
    },
    async listQuickbaseFields() {
      return {
        ok: true,
        fields: [
          { id: 3, label: 'Case #' },
          { id: 7, label: 'End User' },
          { id: 8, label: 'Short Description or New "Concern" That Is Not in The KB' },
          { id: 9, label: 'Case Status' },
          { id: 10, label: 'Assigned to' },
          { id: 11, label: 'Last Update Days' },
          { id: 12, label: 'Age' },
          { id: 13, label: 'Type' }
        ]
      };
    },
    async queryQuickbaseRecords(opts) {
      calls.push(opts);
      return {
        ok: true,
        records: [
          {
            '3': { value: 'CASE-1' },
            '7': { value: 'Woolworths' },
            '8': { value: 'Issue 1' },
            '9': { value: 'A - Active' },
            '10': { value: 'Agent 1' },
            '11': { value: '2' },
            '12': { value: '5' },
            '13': { value: 'Graphical Screen Service' }
          }
        ]
      };
    }
  });

  const req = { method: 'GET', query: {} };
  const res = makeRes();
  await route(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1, 'queryQuickbaseRecords should be called once');
  const where = String(calls[0].where || '');
  assert.equal(where.includes("{13.EX.'Graphical Screen Service'}"), true, 'default type filter missing');
  assert.equal(where.includes("{13.EX.'CS Triaging'}"), true, 'second default type filter missing');
  assert.equal(where.includes("{7.EX.'Woolworths'}"), true, 'default end user filter missing');
  assert.equal(where.includes("{9.XEX.'C - Resolved'}"), true, 'default excluded status missing');

  const payload = JSON.parse(res.body || '{}');
  assert.equal(payload.ok, true);
  assert.equal(Array.isArray(payload.columns), true);
  assert.equal(payload.settings.excludedStatus, 'C - Resolved');
  assert.equal(payload.settings.fieldIds.type, 13);

  console.log('quickbase monitoring route defaults test passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
