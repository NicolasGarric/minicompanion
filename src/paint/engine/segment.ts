/**
 * Splits an image into N reference colours, each with a soft mask.
 *
 * 1. k-means on a downsampled copy, in Lab space with lightness down-weighted: the shading of one
 *    paint (dark recess → bright edge) should stay in the same colour, hue matters more.
 * 2. Every full-resolution pixel gets the label of its nearest centre.
 * 3. A 3×3 majority filter removes isolated pixels, then a 1 px box blur softens the edges.
 *    Masks are a partition of unity: at every pixel they add up to 255.
 * 4. The background is the colour covering most (>55 %) of the image border.
 *
 * Self-contained (no app imports) so it runs in the browser and in Node unit tests.
 */

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
   * apart, so the split follows lightness only and the UI suggests drawing areas instead.
   */
  greyscale: boolean;
}

const L_WEIGHT = 0.45; // lightness counts less than hue/chroma
const GREYSCALE_CHROMA = 9; // mean Lab chroma under which a photo counts as colourless
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
export function segmentImage(img: ImageLike, count: number): Segmentation {
  const { width: w, height: h, data } = img;
  const k = Math.max(2, Math.min(16, Math.round(count)));

  // 1. Sample and cluster
  const step = Math.max(1, Math.floor(Math.max(w, h) / SAMPLE_SIDE));
  const samples: number[] = [];
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) samples.push((y * w + x) * 4);
  const n = samples.length;
  const sLab = new Float32Array(n * 3);
  samples.forEach((p, i) => lab(data[p], data[p + 1], data[p + 2], sLab, i * 3));
  let chroma = 0;
  for (let i = 0; i < n; i++) chroma += Math.hypot(sLab[i * 3 + 1], sLab[i * 3 + 2]);
  const greyscale = chroma / n < GREYSCALE_CHROMA;
  // Without colour, lightness is all we have: give it full weight.
  const lWeight = greyscale ? 1 : L_WEIGHT;
  if (greyscale) samples.forEach((p, i) => lab(data[p], data[p + 1], data[p + 2], sLab, i * 3, lWeight));

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

  // 2. Label every pixel
  const labels = new Uint8Array(w * h);
  const px = new Float32Array(3);
  for (let i = 0, p = 0; i < labels.length; i++, p += 4) {
    lab(data[p], data[p + 1], data[p + 2], px, 0, lWeight);
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

  // 4. Background = colour covering most of the border (if it clearly dominates)
  const border = new Float64Array(k);
  let borderTotal = 0;
  const band = Math.max(1, Math.round(Math.min(w, h) * 0.03));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= band && x < w - band && y >= band && y < h - band) continue;
      border[clean[y * w + x]]++;
      borderTotal++;
    }
  }
  clusters.sort((a, b) => b.weight - a.weight);
  let background = -1;
  let best = 0;
  clusters.forEach((c, i) => {
    const share = border[c.label] / borderTotal;
    if (share > best) {
      best = share;
      background = i;
    }
  });
  // A real backdrop covers well over half of the border, even when the base touches the bottom edge.
  if (best < 0.55) background = -1;

  clusters = clusters.map(({ hex, weight, mask }) => ({ hex, weight, mask })) as typeof clusters;
  return { clusters, background, greyscale };
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
