# PLAY module — architecture, data model and plan (proposal)

> Status: **proposal, waiting for validation**. No PLAY code is written yet.
> Date: 2026-10-21

## 0. What the codebase actually is

The brief says "assume Next.js + Supabase unless the codebase says otherwise". The codebase says otherwise:

| Area | Current state |
|---|---|
| Framework | **Vite 5 + React 18 SPA**, TypeScript strict. Not Next.js. |
| State | Zustand (one store for the editor). |
| Backend | **None.** Projects in IndexedDB, preferences and analytics in localStorage. |
| Routing | In-house hash router (`#/editor`, `#/beginner`, `#/s/<scheme>`…). |
| i18n | In-house, `en.ts` is the typed reference, `ja.ts` must define every key. ~300 keys. |
| Design system | `components/ui.tsx` (Icon, Button, Slider, Modal…), CSS tokens in `styles.css`, rem, mobile-first. |
| Size | ~7,300 lines, 3 runtime dependencies, ~108 KB gzipped. |
| PAINT status | All 6 PAINT brief items done and smoke-tested. Nothing blocking. |

PLAY needs what PAINT never needed: accounts, shared multi-user data, permissions, realtime, file uploads,
geo queries and a server-side secret (Twitch). **A backend is unavoidable.**

## 1. Architecture

### Recommendation: keep the Vite SPA, add Supabase. Do not migrate to Next.js.

- A Next.js migration would cost 1–2 of the 10 days, put PAINT at risk, and buy little: we don't need SSR
  for the MVP, and the only server code (Twitch proxy) fits in a Supabase Edge Function.
- Supabase covers everything PLAY needs in one service: Auth (email + Google OAuth), Postgres + **PostGIS**,
  **Row Level Security**, **Realtime** (live standings), Storage (contest and board photos),
  Edge Functions (Twitch proxy with cache, secrets in env vars).
- PAINT stays **usable without an account** (no signup wall in the recruitment funnel). An account is only
  needed to register, vote, organise, or publish a scheme to a profile.

### Folder layout

```
src/
  core/                     shared foundation
    auth/                   supabase client, AuthProvider, useSession, RequireAuth, profile hooks
    ui/                     design system (today's ui.tsx split per component) + tokens.css
    i18n/                   same system; dictionaries split per module: core.*, paint.*, play.*
    router/                 nested hash routes: #/paint/…, #/play/…, #/account, #/legal
    analytics/              track(): local counters (anonymous) + `events` table when signed in
    layout/                 AppShell with the Paint / Play switch, footer disclaimer
  paint/                    today's code moved as-is (engine, components, pages, store)
  play/
    tournaments/            list, filters, map, detail, create/edit
    registration/           register, army list (paste, parse, review)
    matches/                pairings, score entry, confirmation, standings, archive, exports
    contests/               entries, voting, jury, podium
    tables/                 QR table + check-in screens, organiser tablet view
    live/                   Live tab, stream grid, embed player
    dashboard/              organiser marketing dashboard
    cards/                  result / podium cards (reuses PAINT card renderer)
    lib/                    pairing/ (pure TS, unit-tested), listParser.ts, tiebreakers.ts
supabase/
  migrations/               0001_core.sql, 0002_play.sql, 0003_rls.sql, 0004_functions.sql …
  seed.sql                  Tokyo stores, ~20 tournaments, users, matches, events (fictional)
  functions/twitch-streams/ Edge Function: app token, Get Streams, keyword filter, cache
config/
  twitch-categories.json    our labels -> Twitch category IDs (verified via API, with date)
```

The move of PAINT into `src/paint/` is one commit with **no logic change**, verified by the existing smoke tests.

### Routes

| Route | Screen |
|---|---|
| `#/` | Home: the whole journey (discover → paint → share → play → watch → store) |
| `#/paint`, `#/paint/editor`, `#/paint/beginner`, `#/paint/stores` | PAINT (today's screens) |
| `#/s/<data>` | Shared scheme — **kept forever**, links are already in the wild |
| `#/play` | Tournament list (list / map) |
| `#/play/t/<slug>` | Tournament page (info, players, pairings, standings, live badge) |
| `#/play/t/<slug>/manage` | Organiser view (tablet friendly) |
| `#/play/m/<matchId>` | Match screen (score entry, confirmation) — target of the table QR |
| `#/play/checkin/<token>` | QR check-in |
| `#/play/contests/<slug>` | Contest entries, vote, podium |
| `#/play/live` | Live streams |
| `#/play/dashboard` | Marketing dashboard (organisers) |
| `#/u/<handle>` | Public profile with match archive and contest entries |
| `#/account`, `#/legal` | Shared |

**Technical note:** Supabase's default OAuth flow returns tokens in the URL hash, which clashes with the hash
router. We use the **PKCE flow** (`?code=` in the query string), which supabase-js supports.

### Cross-module bridges (the customer journey)

- **Paint → Play:** a PAINT scheme can be published to the account (`schemes` table); contest entries link to it.
  The beginner path's last step shows tournaments tagged "Beginner" near the user, as well as stores.
- **Play → Paint:** army list factions and contest categories link back to "Plan a scheme for this army".
- **Play → Store:** every tournament happens in a store; result cards and the live badge point to it.
- **Metrics:** when signed in, `track()` also writes to the `events` table, which powers the cross-module
  funnel ("created a scheme then joined a tournament" and the reverse).

### Twitch

- An Edge Function holds `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`, gets an app access token (client
  credentials flow), calls **Get Streams** per category, applies keyword / tag include and exclude rules,
  and caches the result for 3 minutes in a `stream_cache` table. The client never sees the secret.
- Category IDs are fetched once with **Get Games** by a setup script and written to
  `config/twitch-categories.json` with the date of verification. I won't hardcode guessed IDs:
  **I need your Twitch app credentials to verify them.**
- Player: official iframe `player.twitch.tv/?channel=…&parent=localhost&parent=<prod domain>`; chat:
  `twitch.tv/embed/<channel>/chat?parent=…`. No SDK, nothing downloaded or re-hosted.
- Sub-tab labels are our own (e.g. "Sci-fi battles", "Fantasy battles", "Squad skirmish", "Other tabletop").
  Official game names appear only inside the server config as Twitch category identifiers, never in the UI.

### Other technical choices (dependency-free where reasonable)

| Need | Choice | Dependency? |
|---|---|---|
| Auth, DB, realtime, storage | `@supabase/supabase-js` | **Yes (required)** |
| Map with many markers + radius | Leaflet + OpenStreetMap tiles, lazy-loaded on the map view only | **Yes (recommended)** — the alternative is a list plus one-marker iframe per tournament (what PAINT does today) |
| QR code generation | `qrcode` (small) | **Yes (recommended)** — writing a QR encoder by hand is about a day of work for no portfolio value |
| QR scanning | The phone's native camera opens the URL | No |
| PDF export | Print stylesheet + `window.print()` | No |
| CSV export | Hand-written | No |
| Pairing engine tests | `node:test` with Node 22 `--experimental-strip-types` | No |
| Local Supabase | Supabase CLI via `npx` (dev tool, needs Docker) | Only if you choose a local setup |

## 2. Data model

Postgres + PostGIS on Supabase. All tables have **RLS enabled**. Geography columns use `geography(Point, 4326)`.
Score changes go through `SECURITY DEFINER` functions so the rules (who can report, confirm, resolve)
live in one place in the database.

### Core

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `id` (PK = `auth.users.id`), `handle` unique, `display_name`, `avatar_path`, `home_city`, `home_location` geography, `preferred_lang` (`en`/`ja`), `factions` text[] (free text), `is_admin`, `created_at` | Created by trigger on signup |
| `stores` | `id`, `name`, `address`, `city`, `location` geography, `website`, `created_at` | Fictional names in seed |
| `store_staff` | `store_id` → stores, `user_id` → profiles, `role` (`owner`/`staff`) | PK (`store_id`, `user_id`). Gives a store's organisers access to its dashboard |
| `schemes` | `id`, `owner_id` → profiles, `name`, `payload` jsonb (same compact format as share links), `is_public`, `created_at` | Published from PAINT |
| `events` | `id` bigint, `user_id` null, `name`, `module` (`paint`/`play`), `tournament_id` null, `store_id` null, `props` jsonb, `created_at` | Insert-only. No IP, no user agent |
| `reports` | `id`, `reporter_id`, `target_type` (`photo`/`list`/`stream`/`entry`/`profile`), `target_id`, `reason`, `status` (`open`/`actioned`/`dismissed`), `created_at` | Moderation queue |

### Tournaments

| Table | Key columns | Notes |
|---|---|---|
| `formats` | `id` (`skirmish`/`clash`/`battle`), `points_limit` (500/1000/2000), `round_minutes` (60/120/180), `default_rounds` (3/3/5) | Reference data |
| `tournaments` | `id`, `slug` unique, `name`, `organiser_id` → profiles, `store_id` → stores null, `venue_name`, `address`, `location` geography, `starts_at`, `ends_at`, `format_id` → formats, `type` (`beginner`/`casual`/`competitive`/`narrative`/`painting_contest`), `language` (`en`/`ja`/`both`), `max_players`, `registration_deadline`, `list_deadline`, `pairing_system` (`swiss`/`single_elim`/`round_robin`), `rounds_planned`, `lists_visibility` (`hidden_until_start`/`public`), `twitch_channel` null, `status` (`draft`/`published`/`in_progress`/`finished`/`cancelled`), `is_hidden`, `created_at` | |
| `registrations` | `id`, `tournament_id`, `user_id`, `status` (`registered`/`waitlist`/`withdrawn`/`dropped`), `checked_in_at`, `checkin_token` uuid unique, `created_at` | Unique (`tournament_id`, `user_id`) |
| `army_lists` | `id`, `registration_id` unique, `raw_text` (≤ 20,000 characters), `parsed_faction` text, `parsed_points` int, `status` (`submitted`/`approved`/`rejected`), `organiser_comment`, `submitted_at`, `is_hidden` | Only the player's own text is stored. No rules data anywhere. "Locked" = `now() > list_deadline`, checked in RLS |
| `rounds` | `id`, `tournament_id`, `number`, `status` (`pending`/`active`/`finished`), `started_at` | Unique (`tournament_id`, `number`) |
| `game_tables` | `id`, `tournament_id`, `number`, `qr_token` uuid unique | One QR per table |
| `matches` | `id`, `tournament_id` (denormalised for realtime filtering and RLS), `round_id`, `table_id`, `player_a_id`, `player_b_id` null (bye), `a_primary`, `a_secondary`, `a_bonus`, `b_primary`, `b_secondary`, `b_bonus`, `result` (`a_win`/`b_win`/`draw`) null, `status` (`scheduled`/`reported`/`confirmed`/`disputed`/`resolved`), `reported_by`, `confirmed_by`, `dispute_note`, `board_photo_path`, `updated_at` | Dual validation: one player reports, the other confirms or disputes; the organiser resolves |

`standings` is a **view**: match points (win 3, draw 1), then strength of schedule (sum of opponents' match
points), then victory-point difference, then total victory points. A bye counts as a win with a neutral score.

### Painting contests

| Table | Key columns | Notes |
|---|---|---|
| `contest_categories` | `id`, `tournament_id`, `kind` (`single`/`squad`/`vehicle`/`beginner`), `voting_closes_at`, `jury_enabled` | |
| `contest_entries` | `id`, `category_id`, `user_id`, `title`, `photo_paths` text[] (check: 3–5), `scheme_id` → schemes null, `rights_confirmed` (check: true), `is_hidden`, `created_at` | Unique (`category_id`, `user_id`) |
| `contest_votes` | `id`, `category_id`, `entry_id`, `voter_id`, `created_at` | Unique (`category_id`, `voter_id`) = one vote per account per category. No self-vote: enforced by trigger. Requires a verified email |
| `jury_members` | `tournament_id`, `user_id` | PK on both |
| `jury_scores` | `entry_id`, `juror_id`, `technique`, `composition`, `originality` (1–10) | Unique (`entry_id`, `juror_id`) |

**Blind voting:** RLS works per row, not per column, so the client reads `contest_entries_public`, a view that
returns `user_id = null` until the tournament is `finished`.

### Live

| Table | Key columns | Notes |
|---|---|---|
| `stream_cache` | `category_key` PK, `payload` jsonb, `fetched_at` | Written by the Edge Function only (service role) |

### Indexes

- `GIST(stores.location)`, `GIST(tournaments.location)`, `GIST(profiles.home_location)` — radius search.
- `tournaments(status, starts_at)`, `tournaments(store_id)`, `tournaments(format_id)`, `tournaments(type)`.
- `registrations(user_id)`, `registrations(tournament_id, status)`.
- `matches(tournament_id, round_id)`, `matches(player_a_id)`, `matches(player_b_id)` — profile archive.
- `contest_votes(entry_id)`, `contest_entries(category_id)`.
- `events(name, created_at)`, `events(store_id, created_at)`, `events(tournament_id)`, `events(user_id, created_at)`.

### Search function

`search_tournaments(lat, lng, radius_km, from, to, format_ids, types, language, store_id, has_spots)` returns
tournaments with `distance_km` and `spots_left` (`ST_DWithin` on the GIST index). The map view and the list
view share this one function.

### RLS summary

| Table | Read | Write |
|---|---|---|
| `profiles` | everyone (public fields) | self |
| `stores` | everyone | store staff, admin |
| `tournaments` | everyone if `published` and not hidden; organiser always | organiser, store staff, admin |
| `registrations` | players of the tournament, organiser | self (register / withdraw); organiser (check-in, drop) |
| `army_lists` | owner and organiser always; others only if `public`, or once the tournament has started | owner until the deadline; organiser (approve / reject / hide) |
| `matches` | everyone (published tournament) | **through functions only**: `report_score`, `confirm_score`, `dispute_score`, `resolve_score` |
| `contest_entries` | through the blind view | self (create); organiser and admin (hide) |
| `contest_votes` | aggregated counts only, after results | verified users, one per category, not on own entry |
| `jury_scores` | organiser, after results | jury members |
| `events` | organiser and store staff, through aggregated dashboard views; admin | insert only |
| `reports` | admin, organiser of the related tournament | any signed-in user |

### Prepared for later (designed now, migrated later)

`seasons`, `ratings` (user, season, format, elo, tier), `achievements` and `user_achievements`,
`featured_streams`, `youtube_channels`. The MVP tables already carry what they need: format on every match,
`starts_at` on tournaments, and city and location on profiles for matchmaking. Details in `ROADMAP.md`.

## 3. Scope reality check (read this first)

The full brief is **3 to 4 weeks of work**, not 10 days. What I can deliver well in 10 days:

| Item | In 10 days | Cut or simplified |
|---|---|---|
| Shared account + Paint/Play navigation | Full | Avatar upload can wait (initials by default) |
| Tournament list + filters + map | Full | |
| Creation, registration, army lists | Full | |
| Swiss pairings + dual validation + live standings | Full | |
| Round robin | Yes (simple fixed schedule) | |
| Single elimination | **Risky** | Proposed: last, or roadmap |
| Archive on profiles, CSV | Full | |
| PDF | Print stylesheet | No generated PDF file |
| Painting contests + blind public vote + podium | Full | |
| Jury scoring | Simple form + average | No weighting or per-juror report |
| Marketing dashboard with seeded data | Full | |
| QR table + QR check-in | Full | |
| Organiser tablet view | Responsive version of the organiser page | Not a separate app |
| Result cards | Full (reuses the PAINT card renderer) | |
| Twitch Live tab + live badge | **Depends on your credentials and a production domain** | If they arrive late: build the UI against the cached-format mock and switch on the real API |
| Moderation | Report button + hide | No admin back-office beyond a simple list |

**External setup only you can do** (I'll give step-by-step instructions):
1. A Supabase project (free tier) — or Docker for a local one.
2. A Google Cloud OAuth client for "Sign in with Google".
3. A Twitch developer application (Client ID + secret).
4. A production host and domain (for the OAuth redirect URLs and the Twitch `parent` parameter).
   Any static host works (Cloudflare Pages, Netlify, Vercel).

## 4. Step-by-step plan

Each step ends with: type-check, build, headless smoke tests (PAINT included), a commit, and an update of
`docs/CONTEXT.md`.

| # | Days | Step | Done when |
|---|---|---|---|
| 0 | ½ | **Rename + PAINT wrap-up**: new app name, new disclaimer text (EN/JP), privacy text updated for accounts | PAINT smoke tests green |
| 1 | ½ | **Restructure**: `core/`, `paint/`, `play/`; nested router with old routes redirected; Paint/Play navigation | PAINT unchanged, `#/s/…` links still work |
| 2 | 1½ | **Supabase foundation**: migrations (schema, PostGIS, RLS, functions), auth (email + Google, PKCE), profile page, seed (Tokyo stores, ~20 tournaments, ~60 users) | Sign up / sign in / profile edit work; RLS checked with two test accounts |
| 3 | 1 | **Tournament list**: filters, near me / city, radius, list + map, tournament page | 20 seeded tournaments filter correctly by distance |
| 4 | 1 | **Organise + register**: creation form, formats, registration, army list paste + parse + over-limit warning, deadline lock, approve / reject | Full flow with two accounts |
| 5 | 2 | **Play the event**: Swiss engine (unit-tested: no rematch, byes, tie-breakers), round robin, rounds, score report / confirm / dispute / resolve, realtime standings, profile archive, CSV + print | A simulated 8-player, 3-round event runs end to end |
| 6 | 1 | **Painting contests**: categories, entries (3–5 photos, rights confirmation, scheme link), blind vote, jury, podium | Vote rules verified (no double vote, no self-vote) |
| 7 | 1 | **Marketing dashboard**: seeded events, new vs returning, retention, formats, busiest days and times, contest and stream engagement, cross-module funnel | Presentable with seed data |
| 8 | 1 | **QR + cards**: table QR, check-in QR, organiser tablet view, podium and contest-winner cards (story / square, EN/JP) | Scanning a QR on a phone opens the right match |
| 9 | 1 | **Live**: Twitch Edge Function + cache, verified category config, Live tab, embed player + chat, live badge on tournaments, empty state, events | Real live streams shown with your credentials |
| — | ½ | Buffer, single elimination if time allows, `ROADMAP.md`, README update | |

## 5. Decisions needed from you

1. **Stack**: keep Vite + add Supabase (recommended), or migrate to Next.js?
2. **Supabase**: hosted free project (recommended — you create it and give me the URL and anon key) or local Docker?
3. **Dependencies**: OK for `@supabase/supabase-js`, `leaflet` (+ `@types/leaflet`) and `qrcode` (+ `@types/qrcode`)?
4. **Twitch** credentials and the **production domain** — needed by step 9 at the latest.
5. **Single elimination**: last-day bonus or roadmap?
6. **Privacy**: signed-in users' events will be stored with their user ID (needed for retention and the
   cross-module funnel). The privacy page will say so. Anonymous PAINT use stays local and anonymous. OK?
7. **App name** (see the proposal in chat).

## 6. Quick play and the wider PLAY roadmap (decided 2026-10-24)

Owner decisions:

| Topic | Decision |
|---|---|
| Navigation | PLAY tabs: **Tournaments** · **Quick play** · **My games** |
| Game and format | **Free text** typed by players; suggestions come from what other players typed (`popular_game_texts`). The app ships no list of official games or formats. |
| Games in scope | Every game system players type (40k family, Age of Sigmar family, specialist and other games) |
| Joining | **On request**: the host accepts or declines. Country, city and district are public; the **exact address** is visible to the host and accepted players only (`game_private` + RLS). |
| Priorities | Opponent finder, battle report + share card, friendly rating + badges, leagues / stores / calendar |

### Phase 1 — done (2026-10-24)
- Migration `20261024000005_quick_play.sql`: `games`, `game_private`, `game_players`, functions
  `create_game`, `request_join_game`, `respond_join_game`, `leave_game`, `cancel_game`, `popular_game_texts`.
  All writes go through the functions (capacity, host rights, 20 upcoming games per host).
- Demo data `seed_games.sql` (8 games around Tokyo); RLS tests `supabase/tests/rls_games.sql` (21 checks);
  live checks in `scripts/check-supabase.mjs`.
- UI: Tournaments tab (list), Quick play (filters: game, format chips, country, city, level, seats left),
  Host a game form (game, format, points, level, players, language, date, duration, store, country,
  city, district, private address, note), game page (players, requests, accept / decline, leave, cancel),
  My games (upcoming / played).

### Phase 2 — Opponent finder
"Looking for a game" posts (game, area, date window, level); matching posts and games are listed
together; optional alert when a matching game is published (in-app first, e-mail later).

### Phase 3 — Battle report and share card
After a game: score and winner, confirmed by both players (same pattern as tournament matches),
photos (Storage), link to the painted army from the PAINT gallery, and a result card to share
(reusing the share-card renderer).

### Phase 4 — Friendly rating and badges
Per-game rating (Elo-like, only on confirmed reports), head-to-head history, badges (first game,
10 games, fully painted army, first hosted game…). Visible on the profile.

### Phase 5 — Leagues, stores, calendar
Store leagues over several weeks (standings from confirmed reports), store pages with free tables and
regular nights, `.ics` export and reminders the day before.

Open questions for later phases: e-mail notifications (provider, opt-in), moderation of free-text
games (report button, admin review), public player profiles.
