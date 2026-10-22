import type { ProjectRecord } from '../types';
import { download, slug } from '../../core/lib/image';
import { APP_ID } from '../../core/brand';

/** Files exported under the app's first name are still accepted. */
const PROJECT_FORMATS = [APP_ID, 'chromaforge'];

// --- Portable project file (.minicompanion.json) ---------------------------------------------------

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
  const payload = { format: APP_ID, version: 1, ...rec, image, imageType: rec.image.type, masks };
  download(new Blob([JSON.stringify(payload)], { type: 'application/json' }), `${slug(rec.name)}.${APP_ID}.json`);
}

export async function parseProjectFile(file: File): Promise<ProjectRecord> {
  const data = JSON.parse(await file.text());
  if (!PROJECT_FORMATS.includes(data.format)) throw new Error('Unrecognised file');
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
