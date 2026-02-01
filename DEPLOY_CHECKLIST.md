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
  - Confirm `?v=20260201-13126-05` is applied to all `public/*.html` assets that reference CSS/JS.
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

## Enterprise UI/UX + Sync Verification (13126-05)
- Cache-busting:
  - Confirm `?v=20260201-13126-05` is applied to **all** `public/*.html` assets that reference CSS/JS.
- My Schedule (/#/my_schedule):
  - Layout:
    - Grid alignment is clean (no stacked/overlapping text). No horizontal overflow on desktop/tablet/mobile.
    - Shift header, timezone strip, and calendar grid are visually distinct and readable.
  - Content:
    - Shift blocks are color-coded (Morning/Mid/Night) and include role badges.
    - Timezone conversion uses `UI.parseManilaDateTimeLocal()` and displays both Manila + local accurately.
    - Countdown timer updates and remains accurate after sleep/wake.
    - Hover tooltips show full block context (role, time, audit).
  - Accessibility:
    - ARIA labels present for interactive blocks.
    - Focus rings visible via keyboard navigation; WCAG AA contrast maintained in dark/light themes.
  - Mobile/tablet:
    - Collapsible sections work; swipe navigation changes focus day without breaking layout.
- Mailbox (/#/mailbox):
  - Realtime sync:
    - Open 2 sessions; confirm duty/time blocks, mailbox manager visibility, assignment counts match across users.
    - Confirm Store.listen triggers on: `mums_mailbox_tables`, `mums_mailbox_state`, `ums_cases`, `ums_schedule_notifs`.
  - Role-based assignment:
    - MEMBER on-duty Mailbox Manager can assign cases **to MEMBERS only** during active duty block.
    - TEAM_LEAD can assign cases for the same shift.
    - SUPER_ADMIN can assign cases by default.
    - Others are blocked (UI disabled) and backend rejects.
  - Audit logging:
    - Each assignment generates an audit entry in `ums_activity_logs` including: assigner, assignee, time block, shiftKey, role, timestamp.


## Verification (13126-06)
- Cache-busting:
  - Confirm `?v=20260201-13126-06` is applied to **all** `public/*.html` assets that reference CSS/JS.
- Sidebar menu routing:
  - Click **Dashboard** → loads Dashboard only.
  - Click **My Schedule** (left sidebar) → loads the My Schedule grid (not Dashboard).
  - From Dashboard quick actions/links, click **Schedule/My Schedule** → loads My Schedule.
- My Schedule page load:
  - `UI.renderSchedule()` renders `Pages.my_schedule` and mounts into `#main` without blank state.
  - No missing container errors; no console errors on navigation.
- JS syntax check:
  - Run `node --check public/js/app.js public/js/ui.js public/js/pages/my_schedule.js` and confirm no syntax errors.
