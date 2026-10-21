import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOverLimit, parseArmyList } from '../../src/play/lib/listParser.ts';

test('explicit total line wins, with thousands separator', () => {
  const p = parseArmyList(`Faction: Space knights
Captain ........ 95 pts
Squad of 10 .... 180 pts
TOTAL: 1,995 pts`);
  assert.equal(p.faction, 'Space knights');
  assert.equal(p.points, 1995);
  assert.equal(p.source, 'total');
});

test('points on the first line are read as the army total', () => {
  const p = parseArmyList(`Undead legion (995 points)
Lord on foot (120 points)
Skeleton warriors x20 (200 points)`);
  assert.equal(p.points, 995);
  assert.equal(p.source, 'header');
  assert.equal(p.faction, 'Undead legion');
});

test('falls back to the sum of unit points', () => {
  const p = parseArmyList(`My orcs
Boss - 80pts
Boyz - 170pts
Truck - 250pts`);
  assert.equal(p.points, 500);
  assert.equal(p.source, 'sum');
  assert.equal(p.faction, 'My orcs');
});

test('Japanese list: faction label and total', () => {
  const p = parseArmyList(`陣営：機械教団
司令官　90ポイント
歩兵分隊　100ポイント
合計：990ポイント`);
  assert.equal(p.faction, '機械教団');
  assert.equal(p.points, 990);
  assert.equal(p.source, 'total');
});

test('no points at all', () => {
  const p = parseArmyList('Just some notes about my army');
  assert.equal(p.points, null);
  assert.equal(p.source, 'none');
  assert.equal(p.faction, 'Just some notes about my army');
});

test('empty text', () => {
  assert.deepEqual(parseArmyList('  \n '), { faction: null, points: null, source: 'none' });
});

test('over-limit warning', () => {
  assert.equal(isOverLimit(parseArmyList('Total 1010 pts'), 1000), true);
  assert.equal(isOverLimit(parseArmyList('Total 1000 pts'), 1000), false);
  assert.equal(isOverLimit(parseArmyList('no points'), 1000), false);
});
