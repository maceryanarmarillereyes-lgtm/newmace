# AGENTS.md

This repository is intentionally designed as a **Dual-Platform Architecture**.

## Deployment Roles

### Vercel = UAT
- **Purpose:** user acceptance testing / staging
- **API base path:** `/api/*`
- **Routing implementation:** single-function router at `api/handler.js` (via `vercel.json` rewrites)

### Cloudflare Pages = PROD
- **Purpose:** production
- **API base path:** `/functions/*`
- **Routing implementation:** Cloudflare Pages Functions under `functions/`.
- **IMPORTANT:** `public/_routes.json` controls which paths are handled by Functions.

## Rules for ALL future changes (for humans + AI agents)

1. **Any backend/API fix must be implemented for BOTH platforms.**
   - If you add or modify an endpoint, update:
     - `api/handler.js` (Vercel router table), AND
     - Cloudflare Functions (either `functions/api/[[path]].js` route table for `/api/*` back-compat, and/or a dedicated Pages Function file under `functions/` for `/functions/*`).

2. **Cloudflare Functions routing must be kept in sync with `_routes.json`.**
   - When introducing a new `/functions/*` endpoint, ensure `public/_routes.json` includes the matching route pattern.

3. **Prefer shared logic in `/server/routes` and `/server/lib`.**
   - Implement business logic once, then expose it through both platform routers.
   - Keep platform-specific files thin adapters.

4. **UI resilience standard (no blank-screen crashes).**
   - Rendering functions must not throw on missing/undefined data.
   - If a label or field is missing, render a safe fallback (`"N/A"` or empty string) instead of crashing the UI.

5. **Do NOT alter `vercel.json` structure.**
   - It must remain in the approved v4.2 structure (rewrites + `functions.maxDuration` only).

## Quick reference

- Vercel UAT endpoints live under: `/api/...`
- Cloudflare PROD endpoints live under: `/functions/...`
