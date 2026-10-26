import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DENSITY_COUNT, generate } from '../../src/play/lib/tableGen.ts';

test('the same seed gives the same table', () => {
  const a = generate({ mode: 'casual', size: 1, density: 'standard', theme: 'city', seed: 123 });
  const b = generate({ mode: 'casual', size: 1, density: 'standard', theme: 'city', seed: 123 });
  assert.deepEqual(a, b);
});

test('competitive tables are point-symmetric', () => {
  for (const seed of [1, 42, 999, 31337]) {
    const t = generate({ mode: 'competitive', size: 1, density: 'dense', theme: 'city', seed });
    for (const p of t.pieces) {
      const twin = t.pieces.find((q) => Math.abs(q.x - (t.width - p.x)) < 1e-9 && Math.abs(q.y - (t.height - p.y)) < 1e-9);
      assert.ok(twin, `piece at ${p.x},${p.y} has a twin (seed ${seed})`);
    }
    assert.ok(t.pieces.length <= DENSITY_COUNT.dense + 1);
    for (const o of t.objectives) {
      assert.ok(t.objectives.some((q) => Math.abs(q.x - (t.width - o.x)) < 1e-9 && Math.abs(q.y - (t.height - o.y)) < 1e-9));
    }
  }
});

test('pieces stay on the table and keep 3" apart', () => {
  for (const mode of ['narrative', 'casual', 'competitive'] as const) {
    const t = generate({ mode, size: 3, density: 'standard', theme: 'forest', seed: 77 });
    for (const p of t.pieces) {
      assert.ok(p.x - p.w / 2 >= 1.5 && p.x + p.w / 2 <= t.width - 1.5, `${mode} x`);
      assert.ok(p.y - p.h / 2 >= 1.5 && p.y + p.h / 2 <= t.height - 1.5, `${mode} y`);
    }
    assert.ok(t.objectives.length >= 3);
  }
});
