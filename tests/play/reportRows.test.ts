import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanGuests, reportRows } from '../../src/play/lib/reportRows.ts';

const res = (id: string, placement: number, score: number | null = null) => ({
  player_id: id, placement, score, gallery_item_id: null, army: null, agreed: true, profile: { display_name: id.toUpperCase(), handle: id },
});

test('players and guests are merged by placement', () => {
  const rows = reportRows({ results: [res('a', 2, 60), res('b', 1)], guests: [{ name: 'Ken', placement: 1, score: 90, army: 'Raiders' }] });
  assert.deepEqual(rows.map((r) => `${r.name}:${r.placement}:${r.guest}`), ['B:1:false', 'Ken:1:true', 'A:2:false']);
  assert.equal(rows[1].score, 90);
  assert.equal(rows[1].result, undefined);
});

test('a report from before the guests still reads', () => {
  assert.deepEqual(reportRows({ results: [res('a', 1)] }).map((r) => r.key), ['a']);
});

test('guest lines are cleaned for the database', () => {
  const g = cleanGuests([
    { name: '  Ken ', placement: 2, score: ' 42.4', army: ' ' },
    { name: '   ', placement: 3, score: '1', army: '' },
    { name: 'Aiko', placement: 3, score: 'abc', army: 'Iron line' },
    { name: 'Too many', placement: 4, score: '', army: '' },
  ], 2);
  assert.deepEqual(g, [
    { name: 'Ken', placement: 2, score: 42, army: null },
    { name: 'Aiko', placement: 3, score: null, army: 'Iron line' },
  ]);
  assert.equal(cleanGuests([{ name: 'x'.repeat(50), placement: 1, score: '', army: '' }], 1)[0].name.length, 40);
});
