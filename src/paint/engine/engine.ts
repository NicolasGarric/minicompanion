import type { Primer, Zone } from '../types';
import { hexToLinear, LINEAR_TO_SRGB_LUT, SRGB_TO_LINEAR } from '../../core/lib/color';

export interface Rect {
  x0: number;
  y0: number;
  x1: number; // exclusif
  y1: number; // exclusif
}

interface ZoneCache {
  bbox: Rect | null;
  mean: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Paint engine: keeps the source image, derived maps (luminance, blurred luminance to detect
 * recesses and raised areas, edges) and one 8-bit mask per zone.
 * Rendering recolours each zone by multiplying the paint colour by the photo's relative shading,
 * which preserves the volumes of the miniature.
 */
export class PaintEngine {
  width = 0;
  height = 0;
  src = new Uint8ClampedArray(0);
  lumLin = new Float32Array(0);
  lumG = new Float32Array(0);
  blur = new Float32Array(0);
  edge = new Float32Array(0);
  noise = new Float32Array(0);
  masks = new Map<string, Uint8Array>();
  private cache = new Map<string, ZoneCache>();
  out: ImageData | null = null;

  load(image: ImageData) {
    const { width: w, height: h, data } = image;
    this.width = w;
    this.height = h;
    this.src = new Uint8ClampedArray(data);
    this.out = new ImageData(new Uint8ClampedArray(data), w, h);
    const n = w * h;
    this.lumLin = new Float32Array(n);
    this.lumG = new Float32Array(n);
    this.noise = new Float32Array(n);
    let seed = 1337;
    for (let i = 0; i < n; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      this.lumLin[i] = SRGB_TO_LINEAR[r] * 0.2126 + SRGB_TO_LINEAR[g] * 0.7152 + SRGB_TO_LINEAR[b] * 0.0722;
      this.lumG[i] = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      this.noise[i] = seed / 4294967296;
    }
    const radius = Math.max(3, Math.round(Math.max(w, h) * 0.012));
    this.blur = boxBlurFloat(this.lumG, w, h, radius, 3);
    this.edge = sobel(boxBlurFloat(this.lumG, w, h, 1, 1), w, h);
    this.masks.clear();
    this.cache.clear();
  }

  get loaded() {
    return this.width > 0;
  }

  ensureMask(id: string): Uint8Array {
    let m = this.masks.get(id);
    if (!m) {
      m = new Uint8Array(this.width * this.height);
      this.masks.set(id, m);
    }
    return m;
  }

  setMask(id: string, data: Uint8Array) {
    this.masks.set(id, data);
    this.invalidate(id);
  }

  invalidate(id?: string) {
    if (id) this.cache.delete(id);
    else this.cache.clear();
    this.figureMeanCache = null;
  }

  /** Mean linear luminance of the miniature (everything but the excluded background). */
  private figureMeanCache: { bg: Uint8Array | null; value: number } | null = null;
  private figureMean(bg: Uint8Array | null): number {
    if (this.figureMeanCache && this.figureMeanCache.bg === bg) return this.figureMeanCache.value;
    let sum = 0;
    let weight = 0;
    for (let i = 0; i < this.lumLin.length; i++) {
      const a = bg ? 255 - bg[i] : 255;
      sum += this.lumLin[i] * a;
      weight += a;
    }
    const value = weight ? Math.max(0.01, sum / weight) : 0.2;
    this.figureMeanCache = { bg, value };
    return value;
  }

  private zoneCache(id: string): ZoneCache {
    let c = this.cache.get(id);
    if (c) return c;
    const m = this.masks.get(id);
    const w = this.width;
    let x0 = w, y0 = this.height, x1 = -1, y1 = -1;
    let sum = 0, wsum = 0;
    if (m) {
      for (let y = 0; y < this.height; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
          const a = m[row + x];
          if (a === 0) continue;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
          sum += this.lumLin[row + x] * a;
          wsum += a;
        }
      }
    }
    c = {
      bbox: x1 >= 0 ? { x0, y0, x1: x1 + 1, y1: y1 + 1 } : null,
      mean: wsum > 0 ? Math.max(0.01, sum / wsum) : 0.2,
    };
    this.cache.set(id, c);
    return c;
  }

  /** Grows the cached bbox during a brush stroke without recomputing the mean. */
  growBBox(id: string, r: Rect) {
    const c = this.cache.get(id);
    if (!c) return;
    if (!c.bbox) c.bbox = { ...r };
    else {
      c.bbox.x0 = Math.min(c.bbox.x0, r.x0);
      c.bbox.y0 = Math.min(c.bbox.y0, r.y0);
      c.bbox.x1 = Math.max(c.bbox.x1, r.x1);
      c.bbox.y1 = Math.max(c.bbox.y1, r.y1);
    }
  }

  maskCoverage(id: string): number {
    return this.zoneCache(id).bbox ? 1 : 0;
  }

  /**
   * Renders into `target` (default: the main buffer), limited to `rect` when given.
   * Layers, bottom to top: photo → primer (on the miniature) → painted colour zones → drawn areas.
   * Colour zones that were never repainted are transparent.
   */
  render(zones: Zone[], rect?: Rect, target?: ImageData, primer: Primer | null = null): ImageData {
    const w = this.width;
    const h = this.height;
    const out = target ?? this.out!;
    const o = out.data;
    const s = this.src;
    const r: Rect = rect
      ? { x0: Math.max(0, rect.x0 | 0), y0: Math.max(0, rect.y0 | 0), x1: Math.min(w, Math.ceil(rect.x1)), y1: Math.min(h, Math.ceil(rect.y1)) }
      : { x0: 0, y0: 0, x1: w, y1: h };
    if (r.x1 <= r.x0 || r.y1 <= r.y0) return out;

    // Reset the area to the source image
    for (let y = r.y0; y < r.y1; y++) {
      const a = (y * w + r.x0) * 4;
      const b = (y * w + r.x1) * 4;
      o.set(s.subarray(a, b), a);
    }

    // Priority zones are painted last, over everything they overlap.
    const ordered = [...zones.filter((z) => !z.priority), ...zones.filter((z) => z.priority)];
    const prepared = ordered
      .filter((z) => z.visible && z.opacity > 0 && this.masks.has(z.id) && !isUnpaintedColour(z))
      .map((z) => prepareZone(z, this.zoneCache(z.id), this.masks.get(z.id)!))
      .filter((p) => p.bbox && intersects(p.bbox, r));
    if (prepared.length === 0 && !primer) return out;

    // The primer covers the miniature, not the excluded background.
    const bgZone = zones.find((z) => z.isBackground);
    const bgMask = primer && bgZone && !bgZone.visible ? this.masks.get(bgZone.id) ?? null : null;
    const primerLin = primer?.kind === 'paint' ? hexToLinear(primer.hex) : null;
    const primerMean = primer ? this.figureMean(bgMask) : 1;
    const flatPrimer = primer?.kind === 'paint' && primer.look === 'flat';

    const { lumLin, lumG, blur, edge, noise } = this;
    const exclusive = prepared.filter((z) => z.exclusive);
    const LUT = LINEAR_TO_SRGB_LUT;
    const L = SRGB_TO_LINEAR;

    for (let y = r.y0; y < r.y1; y++) {
      for (let x = r.x0; x < r.x1; x++) {
        const i = y * w + x;
        let touched = false;
        let cr = 0, cg = 0, cb = 0;
        if (primer) {
          const a = bgMask ? 1 - bgMask[i] / 255 : 1;
          if (a > 0) {
            const p = i * 4;
            cr = L[o[p]];
            cg = L[o[p + 1]];
            cb = L[o[p + 2]];
            touched = true;
            let pr: number, pg: number, pb: number;
            if (primerLin) {
              // Desaturate and tint with the primer. A primed miniature has no highlights until they
              // are painted by hand, so nothing is lighter than the primer colour itself:
              // 'shadows' keeps the photo's shadows, 'flat' is a uniform coat where only recesses
              // (darker than their surroundings) darken.
              const sh = flatPrimer
                ? 1 - 0.75 * Math.min(1, Math.max(0, (blur[i] - lumG[i]) * 6))
                : Math.min(1, lumLin[i] / primerMean);
              pr = primerLin[0] * sh;
              pg = primerLin[1] * sh;
              pb = primerLin[2] * sh;
            } else {
              pr = pg = pb = lumLin[i]; // black & white
            }
            cr += (pr - cr) * a;
            cg += (pg - cg) * a;
            cb += (pb - cb) * a;
          }
        }
        // Automatic colour zones split each pixel between them (their masks add up to 255).
        // Blending them in sequence with plain alpha would let the photo show through at shared
        // edges; instead each one weighs exactly its share: alpha = m / (photo share + masks so far).
        let shared = 255;
        for (let k = 0; k < exclusive.length; k++) shared -= exclusive[k].mask[i];
        if (shared < 0) shared = 0;
        for (let k = 0; k < prepared.length; k++) {
          const z = prepared[k];
          const bb = z.bbox!;
          if (x < bb.x0 || x >= bb.x1 || y < bb.y0 || y >= bb.y1) continue;
          const m = z.mask[i];
          if (m === 0) continue;
          if (!touched) {
            const p = i * 4;
            cr = L[o[p]];
            cg = L[o[p + 1]];
            cb = L[o[p + 2]];
            touched = true;
          }
          let alpha: number;
          if (z.exclusive) {
            shared += m;
            alpha = (m / shared) * z.opacity;
          } else {
            alpha = (m / 255) * z.opacity;
          }
          const lg = lumG[i];
          const bl = blur[i];
          const cav = clamp01((bl - lg) * 7);
          const ridge = clamp01((lg - bl) * 7);

          // Relative shading from the photo
          let sh = 1 + (lumLin[i] / z.mean - 1) * z.shading;
          if (sh < 0) sh = 0;
          // Photos of painted miniatures already contain highlights: compress what is far above the
          // zone's mean so recolouring does not blow them out to white.
          if (z.exclusive && sh > 1) sh = 1 + (sh - 1) / (1 + 0.6 * (sh - 1));
          if (z.metal) sh = Math.pow(sh, 1.45);
          let pr = z.base[0] * z.bright;
          let pg = z.base[1] * z.bright;
          let pb = z.base[2] * z.bright;
          if (sh <= 1) {
            pr *= sh; pg *= sh; pb *= sh;
          } else {
            const t = 1 - Math.exp(-(sh - 1) * z.lift);
            pr += (1 - pr) * t; pg += (1 - pg) * t; pb += (1 - pb) * t;
          }

          if (z.contrast) {
            // Pigment pools in recesses and thins out on raised areas
            const dk = 1 - cav * 0.65;
            const lt = ridge * 0.35;
            pr = pr * dk + (Math.min(1, z.base[0] * 1.8) - pr * dk) * lt;
            pg = pg * dk + (Math.min(1, z.base[1] * 1.8) - pg * dk) * lt;
            pb = pb * dk + (Math.min(1, z.base[2] * 1.8) - pb * dk) * lt;
          }

          if (z.wash) {
            const t = z.wash[3] * (0.18 + 0.82 * cav);
            pr += (pr * z.wash[0] * 1.6 - pr) * t;
            pg += (pg * z.wash[1] * 1.6 - pg) * t;
            pb += (pb * z.wash[2] * 1.6 - pb) * t;
          }

          if (z.dry) {
            const v = lg - bl + (noise[i] - 0.5) * 0.14 + (lg - 0.45) * 0.18;
            const t = z.dry[3] * clamp01(v * 9) * 0.85;
            pr += (z.dry[0] - pr) * t;
            pg += (z.dry[1] - pg) * t;
            pb += (z.dry[2] - pb) * t;
          }

          if (z.hl) {
            const t = z.hl[3] * clamp01(edge[i] * 3.2 * (0.25 + ridge) + ridge * 0.25);
            pr += (z.hl[0] - pr) * t;
            pg += (z.hl[1] - pg) * t;
            pb += (z.hl[2] - pb) * t;
          }

          if (z.spec > 0) {
            const t = clamp01((lg - z.specFrom) * 5) * z.spec;
            pr += (1 - pr) * t; pg += (1 - pg) * t; pb += (1 - pb) * t;
          }

          cr += (pr - cr) * alpha;
          cg += (pg - cg) * alpha;
          cb += (pb - cb) * alpha;
        }
        if (touched) {
          const p = i * 4;
          o[p] = LUT[(clamp01(cr) * 4096) | 0];
          o[p + 1] = LUT[(clamp01(cg) * 4096) | 0];
          o[p + 2] = LUT[(clamp01(cb) * 4096) | 0];
        }
      }
    }
    return out;
  }

  sourceImageData(): ImageData {
    return new ImageData(new Uint8ClampedArray(this.src), this.width, this.height);
  }

  /** Couleur source moyenne autour d'un point (pipette). */
  sampleSource(x: number, y: number, r = 2): [number, number, number] {
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let yy = Math.max(0, y - r); yy <= Math.min(this.height - 1, y + r); yy++) {
      for (let xx = Math.max(0, x - r); xx <= Math.min(this.width - 1, x + r); xx++) {
        const p = (yy * this.width + xx) * 4;
        sr += this.src[p]; sg += this.src[p + 1]; sb += this.src[p + 2]; n++;
      }
    }
    return [sr / n, sg / n, sb / n];
  }
}

interface PreparedZone {
  mask: Uint8Array;
  bbox: Rect | null;
  mean: number;
  opacity: number;
  shading: number;
  bright: number;
  base: [number, number, number];
  metal: boolean;
  lift: number;
  contrast: boolean;
  spec: number;
  specFrom: number;
  wash: [number, number, number, number] | null;
  hl: [number, number, number, number] | null;
  dry: [number, number, number, number] | null;
  /** Automatic colour zone: shares pixels with the other automatic zones (partition). */
  exclusive: boolean;
}

/**
 * A colour zone still showing the photo's own colour, with no effect: it is not rendered, so what
 * lies below (primer or photo) shows through. Painting it makes it a layer.
 */
export function isUnpaintedColour(z: Zone): boolean {
  return (
    z.source === 'auto' &&
    !!z.refHex &&
    z.base.hex === z.refHex &&
    !z.base.paintId &&
    !z.wash.enabled &&
    !z.drybrush.enabled &&
    !z.highlight.enabled &&
    !z.contrast &&
    z.brightness === 0 &&
    z.finish === 'mat'
  );
}

function layer(e: Zone['wash']): [number, number, number, number] | null {
  if (!e.enabled || e.amount <= 0) return null;
  const c = hexToLinear(e.hex);
  return [c[0], c[1], c[2], e.amount];
}

function prepareZone(z: Zone, c: ZoneCache, mask: Uint8Array): PreparedZone {
  const metal = z.finish === 'metal';
  const spec = { mat: 0, satin: 0.25, gloss: 0.6, metal: 0.55 }[z.finish];
  return {
    mask,
    bbox: c.bbox,
    mean: c.mean,
    opacity: z.opacity,
    shading: z.contrast ? z.shading * 1.35 : z.shading,
    bright: Math.pow(2, z.brightness * 1.5),
    base: hexToLinear(z.base.hex),
    metal,
    lift: metal ? 0.9 : 0.55,
    contrast: z.contrast,
    spec,
    specFrom: z.finish === 'gloss' ? 0.8 : metal ? 0.72 : 0.85,
    wash: layer(z.wash),
    hl: layer(z.highlight),
    dry: layer(z.drybrush),
    exclusive: z.source === 'auto' && !z.priority,
  };
}

function intersects(a: Rect, b: Rect) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

/** Separable box blur; a few passes approximate a Gaussian. */
export function boxBlurFloat(src: Float32Array, w: number, h: number, r: number, passes: number): Float32Array {
  let a = new Float32Array(src);
  let b = new Float32Array(src.length);
  const inv = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += a[row + Math.min(w - 1, Math.max(0, k))];
      for (let x = 0; x < w; x++) {
        b[row + x] = acc * inv;
        acc += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += b[Math.min(h - 1, Math.max(0, k)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc * inv;
        acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  b = a;
  return b;
}

function sobel(l: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(l.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -l[i - w - 1] - 2 * l[i - 1] - l[i + w - 1] + l[i - w + 1] + 2 * l[i + 1] + l[i + w + 1];
      const gy = -l[i - w - 1] - 2 * l[i - w] - l[i - w + 1] + l[i + w - 1] + 2 * l[i + w] + l[i + w + 1];
      out[i] = Math.min(1, Math.hypot(gx, gy));
    }
  }
  return out;
}

export const engine = new PaintEngine();
