/**
 * Region growing on a miniature photo: "tap a part" (from a tapped point) and background detection
 * (from the image border).
 *
 * Parts of a miniature are separated by dark recesses and sharp edges, while one part shades
 * smoothly. So the region spreads to a neighbour only if the lightness step between the two pixels
 * is small and the neighbour is not on a strong edge. Small holes are then closed, the rim covered
 * and the edge softened. Pure function (no DOM, no engine) so it can be unit-tested.
 */

export interface LumaMaps {
  /** Perceptual lightness 0..1 per pixel */
  lum: Float32Array;
  /** Edge strength 0..1 per pixel (Sobel) */
  edge: Float32Array;
  width: number;
  height: number;
}

/** sensitivity 1 (tight) … 10 (loose) */
export function growPart(maps: LumaMaps, seedX: number, seedY: number, sensitivity = 5): Uint8Array {
  const { edge, width: w, height: h } = maps;
  let sx = Math.round(seedX);
  let sy = Math.round(seedY);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return new Uint8Array(w * h);
  // A finger rarely lands in the middle of a part: start from the calmest pixel (lowest edge)
  // within a few pixels, so a tap right on an outline still selects the part.
  const r = 5;
  let best = edge[sy * w + sx];
  for (let y = Math.max(0, sy - r); y <= Math.min(h - 1, sy + r); y++) {
    for (let x = Math.max(0, sx - r); x <= Math.min(w - 1, sx + r); x++) {
      if (edge[y * w + x] < best - 1e-6) {
        best = edge[y * w + x];
        sx = x;
        sy = y;
      }
    }
  }
  return finish(flood(maps, [sy * w + sx], sensitivity), w, h);
}

/**
 * Background: everything reachable from the image border without crossing a strong edge.
 * A backdrop with a gradient or vignette is smooth, so it is crossed; the figure's outline is not.
 */
export function growFromBorder(maps: LumaMaps, sensitivity = 5): Uint8Array {
  const { edge, width: w, height: h } = maps;
  const seeds: number[] = [];
  const calm = 0.12 + sensitivity * 0.04;
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) if (edge[y * w + x] <= calm) seeds.push(y * w + x);
  }
  for (let y = 1; y < h - 1; y++) {
    for (const x of [0, w - 1]) if (edge[y * w + x] <= calm) seeds.push(y * w + x);
  }
  return finish(flood(maps, seeds, sensitivity), w, h);
}

/**
 * Adds pockets of backdrop enclosed by the figure (between an arm and the body, behind a plume…),
 * which the walk from the border cannot reach. A pocket must look exactly like the backdrop: same
 * colour, perfectly flat (no edge) and not tiny, so a white highlight on a sculpted part is kept.
 */
export function addEnclosedBackdrop(
  img: { data: Uint8ClampedArray | Uint8Array },
  maps: LumaMaps,
  bg: Uint8Array,
): Uint8Array {
  const { edge, width: w, height: h } = maps;
  const { data } = img;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < bg.length; i++) {
    if (bg[i] < 230) continue;
    r += data[i * 4];
    g += data[i * 4 + 1];
    b += data[i * 4 + 2];
    n++;
  }
  if (n === 0) return bg;
  r /= n; g /= n; b /= n;

  const candidate = new Uint8Array(w * h);
  for (let i = 0; i < candidate.length; i++) {
    if (bg[i] >= 128 || edge[i] > POCKET_MAX_EDGE) continue;
    const p = i * 4;
    if (Math.hypot(data[p] - r, data[p + 1] - g, data[p + 2] - b) <= POCKET_MAX_COLOUR) candidate[i] = 1;
  }
  const pockets = new Uint8Array(w * h);
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  const minArea = Math.max(40, Math.round(w * h * POCKET_MIN_AREA));
  for (let start = 0; start < candidate.length; start++) {
    if (!candidate[start] || seen[start]) continue;
    // Collect one connected component of backdrop-like pixels
    let head = 0, tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || seen[j] || !candidate[j]) continue;
        seen[j] = 1;
        queue[tail++] = j;
      }
    }
    if (tail < minArea) continue;
    for (let k = 0; k < tail; k++) pockets[queue[k]] = 255;
  }
  const soft = finish(pockets, w, h);
  const out = new Uint8Array(bg);
  for (let i = 0; i < out.length; i++) if (soft[i] > out[i]) out[i] = soft[i];
  return out;
}

const POCKET_MAX_EDGE = 0.08; // perfectly flat
const POCKET_MAX_COLOUR = 16; // RGB distance to the backdrop colour
const POCKET_MIN_AREA = 0.0004; // of the image (~ 380 px on a 1600 × 600 photo)

/** 4-connected walk: a neighbour joins if the lightness step is small and it is not on a strong edge. */
function flood(maps: LumaMaps, seeds: number[], sensitivity: number): Uint8Array {
  const { lum, edge, width: w, height: h } = maps;
  const out = new Uint8Array(w * h);
  const s = Math.max(1, Math.min(10, sensitivity));
  const maxStep = 0.012 + s * 0.006; // allowed lightness change between neighbours
  const maxEdge = 0.12 + s * 0.04; // stop on strong edges
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  for (const seed of seeds) {
    if (out[seed]) continue;
    out[seed] = 255;
    queue[tail++] = seed;
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const li = lum[i];
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (j < 0 || j >= w * h || out[j]) continue;
      if (Math.abs(lum[j] - li) > maxStep || edge[j] > maxEdge) continue;
      out[j] = 255;
      queue[tail++] = j;
    }
  }
  return out;
}

/**
 * Cleans a walked region: closes small holes, covers the outline rim (pixels right on the outline
 * are themselves on the edge, so the walk stops one short of them), then softens the edge.
 */
function finish(m: Uint8Array, w: number, h: number): Uint8Array {
  return soften(morph(close(m, w, h, 2), w, h, 1, true), w, h);
}

/** Lightness + edge maps of an image, computed like the paint engine (luma, 3×3 blur, Sobel). */
export function lumaMaps(img: { data: Uint8ClampedArray | Uint8Array; width: number; height: number }): LumaMaps {
  const { data, width: w, height: h } = img;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < lum.length; i++) lum[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255;
  const blurred = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
          acc += lum[yy * w + xx];
          n++;
        }
      }
      blurred[y * w + x] = acc / n;
    }
  }
  const edge = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = blurred;
      const gx = -l[i - w - 1] - 2 * l[i - 1] - l[i + w - 1] + l[i - w + 1] + 2 * l[i + 1] + l[i + w + 1];
      const gy = -l[i - w - 1] - 2 * l[i - w] - l[i - w + 1] + l[i + w - 1] + 2 * l[i + w] + l[i + w + 1];
      edge[i] = Math.min(1, Math.hypot(gx, gy));
    }
  }
  return { lum, edge, width: w, height: h };
}

/** Grows a mask by `r` pixels (max filter). */
export function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return morph(m, w, h, r, true);
}

/** Morphological closing (dilate then erode): fills specks and thin gaps inside the part. */
export function close(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return morph(morph(m, w, h, r, true), w, h, r, false);
}

function morph(m: Uint8Array, w: number, h: number, r: number, dilate: boolean): Uint8Array {
  const tmp = new Uint8Array(m.length);
  const out = new Uint8Array(m.length);
  const pick = dilate ? Math.max : Math.min;
  const init = dilate ? 0 : 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = init;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) v = pick(v, m[y * w + k]);
      tmp[y * w + x] = v;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = init;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) v = pick(v, tmp[k * w + x]);
      out[y * w + x] = v;
    }
  }
  return out;
}

/** 3×3 average: a 1 px soft edge so the recoloured part blends with its neighbours. */
function soften(m: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          s += m[yy * w + xx];
          n++;
        }
      }
      out[y * w + x] = Math.round(s / n);
    }
  }
  return out;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Frame around the miniature (everything that is not backdrop) plus a margin, or null when cropping
 * would not help (no clear backdrop, or the figure already fills most of the photo).
 */
export function subjectCrop(img: { data: Uint8ClampedArray | Uint8Array; width: number; height: number }): CropRect | null {
  const { width: w, height: h } = img;
  const maps = lumaMaps(img);
  const bg = addEnclosedBackdrop(img, maps, growFromBorder(maps));
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (bg[y * w + x] >= 128) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const margin = Math.round(Math.max(x1 - x0, y1 - y0) * CROP_MARGIN);
  const rect = {
    x: Math.max(0, x0 - margin),
    y: Math.max(0, y0 - margin),
    width: Math.min(w, x1 + margin + 1) - Math.max(0, x0 - margin),
    height: Math.min(h, y1 + margin + 1) - Math.max(0, y0 - margin),
  };
  const kept = (rect.width * rect.height) / (w * h);
  return kept > CROP_MAX_KEPT || kept < CROP_MIN_KEPT ? null : rect;
}

const CROP_MARGIN = 0.06; // around the figure, relative to its larger side
const CROP_MAX_KEPT = 0.8; // not worth cropping if we would keep more than this
const CROP_MIN_KEPT = 0.03; // a "figure" this small is more likely a detection error
