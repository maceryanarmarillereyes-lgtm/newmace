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
  clearTimeout
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const hooks = sandbox.window.__MUMS_TEST_HOOKS__.myQuickbase;
assert.ok(hooks && typeof hooks.parseQuickbaseReportUrl === 'function', 'parseQuickbaseReportUrl hook should be exposed');

const parsedNav = hooks.parseQuickbaseReportUrl('https://copeland-coldchainservices.quickbase.com/nav/app/bpvmztzkw/table/bpvmztzr5/action/q?qid=1000292');
assert.ok(parsedNav, 'expected nav URL to parse');
assert.strictEqual(parsedNav.appId, 'bpvmztzkw');
assert.strictEqual(parsedNav.tableId, 'bpvmztzr5');
assert.strictEqual(parsedNav.qid, '1000292');

const parsedDb = hooks.parseQuickbaseReportUrl('https://copeland-coldchainservices.quickbase.com/db/bpvmztzr5?a=q&qid=12345');
assert.ok(parsedDb, 'expected db URL to parse');
assert.strictEqual(parsedDb.tableId, 'bpvmztzr5');
assert.strictEqual(parsedDb.qid, '12345');

const parsedFromReportPath = hooks.parseQuickbaseReportUrl('https://copeland-coldchainservices.quickbase.com/db/bpvmztzr5/report/67890');
assert.ok(parsedFromReportPath, 'expected report path to parse fallback qid');
assert.strictEqual(parsedFromReportPath.qid, '67890');

const invalid = hooks.parseQuickbaseReportUrl('https://example.com/report?qid=100');
assert.strictEqual(invalid, null, 'non-quickbase host should return null');

console.log('quickbase report URL parser test passed');
