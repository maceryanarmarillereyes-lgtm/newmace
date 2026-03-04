/* @AI_CRITICAL_GUARD: UNTOUCHABLE ZONE. */
// Resolve normalizeSettings from the correct root-level lib path
const path = require('path');
const { normalizeSettings } = require(path.resolve(__dirname, '../../lib/normalizeSettings'));

module.exports = { normalizeSettings };
