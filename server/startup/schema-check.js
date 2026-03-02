/* @AI_CRITICAL_GUARD: UNTOUCHABLE ZONE. Strictly protects Enterprise UI/UX, Realtime Sync Logic, Core State Management, and Database/API Adapters. Do NOT modify existing logic or layout in this file without explicitly asking Thunter BOY for clearance. If overlapping changes are required, STOP and provide a RISK IMPACT REPORT first. */
async function ensureQuickbaseSettingsColumn(db) {
  const rows = await db.query(
    "select column_name from information_schema.columns where table_name='mums_profiles' and column_name='quickbase_settings'"
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
