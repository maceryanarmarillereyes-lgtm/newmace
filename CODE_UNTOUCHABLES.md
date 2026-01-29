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
- **Visibility rule:** If override `scope === 'global'` and enabled, the mailbox override indicator/banner and the override modal **must be viewable by all authenticated roles** (read-only for non-Super Admin).
- **Permission rule:** Only **SUPER_ADMIN** can modify overrides (backend enforced).
- **Audit rule:** Every successful override change must attempt to write an audit record to `public.mums_sync_log` (who changed it, scope, timestamp, action, effective_time).
- **API contract:** `/api/mailbox_override/get` returns `{ ok:true, override:{...} }` and `/api/mailbox_override/set` returns `{ ok:true, override_row, audit }`.

**Conditional Exceptions (mailbox override):**
- Only change if required by **documented Supabase platform/API changes**, **documented security requirements**, or an **approved UX spec change** that explicitly supersedes these rules.
