import { test } from 'node:test';
import assert from 'node:assert/strict';
import { growPart } from '../../src/paint/engine/parts.ts';
import { splitMask } from '../../src/paint/engine/segment.ts';

/**
 * A grey-primed "miniature": two shaded parts (a pad and a torso) separated by a dark recess line,
 * on a light background. Lightness and edge maps are computed the way the engine does.
 */
function primedMaps() {
  const w = 100, h = 80;
  const lum = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0.85; // background
      if (x >= 10 && x < 90 && y >= 10 && y < 70) v = 0.35 + 0.35 * (1 - (y - 10) / 60); // smooth shading
      if (x >= 49 && x <= 51 && y >= 10 && y < 70) v = 0.08; // recess between the two parts
      lum[y * w + x] = v;
    }
  }
  const edge = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = lum[i + 1] - lum[i - 1];
      const gy = lum[i + w] - lum[i - w];
      edge[i] = Math.min(1, 2 * Math.hypot(gx, gy));
    }
  }
  return { lum, edge, width: w, height: h };
}

test('tapping a part selects that part only, despite its shading', () => {
  const maps = primedMaps();
  const part = growPart(maps, 30, 40);
  const at = (x: number, y: number) => part[y * maps.width + x];
  assert.ok(at(30, 12) > 200 && at(30, 68) > 200, 'bright top and dark bottom of the part are selected');
  assert.ok(at(70, 40) < 30, 'the part on the other side of the recess is not selected');
  assert.ok(at(5, 5) < 30, 'the background is not selected');
});

test('tapping outside the image returns an empty mask', () => {
  const maps = primedMaps();
  assert.equal(growPart(maps, -5, 10).reduce((a, v) => a + v, 0), 0);
});

test('splitting a two-tone zone gives two masks that add up to the original', () => {
  const w = 40, h = 20;
  const data = new Uint8ClampedArray(w * h * 4);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const x = i % w;
    data.set(x < 20 ? [180, 30, 30, 255] : [30, 30, 180, 255], i * 4);
    mask[i] = x === 0 ? 128 : 255;
  }
  const res = splitMask({ data, width: w, height: h }, mask);
  assert.ok(res, 'split found');
  const [a, b] = res!.masks;
  for (let i = 0; i < w * h; i++) assert.equal(a[i] + b[i], mask[i]);
  const reds = res!.hexes.filter((hx) => parseInt(hx.slice(1, 3), 16) > 120);
  assert.equal(reds.length, 1, 'one red half and one blue half');
});

test('a uniform zone cannot be split', () => {
  const w = 30, h = 30;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([90, 90, 200, 255], i * 4);
  assert.equal(splitMask({ data, width: w, height: h }, new Uint8Array(w * h).fill(255)), null);
});

test('a tap right on an outline still selects the part next to it', () => {
  const maps = primedMaps();
  // x = 48 sits on the strong edge just before the recess (x 49..51)
  const part = growPart(maps, 48, 40);
  assert.ok(part[40 * maps.width + 30] > 200, 'the left part is selected');
});
