import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISPOSITIONS, VARIANTS, findLayout, layoutTable, primaryMission } from '../../src/play/lib/layouts.ts';
import { LAYOUT_ROWS } from '../../src/play/lib/layouts2026.ts';
import { CARD_IDS } from '../../src/play/lib/deployCards.ts';
import { MAX_CODE, decodeTable, encodeTable } from '../../src/play/lib/tableCodec.ts';
import { footprint } from '../../src/play/lib/terrain.ts';

test('45 layouts: every pair of dispositions, A B and C', () => {
  assert.equal(LAYOUT_ROWS.length, 45);
  for (const a of DISPOSITIONS) for (const b of DISPOSITIONS) for (const v of VARIANTS) assert.ok(findLayout(a, b, v), `${a} ${b} ${v}`);
});

test('every layout: a card, two home and two expansion objectives, a central one, pieces on the table', () => {
  for (const r of LAYOUT_ROWS) {
    assert.ok(CARD_IDS.includes(r.card));
    const kinds = r.o.map((o) => o[2]).sort().join('');
    assert.match(kinds, /^01223{1,2}$/, `${r.a}/${r.b}/${r.v}: ${kinds}`);
    assert.ok(r.p.length >= 10, `${r.a}/${r.b}/${r.v}: ${r.p.length} pieces`);
    const t = layoutTable(r.a, r.b, r.v)!;
    for (const p of t.pieces) for (const [x, y] of footprint(p)) assert.ok(x > -1.5 && x < 45.5 && y > -1.5 && y < 61.5, `${r.a}/${r.b}/${r.v} piece at ${p.x},${p.y}`);
  }
});

test('a layout fits in a game map code and comes back the same', async () => {
  let longest = 0;
  for (const r of LAYOUT_ROWS) {
    const t = layoutTable(r.a, r.b, r.v)!;
    const code = await encodeTable(t);
    longest = Math.max(longest, code.length);
    const back = await decodeTable(code);
    assert.equal(back.pieces.length, t.pieces.length);
    assert.equal(back.deployment, r.card);
    assert.deepEqual(back.objectives.map((o) => o.kind), t.objectives.map((o) => o.kind));
    assert.ok(back.pieces.some((p) => p.shape === 'wedge') === t.pieces.some((p) => p.shape === 'wedge'));
  }
  assert.ok(longest <= MAX_CODE, `longest code ${longest}`);
});

test('primary missions follow the published pairing table', () => {
  assert.equal(primaryMission('take', 'take'), 'Battlefield Dominance');
  assert.equal(primaryMission('recon', 'purge'), 'Triangulation');
  assert.equal(primaryMission('assets', 'recon'), 'Vanguard Operation');
  const t = layoutTable('purge', 'assets', 'B')!;
  assert.equal(t.refs?.length, 3);
  assert.match(t.refs![2].l!, /Destroyer.s Wrath \/ Vital Link/);
});

test('terrain-area marks: in the layouts and kept by the map code', async () => {
  const total = LAYOUT_ROWS.reduce((n, r) => n + r.m.length, 0);
  assert.ok(total > 100, `${total} marks`);
  const t = layoutTable('take', 'purge', 'A')!;
  const back = await decodeTable(await encodeTable(t));
  assert.deepEqual(back.areas, t.areas);
  assert.ok(t.pieces.some((p) => p.cover === 'blocking'), 'dense terrain blocks sight');
});
