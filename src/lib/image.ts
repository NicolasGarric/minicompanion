import type { ProjectRecord, Zone } from '../types';
import { engine } from '../engine/engine';

export const MAX_SIDE = 1600;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export type ImageCheck = 'ok' | 'type' | 'size';

export function checkImageFile(file: File): ImageCheck {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'type';
  if (file.size > MAX_FILE_BYTES) return 'size';
  return 'ok';
}

export async function fileToImageData(file: Blob, maxSide = MAX_SIDE): Promise<ImageData> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return ctx.getImageData(0, 0, w, h);
}

export const blobToImageData = (b: Blob) => fileToImageData(b, Number.MAX_SAFE_INTEGER);

function canvasOf(img: ImageData) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}

/** Images are stored as JPEG q=0.85: a 1600 px photo is typically 200–400 KB. */
export function imageDataToBlob(img: ImageData, type = 'image/jpeg'): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvasOf(img).toBlob((b) => (b ? resolve(b) : reject(new Error('Image encoding failed'))), type, 0.85),
  );
}

/** Renders zones into a separate buffer (the on-screen canvas is untouched). */
export function renderOffscreen(zones: Zone[]): ImageData {
  const target = new ImageData(engine.width, engine.height);
  return engine.render(zones, undefined, target);
}

export function renderThumb(zones: Zone[], size: number): string {
  if (!engine.loaded) return '';
  const full = canvasOf(renderOffscreen(zones));
  const s = size / Math.max(full.width, full.height);
  const c = document.createElement('canvas');
  c.width = Math.round(full.width * s);
  c.height = Math.round(full.height * s);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
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

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'schema';

export async function exportRenderPNG(zones: Zone[], name: string) {
  const blob = await imageDataToBlob(renderOffscreen(zones), 'image/png');
  download(blob, `${slug(name)}.png`);
}

export interface RecipeLine {
  zone: string;
  role: string;
  steps: { label: string; name: string; hex: string; brand?: string }[];
}

// --- Portable project file (.chroma.json) ---------------------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Simple RLE: masks are mostly runs of 0 or 255. */
function rle(m: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < m.length) {
    const v = m[i];
    let n = 1;
    while (i + n < m.length && m[i + n] === v && n < 255) n++;
    out.push(n, v);
    i += n;
  }
  return Uint8Array.from(out);
}

function unrle(d: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(size);
  let p = 0;
  for (let i = 0; i < d.length; i += 2) {
    out.fill(d[i + 1], p, p + d[i]);
    p += d[i];
  }
  return out;
}

export async function exportProjectFile(rec: ProjectRecord) {
  const image = bytesToBase64(new Uint8Array(await rec.image.arrayBuffer()));
  const masks = Object.fromEntries(Object.entries(rec.masks).map(([k, v]) => [k, bytesToBase64(rle(v))]));
  const payload = { format: 'chromaforge', version: 1, ...rec, image, imageType: rec.image.type, masks };
  download(new Blob([JSON.stringify(payload)], { type: 'application/json' }), `${slug(rec.name)}.chroma.json`);
}

export async function parseProjectFile(file: File): Promise<ProjectRecord> {
  const data = JSON.parse(await file.text());
  if (data.format !== 'chromaforge') throw new Error('Unrecognised file');
  const size = data.width * data.height;
  const masks: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(data.masks as Record<string, string>)) masks[k] = unrle(base64ToBytes(v), size);
  return {
    ...data,
    image: new Blob([base64ToBytes(data.image)], { type: data.imageType || 'image/png' }),
    masks,
    variants: data.variants ?? [],
    palette: data.palette ?? [],
  };
}
