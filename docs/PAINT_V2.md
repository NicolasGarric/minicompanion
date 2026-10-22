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
