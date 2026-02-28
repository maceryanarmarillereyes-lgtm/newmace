async function ensureQuickbaseSettingsColumn(db) {
  const rows = await db.query(
    "select column_name from information_schema.columns where table_name='users' and column_name='quickbase_settings'"
  );

  const list = Array.isArray(rows) ? rows : (rows && Array.isArray(rows.rows) ? rows.rows : []);
  const hasColumn = list.length > 0;
  if (!hasColumn) {
    console.warn('[startup] quickbase_settings missing — fallback enabled');
  }
  return hasColumn;
}

module.exports = {
  ensureQuickbaseSettingsColumn
};
