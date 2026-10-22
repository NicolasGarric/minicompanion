import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addEnclosedBackdrop, growFromBorder, growPart, lumaMaps, subjectCrop } from '../../src/paint/engine/parts.ts';
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


/** White backdrop, a grey figure with a ring (an enclosed pocket of backdrop inside it). */
function ringPhoto() {
  const w = 200, h = 200;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - 100, y - 100);
      if (d < 40 && d > 18) data.set([110, 110, 112, 255], (y * w + x) * 4); // the ring
      if (x > 95 && x < 105 && y >= 140 && y < 170) data.set([90, 90, 92, 255], (y * w + x) * 4); // a stem
    }
  }
  return { data, width: w, height: h };
}

test('a pocket of backdrop enclosed by the figure is background', () => {
  const img = ringPhoto();
  const maps = lumaMaps(img);
  const fromBorder = growFromBorder(maps);
  assert.ok(fromBorder[100 * 200 + 100] < 128, 'the walk from the border cannot reach the hole');
  const bg = addEnclosedBackdrop(img, maps, fromBorder);
  assert.ok(bg[100 * 200 + 100] > 200, 'the hole is backdrop');
  assert.ok(bg[100 * 200 + 70] < 30, 'the ring itself is not');
});

test('crops to the figure with a margin', () => {
  const crop = subjectCrop(ringPhoto());
  assert.ok(crop, 'crop proposed');
  assert.ok(crop!.x > 40 && crop!.x < 62 && crop!.y > 40 && crop!.y < 62, `top-left ${crop!.x},${crop!.y}`);
  assert.ok(crop!.x + crop!.width > 140 && crop!.y + crop!.height > 170, 'figure fully inside');
});

test('no crop when the figure already fills the photo', () => {
  const w = 60, h = 60;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([120, 60, 40, 255], i * 4);
  assert.equal(subjectCrop({ data, width: w, height: h }), null);
});
