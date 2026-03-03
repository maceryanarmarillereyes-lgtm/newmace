const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('public/js/pages/my_quickbase.js', 'utf8');

const sandbox = {
  window: {
    Pages: {},
    __MUMS_TEST_HOOKS__: {}
  },
  document: {},
  console,
  setTimeout,
  clearTimeout,
  URL
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const hooks = sandbox.window.__MUMS_TEST_HOOKS__.myQuickbase;
assert.ok(hooks && typeof hooks.parseQuickbaseReportUrl === 'function', 'parseQuickbaseReportUrl helper should be exposed');

const parsed = hooks.parseQuickbaseReportUrl('https://tenant.quickbase.com/nav/app/bpvmztzkw/table/bpvm1212tzr5/action/q?qid=123');
assert.strictEqual(parsed.appId, 'bpvmztzkw');
assert.strictEqual(parsed.tableId, 'bpvm1212tzr5');
assert.strictEqual(parsed.qid, '123');

const invalid = hooks.parseQuickbaseReportUrl('not-a-url');
assert.strictEqual(invalid, null);

console.log('my_quickbase url parser test passed');
