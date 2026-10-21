# Supabase setup (about 20 minutes)

Everything here is done in the Supabase and Google Cloud web consoles. You never need to share a
secret key: the app only uses the **public** anon key, and data is protected by Row Level Security.

## 1. Create the project

1. Sign in at <https://supabase.com> and click **New project** (free plan is enough).
2. Region: **Northeast Asia (Tokyo)** — closest to Japanese users.
3. Choose a strong database password and keep it in your password manager (the app does not need it).

## 2. Create the database

Fastest: run `scripts/copy-setup-sql.sh` (WSL) — it copies the two migrations and the seed, in order,
to the Windows clipboard. Paste into **SQL Editor** → **New query** and click **Run**.

Or paste and run each file manually, **in this order**:

1. `supabase/migrations/20261021000001_core.sql`
2. `supabase/migrations/20261021000002_play.sql`
3. `supabase/seed.sql` — demo data only (fictional stores, players and 20 Tokyo tournaments)

Each run should end with "Success. No rows returned".

> Alternative with the CLI (no Docker needed for this): `npx supabase login`,
> `npx supabase link --project-ref <ref>`, `npx supabase db push`, then run `seed.sql` in the SQL Editor.

## 3. Authentication settings

**Authentication → URL Configuration**

- Site URL: `http://localhost:5173`
- Redirect URLs: add `http://localhost:5173` (add the production URL later)

**Authentication → Providers → Email**: keep it enabled with "Confirm email" on
(contest voting requires a verified email).

**Authentication → Providers → Google**

1. In <https://console.cloud.google.com>: create a project → **APIs & Services → OAuth consent screen**
   (External, app name, your email) → **Credentials → Create credentials → OAuth client ID**
   → type **Web application**.
2. Authorised redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
   (Supabase shows this exact URL on the Google provider page).
3. Copy the Google **Client ID** and **Client secret** into the Supabase Google provider and save.

## 4. Connect the app

1. **Project Settings → API**: copy the **Project URL** and the **anon public** key.
2. In the repo: `cp .env.example .env.local` and paste both values.
3. Restart `npm run dev`.

`.env.local` is git-ignored. Never put the **service_role** key in it or anywhere in the frontend.

## 5. Check it works

- Sign in with a demo account (password `demo-password-2026`):
  - `organiser@demo.example` — owner of the fictional store "Kanda Miniature Hall"
  - `player@demo.example` — a regular player
- Or create your own account / use Google.

## Local tests (optional, no Supabase needed)

`supabase/tests/local/run.sh` applies the migrations, the seed and the RLS tests on any local
Postgres 16 (PostGIS is emulated). See the comment at the top of the script.
