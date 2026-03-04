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
        queryQuickbaseRecords: mocks.queryQuickbaseRecords,
        normalizeQuickbaseCellValue: (v) => v
      };
    }
    if (request === '../../lib/normalize_settings') {
      return {
        normalizeSettings: (v) => (v && typeof v === 'object' ? v : {})
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
  let capturedWhere = '';
  const route = loadRouteWithMocks({
    sendJson(res, code, payload) {
      res.statusCode = code;
      res.body = JSON.stringify(payload);
      return res;
    },
    async requireAuthedUser() {
      return {
        id: 'u-1',
        profile: {
          qb_token: 'tok',
          quickbase_settings: {}
        }
      };
    },
    async listQuickbaseFields() {
      return {
        ok: true,
        fields: [
          { id: 3, label: 'Case #' },
          { id: 13, label: 'Assigned to' },
          { id: 25, label: 'Case Status' },
          { id: 8, label: 'Type' },
          { id: 7, label: 'End User' }
        ]
      };
    },
    async queryQuickbaseRecords(opts) {
      capturedWhere = String(opts.where || '');
      return {
        ok: true,
        records: [{ '3': { value: 'C-1' }, '13': { value: 'Juan' }, '25': { value: 'Open' }, '8': { value: 'A' }, '7': { value: 'Shop' } }],
        mappedRecords: [{ '3': 'C-1', '13': 'Juan', '25': 'Open', '8': 'A', '7': 'Shop' }]
      };
    }
  });

  const req = {
    method: 'GET',
    query: {
      qid: '10',
      tableId: 'tbl1',
      realm: 'tenant.quickbase.com',
      customFilters: [
        { fieldId: '25', operator: 'XEX', value: 'C - Resolved' },
        { fieldId: '25', operator: 'XEX', value: 'Closed' },
        { fieldId: '13', operator: 'EX', value: 'Mace Ryan Reyes' },
        { fieldId: '13', operator: 'EX', value: 'Ian Solaina' }
      ],
      filterMatch: 'ALL'
    }
  };
  const res = makeRes();
  await route(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.ok(capturedWhere.includes("{25.XEX.'C - Resolved'}"), 'should include first XEX clause');
  assert.ok(capturedWhere.includes("{25.XEX.'Closed'}"), 'should include second XEX clause');
  assert.ok(capturedWhere.includes("{13.EX.'Mace Ryan Reyes'}"), 'should include first EX clause');
  assert.ok(capturedWhere.includes("{13.EX.'Ian Solaina'}"), 'should include second EX clause');

  assert.ok(
    capturedWhere.includes("({25.XEX.'C - Resolved'} AND {25.XEX.'Closed'})"),
    'XEX filters on same field should be AND-ed to avoid always-true conditions'
  );
  assert.ok(
    capturedWhere.includes("({13.EX.'Mace Ryan Reyes'} OR {13.EX.'Ian Solaina'})"),
    'EX filters on same field should remain OR-ed'
  );

  console.log('quickbase monitoring filter logic test passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
