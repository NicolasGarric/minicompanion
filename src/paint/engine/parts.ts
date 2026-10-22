/**
 * "Tap a part": grows a region from a tapped point on a (usually grey-primed) miniature photo.
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
  const { lum, edge, width: w, height: h } = maps;
  const out = new Uint8Array(w * h);
  let sx = Math.round(seedX);
  let sy = Math.round(seedY);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return out;
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

  const s = Math.max(1, Math.min(10, sensitivity));
  const maxStep = 0.012 + s * 0.006; // allowed lightness change between neighbours
  const maxEdge = 0.12 + s * 0.04; // stop on strong edges

  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const seed = sy * w + sx;
  out[seed] = 255;
  queue[tail++] = seed;
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const li = lum[i];
    // 4-neighbourhood
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (j < 0 || j >= w * h || out[j]) continue;
      if (Math.abs(lum[j] - li) > maxStep || edge[j] > maxEdge) continue;
      out[j] = 255;
      queue[tail++] = j;
    }
  }
  // The pixels right on the outline are themselves on the edge, so the walk stops one short of them:
  // grow by 1 px to cover the rim, then soften.
  return soften(morph(close(out, w, h, 2), w, h, 1, true), w, h);
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
