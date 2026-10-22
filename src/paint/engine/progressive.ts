import type { Primer, Zone } from '../types';
import { PaintEngine, type Rect } from './engine';

/**
 * Fluid colour changes on large images:
 *   1. a low-resolution copy of the engine (longest side PREVIEW_SIDE) renders the change at once,
 *      drawn scaled up on the canvas;
 *   2. the full-resolution render then runs in horizontal bands between frames (a few ms each), each
 *      band replacing the preview as it is ready. A newer change cancels the job in progress.
 * The result is the same image as a single full render; the page never freezes.
 */
const PREVIEW_SIDE = 640;
/** Below this many pixels a full render is fast enough to do in one go. */
const DIRECT_PIXELS = 700_000;
/** Time budget of one band, in ms. */
const BAND_BUDGET = 8;

class PreviewEngine {
  private eng: PaintEngine | null = null;
  private source: Uint8ClampedArray | null = null;
  private maskKey = '';
  private factor = 1;

  /** The preview engine, rebuilt when the image changes and its masks when a mask changes. */
  get(main: PaintEngine): PaintEngine {
    if (!this.eng || this.source !== main.src) {
      this.factor = Math.max(1, Math.ceil(Math.max(main.width, main.height) / PREVIEW_SIDE));
      const w = Math.ceil(main.width / this.factor);
      const h = Math.ceil(main.height / this.factor);
      this.eng = new PaintEngine();
      this.eng.load(new ImageData(downscaleRGBA(main.src, main.width, main.height, this.factor, w, h), w, h));
      this.source = main.src;
      this.maskKey = '';
    }
    const eng = this.eng;
    eng.cutout = main.cutout;
    // The engine epoch changes whenever a mask is replaced or edited.
    const key = String(main.epoch);
    if (this.maskKey !== key) {
      eng.masks.clear();
      for (const [id, m] of main.masks) eng.setMask(id, downscaleMask(m, main.width, main.height, this.factor, eng.width, eng.height));
      eng.invalidate();
      this.maskKey = key;
    }
    return eng;
  }
}

const preview = new PreviewEngine();

function downscaleRGBA(src: Uint8ClampedArray, w: number, h: number, f: number, ow: number, oh: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(ow * oh * 4);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let dy = 0; dy < f; dy++) {
        const sy = y * f + dy;
        if (sy >= h) break;
        for (let dx = 0; dx < f; dx++) {
          const sx = x * f + dx;
          if (sx >= w) break;
          const p = (sy * w + sx) * 4;
          r += src[p];
          g += src[p + 1];
          b += src[p + 2];
          a += src[p + 3];
          n++;
        }
      }
      const o = (y * ow + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = a / n;
    }
  }
  return out;
}

function downscaleMask(m: Uint8Array, w: number, h: number, f: number, ow: number, oh: number): Uint8Array {
  const out = new Uint8Array(ow * oh);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      let s = 0, n = 0;
      for (let dy = 0; dy < f; dy++) {
        const sy = y * f + dy;
        if (sy >= h) break;
        const row = sy * w;
        for (let dx = 0; dx < f; dx++) {
          const sx = x * f + dx;
          if (sx >= w) break;
          s += m[row + sx];
          n++;
        }
      }
      out[y * ow + x] = s / n;
    }
  }
  return out;
}

/** Builds the preview ahead of time (call when the browser is idle after loading an image). */
export function warmPreview(main: PaintEngine) {
  if (main.loaded && main.width * main.height > DIRECT_PIXELS) preview.get(main);
}

/** Low-resolution render (longest side ≈ PREVIEW_SIDE), for thumbnails: fast at any image size. */
export function renderSmall(main: PaintEngine, zones: Zone[], primer: Primer | null): ImageData {
  const pv = preview.get(main);
  return pv.render(zones, undefined, new ImageData(pv.width, pv.height), primer);
}

// Runs a callback after the browser had a chance to paint (faster than setTimeout's 4 ms clamp).
const channel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
const queue: (() => void)[] = [];
if (channel) channel.port1.onmessage = () => queue.shift()?.();
const nextTick = (fn: () => void) => {
  if (channel) {
    queue.push(fn);
    channel.port2.postMessage(0);
  } else setTimeout(fn, 0);
};

/**
 * Renders `zones` on `canvas` (same size as the engine). Returns a cancel function.
 */
export function renderProgressive(
  main: PaintEngine,
  canvas: HTMLCanvasElement,
  zones: Zone[],
  primer: Primer | null,
  onDone?: () => void,
): () => void {
  const ctx = canvas.getContext('2d')!;
  const w = main.width;
  const h = main.height;
  if (w * h <= DIRECT_PIXELS) {
    main.render(zones, undefined, undefined, primer);
    ctx.putImageData(main.out!, 0, 0);
    onDone?.();
    return () => undefined;
  }

  // 1. Instant preview
  const pv = preview.get(main);
  pv.render(zones, undefined, undefined, primer);
  const tmp = document.createElement('canvas');
  tmp.width = pv.width;
  tmp.height = pv.height;
  tmp.getContext('2d')!.putImageData(pv.out!, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, w, h);
  // Each preview pixel covers f × f full pixels (the last row / column may overhang: clipped).
  const f = Math.max(1, Math.ceil(Math.max(w, h) / PREVIEW_SIDE));
  ctx.drawImage(tmp, 0, 0, pv.width * f, pv.height * f);
  ctx.restore();

  // 2. Full resolution, band by band
  let cancelled = false;
  let y = 0;
  let rows = 48;
  const step = () => {
    if (cancelled) return;
    const start = performance.now();
    const rect: Rect = { x0: 0, y0: y, x1: w, y1: Math.min(h, y + rows) };
    main.render(zones, rect, undefined, primer);
    ctx.putImageData(main.out!, 0, 0, 0, rect.y0, w, rect.y1 - rect.y0);
    y = rect.y1;
    // Adapt the band height to the time budget.
    const spent = performance.now() - start;
    rows = Math.max(8, Math.min(512, Math.round(rows * (BAND_BUDGET / Math.max(0.5, spent)))));
    if (y < h) nextTick(step);
    else onDone?.();
  };
  nextTick(step);
  return () => {
    cancelled = true;
  };
}
