# MUMS (Realtime Green Mandatory) — Static Webapp + Vercel API + Supabase

This project is a **static HTML/JS webapp** deployed on **Vercel** with **Serverless API Routes** under `/api/*`, backed by **Supabase** for Auth, Realtime, and storage tables.

## High-level architecture

- **Frontend**: `index.html` + `js/*` + `css/*` (served as static assets)
- **Auth**: Supabase Auth (REST) via `js/cloud_auth.js`
- **Realtime**: Supabase Realtime (UMD `@supabase/supabase-js`) via `js/realtime.js`
- **Server-side API**: Vercel functions in `api/*` (use Supabase **service role** key)
- **Local dev relay**: `realtime/server.js` (optional websocket relay for localhost only)

## Supabase setup

1. Create a Supabase project.
2. In Supabase SQL editor, run:
   - `supabase/schema.sql`
   - `supabase/schema_update_v2.sql` (if applicable)
3. Verify these tables exist:
   - `mums_profiles`
   - `mums_documents`
   - `mums_presence`
   - `mums_sync_log`
   - `mums_mailbox_time_override`

> Note: The code assumes `mums_profiles.user_id` stores the Supabase Auth user UUID.

## Deployment (Vercel)

1. Push the repository to GitHub.
2. Import the repo in Vercel.
3. Set the environment variables (Project Settings → Environment Variables):
   - See `.env.example` for the full list.
4. Deploy.

This repo includes:
- `vercel.json` to pin API route runtime to **nodejs24.x**.
- `package.json` with `engines.node=24.x`.

## Local development

### Run the webapp

From the repo root:

```bash
python -m http.server 8080
```

Open:
- `http://localhost:8080/login.html`

### Optional: run the local realtime relay

```bash
cd realtime
npm install
npm start
```

The webapp will automatically attempt the relay on `ws://localhost:17601` when running on `localhost`.

## Security notes

- The **Supabase service role key** is only used server-side (Vercel functions). Do not embed it in the client.
- `/api/presence/*` requires an authenticated Supabase JWT (sent via `Authorization: Bearer <access_token>`).
- `/api/users/create` is restricted to `SUPER_ADMIN` and `TEAM_LEAD` (TEAM_LEAD can create `MEMBER` only).
