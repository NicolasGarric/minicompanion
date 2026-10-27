/** Paths of uploaded photos (see photo.ts): pure helpers, also used by the tests. */

/** "<folder>/<id>.w.<ext>": the stored path of a new full image. */
export const photoPath = (folder: string, ext: 'webp' | 'jpg' | 'png') => `${folder}/${crypto.randomUUID()}.w.${ext}`;

/** The thumbnail of a full image, or the path itself for older files that have none. */
export const thumbOf = (path: string) => path.replace(/\.w\.(webp|jpg|png)$/, '.t.$1');

/** Paths plus their thumbnails, without duplicates (to sign URLs of private files in one call). */
export const withThumbs = (paths: string[]) => [...new Set(paths.flatMap((p) => [p, thumbOf(p)]))];

