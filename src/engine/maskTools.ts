import type { Rect } from './engine';
import { engine } from './engine';

export interface BrushOptions {
  size: number; // diamètre en pixels image
  hardness: number; // 0..1
  flow: number; // 0..1 opacité maximale du coup
  erase: boolean;
  smart: boolean; // limite au voisinage colorimétrique du point de départ
  smartTolerance: number; // 0..100
}

/**
 * Un coup de pinceau : accumule la couverture dans un tampon (max) pour qu'une
 * même zone repassée dans le même coup ne dépasse pas l'opacité choisie.
 */
export class BrushStroke {
  private before: Uint8Array;
  private cover: Float32Array;
  private last: { x: number; y: number } | null = null;
  private ref: [number, number, number] | null = null;
  dirty: Rect | null = null;

  constructor(private mask: Uint8Array, private opts: BrushOptions) {
    this.before = new Uint8Array(mask);
    this.cover = new Float32Array(mask.length);
  }

  get snapshot() {
    return this.before;
  }

  /** Ajoute un segment jusqu'à (x, y) et renvoie le rectangle modifié. */
  to(x: number, y: number): Rect | null {
    if (this.opts.smart && !this.ref) this.ref = engine.sampleSource(Math.round(x), Math.round(y), 1);
    const from = this.last ?? { x, y };
    const r = this.opts.size / 2;
    const spacing = Math.max(0.5, r * 0.2);
    const dist = Math.hypot(x - from.x, y - from.y);
    const steps = Math.max(1, Math.ceil(dist / spacing));
    let rect: Rect | null = null;
    for (let s = this.last ? 1 : 0; s <= steps; s++) {
      const t = s / steps;
      const rr = this.stamp(from.x + (x - from.x) * t, from.y + (y - from.y) * t);
      if (rr) rect = union(rect, rr);
    }
    this.last = { x, y };
    if (rect) this.dirty = union(this.dirty, rect);
    return rect;
  }

  private stamp(cx: number, cy: number): Rect | null {
    const { width: w, height: h, src } = engine;
    const r = this.opts.size / 2;
    const x0 = Math.max(0, Math.floor(cx - r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const x1 = Math.min(w, Math.ceil(cx + r + 1));
    const y1 = Math.min(h, Math.ceil(cy + r + 1));
    if (x1 <= x0 || y1 <= y0) return null;
    const hard = Math.min(0.99, this.opts.hardness);
    const flow = this.opts.flow;
    const tol = (this.opts.smartTolerance / 100) * 255 * 1.2;
    const ref = this.ref;
    const { cover, before, mask } = this;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
        if (d >= 1) continue;
        let f = d <= hard ? 1 : 1 - (d - hard) / (1 - hard);
        f = f * f * (3 - 2 * f);
        const i = y * w + x;
        if (ref) {
          const p = i * 4;
          const dc = Math.hypot(src[p] - ref[0], src[p + 1] - ref[1], src[p + 2] - ref[2]);
          if (dc > tol) continue;
          f *= 1 - Math.max(0, (dc - tol * 0.6) / (tol * 0.4));
        }
        f *= flow;
        if (f <= cover[i]) continue;
        cover[i] = f;
        const b = before[i];
        mask[i] = this.opts.erase ? Math.round(b * (1 - f)) : Math.round(b + (255 - b) * f);
      }
    }
    return { x0, y0, x1, y1 };
  }
}

export function union(a: Rect | null, b: Rect): Rect {
  if (!a) return { ...b };
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

export type CombineMode = 'add' | 'subtract' | 'replace';

export function combine(mask: Uint8Array, sel: Uint8Array, mode: CombineMode) {
  for (let i = 0; i < mask.length; i++) {
    const s = sel[i];
    if (mode === 'replace') mask[i] = s;
    else if (s === 0) continue;
    else if (mode === 'add') mask[i] = Math.max(mask[i], s);
    else mask[i] = Math.round(mask[i] * (1 - s / 255));
  }
}

/** Baguette magique : sélection par similarité de couleur, contiguë ou globale. */
export function magicWand(x: number, y: number, tolerance: number, contiguous: boolean): Uint8Array {
  const { width: w, height: h, src } = engine;
  const out = new Uint8Array(w * h);
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= w || y >= h) return out;
  const [rr, rg, rb] = engine.sampleSource(x, y, 1);
  const tol = (tolerance / 100) * 441;
  const tol2 = tol * tol;
  const match = (i: number) => {
    const p = i * 4;
    const dr = src[p] - rr;
    const dg = src[p + 1] - rg;
    const db = src[p + 2] - rb;
    return dr * dr + dg * dg + db * db <= tol2;
  };
  if (!contiguous) {
    for (let i = 0; i < out.length; i++) if (match(i)) out[i] = 255;
    return out;
  }
  const stack = [x, y];
  while (stack.length) {
    const sy = stack.pop()!;
    const sx = stack.pop()!;
    let lx = sx;
    const row = sy * w;
    if (out[row + lx] || !match(row + lx)) continue;
    while (lx > 0 && !out[row + lx - 1] && match(row + lx - 1)) lx--;
    let rx = sx;
    while (rx < w - 1 && !out[row + rx + 1] && match(row + rx + 1)) rx++;
    for (let xx = lx; xx <= rx; xx++) {
      out[row + xx] = 255;
      if (sy > 0) {
        const j = row - w + xx;
        if (!out[j] && match(j)) stack.push(xx, sy - 1);
      }
      if (sy < h - 1) {
        const j = row + w + xx;
        if (!out[j] && match(j)) stack.push(xx, sy + 1);
      }
    }
  }
  return out;
}

/** Remplit un polygone (lasso) en masque. */
export function polygonMask(points: { x: number; y: number }[]): Uint8Array {
  const { width: w, height: h } = engine;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fill();
  const d = ctx.getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3];
  return out;
}

export function feather(mask: Uint8Array, radius: number): Uint8Array {
  if (radius <= 0) return mask;
  const { width: w, height: h } = engine;
  const f = new Float32Array(mask.length);
  for (let i = 0; i < f.length; i++) f[i] = mask[i];
  const b = boxBlur(f, w, h, Math.round(radius));
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(b[i]);
  return out;
}

/** Dilatation (px > 0) ou érosion (px < 0) par filtre max/min séparable. */
export function growShrink(mask: Uint8Array, px: number): Uint8Array {
  const { width: w, height: h } = engine;
  const r = Math.abs(Math.round(px));
  if (r === 0) return mask;
  const grow = px > 0;
  const tmp = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);
  const pick = grow ? Math.max : Math.min;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = grow ? 0 : 255;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) v = pick(v, mask[y * w + k]);
      tmp[y * w + x] = v;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = grow ? 0 : 255;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) v = pick(v, tmp[k * w + x]);
      out[y * w + x] = v;
    }
  }
  return out;
}

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const a = new Float32Array(src);
  const b = new Float32Array(src.length);
  const inv = 1 / (2 * r + 1);
  for (let pass = 0; pass < 2; pass++) {
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
  return a;
}
