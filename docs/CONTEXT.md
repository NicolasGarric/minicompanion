# Project context — MiniCompanion

> Working memory for this project. Read this first when resuming work.
> Last update: 2026-10-28 (security audit, migration 19)

## What it is

A web app to plan miniature painting schemes (tabletop hobby). The user uploads a photo of a
miniature, marks zones (armour, cloth, metal…), then tries paints on it. The shading of the photo
is preserved, and wash / drybrush / highlight / metallic / contrast-paint effects are simulated.

It is also a **portfolio piece for a Marketing Manager application in Japan**: it must show
marketing thinking (player recruitment, social sharing, driving visits to physical stores),
not only technical skill.

## Stack (do not change without asking)

- React 18 + Vite 5 + TypeScript (strict), Zustand for state. No other runtime dependency.
- **Ask the owner before adding any new dependency.**
- No backend. Persistence in IndexedDB (projects, library) and localStorage (prefs, analytics).
- Path router (History API, real URLs such as `/play/t/<slug>`) written in-house, i18n written in-house.
  Old `#/…` links (printed table QR codes, bookmarks) are redirected on load; shared schemes stay
  `/#/s/…` on purpose (their data never reaches the server). Vercel rewrites unknown paths to index.html.
- CSS: one stylesheet, `rem` units, mobile-first, desktop layout from `64rem`.
- Visual polish is deferred: keep styles simple, the owner will do a visual pass later.

## Architecture

```
src/
  engine/       engine.ts (recolour renderer), maskTools.ts (brush, wand, lasso), demo.ts
  lib/          color.ts, image.ts (resize, export), palette.ts (k-means extraction),
                share.ts (card + link), recipe.ts, beginner.ts, analytics.ts, router.ts
  i18n/         en.ts (reference), ja, fr, es, de, it, pt (BR), zh (simplified), ko; index.ts (LANGS, useT)
  data/         paints.ts (text + hex only), presets.ts (neutral scheme names), stores.ts (sample)
  storage/      db.ts (IndexedDB)
  components/   UI, one component per file
  pages/        Home, Beginner, Stores, Legal, Stats, SharedScheme
```

Rendering: `engine.render()` multiplies the paint colour by the photo's relative luminance per
zone mask, then adds wash (cavities = blurred luminance − luminance), drybrush (raised + noise),
edge highlight (Sobel × ridge) and specular for satin/gloss/metal.

## Brief (priority order)

1. **Mandatory reference image + palette extraction** — JPG/PNG/WebP only, resized and
   compressed client-side, rights confirmation checkbox, 5–8 dominant colours (k-means),
   eyedropper adds colours, each colour assignable to a zone, closest paints with similarity,
   image always visible (side panel desktop / collapsible mobile), replaceable but never removable.
2. **Legal & brand safety** — independent fan project. No logos, artwork, product photos or
   trademarks in app name / UI / assets / metadata. Paints referenced by text + hex only.
   Paint links go to neutral search or the user's chosen retailer, no affiliate links.
   Footer disclaimer on every page, full text on Legal/About page, short version on cards
   and README, in EN and JP.
3. **EN/JP interface** — all strings in translation files, language switcher, Noto Sans JP.
   Uncertain hobby terms are flagged in `src/i18n/ja.ts` with `// CHECK:` comments.
4. **Shareable card** — story 1080×1920 and square 1080×1080, download / Web Share / copy link,
   public link that re-opens the scheme, "Made with MiniCompanion" footer + short disclaimer.
5. **Beginner path** — upload → 3–5 step scheme (base coat, wash, drybrush, highlight) →
   shopping list → store finder (sample data, pluggable provider).
6. **Analytics** — privacy-friendly local event counters + internal stats page.

Deadline ≈ 10 days: favour simple working features over complete ones.

## Decisions taken

- **UI languages (2026-10-23)**: EN, JA, FR, ES, DE, IT, PT-BR, ZH (simplified), KO. Each file is
  typed `Record<MessageKey, string>` against `en.ts`, so a missing key fails the build. Adding a
  language = one file + one `LANGS` entry + the enum value in a migration (`app_lang`, `event_language`).
- **Scheme presets renamed to neutral descriptions** ("Royal blue & gold"…). Faction / chapter
  names are trademarks and are not used anywhere. The demo figure is a generic "armoured trooper".
- **Public share links without backend**: the scheme (recipes per role, no image) is encoded in
  the URL hash (`#/s/<base64url>`). Images are not uploaded anywhere. A real hosted link would
  need a backend; `lib/share.ts` is the single place to swap.
- **Analytics are local only** (counts in localStorage, no personal data, no cookies, no third
  party). `lib/analytics.ts` has an optional `endpoint` hook to forward events to a
  self-hosted, cookie-less counter later. Stats page = this browser's numbers.
- **Store finder**: fictional sample stores (no real retailer names), OpenStreetMap embed
  iframe for the map (no dependency). `data/stores.ts` exposes a `StoreProvider` interface.
- Images are stored as JPEG (quality 0.85, max 1600 px) to keep IndexedDB small.

## Status

- [x] Core editor: zones, brush / eraser / smart brush, magic wand, lasso, eyedropper, mask ops,
      undo/redo, effects, finishes, variants & comparison, schemes, harmonies, exports, autosave.
- [x] 1. Reference panel + palette extraction + rights confirmation + replace image
- [x] 2. Legal page, footer, neutral presets, neutral paint search links
- [x] 3. i18n EN/JP (≈300 keys, `ja.ts` typed against `en.ts`)
- [x] 4. Share card (square + story) + share link + shared scheme page
- [x] 5. Beginner path + store finder (sample data, OSM embed)
- [x] 6. Analytics + stats page (`#/stats`, not linked in the nav on purpose)
- [x] README

Verified 2026-10-21: `tsc` clean, `vite build` OK (≈108 KB gzip), headless Chromium smoke tests
on desktop (1440×900) and mobile (390×844): demo → editor → eyedropper → brush → JP switch →
share cards → shared link page; beginner path with real file upload → plan → shopping → stores →
editor; stats; legal. No console errors, no horizontal overflow on mobile.

## Phase 2: PLAY module (in progress)

The platform grows into two modules sharing one account: PAINT (still the priority) and PLAY
(tournaments, matches, painting contests, live streams). Goal: show the full customer journey
discover → paint → share → play → watch → back to physical stores.

- Plan, data model, scope check: `docs/PLAY_PLAN.md`. Out of scope: `ROADMAP.md`.
- Validated by the owner (2026-10-21): keep Vite + add **hosted Supabase**; dependencies
  `@supabase/supabase-js`, `leaflet`, `qrcode` approved.
- App name: **MiniCompanion** (chosen by the owner 2026-10-22). Written in Latin letters everywhere,
  including the Japanese UI: the katakana コンパニオン is strongly associated with banquet hostesses.
  Internal storage ids (`chromaforge` IndexedDB, `cf.*` localStorage keys) are kept on purpose so
  existing local projects stay readable; old `.chroma.json` project files are still imported.
- Hosting: Vercel (Hobby plan), live at `https://minicompanion.vercel.app` (Google Search Console
  verified via `public/google697cbb3d751d634f.html`).
- Code: GitHub `NicolasGarric/minicompanion` (public), local folder `~/sources/minicompanion`
  (both renamed from `painting` / `painting_scheme` on 2026-10-22).
- Supabase project created and seeded (2026-10-22). The DB password leaked once in a public commit
  (since removed with a force push): it must be rotated; never keep it in repo files.
- Still open: Twitch credentials (step 9), single elimination (bonus or roadmap), privacy of
  signed-in events.

### PLAY progress

- [x] Step 1 — code split into `src/core` (shared), `src/paint`, `src/play`; `core` never imports
      `paint`. Nested hash routes, legacy `#/editor` and `#/beginner` redirect, `#/s/…` unchanged.
      Paint / Play navigation with sub-navigation. New platform home (customer journey).
- [x] Step 2 (code) — Supabase client (PKCE), session store, sign in / sign up / Google, profile page
      (display name, username, home city, language, free-text factions). App runs without backend.
- [x] Step 2 (database) — migrations `supabase/migrations/` (all PLAY tables, enums, indexes, RLS,
      search / register / withdraw / army list functions) + demo seed (9 stores, 50 users,
      20 tournaments). **27 RLS tests pass** on local Postgres (`supabase/tests/local/run.sh`).
- [x] Pure TS engines with tests (`npm test`, 18 tests): army list parser, standings + tie-breakers,
      Swiss pairings (no rematch, byes, backtracking), round-robin schedule.
- [x] Step 2 — verified on the live Supabase project (2026-10-22): `node scripts/check-supabase.mjs`
      20/20 (auth, profile trigger, RLS, PostGIS search, registration, organiser drafts). Migration
      `20261022000003` applied (fix for INSERT … RETURNING on tournaments).
- [x] Step 3 — tournament list, filters, map (Leaflet), tournament page
- [x] Steps 4–8 — tournament flow, painting contest, social layer (see `docs/PLAY_PLAN.md`)
- [ ] Step 9 — Twitch live status (needs Twitch developer credentials; embedded player only for now)

### PAINT v2 (2026-10-22) — simpler editor, see `docs/PAINT_V2.md`

- [x] Automatic reference colours (`src/paint/engine/segment.ts`): N colours (3–12, default 6),
      Lab k-means with lightness down-weighted, soft masks forming a partition, background
      detected from the border (>55 %) and excluded, colourless photos flagged (`greyscale`).
- [x] Zones `source: 'auto'` named after their colour (EN/JP), recoloured live; re-analysis keeps
      renamed / recoloured zones (ΔE < 14). Brush / lasso / wand edits on auto zones are exclusive.
- [x] Undo stores mask rectangles only (`maskPatch.ts`). Blending of auto zones by share (no seams).
- [x] 3-step editor (Image → Colours → Paints & share), closest paints first, effects behind a
      toggle, live shopping list with "I have it", share card, variants, presets in step 3.
- [x] Removed: reference-palette panel, harmonies panel, old zones panel (and their dead strings).
- [x] Layer model: primer step (B&W or primer colour on the miniature), unpainted colours are
      transparent, drawn areas are reorderable layers, border flood-fill background (see PAINT_V2.md).
- [x] Tap a part, mobile bottom sheet, long press / hold to see the original, split / merge colours,
      preferred brand, before / after card, popular colours for grey or drawn zones.
- [x] Round 3: priority toggle, protected background + enclosed pockets, soft light levels on grey
      photos, auto-crop, active-zone outline, painting-steps slider (see PAINT_V2.md).
- [x] Round 4: build-up brush, colour count everywhere, no on-screen markers, 2048 px detail,
      right-drag pan / pinch zoom.
- [x] Primer without highlights: two looks, "Photo shadows" (default) and "Flat + recesses".
- [x] Round 5: base paints (8 max, add / remove), grey photos split by material, covering base
      coats, model-alone / original photo (transparent PNG), brush by default, profile gallery
      (migration 20261023000004 to apply in Supabase), footer scroll fix (see PAINT_V2.md).
- [x] PLAY tabs (Tournaments / Quick play / My games) and quick play games: free-text game and
      format, join on request, private address (migration 20261024000005 + seed_games.sql to apply).
      Roadmap phases 2–5 in PLAY_PLAN.md §6.
- [x] PLAY social (phases 2–5): battle reports + result card, friendly rating + badges, public /
      private player page, looking-for-a-game posts, in-app notifications, messages, leagues, store
      nights, .ics (migration 20261025000006 + seed_social.sql to apply in Supabase).
- [x] Owner decisions applied (migration 20261026000007): report media per profile, realtime,
      auto re-detection of old PAINT projects, cleanup of check games.
- [x] Full tournament flow (migration 20261027000008 + seed_tournament.sql): organise, register, lists,
      Swiss rounds, score reports by QR code, live standings (see PLAY_PLAN.md).
- [x] Painting contest (migration 20261028000009 + seed_contest.sql): entries, blind vote, jury,
      podium and share card (see PLAY_PLAN.md).
- Insight: automatic colours shine on **painted** minis / box art / illustrations. On a grey-primed
  mini they only follow light and shadow → the app says so and suggests drawing areas.

### Conventions for PLAY

- Write operations with business rules go through `SECURITY DEFINER` SQL functions; tables only get
  the policies needed for reads and simple owner edits. Execute is revoked from `public, anon`
  (Supabase also grants `anon` explicitly by default).
- Every new SQL rule gets a test in `supabase/tests/*.sql` (run with the local harness).
- Seeded data is fictional; demo accounts use `demo-password-2026` (demo project only).
- Live database cleanup (2026-10-23): `supabase/cleanup_demo_data.sql` removes every demo account, its content and
  the 9 fictional stores, keeping only real users' data (tested on local Postgres). Once applied in production,
  `scripts/check-supabase.mjs` no longer works (it signs in with the demo accounts); seeds stay for local tests.

## Owner decisions (2026-10-25)

| Topic | Decision |
|---|---|
| Demo data names | Keep real game names in demo games (player-typed text, no logos, trademark notice) |
| Profiles | Private by default; public page by choice |
| Report photos / attached army | Visible according to the **author's profile**: public profile → public, private → participants only |
| Messages / notifications | **Supabase Realtime** (no new dependency; SQL to enable it on the tables) |
| Twitch | Embedded player only for now (no developer credentials, no live status) |
| Pairings | Swiss rounds only |
| Tournaments | Always public; an account is needed to register |
| Old PAINT projects | Re-detect base paints **automatically** on open (colours carried over to the closest) |
| Japanese review | Later |
| DB password (leaked once) | Not rotated for now, owner's choice |
| "Automated check" games | Deleted after each live check (admin-only cleanup function) |
| Next priorities | Full tournament flow, painting contest, visual pass, PAINT performance |
| Visual identity (2026-10-23) | **Riso tactique**: risograph print on paper, inks pink `#ff4f7b` + navy `#1d2a5b` + yellow marker `#ffd23f`, Dela Gothic One (titles) + Zen Maru Gothic (text); home = tabletop seen from above in halftone (terrain, deployment zones, objectives, units, measuring tape) with the app name airbrushed by particles (`src/core/visual/risoTable.ts`) |
| Languages (2026-10-23) | **One language at a time + a selector** in the header (language names in their own script), first visit follows the browser language; signed in, the choice is saved on the profile |
| Decisions page (2026-10-27) | Owner answered on a decisions page (claude.ai artifact). Photos: steps 1-4 of the storage plan, quota **100 photos** per player, retention as proposed; R2 or Supabase Pro only if the gauge passes 70 %. Expected audience in 6 months: unknown |
| Tablets (2026-10-27) | PAINT side panel when the tablet is held sideways, colour bar when upright |
| Language URLs (2026-10-27) | Prefixed addresses for **public pages only** (`/ja/play`), all 9 languages |
| Single elimination (2026-10-27) | Still **Swiss rounds only** |
| Quick games privacy (2026-10-27) | Visible to everyone, exact address for accepted players only (already the case) |
| Demo data (2026-10-27) | **Remove it** from production (`cleanup_demo_data.sql`, PREVIEW first) |
| DB password (2026-10-27) | **Rotate it now** (replaces the 2026-10-25 "not rotated" choice) |
| Twitch (2026-10-27) | Later; embedded player only |
| Translations review (2026-10-27) | **In-app "Suggest a translation"**, reviewed in `/admin` |
| Vite 8 (2026-10-27) | Approved and done |
| Languages added (2026-10-23) | French, Spanish, German, Italian, Brazilian Portuguese, **Simplified** Chinese, Korean (Noto Sans SC / KR for those two); events can be in any of them or "Japanese and English" (migration 000010) |

## Open points / next steps (updated 2026-10-27, evening)

Agreed order: 4. PAINT performance → 5. visual pass. Then:

1. ~~Multi-week tournaments~~ done (migration 000011, table `round_schedule` + `set_round_schedule`):
   date and venue per round, set at creation ("Rounds on different days") and editable by the
   organiser (registered players notified); shown on the info tab, pairings, table pages; .ics with
   one event per round (reminders 1 day and 1 hour before) and in-app "next 24 hours" reminders.
2. ~~PAINT performance~~ done: low-res preview + full render in bands (commit 360f6fc).
3. ~~Visual pass~~ done: Riso tactique theme on the whole app, share / result / podium cards in riso
   inks. ~~More languages~~ done (9 languages, migration 000010). Next: tablet fine-tuning.
4. ~~Tournaments list: map and filters~~ done: Leaflet map (OSM tiles tinted in riso inks, loaded
   only on that page), filters city / distance / game size / type, starts on the profile's city,
   "Around me" asks for the position on click only and filters in the browser (never stored or sent).
   ~~Lazy-load the dictionaries~~ done (2026-10-27): English stays bundled, the 8 others are chunks loaded
   when picked (`loadLang` in `src/core/i18n/index.ts`; the first screen waits for its dictionary). Main
   bundle 1,528 kB → 972 kB (gzip 510 → 291 kB).
5. ~~Organiser dashboard and PAINT ↔ PLAY bridges~~ done (2026-10-27), no migration:
   - **Dashboard** tab on the tournament page (organiser only, `OrganiserDashboard.tsx`, numbers in
     `src/play/lib/organiserStats.ts` with tests): seats / waiting list / check-ins, sign-ups over time (step line
     with seat limit and deadline), list status with the names to chase, active round (to play / to confirm /
     disputed), contest entries and votes per category, player list as CSV (formula-safe, UTF-8 BOM).
   - **Paint this army**: on my tournament list, creates an army in My pile with one unit per list line that has
     points (`listUnits` in `listParser.ts`, counts from "10x", "x20", "5 models", "10体"), all in the box.
   - **Contest entry from this device**: the entry form also offers the photos of PAINT projects and the latest
     photo of each unit in My pile (`src/play/lib/devicePhotos.ts`); only ticked photos are uploaded.
6. ~~Moderation~~ done: report button (`src/play/lib/social.ts`) and moderation queue in `/admin` (7h).
7. ~~Stores page~~ done: **5,588 real shops worldwide** from OpenStreetMap (games & miniatures,
   model kits, hobby shops; anime / cards-only / crafts filtered out) in `public/data/shops.json`,
   rebuilt with `node scripts/fetch-osm-shops.mjs` (ODbL credit shown). Leaflet map drives the list,
   place search (Nominatim, typed text only), "Near me" in the browser only. OSM coverage is uneven
   (good in Europe / US, thin in Japan): shops can add themselves on OSM. The PLAY demo stores
   (fictional, with store pages and nights) are separate and unchanged.
7b. **Bug reports** (footer, every page): text + up to 3 screenshots (signed in; drop / paste / pick,
   shrunk on the device) + optional technical context; anyone can report (rate limited), admins
   read them at `/admin/bugs` (link on the account page). Migration 000012.
7c. **Security pass (2026-10-23)**: migration 000013 (direct writes limited to what the app does,
   no TRUNCATE, tournament moderation flag / owner / flow protected by a trigger, contest entries only
   via functions, profiles: public name card only, city / armies via `player_card`, own profile via
   `my_profile`, unused check-in tokens dropped, analytics table closed); `safeHref` for links typed
   by users; security headers + CSP in `vercel.json` (tested on the production build, no violation);
   supabase-js updated (auth-js advisory). Open: vite/esbuild dev-server advisory needs vite 8
   (dev only); owner actions in the Supabase dashboard (below).
7d. **SEO / AI assistants (2026-10-23)**: real URLs; per-page title, description, canonical, robots
   (personal pages noindex); schema.org `WebSite` / `WebApplication` and `Event` per tournament;
   `scripts/build-seo.mjs` (runs after `vite build`) writes static HTML for the public pages and every
   published tournament, `sitemap.xml`, `robots.txt` (AI crawlers explicitly allowed on public pages)
   and `llms.txt`; Open Graph image `public/og-image.png`. Not done: per-language URLs / hreflang
   (language is a client setting), Search Console sitemap submission (owner).
7e. **"Stats" tab (2026-10-26)**, top-level nav next to Paint / Play / Hobby stores, at `/dice`: generic 3-phase D6 attack (hit, wound with reroll
   none / 1s / failures, opponent's save 2+–6+ or none) + damage per unsaved die (1–6, D3, D6); dice 1–40.
   Exact odds (threshold table, chain, P(≥1), distribution of total damage), maths in `src/play/lib/dice.ts`
   (tests in `tests/play/dice.test.ts`). One roll animated on a halftone tabletop (`src/play/visual/diceTable.ts`),
   chosen by the owner among 5 visual proposals ("Table de jeu tramée"). Game-neutral wording, 9 languages
   (`// CHECK:` on the Japanese terms). `/stats` stays the internal analytics page.
7f. **Mobile pass (2026-10-26)**: PAINT step 2 on phones = full-screen image + colour bar under it
   (`ColourDock`: every colour as a swatch, "Paints" opens the catalogue, "Details" raises the panel, which
   drops as soon as the image is touched); tool options unroll vertically from a one-line summary;
   wrapped tab bars (tournament page, quick play) form even rows; dice choices share the card width.
7g. **Hobby & community (2026-10-26)**, chosen by the owner from 40 ideas then 3 mockups each (visual picked per feature):
   - PAINT, on this device (`src/paint/hobby/store.ts`, localStorage + photos in IndexedDB): **My pile** (`/paint/pile`,
     armies as halftone gauges, unit list with "all painted" tick and painted / total stepper, stages box → based),
     **army cards** (deck per army, share link `/#/d/…` text-only like scheme links, PNG of the deck with latest photos),
     **time-lapse story** (unit step photos → 1080×1920 video via MediaRecorder), **sessions** (`/paint/sessions`, timer,
     streak, 18-week halftone calendar, journal), **paint shelf** (`/paint/shelf`, owned pots + own paints with a reference
     colour = PAINT library `owned` / `customPaints`; shopping list suggests an owned stand-in under ΔE 8).
   - With the backend, **migration 000015 (to apply in Supabase)**: seasonal **challenges** (`/paint/challenges`, monthly
     theme + palette Oct 2026 → Sep 2027, one photo per player, likes, 3 reports hide), tournament **predictions** (pairings tab,
     points only), **mentoring** (`/play/mentors`, 4 shared steps + stamps, notifications `mentor_*`), league **campaign map**
     (league page, planet regions or star system, one confirmed league win = one conquest, organiser can fix), **swap board**
     (`/play/swap`, offer / wanted, contact by message, no payment, 3 reports hide, admin restore), `my_hobby_stats()`.
     50 new RLS tests (`supabase/tests/rls_hobby.sql`).
   - PLAY **table & mission generator** (`/play/table-generator`, narrative with scenario themes / casual / competitive
     point-symmetric with density, seed in the URL, PNG export) — generic missions, no rules of any brand.
   - Me (`src/me/`): **level & titles** as hanko stamps (`/me/level`, XP only from real activity), **player card** meishi with
     QR to the public page (`/me/card`), **year in review** six-screen story (`/me/year`). Linked from the account page.
   - 9 languages (`// CHECK:` on Japanese terms); new tests: deck link codec, table generator symmetry.
7h. **Admin dashboard (2026-10-26)** at `/admin` (admins only, linked from the account page), migration 000016 (to apply
   after 000015): KPIs (visits, page views, accounts created / active, activity, open reports, new bugs), day-by-day chart,
   top page types, languages, activity feed; accounts list (search, sort, last active, games, reports, suspend / lift);
   moderation queue (reports → hide and close, dismiss, reopen, suspend the author); latest content per type with hide /
   restore. Traffic = anonymous counters per *route name* and language per day (`track_page_view`, skipped with Do Not
   Track and on admin pages), plus one `active_days` row per signed-in player per day. Suspended accounts cannot post
   (insert triggers), their public content is hidden. 25 new RLS tests (`supabase/tests/rls_admin.sql`).
   Demo cleanup: `supabase/cleanup_demo_data.sql` still covers everything (new tables cascade from the demo accounts).
8. **Twitch live status**: needs Twitch developer credentials and an Edge Function (later).
9. **Native review** of the translations by hobbyists: Japanese (`// CHECK:` markers in
   `src/core/i18n/ja.ts` and all PLAY texts added since) and the 7 new languages (written by Claude,
   hobby terms to check first: wash, drybrush, edge highlight, contrast paints, Swiss pairing terms).
10. **Security**: the database password leaked once; the owner decided on 2026-10-27 to rotate it (nothing in
    the app or the scripts uses it: only the anon key). Also delete the old password from the comment in the local `.env`.
11. Demo data: in the live database the "Friday Live Clash" table 3 shows 14–14 marked as a win
    (fixed in `seed_tournament.sql` for new installs; `supabase/fixes/fix_demo_friday_table3.sql` for the live one).
12. ~~Zone names not re-translated~~ done (2026-10-27): names made by the app keep how they were made
    (`Zone.autoName`: colour, or a message key + number) and are rewritten when the language changes, on open
    and on loading a variant; a name typed by the user drops it. Older projects: recognised when the name matches
    a generated one in a loaded language.
13. **SQL pack** (2026-10-27): `resources/supabase/` (built by `scripts/build-sql-resources.sh`): status query,
    all migrations as one re-runnable script, the latest migration alone, numbered copies, demo seeds,
    `fix_demo_friday_table3.sql` (item 11) and the demo cleanup, all ASCII. Live database checked the same day:
    migrations 01–15 applied, 16 applied by the owner the same day, demo data still there.
14. **Photo storage plan** (2026-10-27, migration 17 **to apply**): uploads go through `uploadPhoto` (`src/core/lib/photo.ts`):
    1280 px WebP q0.8 + 400 px thumbnail (`<id>.w.webp` / `<id>.t.webp`; JPEG, or PNG for transparency, where WebP
    cannot be encoded), one-year cache headers; lists and grids show thumbnails (`thumbOf`, older files have none).
    Quota of 100 photos per player (restrictive storage policy + `my_photo_usage()` checked first, thumbnails and bug
    screenshots excluded). `/admin` → Storage: gauge per bucket against the 1 GB free plan (alert at 70 %) and a
    cleanup button (retention: bugs 90 d after closing, swap 30 d after closing, challenges / contests 12 months except
    top 10 / podium, orphans after 7 d); it updates the rows first, then deletes through the Storage API (Supabase
    forbids SQL deletes of storage rows). Not automatic (nightly run would need an Edge Function + cron). 21 SQL tests.
    Measured 2026-10-27: 1 file, 133 kB.
15. ~~Tablets~~ done: landscape tablets (48–64rem wide, ≥34rem high) use the desktop layout with a 20rem panel;
    upright tablets and phones keep the colour bar. Checked in a headless browser at 1000×700 and 768×1024.
16. ~~Vite 8~~ done: vite 8.3.4 + @vitejs/plugin-react 6.1.2 (separate commit), npm audit clean, build ~0.4 s.
17. ~~Language URLs~~ done: `/fr/…`, `/ja/…` etc. for public pages (`PUBLIC_ROUTES` in `src/core/router.ts`,
    helpers in `src/core/i18n/langs.ts`). A prefix in the URL switches the app to that language; on public pages
    the address follows the current language; private pages have no prefix. `hreflang` alternates (x-default =
    English), static pages and sitemap (with xhtml:link) in 9 languages. The English home static HTML has no
    alternates (it is the SPA fallback); the app adds them.
18. ~~Translations review~~: "Suggest a translation" in the footer (selected text pre-fills it; matching dictionary
    keys are sent), `/admin` → Translations with ready-to-paste lines. Migration 18 **to apply**. 9 SQL tests.
19. Quick games privacy: nothing to change (already public with the address for accepted players only).
20. Still open: Twitch live status (later), nightly automatic photo cleanup (optional).
    Live database checked 2026-10-28: migrations 01-19 applied, demo accounts removed, 1 admin, `security_check.sql` all OK.
    DB password rotated by the owner (2026-10-28); the old passwords were removed from the local `.env` comments.
21. **Security audit (2026-10-28)**, migration 19 applied on the live database by the owner the same day (+16 SQL tests in `supabase/tests/rls_security_fixes.sql`):
    - a thumbnail (`*.t.webp`) skipped the photo quota by its name alone: it is now accepted only when the full image
      `*.w.webp` is already stored and belongs to the uploader (`thumb_has_main`). The app uploads the full image first.
    - `track_page_view` creates at most 1,000 page / language rows a day (made-up route names could grow the table).
    - `hidden_at` on contest entries, challenge entries and swap posts (trigger); `/admin` → Storage cleanup offers the
      photos of content hidden for 7+ days (reason `hidden_7d`), since those buckets are public and a hidden photo
      stayed reachable by its URL. Restoring after the cleanup leaves the entry without photo (contest / challenge
      entries are deleted, swap posts lose the photo).
    - Live check: `supabase/checks/security_check.sql` (= `resources/supabase/3_security_check.sql`), changes nothing,
      reports OK / BAD / WARN lines in its final error message.
    - Checked and fine: RLS on every table, no TRUNCATE grant, every SECURITY DEFINER function has a search_path,
      admin functions check `is_admin`, private profile columns closed, no service key in the bundle or git history,
      CSP / HSTS live, npm audit clean, no HTML injection sinks, user links through `safeHref`.
    - Not fixed (minor): the anonymous rate limits of bug reports / translation suggestions are shared by all visitors
      (a spammer can use up the 30 / hour). Owner to check in the Supabase dashboard: email confirmation, leaked
      password protection, MFA on the admin account, redirect URL allow-list, CAPTCHA on sign-up.

## Dev environment notes

- WSL + Node 22: npm hangs with ETIMEDOUT because of IPv4/IPv6 auto-selection. Fix:
  `export NODE_OPTIONS=--no-network-family-autoselection`.

## How to run

```
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```
