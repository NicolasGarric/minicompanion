# PAINT v2 — simpler editor (spec)

> Decided with the owner on 2026-10-22. Goal: a first-time hobbyist recolours their miniature in
> a minute, without learning masks or panels.

## Owner decisions

| Topic | Decision |
|---|---|
| Entry point | The image is split automatically into **N reference colours** (default 6, 3–12) |
| Background | Detected automatically (colour that dominates the image borders) and **excluded**; one tap brings it back |
| Effects | **Simple by default**: one colour per zone + photo shading. An **"Effects"** toggle reveals wash, drybrush, highlight, finish |
| Changing a colour | **Closest paints first**, then the full catalogue, then a free colour |
| Flow | **3 steps**: 1. Image → 2. Colours → 3. Paints & share (back and forth allowed) |
| Shopping list | Live in step 3: paints used, "I have it", neutral search link |
| Kept | Brush, eraser, lasso, magic wand, renamable zones, undo/redo, before/after, variants, share card |

## How it works

1. **Segmentation** (`src/paint/engine/segment.ts`): k-means on a downsampled copy in Lab space, with
   lightness down-weighted so the shading of one paint stays in one colour. Every full-resolution
   pixel is assigned to its nearest colour, a 3×3 majority filter removes speckles, and a 1 px blur
   gives soft edges. Masks always sum to 100 %, so colours never overlap.
2. Each colour becomes an **automatic zone** (`source: 'auto'`) named after its colour
   ("Dark blue", "濃い青"), with its original colour kept as `refHex`. It starts with its own colour,
   so the render matches the photo until the user changes something.
3. **Re-analysing** with another count rebuilds the automatic zones; recipes are carried over to the
   new colour closest to each old one. Manual zones are never touched.
4. **Refining**: brush, lasso and wand still edit the active zone. On automatic zones the edit is
   *exclusive*: whatever is added to one colour is removed from the others.
5. Undo stores only the changed rectangle of each affected mask (memory-light on phones).

## Screens

- **Step 1 — Image**: reference image, replace (with rights confirmation), tips for a good photo.
- **Step 2 — Colours**: number of colours, list of colour zones (original → new swatch, name, show/hide);
  tapping one opens: closest paints, full catalogue, free colour, reset, "Effects", refine tools.
  Eyedropper on the image selects the colour under the finger. "+ Manual zone" for lasso/brush areas.
- **Step 3 — Paints & share**: recipe per zone, shopping list, share card, variants, export, presets.

## Layer model (2026-10-22, after owner feedback)

Painting works like a real miniature, bottom to top:

1. **Photo**
2. **Primer** (`primer` on the project, not a zone): the miniature (everything but the excluded
   background) is desaturated, then tinted with the primer colour. A primed miniature has **no
   highlights** (they are painted by hand), so nothing is lighter than the primer colour. Two looks,
   chosen by the owner (2026-10-22): **Photo shadows** (default: the photo's shadows only) and
   **Flat + recesses** (uniform matte coat, only recesses darken). Options: none, black & white, black, grey, white,
   bone, metal (closest paint of the preferred brand), or any paint from the catalogue.
3. **Colour zones** (automatic): a colour that was never repainted is *transparent* — the primer or
   the photo shows through. Painting it makes it a layer.
4. **Drawn areas** (lasso, brush, "tap a part"): layers above the colours, the newest on top,
   reorderable with ↑ / ↓. "Tap a part" creates a new area by default ("add to the open area" is an
   explicit option).

Background detection: everything reachable from the image border without crossing a strong edge
(flood fill on lightness), so backdrops with a gradient or vignette are found; it is carved out of the
colour masks (still a partition). Colours that were mostly backdrop give it their anti-aliased rim
only; their pixels inside the figure (highlights of the same grey) stay figure colours.

Fixed bugs reported by the owner: a primer drawn with the lasso hid every colour painted later
(drawn areas are above colours), and "tap a part" grew the open area instead of creating one.

## Round 3 (2026-10-22, from the owner's tests on a real photo)

- **Priority** toggle per zone: painted over every colour and drawn area it overlaps (render order),
  outside the partition blending.
- **Protected background** (default on): brush, lasso, wand and "tap a part" never paint the excluded
  background. **Enclosed pockets** of backdrop (behind a plume, between arm and body) are detected:
  same colour as the backdrop, perfectly flat, not tiny.
- (Replaced in round 5) **Colourless photos** are split into soft **light levels** (shadows / mid-tones / highlights) from
  lightness percentiles of the figure, with smooth transitions — painting "Highlights" reads as a
  real highlight, not blotches. The colour-count control is hidden in that case.
- **Auto-crop** on import when the miniature leaves wide margins (frame + 6 %).
- **Outline** ("marching ants") of the open zone; skipped for diffuse zones (light levels).
- **Painting steps** slider in step 3: primer → base coats → wash → drybrush → highlights, replayed
  on the image.

## Round 5 (2026-10-23, owner feedback)

- **Base paints instead of a colour count**: the analysis proposes up to **8** paints (k-means from 8,
  then centres that are the same paint are merged: same hue, close relative chroma; tiny colours join
  their neighbour unless clearly different, e.g. a red eye). The user **removes** a paint (its area
  joins the closest one) or **adds** one by tapping the image (pixels close to the tapped colour and
  closer to it than to their current paint move to it).
- **Grey photos** are no longer split into light levels (painting one level left the next one dark,
  e.g. black patches on a thigh). They are clustered on a blurred copy by lightness: recess lines join
  their surface, so the zones are materials (light armour, dark cloak, base).
- **Base coats cover**: the photo's shadows darken a paint by half at most (`MAX_SHADOW`).
- **Paint on the model alone or the original photo** (step 1). A transparent PNG is detected (its alpha
  is the background, the file is stored as PNG) and painted alone by default; the render, exports and
  thumbnails keep the transparency.
- **Brush** is the default tool; with nothing selected, the first stroke picks the colour under it.
- **Gallery**: step 3 "Save to my gallery" (signed-in players) stores the render (1600 px, JPEG or PNG)
  and its paints; the profile page lists them (private bucket, signed URLs, 200 items max).
- Fixed: the hidden checkbox of toggles escaped the side panel and made the whole editor page scroll.

