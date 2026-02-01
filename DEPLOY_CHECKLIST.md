# Deploy checklist (Node 20)

## Why you saw Node 18 build failures on Vercel
Vercel builds whatever commit is on your production branch. If the build log still shows the same commit SHA, the repo wasn't updated.

## Required steps
1) **Extract** this ZIP locally (do not upload the ZIP file as-is).
2) Copy the extracted contents into your GitHub repo working tree.
3) Commit and push to the branch Vercel deploys (usually `main`).
4) In Vercel → Project → Settings → Environment Variables, set Supabase vars and **Redeploy**.

## Verify before pushing
- `package.json` (root) contains `"engines": { "node": "20.x" }`
- `realtime/package.json` contains `"engines": { "node": "20.x" }` (if applicable)
- `vercel.json` uses `nodejs20.x`
- No `.env` file committed (only `.env.example`)

## Verify on Vercel
In Deployment → Build Logs, confirm it clones a **new commit SHA** and no longer reports Node 18.x.

## Apply Supabase migrations (required for Steps 1–6)
Run these in order (SQL editor or Supabase CLI):
1) `supabase/migrations/20260127_01_profiles_avatar_url.sql`
2) `supabase/migrations/20260127_02_storage_public_bucket.sql`
3) `supabase/migrations/20260128_01_profiles_team_override.sql`

After applying migrations:
- Confirm `mums_profiles.team_override` exists
- Confirm SUPER roles have `team_id = NULL` when `team_override = false`

## Enterprise UI/UX Verification (13126-04)
- Cache-busting:
  - Confirm `?v=20260131-13126-04` is applied to all `public/*.html` assets that reference CSS/JS.
- Dashboard (/#/dashboard):
  - Renders for SUPER_ADMIN / TEAM_LEAD / MEMBER without redirect or blank state.
  - KPI cards show: Active cases, My active cases, Pending acknowledgements, Mailbox shift load.
  - Notification Center:
    - Filters (Unread/Schedule/Mailbox/System/All) work.
    - Acknowledge button updates `ums_schedule_notifs` and removes from Unread.
    - Search works without crashing.
  - Activity Heatmap renders with 7-day view and tooltips.
  - Mailbox Analytics panel renders current shift stats (assigned/confirmed/open + avg response), bucket rows, role distribution.
  - Quick Actions and Sidebar toggle behave correctly on desktop and mobile.
- My Schedule (/#/my_schedule):
  - Enterprise grid layout is responsive (desktop/tablet/mobile), no horizontal overflow.
  - Shift blocks are color-coded (Morning/Mid/Night), include role badges, timezone conversion, and countdown timer.
  - Hover tooltips and per-block audit trail render.
  - Drag-to-reschedule is permission-gated, produces an audit entry, and does not break schedule integrity.
  - WCAG checks: keyboard focus visible, sufficient contrast, readable typography.
- Real-time consistency (multi-session):
  - Open two sessions and confirm schedule notifications, mailbox tables, and audit logs remain consistent across users.
