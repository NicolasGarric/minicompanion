import type { ProjectRecord, Zone } from '../types';
import { engine } from '../engine/engine';

export const MAX_SIDE = 1600;

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

export function imageDataToBlob(img: ImageData, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvasOf(img).toBlob((b) => (b ? resolve(b) : reject(new Error('Encodage impossible'))), type, 0.92),
  );
}

/** Rend les zones dans un buffer séparé (ne touche pas l'affichage principal). */
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
  const blob = await imageDataToBlob(renderOffscreen(zones));
  download(blob, `${slug(name)}.png`);
}

export interface RecipeLine {
  zone: string;
  role: string;
  steps: { label: string; name: string; hex: string; brand?: string }[];
}

/** Fiche : rendu + recette par zone, dessinée sur un canvas. */
export async function exportSheetPNG(zones: Zone[], lines: RecipeLine[], title: string, subtitle: string) {
  const render = canvasOf(renderOffscreen(zones));
  const W = 1800;
  const pad = 60;
  const imgW = 820;
  const imgH = Math.round((render.height / render.width) * imgW);
  const lineH = 44;
  const listH = lines.reduce((acc, l) => acc + 64 + l.steps.length * lineH + 24, 0);
  const H = Math.max(imgH, listH) + pad * 2 + 140;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#121419';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e3b04b';
  ctx.font = '700 46px Cinzel, serif';
  ctx.fillText(title, pad, pad + 40);
  ctx.fillStyle = '#9aa0ab';
  ctx.font = '400 22px Inter, sans-serif';
  ctx.fillText(subtitle, pad, pad + 80);
  const top = pad + 120;
  ctx.drawImage(render, pad, top, imgW, imgH);
  ctx.strokeStyle = '#2a2e38';
  ctx.lineWidth = 2;
  ctx.strokeRect(pad, top, imgW, imgH);

  let y = top;
  const x = pad + imgW + 60;
  for (const l of lines) {
    ctx.fillStyle = '#f2f3f5';
    ctx.font = '600 28px Inter, sans-serif';
    ctx.fillText(l.zone, x, y + 30);
    ctx.fillStyle = '#7d8492';
    ctx.font = '400 18px Inter, sans-serif';
    ctx.fillText(l.role, x, y + 54);
    y += 64;
    for (const s of l.steps) {
      ctx.fillStyle = s.hex;
      roundRect(ctx, x, y + 6, 32, 32, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.stroke();
      ctx.fillStyle = '#9aa0ab';
      ctx.font = '500 18px Inter, sans-serif';
      ctx.fillText(s.label, x + 48, y + 28);
      ctx.fillStyle = '#e6e8eb';
      ctx.font = '500 21px Inter, sans-serif';
      ctx.fillText(`${s.name}${s.brand ? `  ·  ${s.brand}` : ''}`, x + 210, y + 29);
      y += lineH;
    }
    y += 24;
  }
  ctx.fillStyle = '#4b505c';
  ctx.font = '400 16px Inter, sans-serif';
  ctx.fillText('Généré avec Chromaforge — couleurs indicatives, rendu écran.', pad, H - 30);
  const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'));
  download(blob, `${slug(title)}-fiche.png`);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// --- Fichier projet portable (.chroma.json) -------------------------------------------------

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

/** Compression RLE simple : les masques sont très majoritairement à 0 ou 255. */
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
  if (data.format !== 'chromaforge') throw new Error('Fichier non reconnu');
  const size = data.width * data.height;
  const masks: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(data.masks as Record<string, string>)) masks[k] = unrle(base64ToBytes(v), size);
  return {
    ...data,
    image: new Blob([base64ToBytes(data.image)], { type: data.imageType || 'image/png' }),
    masks,
    variants: data.variants ?? [],
  };
}
