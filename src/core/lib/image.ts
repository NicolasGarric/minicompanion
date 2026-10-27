/** Working resolution of the editor (longest side). */
export const MAX_SIDE = 2048;
/** Uploads are decoded up to this size, cropped around the miniature, then fitted to MAX_SIDE. */
export const DECODE_SIDE = 4096;
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

export function canvasOf(img: ImageData) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}

/** Images are stored as JPEG q=0.92 (detail matters here): a 2048 px photo is typically 0.5–1 MB. */
export function imageDataToBlob(img: ImageData, type = 'image/jpeg', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvasOf(img).toBlob((b) => (b ? resolve(b) : reject(new Error('Image encoding failed'))), type, quality),
  );
}

/** Downscales an image so its longest side is at most `maxSide` (high-quality resampling). */
export function fitImageData(img: ImageData, maxSide: number): ImageData {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  if (scale === 1) return img;
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvasOf(img), 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** Copy of a rectangle of an image (e.g. the frame around the miniature). */
export function cropImageData(img: ImageData, r: { x: number; y: number; width: number; height: number }): ImageData {
  const out = new ImageData(r.width, r.height);
  for (let y = 0; y < r.height; y++) {
    const from = ((r.y + y) * img.width + r.x) * 4;
    out.data.set(img.data.subarray(from, from + r.width * 4), y * r.width * 4);
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

/** A photo picked by the user, shrunk on the device to `maxSide` and saved as JPEG. */
export async function shrinkPhoto(file: Blob, maxSide = 1600): Promise<Blob> {
  return imageDataToBlob(await fileToImageData(file, maxSide), 'image/jpeg');
}
