const assert = require('assert');
const Module = require('module');

function loadRoute({ supabaseMocks, schemaMocks }) {
  const routePath = require.resolve('../server/routes/users/update_me');
  delete require.cache[routePath];

  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === '../../lib/supabase') return supabaseMocks;
    if (request === '../../startup/schema-check') return schemaMocks;
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

async function testNormalizeAndEscape() {
  const calls = [];
  const route = loadRoute({
    supabaseMocks: {
      getUserFromJwt: async () => ({ id: 'u-1' }),
      getProfileForUserId: async () => ({ user_id: 'u-1', role: 'MEMBER' }),
      serviceSelect: async () => ({ ok: true, json: [{ column_name: 'quickbase_settings' }] }),
      serviceUpdate: async (_table, patch) => {
        calls.push(patch);
        return { ok: true, json: [patch] };
      }
    },
    schemaMocks: {
      ensureQuickbaseSettingsColumn: async () => true
    }
  });

  const req = {
    method: 'PATCH',
    headers: { authorization: 'Bearer token' },
    body: {
      quickbase_settings: JSON.stringify({
        qid: '7',
        filters: [{ fid: '6', operator: 'Is Not', value: "O'Reilly" }]
      })
    }
  };
  const res = makeRes();

  await route(req, res);
  const payload = JSON.parse(res.body);

  assert.equal(res.statusCode, 200);
  assert.equal(payload.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].quickbase_settings.customFilters[0].fieldId, '6');
  assert.equal(calls[0].quickbase_settings.customFilters[0].operator, 'XEX');
  assert.equal(calls[0].quickbase_settings.customFilters[0].value, "O''Reilly");
}

async function testFallbackColumnMissing() {
  const calls = [];
  const route = loadRoute({
    supabaseMocks: {
      getUserFromJwt: async () => ({ id: 'u-2' }),
      getProfileForUserId: async () => ({ user_id: 'u-2', role: 'MEMBER' }),
      serviceSelect: async () => ({ ok: true, json: [] }),
      serviceUpdate: async (_table, patch) => {
        calls.push(patch);
        return { ok: true, json: [patch] };
      }
    },
    schemaMocks: {
      ensureQuickbaseSettingsColumn: async () => false
    }
  });

  const req = {
    method: 'PATCH',
    headers: { authorization: 'Bearer token' },
    body: {
      quickbase_settings: {
        qid: '9',
        filters: [{ fid: '10', operator: 'Contains', value: "Kid's" }]
      }
    }
  };
  const res = makeRes();

  await route(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.equal(typeof calls[0].quickbase_settings, 'undefined');
  assert.ok(calls[0].quickbase_config);
}

async function run() {
  await testNormalizeAndEscape();
  await testFallbackColumnMissing();
  console.log('update_me integration tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
