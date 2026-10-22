import type { Primer, Zone } from '../types';
import { engine } from '../engine/engine';
import { canvasOf, download, imageDataToBlob, slug } from '../../core/lib/image';

/** Renders zones into a separate buffer (the on-screen canvas is untouched). */
export function renderOffscreen(zones: Zone[], primer: Primer | null = null): ImageData {
  const target = new ImageData(engine.width, engine.height);
  return engine.render(zones, undefined, target, primer);
}

export function renderThumb(zones: Zone[], size: number, primer: Primer | null = null): string {
  if (!engine.loaded) return '';
  const full = canvasOf(renderOffscreen(zones, primer));
  const s = size / Math.max(full.width, full.height);
  const c = document.createElement('canvas');
  c.width = Math.round(full.width * s);
  c.height = Math.round(full.height * s);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, 0, 0, c.width, c.height);
  // The model alone keeps its transparent background (JPEG would turn it black).
  return engine.cutout ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.8);
}

/** Rescales a mask to new dimensions (used when the reference image is replaced). */
export function resampleMask(m: Uint8Array, w: number, h: number, nw: number, nh: number): Uint8Array {
  const out = new Uint8Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(h - 1, Math.floor((y / nh) * h));
    for (let x = 0; x < nw; x++) out[y * nw + x] = m[sy * w + Math.min(w - 1, Math.floor((x / nw) * w))];
  }
  return out;
}

export async function exportRenderPNG(zones: Zone[], name: string, primer: Primer | null = null) {
  const blob = await imageDataToBlob(renderOffscreen(zones, primer), 'image/png');
  download(blob, `${slug(name)}.png`);
}
