function escapeQuickbaseValue(v) {
  if (v === null) return null;
  return String(v).replace(/'/g, "''");
}

module.exports = {
  escapeQuickbaseValue
};
