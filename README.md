# MiniCompanion — paint, play and share your miniature hobby

> Independent fan project. Not affiliated with or endorsed by any brand or retailer. Trademarks
> belong to their owners and are used for identification only.
>
> 非公式のファンプロジェクトです。いかなるブランド・販売店とも提携・承認関係はありません。商標は各権利者に帰属し、識別目的でのみ使用しています。

A mobile-first web app that helps tabletop hobbyists plan a painting scheme from a reference image,
try paints directly on a photo of their miniature, share the result, and find a hobby store to get
started. Interface in **English and Japanese**.

## Why it exists (marketing angle)

The app is built around three growth loops:

| Goal | Feature | Metric tracked |
|---|---|---|
| **Recruit new players** | Beginner path: one image → 5-step scheme → paint list | `beginner_started`, `beginner_completed` |
| **Organic social reach** | "My scheme" cards (story 1080×1920, post 1080×1080) with a "Made with MiniCompanion" footer, plus a public link that lets anyone reuse the scheme | `card_generated`, `card_shared`, `shared_link_opened` |
| **Drive store visits** | The beginner path ends on a store finder; every paint has a neutral search link | `store_finder_opened` |

The internal stats page (`/stats`) shows these as campaign-style numbers and conversion rates.

## Features

- **Mandatory reference image**: JPG / PNG / WebP, resized (max 1600 px) and re-encoded as JPEG on
  the device, with a rights confirmation before every upload. The image stays visible next to the
  scheme at every step, can be replaced, never removed.
- **Palette extraction**: 5–8 dominant colours (k-means in Lab), eyedropper for extra colours,
  each colour assignable to a zone, closest paints with a similarity score.
- **Paint simulation**: zones painted with brush / smart brush / magic wand / lasso; base coat,
  wash, drybrush, edge highlight, matte / satin / gloss / metallic, contrast-style paints. Photo
  shading is preserved.
- Schemes library, variants and side-by-side comparison, colour harmonies, undo / redo, autosave.
- **Share card** (download, Web Share API, copy link). **Beginner path**. **Store finder** (sample data).
- **Privacy-friendly analytics**: anonymous daily counters stored locally, no cookies, no IDs.

## Brand safety

- No logos, artwork, product photos or trademarks in the app name, UI, assets or metadata.
- Paints are referenced by **text only** (brand, range, paint name) plus an approximate hex swatch.
- Scheme presets use neutral descriptive names ("Royal blue & gold"), not faction names.
- Paint links open a neutral web search, or the retailer search URL the user sets on the
  Legal / About page. No affiliate links.
- Short disclaimer in every page footer, on share cards and here; full text (EN + JP) on `/legal`.

## Run it

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # type-check + production build (≈110 KB gzipped)
```

> **WSL / Node 22 note:** if `npm install` hangs with `ETIMEDOUT`, run
> `export NODE_OPTIONS=--no-network-family-autoselection` first.

## Architecture

```
src/
  engine/      engine.ts (recolour renderer), maskTools.ts (brush, wand, lasso), demo.ts
  lib/         palette.ts (k-means), share.ts (card + link), beginner.ts, analytics.ts,
               router.ts (path router), color.ts, image.ts, recipe.ts
  i18n/        en.ts (reference), ja.ts (typed against en), index.ts (useT hook)
  data/        paints.ts (text + hex only), presets.ts, stores.ts (StoreProvider + sample data)
  storage/     db.ts (IndexedDB)
  components/  UI building blocks (one per file)
  pages/       Home, Editor, Beginner, Stores, SharedScheme, Legal, Stats
```

- React 18 + TypeScript (strict) + Vite, Zustand for state. **No other runtime dependency**:
  i18n, routing, palette extraction, share cards, analytics and the map embed are hand-written.
- No backend: projects live in IndexedDB. Share links encode the scheme (never the image) in the URL
  hash, compressed with `CompressionStream`. Swapping to hosted links only touches `lib/share.ts`.
- Rendering: each zone's paint colour is multiplied by the photo's relative luminance; washes use
  cavities (blurred luminance − luminance), drybrush uses raised areas + noise, highlights use edges.

## Plugging in real data later

- **Stores**: implement `StoreProvider` in `src/data/stores.ts` and pass it to `<StoreFinder>`.
- **Analytics**: `configureAnalytics({ endpoint })` forwards the same anonymous events to a
  cookie-less counter (e.g. a self-hosted instance) with `sendBeacon`.

## Known limits

- Stats are per browser until an endpoint is configured.
- Store data is fictional sample data.
- Paint hex values are approximations of on-screen colours.
- Japanese hobby terms marked `// CHECK:` in `src/i18n/ja.ts` should be reviewed by a native
  miniature painter.
