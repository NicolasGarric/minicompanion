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

export function canvasOf(img: ImageData) {
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
