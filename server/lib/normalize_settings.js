/* @AI_CRITICAL_GUARD: UNTOUCHABLE ZONE. */
function normalizeSettings(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try { const p = JSON.parse(trimmed); if (p && typeof p === 'object' && !Array.isArray(p)) return p; } catch (_) {}
    if (trimmed.includes(',')) {
      const out = {};
      trimmed.split(',').map(e => e.trim()).filter(Boolean).forEach(e => { out[e] = true; });
      return out;
    }
  }
  return {};
}
module.exports = { normalizeSettings };
