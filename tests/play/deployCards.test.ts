import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_IDS, cardObjectives, cardZones } from '../../src/play/lib/deployCards.ts';
import { generate } from '../../src/play/lib/tableGen.ts';
import { footprint, inPolygon } from '../../src/play/lib/terrain.ts';
import { decodeTable, encodeTable } from '../../src/play/lib/tableCodec.ts';

const near = (a: number, b: number, eps = 0.02) => Math.abs(a - b) < eps;

test('every card: zones mirror each other, home objectives sit in their own zone', () => {
  for (const id of CARD_IDS) {
    const [a, b] = cardZones(id, 44, 60);
    for (const [x, y] of a) assert.ok(b.some(([u, v]) => near(u, 44 - x) && near(v, 60 - y)), `${id}: zone B mirrors (${x}, ${y})`);
    const obj = cardObjectives(id, 44, 60);
    assert.deepEqual(obj.map((o) => o.kind), ['central', 'homeA', 'homeB', 'expansion', 'expansion']);
    assert.ok(inPolygon(obj[1].x, obj[1].y, a), `${id}: home A in zone A`);
    assert.ok(inPolygon(obj[2].x, obj[2].y, b), `${id}: home B in zone B`);
    assert.ok(!inPolygon(obj[0].x, obj[0].y, a) && !inPolygon(obj[0].x, obj[0].y, b), `${id}: centre in no man's land`);
  }
});

test('measures read from the cards', () => {
  assert.deepEqual(cardObjectives('cp_strips', 44, 60).map((o) => [o.x, o.y]), [[22, 30], [10, 30], [34, 30], [25, 10], [19, 50]]);
  assert.deepEqual(cardObjectives('cp_step', 44, 60).map((o) => [o.x, o.y]), [[22, 30], [11, 14], [33, 46], [38, 24], [6, 36]]);
  // Two central points 6" from the centre, along the line between the territories
  const two = cardObjectives('cp_bands', 44, 60, true).filter((o) => o.kind === 'central');
  assert.deepEqual(two.map((o) => [o.x, o.y]), [[16, 30], [28, 30]]);
  const q = cardObjectives('cp_quarters', 44, 60, true).filter((o) => o.kind === 'central');
  assert.ok(q.every((o) => near(Math.hypot(o.x - 22, o.y - 30), 6)));
});

test('a landscape table gets the card turned', () => {
  const [a] = cardZones('cp_bands', 60, 44);
  assert.ok(a.every(([x]) => x <= 18 + 1e-9), 'the 18" band is along the short (left) edge');
});

test('competitive tables: a card, a terrain feature on every objective point', () => {
  for (const seed of [1, 7, 42, 999, 31337, 5555]) {
    const t = generate({ mode: 'competitive', size: 1, density: 'standard', theme: 'city', seed });
    assert.ok(CARD_IDS.includes(t.deployment as never), `card deployment (seed ${seed})`);
    assert.ok(t.objectives.every((o) => o.kind));
    for (const o of t.objectives) {
      assert.ok(t.pieces.some((p) => inPolygon(o.x, o.y, footprint(p))), `seed ${seed}: objective at ${o.x},${o.y} is covered`);
    }
    assert.equal(t.refs?.[0]?.u.includes('Deployment-deck'), true);
  }
});

test('objective kinds survive the map code; old codes still read', async () => {
  const t = generate({ mode: 'competitive', size: 1, density: 'light', theme: 'forest', seed: 3 });
  const back = await decodeTable(await encodeTable(t));
  assert.deepEqual(back.objectives.map((o) => o.kind), t.objectives.map((o) => o.kind));
  assert.equal(back.deployment, t.deployment);
  const plain = await decodeTable(await encodeTable({ ...t, objectives: [{ x: 10, y: 10 }], deployment: 'long' }));
  assert.deepEqual(plain.objectives, [{ x: 10, y: 10 }]);
});
