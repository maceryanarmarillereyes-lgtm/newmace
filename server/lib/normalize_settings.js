function normalizeSettings(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return JSON.parse(trimmed);
      } catch (e) {
        console.warn('normalizeSettings: invalid JSON string, falling back to {}', { value });
        return {};
      }
    }
    if (trimmed.includes(',')) {
      const obj = {};
      trimmed
        .split(',')
        .map((s) => s.trim())
        .forEach((k) => {
          if (k) obj[k] = true;
        });
      return obj;
    }
    return {};
  }
  return {};
}

module.exports = { normalizeSettings };
