# Deploy checklist (Node 24)

## Why you saw Node 18 build failures on Vercel
Vercel builds whatever commit is on your production branch. If the build log still shows the same commit SHA, the repo wasn't updated.

## Required steps
1) **Extract** this ZIP locally (do not upload the ZIP file as-is).
2) Copy the extracted contents into your GitHub repo working tree.
3) Commit and push to the branch Vercel deploys (usually `main`).
4) In Vercel → Project → Settings → Environment Variables, set Supabase vars and **Redeploy**.

## Verify before pushing
- `package.json` (root) contains `"engines": { "node": "24.x" }`
- `realtime/package.json` contains `"engines": { "node": "24.x" }`
- `vercel.json` uses `nodejs24.x`
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
