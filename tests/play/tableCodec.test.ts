import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../../src/play/lib/tableGen.ts';
import { MAX_CODE, decodeTable, encodeTable } from '../../src/play/lib/tableCodec.ts';
import { analyse, footprint, makePiece, mirrorPiece, polygonArea, rotateHandle } from '../../src/play/lib/terrain.ts';

test('a table survives the link code (to the half inch)', async () => {
  const t = generate({ mode: 'competitive', size: 1, density: 'dense', theme: 'city', seed: 4242 });
  const back = await decodeTable(await encodeTable(t));
  assert.equal(back.width, t.width);
  assert.equal(back.deployment, t.deployment);
  assert.equal(back.mission, t.mission);
  assert.equal(back.mode, 'competitive');
  assert.equal(back.pieces.length, t.pieces.length);
  t.pieces.forEach((p, i) => {
    const q = back.pieces[i];
    assert.equal(q.kind, p.kind);
    assert.equal(q.shape, p.shape);
    assert.equal(q.cover, p.cover);
    assert.deepEqual(q.traits, p.traits);
    assert.ok(Math.abs(q.x - p.x) <= 0.25 && Math.abs(q.w - p.w) <= 0.25);
  });
});

test('a full custom table stays under the database limit', async () => {
  const pieces = Array.from({ length: 40 }, (_, i) => ({ ...makePiece('woods', 3 + i, 5 + i, 100000 + i), rot: i * 7, traits: ['difficult', 'hazardous'] as const }));
  const t = { ...generate({ mode: 'casual', size: 3, density: 'standard', theme: 'city', seed: 1 }), mode: 'custom' as const, mission: '', name: 'Ma table de club, version longue', pieces: pieces.map((p) => ({ ...p, traits: [...p.traits] })) };
  const code = await encodeTable(t);
  assert.ok(code.length < MAX_CODE, `code length ${code.length}`);
  const back = await decodeTable(code);
  assert.equal(back.name, t.name);
  assert.equal(back.mode, 'custom');
  assert.equal(back.pieces[3].rot, 21);
});

test('bad or hostile codes are refused or clamped', async () => {
  await assert.rejects(decodeTable('x<script>'));
  await assert.rejects(decodeTable('jbm90IGpzb24'));
  const json = (o: unknown) => 'j' + Buffer.from(JSON.stringify(o)).toString('base64url');
  const t = await decodeTable(json({ v: 1, w: 9999, h: -3, d: 99, p: [[99, 99, 1e9, -5, 0, 999, 12345, 9, 255, 'x']], o: [[1e9, 1e9]], m: 'not_a_mission', n: 'x'.repeat(500) }));
  assert.equal(t.width, 96);
  assert.equal(t.height, 12);
  assert.equal(t.deployment, 'none');
  assert.equal(t.mission, '');
  assert.equal(t.name?.length, 60);
  const p = t.pieces[0];
  assert.equal(p.kind, 'custom');
  assert.equal(p.shape, 'rect');
  assert.ok(p.x <= 96 && p.y >= 0 && p.w >= 1 && p.h <= 30 && p.rot >= 0 && p.rot < 360);
  assert.equal(t.objectives[0].x, 96);
});

test('footprints, mirror and handle', () => {
  const p = { ...makePiece('building', 10, 10, 1), w: 4, h: 2 };
  assert.equal(polygonArea(footprint(p)), 8);
  const turned = footprint({ ...p, rot: 90 });
  assert.ok(turned.every(([x, y]) => Math.abs(x - 10) <= 1.0001 && Math.abs(y - 10) <= 2.0001));
  const m = mirrorPiece(p, 44, 60, 2);
  assert.deepEqual([m.x, m.y, m.rot], [34, 50, 180]);
  assert.deepEqual(rotateHandle(p).map((n) => Math.round(n * 10) / 10), [10, 7.5]);
  const L = polygonArea(footprint({ ...p, shape: 'L', w: 10, h: 10 }));
  assert.ok(L > 50 && L < 80);
});

test('the layout check spots open tables, fire lanes and blocked objectives', () => {
  const base = { width: 44, height: 60, zones: generate({ mode: 'casual', size: 1, density: 'standard', theme: 'city', seed: 3 }).zones, objectives: [{ x: 22, y: 30 }] };
  const empty = analyse({ ...base, pieces: [makePiece('hill', 10, 30, 1)] });
  assert.ok(empty.tips.includes('open'));
  assert.ok(empty.tips.includes('noBlocking'));
  const wall = analyse({ ...base, pieces: [{ ...makePiece('building', 22, 30, 1), w: 44, h: 4 }] });
  assert.equal(wall.blockedLanes, 1);
  assert.ok(wall.tips.includes('objectiveBlocked'));
  const narrow = analyse({ ...base, pieces: [makePiece('container', 10, 30, 1), makePiece('container', 10, 33, 2)] });
  assert.equal(narrow.narrow, 1);
  const off = analyse({ ...base, pieces: [makePiece('building', 1, 1, 1)] });
  assert.equal(off.offTable, 1);
});

test('the wanted number of pieces is placed', () => {
  for (const count of [0, 4, 12]) {
    const t = generate({ mode: 'casual', size: 1, density: 'standard', theme: 'city', seed: 9, count });
    assert.equal(t.pieces.length, count);
  }
});
