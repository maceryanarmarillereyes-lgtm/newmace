/* @AI_CRITICAL_GUARD: UNTOUCHABLE ZONE. Strictly protects Enterprise UI/UX, Realtime Sync Logic, Core State Management, and Database/API Adapters. Do NOT modify existing logic or layout in this file without explicitly asking Thunter BOY for clearance. If overlapping changes are required, STOP and provide a RISK IMPACT REPORT first. */
const { createClient } = require('@supabase/supabase-js');

let columnEnsured = false;

async function ensureQuickbaseSettingsColumn() {
  if (columnEnsured) return true;

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Check if column exists with correct type
    const { data } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'mums_profiles'
        AND column_name = 'quickbase_settings'
      `
    });

    if (!data || data.length === 0) {
      // Column doesn't exist, create it
      await supabase.rpc('exec_sql', {
        sql: `ALTER TABLE public.mums_profiles ADD COLUMN IF NOT EXISTS quickbase_settings JSONB DEFAULT '{}'::jsonb`
      });
    }

    columnEnsured = true;
    return true;
  } catch (err) {
    console.error('[ensureQuickbaseSettingsColumn] Error:', err);
    return false;
  }
}

module.exports = { ensureQuickbaseSettingsColumn };
