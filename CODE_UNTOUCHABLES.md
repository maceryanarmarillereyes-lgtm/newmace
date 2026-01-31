# CODE UNTOUCHABLES (Permanent)

This repository contains **permanent safeguards** that MUST NOT be removed in future rebuilds, refactors, or AI-generated exports, unless an explicit external platform change requires it (see “Conditional Exceptions”).

---

## 1) vercel.json (Permanent Lock)

`vercel.json` MUST remain in the **v4.2** shape below.  
**Do NOT** re-introduce any `functions.runtime` overrides (e.g., `nodejs20.x`). Vercel will default to Node serverless functions automatically.

> Note: JSON does not support comments. The lock is documented here to avoid breaking Vercel’s JSON parser.

### Required v4.2 structure (do not change)

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api/handler?path=:path*" }
  ],
  "functions": {
    "api/**/*.js": { "maxDuration": 10 }
  }
}
```

**Conditional Exceptions (vercel.json):**
- Only change if required by **documented Vercel platform updates** or **explicit runtime format requirements** that are confirmed to be necessary for builds to succeed.

---

## 2) Backend: User creation safeguards

File: `server/routes/users/create.js`

**Do NOT remove:**
- Duplicate suppression checks (prevents repeated creates for the same identity)
- Cooldown/backoff logic (prevents hammering upstream Auth provider on 429)

**Conditional Exceptions (backend):**
- Only change if required by **Supabase Auth Admin API updates** or **documented behavior changes**.

---

## 3) Frontend: Submission + cooldown UX safeguards

Files:
- `public/js/cloud_users.js`
- `public/js/pages/users.js`

**Do NOT remove:**
- Immediate “Save” disable (`dataset.busy=1`)
- Cooldown countdown UI and auto re-enable after retry window
- Non-JSON safe parsing so users see actionable errors instead of generic “Failed (429)”

**Conditional Exceptions (frontend):**
- Only change if required by **updated UX specifications** or **documented frontend behavior changes**.

---

## 4) Mailbox override visibility + audit logging (Permanent)

Files:
- `server/routes/mailbox_override/get.js`
- `server/routes/mailbox_override/set.js`
- `public/js/store.js`
- `public/js/app.js`
- `public/js/pages/mailbox.js`
- `supabase/migrations/20260130_01_mums_sync_log.sql`

**Do NOT remove or weaken:**

- **Global Override Label:** When mailbox override is active and `scope === 'global'`, **all users** (Member, Team Lead, Super Admin) must see a visible label on the Mailbox screen: **GLOBAL OVERRIDE ACTIVE**. The label must only display when the override is **synced via `startMailboxOverrideSync()`** and must disappear when the override is reset/disabled.
- **Override reset rule:** When Mailbox Override is disabled, system must revert to normal Manila time logic immediately. No stale override flags or cached override values allowed.
- **Visibility rule:** If override `scope === 'global'` and enabled, the mailbox override indicator/banner and the override modal **must be viewable by all authenticated roles** (read-only for non-Super Admin).
- **Permission rule:** Only **SUPER_ADMIN** can modify overrides (backend enforced).
- **Audit rule:** Every successful override change must attempt to write an audit record to `public.mums_sync_log` (who changed it, scope, timestamp, action, effective_time).
- **API contract:** `/api/mailbox_override/get` returns `{ ok:true, override:{...} }` and `/api/mailbox_override/set` returns `{ ok:true, override_row, audit }`.

- **Cross-tab rule:** Global override state must be persisted to `localStorage` (cloud key) and other tabs must react via `storage` events (refresh sync + re-render).
- **Render scheduling rule:** Mailbox page must coalesce renders with `requestAnimationFrame` and guard against recursive tick/render loops.

**Conditional Exceptions (mailbox override):**
- Only change if required by **documented Supabase platform/API changes**, **documented security requirements**, or an **approved UX spec change** that explicitly supersedes these rules.

---

## 3) Mailbox override visibility & safety (Permanent)

Files:
- `server/routes/mailbox_override/get.js`
- `server/routes/mailbox_override/set.js`
- `public/js/store.js`
- `public/js/pages/mailbox.js`
- `public/js/app.js`
- `public/js/ui.js`

**Do NOT remove or weaken:**
- **Global scope visibility**: when `scope === "global"` and override is enabled, the banner/UI must be visible to **all roles**.
- **Permission enforcement**: only `SUPER_ADMIN` can change override state; all authenticated users may read global scope state.
- **Audit logging**: every override change MUST insert a row into `public.mums_sync_log` with `user_id`, `scope`, `action`, `effective_time`, and `timestamp`.
- **Anti-recursion guard** on mailbox page: never call `render()` synchronously from `tick()`; always schedule renders to prevent `RangeError: Maximum call stack size exceeded`.
- **Fallback safety**: if override state is missing/invalid, UI must fall back to system Manila time.

**Conditional exceptions:**
- Only change if required by documented security updates, Supabase API behavior changes, or formal UX specification updates.

---

## 4) RLS: profiles_select_own (Permanent)

Migration:
- `supabase/migrations/20260130_01_rls_profiles_select_own.sql`

**Do NOT remove:**
- The `profiles_select_own` SELECT policy on `public.mums_profiles`
- RLS enablement for `public.mums_profiles`

This is required so authenticated users can read their own profile row under RLS.

**Conditional exceptions:**
- Only change if required by a documented security policy change (and update the backend to match).


## Dashboard Routing (Permanent)
- Dashboard menu must always route to /dashboard and load the correct view for all roles. No redirect to /mailbox is allowed.
- Dashboard route must remain stable after load. No auto-redirect to Mailbox is allowed. Sidebar must always reflect the correct active view.

## Global Layout Scaling (Permanent)
- Global layout must scale proportionally (like zooming out) when browser size changes. No element scattering or misalignment is allowed.

## User Deletion Enforcement (Permanent)
- User deletion must fully remove authentication access, database records, and active sessions. Deleted users must not be able to log in under any condition.

## Mobile Layout Parity (Permanent)
- Mobile users must have a dedicated layout that exposes all features and menus. Future changes to the main webapp must remain visible and accessible on mobile.


## Mobile Layout Visibility & Overlays (Permanent)
- Mobile layout must prioritize visibility of main content. Overlay bars (User Online + Quick Links) must be hidden by default but accessible via toggles (#toggleUserOnlineBar, #toggleQuickLinksBar). All features must remain available and future-proofed.

## Role Sync + Deleted User Auto Logout (Permanent)
- User role and shift must update across all UI panels immediately after change. No stale sidebar data allowed.
- Deleted users must be automatically logged out from all active sessions and redirected to login with: "This account has been removed from the system."

## Login Flow Safety (Permanent)
- Login flow must hydrate session safely and defer UI rendering until user context is complete. No blocking render loops or unresponsive states allowed.
- First-time login must succeed without false session errors. Hydration must retry once before showing failure. Flash messages must only appear on confirmed failure.



## Deleted User Real-Time Logout (Permanent)
- When a user is deleted, all active sessions must be terminated immediately. No continued access allowed. Presence polling must detect deletion and trigger forced logout.

## User Management Real-Time Sync (Permanent)
- User Management must reflect new users in real time across all open sessions and roles. No manual refresh required. Sync queue must dispatch user_created events and trigger partial re-render with scroll preservation.

## Classic Style Theme (Permanent)
- Classic Style theme must maintain enterprise-grade layout, fixed sidebar, top bar, and responsive card-based content. Theme must be selectable via Settings and persist across sessions.

## JWT Expiry Recovery on Resume (Permanent)
- App must detect expired/invalid JWT tokens on resume (sleep/wake, tab restore) and recover gracefully.
- On boot/resume: silently refresh session if a refresh_token is available; otherwise clear session and redirect to login.
- Must show flash message: "Session expired. Please log in again."
- Must not spam console or hammer Supabase endpoints with repeated 401/403 POSTs.
- Dashboard and Mailbox must fail gracefully (no crashes, no broken UI state).


## Mailbox Manager Duty + Schedule Notifications (Permanent)
- “Mailbox Manager must retain full assignment capability during duty hours. Notification logic must include schedule context. Time Table must reflect current Mailbox Manager.”

## Mailbox Real-Time Consistency + Assign Modal Persistence (Permanent)
- “Mailbox data must be real-time and consistent across all users. Assignment logic must respect role + duty block. Assign Case form must remain open until explicitly submitted or canceled.”
- Mailbox data must be real-time and consistent across all users (duty assignments, time blocks, and Mailbox Manager visibility must match for everyone).
- Assignment logic must respect role + duty block:
  - TEAM_LEAD / SUPER_ADMIN / ADMIN roles can assign regardless of shift.
  - MEMBER can assign only when on-duty as Mailbox Manager during their active duty window.
- Assign Case form must remain open until explicitly submitted (Send) or canceled. No auto-close on re-render. Must show a loading spinner and prevent double sends.
