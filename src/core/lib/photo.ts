import { supabase } from '../auth/supabase';
import { fileToImageData, fitImageData, imageDataToBlob } from './image';
import { photoPath, thumbOf } from './photoPaths';
export { photoPath, thumbOf, withThumbs } from './photoPaths';

/**
 * Photos sent to the server (owner decision 2026-10-27, storage plan): a 1280 px image in WebP
 * (q 0.8, about 150 kB) plus a 400 px thumbnail (about 25 kB) that lists and grids show. Browsers
 * that cannot encode WebP (Safari) send JPEG instead, or PNG when transparency matters.
 * Names carry the role: "<id>.w.webp" is the full image, "<id>.t.webp" its thumbnail; files sent
 * before this have no thumbnail and are shown as they are.
 */
export const FULL_SIDE = 1280;
export const THUMB_SIDE = 400;
/** Public files never change under their name: browsers and the CDN may keep them a year. */
export const CACHE_SECONDS = '31536000';

export interface PreparedPhoto {
  full: Blob;
  thumb: Blob | null;
  ext: 'webp' | 'jpg' | 'png';
}

const EXT: Record<string, PreparedPhoto['ext']> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

async function encode(img: ImageData, quality: number, keepAlpha: boolean): Promise<Blob> {
  const webp = await imageDataToBlob(img, 'image/webp', quality);
  // Browsers without a WebP encoder silently return PNG.
  if (webp.type === 'image/webp') return webp;
  return keepAlpha ? imageDataToBlob(img, 'image/png') : imageDataToBlob(img, 'image/jpeg', quality + 0.02);
}

/** Shrinks a photo (file or rendered image) for upload; `thumb: false` for files nobody lists (bug screenshots). */
export async function preparePhoto(src: Blob | ImageData, opts: { thumb?: boolean; keepAlpha?: boolean } = {}): Promise<PreparedPhoto> {
  const base = src instanceof Blob ? await fileToImageData(src, FULL_SIDE) : fitImageData(src, FULL_SIDE);
  const keepAlpha = !!opts.keepAlpha;
  const full = await encode(base, 0.8, keepAlpha);
  const thumb = opts.thumb === false ? null : await encode(fitImageData(base, THUMB_SIDE), 0.72, keepAlpha);
  return { full, thumb, ext: EXT[full.type] ?? 'jpg' };
}

/** The error the app shows when the player's photo quota is full (checked before uploading). */
export class PhotoQuotaError extends Error {
  readonly used: number;
  readonly quota: number;
  constructor(used: number, quota: number) {
    super('photo_quota');
    this.used = used;
    this.quota = quota;
  }
}

/** Players' photos count against their quota (my_photo_usage); older databases without it skip the check. */
async function checkQuota() {
  const { data, error } = await supabase!.rpc('my_photo_usage');
  const row = error ? null : (data as { used: number; quota: number }[] | null)?.[0];
  if (row && row.used >= row.quota) throw new PhotoQuotaError(row.used, row.quota);
}

/**
 * Prepares and uploads one photo (and its thumbnail) into `<bucket>/<folder>/`; returns the stored
 * path of the full image. If the thumbnail fails, the full image is removed again.
 */
export async function uploadPhoto(
  bucket: string,
  folder: string,
  src: Blob | ImageData,
  opts: { thumb?: boolean; keepAlpha?: boolean; quota?: boolean } = {},
): Promise<string> {
  if (!supabase) throw new Error('backend');
  if (opts.quota !== false) await checkQuota();
  const photo = await preparePhoto(src, opts);
  const store = supabase.storage.from(bucket);
  const path = photoPath(folder, photo.ext);
  const up = await store.upload(path, photo.full, { contentType: photo.full.type, cacheControl: CACHE_SECONDS });
  if (up.error) throw up.error;
  if (photo.thumb) {
    const t = await store.upload(thumbOf(path), photo.thumb, { contentType: photo.thumb.type, cacheControl: CACHE_SECONDS });
    if (t.error) {
      await store.remove([path]);
      throw t.error;
    }
  }
  return path;
}

/** Removes photos and their thumbnails. */
export async function removePhotos(bucket: string, paths: string[]) {
  if (!supabase || !paths.length) return;
  await supabase.storage.from(bucket).remove([...new Set(paths.flatMap((p) => [p, thumbOf(p)]))]);
}
