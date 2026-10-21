import { rgbToHex, rgbToLab, type RGB } from '../../core/lib/color';

export interface ExtractedColor {
  hex: string;
  /** Share of sampled pixels in this cluster, 0..1 */
  weight: number;
}

/**
 * Extracts dominant colours with k-means in Lab space on a downsampled copy of the image.
 * Clusters that end up perceptually too close are merged so the palette stays readable.
 */
export function extractPalette(img: ImageData, count = 6, sampleSide = 96): ExtractedColor[] {
  const samples = sample(img, sampleSide);
  if (samples.length === 0) return [];
  const labs = samples.map(rgbToLab);
  const k = Math.min(count + 2, samples.length);

  // k-means++ seeding, deterministic (first seed = mean-ish pixel)
  const centers: RGB[] = [labs[Math.floor(labs.length / 2)]];
  while (centers.length < k) {
    let best = 0;
    let bestD = -1;
    for (let i = 0; i < labs.length; i += 3) {
      const d = Math.min(...centers.map((c) => dist2(c, labs[i])));
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    centers.push(labs[best]);
  }

  const assign = new Int32Array(labs.length);
  for (let iter = 0; iter < 12; iter++) {
    for (let i = 0; i < labs.length; i++) {
      let bi = 0;
      let bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = dist2(centers[c], labs[i]);
        if (d < bd) {
          bd = d;
          bi = c;
        }
      }
      assign[i] = bi;
    }
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < labs.length; i++) {
      const s = sums[assign[i]];
      s[0] += labs[i][0];
      s[1] += labs[i][1];
      s[2] += labs[i][2];
      s[3]++;
    }
    sums.forEach((s, c) => {
      if (s[3]) centers[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
    });
  }

  // Average the clusters in RGB for display
  const clusters = centers.map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
  samples.forEach((p, i) => {
    const c = clusters[assign[i]];
    c.r += p[0];
    c.g += p[1];
    c.b += p[2];
    c.n++;
  });
  let colors = clusters
    .filter((c) => c.n > 0)
    .map((c) => ({ rgb: [c.r / c.n, c.g / c.n, c.b / c.n] as RGB, weight: c.n / samples.length }))
    .sort((a, b) => b.weight - a.weight);

  // Merge near-duplicates (ΔE < 10)
  const merged: typeof colors = [];
  for (const c of colors) {
    const lab = rgbToLab(c.rgb);
    const twin = merged.find((m) => Math.sqrt(dist2(rgbToLab(m.rgb), lab)) < 10);
    if (twin) twin.weight += c.weight;
    else merged.push({ ...c });
  }
  colors = merged.slice(0, count);
  return colors.map((c) => ({ hex: rgbToHex(c.rgb), weight: c.weight }));
}

function sample(img: ImageData, side: number): RGB[] {
  const step = Math.max(1, Math.floor(Math.max(img.width, img.height) / side));
  const out: RGB[] = [];
  for (let y = 0; y < img.height; y += step) {
    for (let x = 0; x < img.width; x += step) {
      const p = (y * img.width + x) * 4;
      if (img.data[p + 3] < 128) continue;
      out.push([img.data[p], img.data[p + 1], img.data[p + 2]]);
    }
  }
  return out;
}

function dist2(a: RGB, b: RGB) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}
