const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('public/js/pages/my_quickbase.js', 'utf8');

assert.match(
  source,
  /id="qbSettingsModal"[^\n]*display:none/,
  'Quickbase settings modal should default to hidden so it does not auto-open'
);

console.log('my_quickbase modal visibility test passed');
