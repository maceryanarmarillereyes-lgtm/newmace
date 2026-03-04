/* @AI_CRITICAL_GUARD: UNTOUCHABLE ZONE. */
// Resolve normalizeSettings from the correct root-level lib path
const path = require('path');

const normalizedModule = require(path.resolve(__dirname, '../../lib/normalizeSettings'));
const normalizeSettings =
  (normalizedModule && normalizedModule.normalizeSettings)
  || (normalizedModule && normalizedModule.default)
  || normalizedModule;

module.exports = { normalizeSettings };
