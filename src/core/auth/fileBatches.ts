/** Files are removed 100 at a time, bucket by bucket, through the Storage API. */
export function fileBatches(files: { bucket: string; name: string }[], size = 100): { bucket: string; names: string[] }[] {
  const byBucket = new Map<string, string[]>();
  for (const f of files) byBucket.set(f.bucket, [...(byBucket.get(f.bucket) ?? []), f.name]);
  return [...byBucket].flatMap(([bucket, names]) =>
    Array.from({ length: Math.ceil(names.length / size) }, (_, i) => ({ bucket, names: names.slice(i * size, (i + 1) * size) })),
  );
}
