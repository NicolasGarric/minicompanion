import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentImage, type ImageLike } from '../../src/paint/engine/segment.ts';

/**
 * Synthetic "miniature photo": light grey background, a blue body with strong vertical shading
 * (dark recess at the bottom, bright edge at the top), a gold belt and a red eye.
 */
function figure(): ImageLike {
  const w = 120, h = 160;
  const data = new Uint8ClampedArray(w * h * 4);
  const put = (x: number, y: number, [r, g, b]: number[]) => {
    const p = (y * w + x) * 4;
    data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      put(x, y, [214, 211, 205]);                                   // background
      if (x >= 30 && x < 90 && y >= 20 && y < 140) {
        const shade = 0.45 + 0.9 * (1 - (y - 20) / 120);             // 1.35 at top -> 0.45 at bottom
        put(x, y, [20 * shade, 60 * shade, 160 * shade]);           // blue armour, shaded
      }
      if (x >= 30 && x < 90 && y >= 90 && y < 100) put(x, y, [200, 160, 60]);   // gold belt
      if (x >= 50 && x < 60 && y >= 40 && y < 50) put(x, y, [190, 20, 25]);     // red eye
    }
  }
  return { data, width: w, height: h };
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('finds the main colours of the figure', () => {
  const { clusters } = segmentImage(figure(), 4);
  assert.equal(clusters.length, 4);
  const hexes = clusters.map((c) => rgb(c.hex));
  for (const expected of [[214, 211, 205], [200, 160, 60], [190, 20, 25]]) {
    const best = Math.min(...hexes.map((h) => dist(h, expected)));
    assert.ok(best < 40, `no cluster close to ${expected} (closest ${best.toFixed(0)})`);
  }
  const blue = hexes.find((h) => h[2] > h[0] + 40 && h[2] > h[1] + 40);
  assert.ok(blue, 'a blue cluster exists');
});

test('a shaded colour stays in one zone (lightness is down-weighted)', () => {
  const img = figure();
  const { clusters } = segmentImage(img, 4);
  const blueIdx = clusters.findIndex((c) => {
    const [r, g, b] = rgb(c.hex);
    return b > r + 40 && b > g + 40;
  });
  // Bright top and dark bottom of the armour belong to the same blue zone.
  for (const y of [25, 130]) {
    const i = y * img.width + 40;
    assert.ok(clusters[blueIdx].mask[i] > 200, `armour pixel at y=${y} not in the blue zone`);
  }
});

test('masks are a partition of the image (they add up to ~255)', () => {
  const img = figure();
  const { clusters } = segmentImage(img, 5);
  for (let i = 0; i < img.width * img.height; i += 37) {
    const sum = clusters.reduce((acc, c) => acc + c.mask[i], 0);
    assert.ok(Math.abs(sum - 255) <= 3, `pixel ${i}: masks sum to ${sum}`);
  }
});

test('the background is the colour dominating the border', () => {
  const { clusters, background } = segmentImage(figure(), 4);
  assert.ok(background >= 0, 'background detected');
  assert.ok(dist(rgb(clusters[background].hex), [214, 211, 205]) < 25);
});

test('no background when the subject fills the frame', () => {
  const w = 40, h = 40;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const stripe = Math.floor((i % w) / 10) % 2;   // vertical stripes reach every border
    data.set(stripe ? [200, 30, 30, 255] : [30, 30, 200, 255], i * 4);
  }
  const { background } = segmentImage({ data, width: w, height: h }, 2);
  assert.equal(background, -1);
});

test('clusters are sorted by size and count is clamped', () => {
  const { clusters } = segmentImage(figure(), 99);
  assert.ok(clusters.length <= 16);
  for (let i = 1; i < clusters.length; i++) assert.ok(clusters[i - 1].weight >= clusters[i].weight);
});

test('a coloured photo is not flagged as greyscale', () => {
  assert.equal(segmentImage(figure(), 4).greyscale, false);
});

test('a grey-primed figure is flagged as greyscale and split by lightness', () => {
  const img = figure();
  const d = img.data;
  for (let p = 0; p < d.length; p += 4) {
    const g = Math.round(d[p] * 0.3 + d[p + 1] * 0.59 + d[p + 2] * 0.11);
    d[p] = d[p + 1] = d[p + 2] = g;
  }
  const { greyscale, clusters } = segmentImage(img, 3);
  assert.equal(greyscale, true);
  const lightness = clusters.map((c) => parseInt(c.hex.slice(1, 3), 16)).sort((a, b) => a - b);
  assert.ok(lightness.at(-1)! - lightness[0] > 60, `zones should span light and dark (${lightness})`);
});

test('a backdrop with a vignette (several shades) is merged into one background', () => {
  const w = 120, h = 160;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // light grey backdrop, darker towards the corners
      const d = Math.hypot((x - w / 2) / (w / 2), (y - h / 2) / (h / 2));
      let v = Math.round(225 - 70 * Math.min(1, d));
      let px = [v, v, v - 4];
      if (x >= 35 && x < 85 && y >= 30 && y < 140) px = [60, 62, 66]; // dark grey primed figure
      data.set([...px, 255], (y * w + x) * 4);
    }
  }
  const { clusters, background } = segmentImage({ data, width: w, height: h }, 5);
  assert.ok(background >= 0, 'background detected');
  const bg = clusters[background].mask;
  assert.ok(bg[2 * w + 2] > 200 && bg[80 * w + 60 - 50] > 200, 'corner and side of the backdrop are background');
  assert.ok(bg[80 * w + 60] < 30, 'the figure is not background');
  for (let i = 0; i < w * h; i += 41) {
    const sum = clusters.reduce((a, c) => a + c.mask[i], 0);
    assert.ok(Math.abs(sum - 255) <= 3, 'still a partition');
  }
});
