const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('public/js/pages/my_quickbase_tab_manager.js', 'utf8');

async function run() {
  const calls = [];
  const sandbox = {
    window: {},
    console,
    localStorage: {
      _store: {},
      getItem(k) { return this._store[k] || null; },
      setItem(k, v) { this._store[k] = String(v); }
    },
    fetch: async (url, opts) => {
      calls.push({ url, method: String(opts && opts.method || 'GET').toUpperCase() });
      return {
        ok: true,
        async json() { return { ok: true, rows: [] }; }
      };
    }
  };
  sandbox.window = sandbox;
  sandbox.Auth = { getUser: () => ({ id: 'user-from-auth' }) };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  const manager = sandbox.TabManager.init({ userId: '', apiBaseUrl: '/api' });
  const tabId = manager.createTab({ tabName: 'Tab A' });
  manager.updateTabLocal(tabId, { qid: '123' });
  await manager.saveTab(tabId);
  await manager.deleteTab(tabId);

  assert.ok(calls.length >= 2, 'expected save and delete calls');
  assert.ok(
    calls.some((c) => c.url === '/api/quickbase_tabs/upsert' && c.method === 'POST'),
    'save should use upsert endpoint'
  );
  assert.ok(
    calls.some((c) => c.url.includes('/api/quickbase_tabs/') && c.url.includes('user_id=user-from-auth') && c.method === 'DELETE'),
    'delete should include resolved auth user id instead of anonymous'
  );

  console.log('my_quickbase tab manager userId fallback test passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
