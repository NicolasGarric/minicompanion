/**
 * Splits an image into reference colours ("base paints"), each with a soft mask.
 *
 * 1. k-means on a downsampled copy, in Lab space with lightness down-weighted: the shading of one
 *    paint (dark recess → bright edge) should stay in the same colour, hue matters more.
 *    In 'auto' mode it starts from AUTO_MAX colours and merges the ones too close to be different
 *    paints, or too small to matter. Colourless photos are clustered on a blurred copy, by
 *    lightness: recess lines join their surface, so the parts found are materials (light armour,
 *    dark cloak), not light levels.
 * 2. Every full-resolution pixel gets the label of its nearest centre.
 * 3. A 3×3 majority filter removes isolated pixels, then a 1 px box blur softens the edges.
 *    Masks are a partition of unity: at every pixel they add up to 255.
 * 4. The background is what the image border reaches without crossing a strong edge.
 *
 * No app imports (only the pure region-growing helpers) so it runs in the browser and in Node tests.
 */

// Explicit .ts extension: Node resolves it when the unit tests import this file directly.
import { addEnclosedBackdrop, dilate, growFromBorder, lumaMaps } from './parts.ts';

export interface ImageLike {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export interface ColourCluster {
  hex: string;
  /** Share of the image, 0..1 */
  weight: number;
  mask: Uint8Array;
}

export interface Segmentation {
  clusters: ColourCluster[];
  /** Index of the background colour in `clusters`, or -1 when none dominates the border. */
  background: number;
  /**
   * The photo is (almost) colourless, e.g. a grey-primed miniature: colours cannot tell the parts
   * apart, so the split follows (blurred) lightness and the UI suggests drawing areas as well.
   */
  greyscale: boolean;
}

const L_WEIGHT = 0.45; // lightness counts less than hue/chroma
const GREYSCALE_CHROMA = 9; // mean Lab chroma under which a photo counts as colourless
const BG_MIN_WEIGHT = 0.05; // a backdrop smaller than this is not one
const BG_MAX_WEIGHT = 0.85; // larger than this: the subject fills the frame, there is no backdrop
export const AUTO_MAX = 8; // most base paints the automatic analysis proposes
const MERGE_DIST = 12; // centres closer than this (weighted Lab) are one paint
const MERGE_DIST_GREY = 16; // same, on lightness only (colourless photos)
const MIN_AUTO_SHARE = 0.012;
const ADD_MAX_DIST = 18; // an added colour only takes pixels this close to the tapped colour // a colour covering less of the samples joins its nearest one
const MIN_COLOUR_WEIGHT = 0.004; // colours left with less than this after removing the backdrop join it
const BACKDROP_LOSS = 0.25; // a colour keeping under 25 % of itself outside the backdrop was the backdrop colour
const SAMPLE_SIDE = 160;
const ITERATIONS = 14;

// --- colour maths (sRGB -> Lab) --------------------------------------------------------------
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

function lab(r: number, g: number, b: number, out: Float32Array, o: number, lWeight = L_WEIGHT) {
  const lr = LIN[r], lg = LIN[g], lb = LIN[b];
  const x = f((lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047);
  const y = f(lr * 0.2126 + lg * 0.7152 + lb * 0.0722);
  const z = f((lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883);
  out[o] = (116 * y - 16) * lWeight;
  out[o + 1] = 500 * (x - y);
  out[o + 2] = 200 * (y - z);
}

const hex2 = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');

// --- segmentation --------------------------------------------------------------------------
/** `backdrop`: a known background (e.g. the alpha of a cut-out PNG), used instead of detecting one. */
export function segmentImage(img: ImageLike, count: number | 'auto' = 'auto', backdrop?: Uint8Array): Segmentation {
  const { width: w, height: h, data } = img;
  const auto = count === 'auto';
  let k = auto ? AUTO_MAX : Math.max(2, Math.min(16, Math.round(count)));

  // 1. Sample and cluster
  const step = Math.max(1, Math.floor(Math.max(w, h) / SAMPLE_SIDE));
  const samples: number[] = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) if (!backdrop || backdrop[y * w + x] < 128) samples.push((y * w + x) * 4);
  }
  const n = samples.length;
  const sLab = new Float32Array(n * 3);
  samples.forEach((p, i) => lab(data[p], data[p + 1], data[p + 2], sLab, i * 3));
  let chroma = 0;
  for (let i = 0; i < n; i++) chroma += Math.hypot(sLab[i * 3 + 1], sLab[i * 3 + 2]);
  const greyscale = chroma / n < GREYSCALE_CHROMA;
  // Without colour, lightness is all there is: cluster a blurred copy at full lightness weight.
  const lWeight = greyscale ? 1 : L_WEIGHT;
  const src = greyscale ? blurredImage(img) : data;
  if (greyscale) samples.forEach((p, i) => lab(src[p], src[p + 1], src[p + 2], sLab, i * 3, lWeight));

  let centres = kMeans(sLab, n, k);
  if (auto) {
    centres = greyscale ? mergeCentres(sLab, n, centres, MERGE_DIST_GREY, plainDist) : mergeCentres(sLab, n, centres, MERGE_DIST, paintDist);
    k = centres.length / 3;
  }

  // 2. Label every pixel
  const labels = new Uint8Array(w * h);
  const px = new Float32Array(3);
  for (let i = 0, p = 0; i < labels.length; i++, p += 4) {
    lab(src[p], src[p + 1], src[p + 2], px, 0, lWeight);
    labels[i] = nearest(px, 0, centres, k);
  }

  // 3. Clean up speckles, then build soft masks
  const clean = majorityFilter(labels, w, h, k);
  const rgb = new Float64Array(k * 4);
  for (let i = 0, p = 0; i < clean.length; i++, p += 4) {
    const c = clean[i] * 4;
    rgb[c] += data[p];
    rgb[c + 1] += data[p + 1];
    rgb[c + 2] += data[p + 2];
    rgb[c + 3]++;
  }

  let clusters = Array.from({ length: k }, (_, c) => {
    const nPix = rgb[c * 4 + 3];
    const hard = new Uint8Array(w * h);
    for (let i = 0; i < hard.length; i++) if (clean[i] === c) hard[i] = 255;
    return {
      hex: nPix ? `#${hex2(rgb[c * 4] / nPix)}${hex2(rgb[c * 4 + 1] / nPix)}${hex2(rgb[c * 4 + 2] / nPix)}` : '#000000',
      weight: nPix / (w * h),
      mask: softenMask(hard, w, h),
      label: c,
    };
  }).filter((c) => c.weight > 0);

  // 4. Background = what can be reached from the image border without crossing a strong edge
  //    (a backdrop with a gradient or vignette is smooth; the figure's outline is not). It is carved
  //    out of the colour masks, so the masks still add up to 255 everywhere.
  clusters.sort((a, b) => b.weight - a.weight);
  let background = -1;
  const maps = backdrop ? null : lumaMaps(img);
  const bgMask = backdrop ? new Uint8Array(backdrop) : addEnclosedBackdrop(img, maps!, growFromBorder(maps!));
  let bgSum = 0;
  for (let i = 0; i < bgMask.length; i++) bgSum += bgMask[i];
  const bgShare = bgSum / (255 * w * h);
  if (backdrop ? bgShare > 0 : bgShare >= BG_MIN_WEIGHT && bgShare <= BG_MAX_WEIGHT) {
    // Pixels hugging the backdrop (2 px), used to absorb the anti-aliased rim of backdrop colours.
    const rim = dilate(bgMask, w, h, 2);
    const weightOf = (m: Uint8Array) => m.reduce((acc, v) => acc + v, 0) / (255 * w * h);
    // Pass 1: carve the backdrop out of every colour, all against the same backdrop mask.
    const lostMost = new Set<(typeof clusters)[number]>();
    for (const c of clusters) {
      const before = c.weight;
      for (let i = 0; i < c.mask.length; i++) c.mask[i] = Math.round((c.mask[i] * (255 - bgMask[i])) / 255);
      c.weight = weightOf(c.mask);
      if (c.weight < before * BACKDROP_LOSS) lostMost.add(c);
    }
    // Pass 2: a colour that lost most of itself to the backdrop was the backdrop colour: its pixels
    // right next to the backdrop are its anti-aliased rim and join it. Its pixels inside the figure
    // (e.g. highlights of the same grey) stay a colour of the figure.
    for (const c of lostMost) {
      for (let i = 0; i < c.mask.length; i++) {
        if (!c.mask[i] || rim[i] < 128) continue;
        bgMask[i] = Math.min(255, bgMask[i] + c.mask[i]);
        c.mask[i] = 0;
      }
      c.weight = weightOf(c.mask);
    }
    // Tiny leftovers are noise: they join the background too.
    for (const c of clusters.filter((x) => x.weight < MIN_COLOUR_WEIGHT)) {
      for (let i = 0; i < bgMask.length; i++) bgMask[i] = Math.min(255, bgMask[i] + c.mask[i]);
    }
    clusters = clusters.filter((x) => x.weight >= MIN_COLOUR_WEIGHT);
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0, p = 0; i < bgMask.length; i++, p += 4) {
      const v = bgMask[i];
      if (!v) continue;
      r += data[p] * v;
      g += data[p + 1] * v;
      b += data[p + 2] * v;
      n += v;
    }
    clusters.push({ hex: `#${hex2(r / n)}${hex2(g / n)}${hex2(b / n)}`, weight: n / (255 * w * h), mask: bgMask, label: -1 });
    clusters.sort((a, b) => b.weight - a.weight);
    background = clusters.findIndex((c) => c.label === -1);
  }

  clusters = clusters.map(({ hex, weight, mask }) => ({ hex, weight, mask })) as typeof clusters;
  return { clusters, background, greyscale };
}

function kMeans(sLab: Float32Array, n: number, k: number): Float32Array {
  const centres = seedCentres(sLab, n, k);
  const assign = new Int32Array(n);
  for (let it = 0; it < ITERATIONS; it++) {
    for (let i = 0; i < n; i++) assign[i] = nearest(sLab, i * 3, centres, k);
    const sum = new Float64Array(k * 4);
    for (let i = 0; i < n; i++) {
      const c = assign[i] * 4;
      sum[c] += sLab[i * 3];
      sum[c + 1] += sLab[i * 3 + 1];
      sum[c + 2] += sLab[i * 3 + 2];
      sum[c + 3]++;
    }
    for (let c = 0; c < k; c++) {
      if (!sum[c * 4 + 3]) continue;
      centres[c * 3] = sum[c * 4] / sum[c * 4 + 3];
      centres[c * 3 + 1] = sum[c * 4 + 1] / sum[c * 4 + 3];
      centres[c * 3 + 2] = sum[c * 4 + 2] / sum[c * 4 + 3];
    }
  }
  return centres;
}

type Dist = (a: number[], b: number[]) => number;
const plainDist: Dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * How different two colour centres are as *paints*: the shading of one paint changes its lightness
 * and chroma together but keeps its hue. So the distance weighs hue (as an arc at the smaller
 * chroma) and relative chroma, and lightness only a little.
 */
const paintDist: Dist = (a, b) => {
  const ca = Math.hypot(a[1], a[2]), cb = Math.hypot(b[1], b[2]);
  let dh = Math.abs(Math.atan2(a[2], a[1]) - Math.atan2(b[2], b[1]));
  if (dh > Math.PI) dh = 2 * Math.PI - dh;
  const hueArc = Math.min(ca, cb) * dh;
  // Chroma difference relative to the stronger one: a dark and a light blue of one paint differ by
  // a fraction of their chroma; bone and grey differ by all of it.
  const relChroma = (Math.abs(ca - cb) / Math.max(ca, cb, 20)) * 25;
  return Math.hypot((a[0] - b[0]) * 0.5, relChroma, hueArc);
};

/**
 * Automatic count: repeatedly merges the closest pair of centres while they are nearer than
 * `minDist`. A colour covering too few samples joins its nearest one too, unless it is clearly a
 * different paint (a red eye on blue armour). Merged centres are the sample-weighted mean.
 */
function mergeCentres(sLab: Float32Array, n: number, input: Float32Array, minDist: number, dist: Dist): Float32Array {
  let cs = Array.from({ length: input.length / 3 }, (_, c) => ({ v: [input[c * 3], input[c * 3 + 1], input[c * 3 + 2]], n: 0 }));
  const flat = () => Float32Array.from(cs.flatMap((c) => c.v));
  const count = () => {
    const f = flat();
    cs.forEach((c) => (c.n = 0));
    for (let i = 0; i < n; i++) cs[nearest(sLab, i * 3, f, cs.length)].n++;
  };
  count();
  cs = cs.filter((c) => c.n > 0);
  const nearestTo = (k: number) => cs.reduce((m, c, i) => (i !== k && (m < 0 || dist(c.v, cs[k].v) < dist(cs[m].v, cs[k].v)) ? i : m), -1);
  while (cs.length > 1) {
    let bi = 0, bj = 1, bd = Infinity;
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        const d = dist(cs[i].v, cs[j].v);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    }
    if (bd >= minDist) {
      // Tiny colours that are not clearly distinct (anti-aliasing blends, noise) join their nearest.
      const small = cs.findIndex((c, i) => c.n < n * MIN_AUTO_SHARE && dist(c.v, cs[nearestTo(i)].v) < minDist * 1.5);
      if (small < 0) break;
      bi = nearestTo(small);
      bj = small;
    }
    const a = cs[bi], b = cs[bj];
    const t = a.n + b.n || 1;
    a.v = a.v.map((x, d) => (x * a.n + b.v[d] * b.n) / t);
    a.n += b.n;
    cs.splice(bj, 1);
  }
  return flat();
}

/** Copy of the image with a soft blur (≈0.5 % of its size): recess lines fade into their surface. */
function blurredImage(img: ImageLike): Uint8ClampedArray {
  const { data, width: w, height: h } = img;
  const r = Math.max(1, Math.round(Math.max(w, h) / 220));
  let a = new Uint8ClampedArray(data);
  let b = new Uint8ClampedArray(data.length);
  for (let pass = 0; pass < 2; pass++) {
    // horizontal then vertical box blur, RGB only
    for (const [len, lines, stride, lineStride] of [[w, h, 4, w * 4], [h, w, w * 4, 4]] as const) {
      for (let line = 0; line < lines; line++) {
        const base = line * lineStride;
        for (let ch = 0; ch < 3; ch++) {
          let acc = 0;
          for (let x = -r; x <= r; x++) acc += a[base + Math.min(len - 1, Math.max(0, x)) * stride + ch];
          for (let x = 0; x < len; x++) {
            b[base + x * stride + ch] = acc / (2 * r + 1);
            acc += a[base + Math.min(len - 1, x + r + 1) * stride + ch] - a[base + Math.max(0, x - r) * stride + ch];
          }
        }
      }
      [a, b] = [b, a];
    }
  }
  return a;
}

/**
 * Adds a base paint where the user tapped: every figure pixel close to `seed`, and closer to it
 * than to the reference colour of the zone it belongs to, moves to the new colour. `masks` (the automatic
 * zones, background included at `background`) are updated in place and stay a partition.
 * Returns the new mask and its mean colour, or null when it would cover almost nothing.
 */
export function addColour(
  img: ImageLike,
  masks: Uint8Array[],
  refHexes: string[],
  background: number,
  seedHex: string,
  greyscale: boolean,
): { mask: Uint8Array; hex: string } | null {
  const { width: w, height: h, data } = img;
  const lWeight = greyscale ? 1 : L_WEIGHT;
  const src = greyscale ? blurredImage(img) : data;
  const toLab = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const v = new Float32Array(3);
    lab(r, g, b, v, 0, lWeight);
    return v;
  };
  const seed = toLab(seedHex);
  const refs = refHexes.map(toLab);
  const hard = new Uint8Array(w * h);
  const px = new Float32Array(3);
  let hits = 0;
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    let owner = 0;
    for (let z = 1; z < masks.length; z++) if (masks[z][i] > masks[owner][i]) owner = z;
    if (owner === background || masks[owner][i] === 0) continue;
    lab(src[p], src[p + 1], src[p + 2], px, 0, lWeight);
    const ds = d2(px, 0, seed, 0);
    if (ds < ADD_MAX_DIST * ADD_MAX_DIST && ds < d2(px, 0, refs[owner], 0)) {
      hard[i] = 1;
      hits++;
    }
  }
  if (hits < w * h * 0.001) return null;
  const clean = majorityFilter(hard, w, h, 2);
  for (let i = 0; i < clean.length; i++) clean[i] = clean[i] ? 255 : 0;
  const soft = softenMask(clean, w, h);
  const bg = background >= 0 ? masks[background] : null;
  let r = 0, g = 0, b = 0, sum = 0;
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    const room = 255 - (bg ? bg[i] : 0);
    const m = Math.min(soft[i], room);
    soft[i] = m;
    if (!m) continue;
    // The other colours share what is left, in their previous proportions.
    let others = 0;
    for (let z = 0; z < masks.length; z++) if (z !== background) others += masks[z][i];
    const factor = others > 0 ? (room - m) / others : 0;
    for (let z = 0; z < masks.length; z++) if (z !== background) masks[z][i] = Math.round(masks[z][i] * factor);
    r += data[p] * m;
    g += data[p + 1] * m;
    b += data[p + 2] * m;
    sum += m;
  }
  if (!sum) return null;
  return { mask: soft, hex: `#${hex2(r / sum)}${hex2(g / sum)}${hex2(b / sum)}` };
}

function seedCentres(sLab: Float32Array, n: number, k: number): Float32Array {
  // k-means++ style, deterministic: start from the median sample, then the farthest points.
  const centres = new Float32Array(k * 3);
  const first = Math.floor(n / 2) * 3;
  centres.set(sLab.subarray(first, first + 3), 0);
  const dist = new Float32Array(n).fill(Infinity);
  for (let c = 1; c < k; c++) {
    let far = 0;
    let farD = -1;
    for (let i = 0; i < n; i++) {
      const d = d2(sLab, i * 3, centres, (c - 1) * 3);
      if (d < dist[i]) dist[i] = d;
      if (dist[i] > farD) {
        farD = dist[i];
        far = i;
      }
    }
    centres.set(sLab.subarray(far * 3, far * 3 + 3), c * 3);
  }
  return centres;
}

function d2(a: Float32Array, ai: number, b: Float32Array, bi: number) {
  const x = a[ai] - b[bi], y = a[ai + 1] - b[bi + 1], z = a[ai + 2] - b[bi + 2];
  return x * x + y * y + z * z;
}

function nearest(v: Float32Array, vi: number, centres: Float32Array, k: number) {
  let best = 0;
  let bestD = Infinity;
  for (let c = 0; c < k; c++) {
    const d = d2(v, vi, centres, c * 3);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Each pixel takes the most frequent label of its 3×3 neighbourhood (keeps its own on ties). */
function majorityFilter(labels: Uint8Array, w: number, h: number, k: number): Uint8Array {
  const out = new Uint8Array(labels);
  const counts = new Uint8Array(k);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      counts.fill(0);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) counts[labels[(y + dy) * w + x + dx]]++;
      const own = labels[y * w + x];
      let best = own;
      for (let c = 0; c < k; c++) if (counts[c] > counts[best]) best = c;
      out[y * w + x] = best;
    }
  }
  return out;
}

/** 3×3 box blur: keeps the partition of unity (masks still add up to 255). */
function softenMask(m: Uint8Array, w: number, h: number): Uint8Array {
  const tmp = new Uint16Array(m.length);
  const out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      tmp[i] = m[i] + m[y * w + Math.max(0, x - 1)] + m[y * w + Math.min(w - 1, x + 1)];
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const s = tmp[i] + tmp[Math.max(0, y - 1) * w + x] + tmp[Math.min(h - 1, y + 1) * w + x];
      out[i] = Math.round(s / 9);
    }
  }
  return out;
}

/**
 * Splits one colour zone into two sub-colours (2-means on the pixels of its mask).
 * The two new masks add up exactly to the original one, so the partition of zones is kept.
 * Returns null when the zone is too uniform to split (one side under 2 %).
 */
export function splitMask(img: ImageLike, mask: Uint8Array): { masks: [Uint8Array, Uint8Array]; hexes: [string, string] } | null {
  const { data, width: w, height: h } = img;
  const inside: number[] = [];
  for (let i = 0; i < w * h; i++) if (mask[i] > 127) inside.push(i);
  if (inside.length < 50) return null;

  // Sample at most ~20k pixels for the clustering
  const step = Math.max(1, Math.floor(inside.length / 20000));
  const n = Math.ceil(inside.length / step);
  const sLab = new Float32Array(n * 3);
  for (let s = 0; s < n; s++) {
    const p = inside[s * step] * 4;
    lab(data[p], data[p + 1], data[p + 2], sLab, s * 3, 1);
  }
  let chroma = 0;
  for (let s = 0; s < n; s++) chroma += Math.hypot(sLab[s * 3 + 1], sLab[s * 3 + 2]);
  const lWeight = chroma / n < GREYSCALE_CHROMA ? 1 : L_WEIGHT;
  if (lWeight !== 1) {
    for (let s = 0; s < n; s++) {
      const p = inside[s * step] * 4;
      lab(data[p], data[p + 1], data[p + 2], sLab, s * 3, lWeight);
    }
  }

  // Seeds: the sample farthest from the first one, then the one farthest from that.
  const centres = new Float32Array(6);
  let a = 0;
  for (let s = 1; s < n; s++) if (d2(sLab, s * 3, sLab, 0) > d2(sLab, a * 3, sLab, 0)) a = s;
  let b = 0;
  for (let s = 1; s < n; s++) if (d2(sLab, s * 3, sLab, a * 3) > d2(sLab, b * 3, sLab, a * 3)) b = s;
  centres.set(sLab.subarray(a * 3, a * 3 + 3), 0);
  centres.set(sLab.subarray(b * 3, b * 3 + 3), 3);
  for (let it = 0; it < ITERATIONS; it++) {
    const sum = new Float64Array(8);
    for (let s = 0; s < n; s++) {
      const c = nearest(sLab, s * 3, centres, 2) * 4;
      sum[c] += sLab[s * 3];
      sum[c + 1] += sLab[s * 3 + 1];
      sum[c + 2] += sLab[s * 3 + 2];
      sum[c + 3]++;
    }
    for (let c = 0; c < 2; c++) {
      if (!sum[c * 4 + 3]) continue;
      for (let j = 0; j < 3; j++) centres[c * 3 + j] = sum[c * 4 + j] / sum[c * 4 + 3];
    }
  }

  const m1 = new Uint8Array(w * h);
  const m2 = new Uint8Array(w * h);
  const rgb = new Float64Array(8);
  const px = new Float32Array(3);
  for (let i = 0; i < w * h; i++) {
    const v = mask[i];
    if (!v) continue;
    const p = i * 4;
    lab(data[p], data[p + 1], data[p + 2], px, 0, lWeight);
    const c = nearest(px, 0, centres, 2);
    (c === 0 ? m1 : m2)[i] = v;
    rgb[c * 4] += data[p] * v;
    rgb[c * 4 + 1] += data[p + 1] * v;
    rgb[c * 4 + 2] += data[p + 2] * v;
    rgb[c * 4 + 3] += v;
  }
  const total = rgb[3] + rgb[7];
  if (rgb[3] / total < 0.02 || rgb[7] / total < 0.02) return null;
  const hex = (c: number) => `#${hex2(rgb[c * 4] / rgb[c * 4 + 3])}${hex2(rgb[c * 4 + 1] / rgb[c * 4 + 3])}${hex2(rgb[c * 4 + 2] / rgb[c * 4 + 3])}`;
  return { masks: [m1, m2], hexes: [hex(0), hex(1)] };
}
