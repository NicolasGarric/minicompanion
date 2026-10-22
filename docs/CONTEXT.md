# Project context — MiniCompanion

> Working memory for this project. Read this first when resuming work.
> Last update: 2026-10-21 (brief items 1–6 implemented)

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
- Hash router (`#/…`) written in-house, i18n written in-house.
- CSS: one stylesheet, `rem` units, mobile-first, desktop layout from `64rem`.
- Visual polish is deferred: keep styles simple, the owner will do a visual pass later.

## Architecture

```
src/
  engine/       engine.ts (recolour renderer), maskTools.ts (brush, wand, lasso), demo.ts
  lib/          color.ts, image.ts (resize, export), palette.ts (k-means extraction),
                share.ts (card + link), recipe.ts, beginner.ts, analytics.ts, router.ts
  i18n/         en.ts, ja.ts, index.ts (useT hook)
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

- **UI languages are EN + JP only** (the earlier French UI was converted). Adding FR later is a
  new file in `src/i18n/`.
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
- [ ] Step 3 — tournament list, filters, map (Leaflet), tournament page
- [ ] Steps 4–9 — see `docs/PLAY_PLAN.md`

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
- Insight: automatic colours shine on **painted** minis / box art / illustrations. On a grey-primed
  mini they only follow light and shadow → the app says so and suggests drawing areas.

### Conventions for PLAY

- Write operations with business rules go through `SECURITY DEFINER` SQL functions; tables only get
  the policies needed for reads and simple owner edits. Execute is revoked from `public, anon`
  (Supabase also grants `anon` explicitly by default).
- Every new SQL rule gets a test in `supabase/tests/*.sql` (run with the local harness).
- Seeded data is fictional; demo accounts use `demo-password-2026` (demo project only).

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

## Open points / next steps

- Japanese terms to validate with a native hobbyist: see `// CHECK:` in `src/i18n/ja.ts`
  (エリア for "zone", ウォッシュ, コントラスト系塗料, 配色 for "scheme", サーフェイサー vs プライマー, grim).
- Visual pass (owner): spacing, typography scale, editor layout on tablets.
- Zone names are created in the UI language at creation time and are not re-translated.
- Hosted share links + real analytics endpoint need a small backend (decision for later).
- Push to GitHub needs the owner to re-authenticate (`gh auth login`), remote is already set.

## Dev environment notes

- WSL + Node 22: npm hangs with ETIMEDOUT because of IPv4/IPv6 auto-selection. Fix:
  `export NODE_OPTIONS=--no-network-family-autoselection`.

## How to run

```
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```
