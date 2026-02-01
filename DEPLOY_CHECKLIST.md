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


## Verification (13126-07)
- Cache-busting:
  - Confirm `?v=20260201-13126-07` is applied to **all** `public/*.html` assets that reference CSS/JS.
  - Confirm sidebar Build shows `20260201-13126-07` and no mixed-version assets are loaded.
- My Schedule (/#/my_schedule):
  - Layout:
    - Time blocks are properly aligned (no stacked/overlapping text). Hour grid remains readable.
    - Blocks use task color codes (TEAM TASK catalog):
      - Mailbox Manager → light blue
      - Back Office → orange
      - Call Available → green
      - Lunch → cyan
    - Hover tooltips show full context (task/role, time, audit).
  - Accessibility:
    - Keyboard focus rings visible; ARIA labels present; contrast meets WCAG AA.
  - Mobile/tablet:
    - Responsive layout holds; no horizontal overflow; interactions remain usable.
- Members (Team Lead tooling):
  - Lock/Unlock:
    - Team Lead can access and edit all calendar dates even if locked.
    - Unlocking days persists and does not revert on refresh or cross-session sync.
    - Lock state syncs via `mums_schedule_lock_state`.
  - Apply Changes:
    - “Apply Changes” sends notifications only to affected members (those with actual schedule diffs).
    - Team Lead receives confirmation toast: “The Schedule Changes have been applied and sent to members for visibility.”
    - Action is logged in `ums_activity_logs` with actor, weekStart, affected dates, and recipient count.
- Member Notifications:
  - Popout behavior:
    - Notification appears once per schedule change (no repeated re-open/spam).
    - No close (X) button; only **Acknowledge**.
    - Acknowledge marks read in schedule notifs and prevents re-show unless a new change is pushed.
  - Message format:
    - `Schedule Updated: [Task Label] added/removed on [Weekday, Month DD, YYYY].`
    - Includes task/date context; details list is acceptable.
- JS syntax verification:
  - Run `node --check` against **all** `public/js/**/*.js` and confirm no syntax errors.
  - Navigate: Dashboard → Members → My Schedule → Mailbox. Confirm no console errors.


## Verification (13126-08)
- Cache-busting:
  - Confirm `?v=20260201-13126-08` is applied to **all** `public/*.html` assets that reference CSS/JS.
  - Confirm sidebar Build shows `20260201-13126-08` and no mixed-version assets are loaded.
- My Schedule — Enterprise Calendar:
  - Weekly view:
    - Blocks align cleanly to the shift ruler and hour grid (no shattered layout, no overlap).
    - Horizontal scrolling is acceptable on narrow widths, but **Daily view** must remain the highest-readability mode.
  - Daily view:
    - Toggle works and persists (localStorage `mums_sched_view`).
    - Day tabs work; swipe left/right changes day on mobile.
  - Task color consistency (TEAM TASK catalog):
    - Mailbox Manager → `#4aa3ff`
    - Back Office → `#ffa21a`
    - Call Available → `#2ecc71`
    - Lunch → `#22d3ee`
    - Badges (`.task-label` + `.task-color`) and block backgrounds use the same palette.
  - Tooltip + accessibility:
    - Hover + focus tooltips show task name, Manila time range, optional local time range, and audit info if available.
    - Blocks are keyboard focusable with visible focus ring; ARIA labels present; contrast meets WCAG AA.
- JS syntax verification:
  - Run `node --check` against **all** `public/js/**/*.js` and confirm no syntax errors.
  - Navigate: Dashboard → My Schedule → Members. Confirm no console errors.


## Verification (13126-09)
- Cache-busting:
  - Confirm `?v=20260201-13126-09` is applied to **all** `public/*.html` assets that reference CSS/JS.
  - Confirm sidebar Build shows `20260201-13126-09` and no mixed-version assets are loaded.
- My Schedule (/#/my_schedule):
  - Horizontal alignment:
    - Hour ruler ticks align **pixel-perfect** with the hour grid lines and schedule blocks.
    - Alignment holds during resize and at common zoom levels (90% / 100% / 110%).
  - Date format:
    - Date labels use full format: `Sunday, February 1, 2026` across **Weekly**, **Daily**, and **Team** views.
    - Timezone context is visible (Manila + Local when different).
  - Tabs:
    - Weekly / Daily / Team tabs switch instantly with no blank state.
    - View mode persists via localStorage `mums_sched_view`.
  - Team tabular view:
    - Renders a team schedule table (rows = members, columns = hourly slots).
    - Sticky MEMBER column and sticky header row remain readable while scrolling.
    - TASK color codes match TEAM TASK catalog:
      - Mailbox Manager → `#4aa3ff`
      - Back Office → `#ffa21a`
      - Call Available → `#2ecc71`
      - Lunch → `#22d3ee`
    - Hover/focus tooltips show member name, task label, and time context.
  - Accessibility:
    - Blocks and team cells are keyboard-focusable with visible focus ring.
    - ARIA labels present; contrast meets WCAG AA.
- JS syntax verification:
  - Run `node --check` against **all** `public/js/**/*.js` and confirm no syntax errors.
  - Navigate: Dashboard → My Schedule → Members → Mailbox. Confirm no console errors.
