const assert = require('assert');
const Module = require('module');

function loadRouteWithMocks(mocks) {
  const routePath = require.resolve('../server/routes/users/update_me');
  delete require.cache[routePath];
  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === '../../lib/supabase') {
      return {
        getUserFromJwt: mocks.getUserFromJwt,
        getProfileForUserId: mocks.getProfileForUserId,
        serviceUpdate: mocks.serviceUpdate,
        serviceSelect: mocks.serviceSelect
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require('../server/routes/users/update_me');
  } finally {
    Module._load = originalLoad;
  }
}

function makeRes() {
  return {
    statusCode: 200,
    body: '',
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    end(payload) { this.body = payload; }
  };
}

async function run() {
  let patchSeen = null;

  const route = loadRouteWithMocks({
    async getUserFromJwt() { return { id: 'u-1' }; },
    async getProfileForUserId() { return { user_id: 'u-1', role: 'MEMBER' }; },
    async serviceSelect() { return { ok: true, json: [{ column_name: 'quickbase_settings' }] }; },
    async serviceUpdate(_table, patch) {
      patchSeen = patch;
      return { ok: true, json: [patch] };
    }
  });

  const req = {
    method: 'PATCH',
    headers: { authorization: 'Bearer token' },
    body: {
      quickbase_settings: {
        reportLink: 'https://acme.quickbase.com/db/abc?a=q&qid=7',
        qid: '7',
        tableId: 'abc',
        realm: 'acme.quickbase.com',
        customColumns: ['3'],
        customFilters: [],
        filterMatch: 'ALL',
        dashboardCounters: [
          { fieldId: '6', operator: 'EX', value: 'Open', label: 'Open Cases', color: 'blue' }
        ]
      }
    }
  };
  const res = makeRes();

  await route(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(patchSeen);
  assert.deepEqual(patchSeen.qb_dashboard_counters, [
    { fieldId: '6', operator: 'EX', value: 'Open', label: 'Open Cases', color: 'blue' }
  ]);
  assert.deepEqual((patchSeen.quickbase_settings || {}).dashboardCounters, [
    { fieldId: '6', operator: 'EX', value: 'Open', label: 'Open Cases', color: 'blue' }
  ]);

  console.log('users/update_me dashboard counters persistence test passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
