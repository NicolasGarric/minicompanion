import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addCard, cleanGroups, cleanInfo, diffInfo, legacyInfo, linkToAbove, markRows, memberUp, moveGroup, removeCard, searchCards, sumOf, toggleType, unlink,
  MAX_CARDS, type InfoLine,
} from '../../src/paint/hobby/cards.ts';

const N = (l: string, v: number): InfoLine => ({ l, t: 'n', v });
const T = (l: string, v: string): InfoLine => ({ l, t: 't', v });

test('the info list keeps what the database accepts', () => {
  const out = cleanInfo([N(' Endurance ', 8), T('', 'no label'), { l: 'Move', t: 'n', v: '6,5' as unknown as number }, T('Rule', 'x'.repeat(600))]);
  assert.deepEqual(out.map((x) => x.l), ['Endurance', 'Move', 'Rule']);
  assert.equal(out[1].v, 6.5, 'a typed number is read');
  assert.equal(String(out[2].v).length, 500);
  assert.equal(cleanInfo(Array.from({ length: 50 }, (_, i) => N(`L${i}`, i))).length, 40);
});

test('a row changes type without losing what was written', () => {
  assert.deepEqual(toggleType(N('Endurance', 8)), T('Endurance', '8'));
  assert.deepEqual(toggleType(T('Move', '7"')), N('Move', 7));
  assert.deepEqual(toggleType(T('Rule', 'Riposte')), N('Rule', 0));
});

test('older units bring their points, stars and note as rows', () => {
  const rows = legacyInfo({ points: 150, stars: 2, note: 'Sand bases' }, { points: 'Points', stars: 'Stars', note: 'Note' });
  assert.deepEqual(rows, [N('Points', 150), T('Stars', '★★'), T('Note', 'Sand bases')]);
  assert.deepEqual(legacyInfo({}, { points: 'P', stars: 'S', note: 'N' }), []);
});

test('deck total and rule search', () => {
  const cards = [
    { name: 'Guard', info: [N('Points', 150), T('Rule', 'Riposte: strikes first')] },
    { name: 'Captain', info: [N('points', 120), T('Rule', 'Command')] },
    { name: 'Scouts', info: [N('Pts', 90), T('Rule', 'Infiltration')] },
  ];
  assert.equal(sumOf(cards, ['Points', 'pts']), 360);
  assert.deepEqual(searchCards(cards, 'riposte').map((c) => c.name), ['Guard']);
  assert.deepEqual(searchCards(cards, 'rule com').map((c) => c.name), ['Captain'], 'every word must match');
  assert.deepEqual(searchCards(cards, '  '), []);
});

test('scroll order: groups move as a block, link and unlink', () => {
  let g = [['guard', 'captain'], ['scouts'], ['banner'], ['walker']];
  g = moveGroup(g, 0, 1);
  assert.deepEqual(g, [['scouts'], ['guard', 'captain'], ['banner'], ['walker']]);
  assert.equal(moveGroup(g, 0, -1), g, 'nothing above the first group');
  g = linkToAbove(g, 2);
  assert.deepEqual(g, [['scouts'], ['guard', 'captain', 'banner'], ['walker']]);
  g = memberUp(g, 1, 2);
  assert.deepEqual(g[1], ['guard', 'banner', 'captain']);
  g = unlink(g, 1, 1);
  assert.deepEqual(g, [['scouts'], ['guard', 'captain'], ['banner'], ['walker']]);
  assert.deepEqual(removeCard(g, 'scouts'), [['guard', 'captain'], ['banner'], ['walker']], 'an empty group disappears');
});

test('adding a linked unit puts it with its squad', () => {
  let g = [['guard'], ['walker']];
  g = addCard(g, 'captain', 'guard');
  assert.deepEqual(g, [['guard', 'captain'], ['walker']]);
  assert.equal(addCard(g, 'captain', 'guard'), g, 'a card is in a deck once');
  assert.deepEqual(addCard(g, 'scouts', 'missing'), [['guard', 'captain'], ['walker'], ['scouts']]);
  const full = Array.from({ length: MAX_CARDS }, (_, i) => [`u${i}`]);
  assert.equal(addCard(full, 'one-more'), full, `at most ${MAX_CARDS} cards`);
});

test('unknown and repeated cards leave the order', () => {
  assert.deepEqual(cleanGroups([['a', 'x'], ['a'], ['x'], ['b']], new Set(['a', 'b'])), [['a'], ['b']]);
});

test('campaign history: what changed between two lists', () => {
  const before = [N('Move', 5), N('Endurance', 8), T('Rule', 'Shield wall'), T('Rule', 'Riposte')];
  const after = [N('Move', 4), N('Endurance', 9), T('Rule', 'Riposte'), T('Rule', 'Veteran')];
  const d = diffInfo(before, after);
  assert.deepEqual(d.find((c) => c.label === 'Move'), { label: 'Move', kind: 'down', before: 5, after: 4 });
  assert.deepEqual(d.find((c) => c.label === 'Endurance'), { label: 'Endurance', kind: 'up', before: 8, after: 9 });
  assert.deepEqual(d.find((c) => c.kind === 'changed'), { label: 'Rule', kind: 'changed', before: 'Shield wall', after: 'Veteran' },
    'two rules called "Rule": the one kept matches, the other counts as changed');
  assert.deepEqual(diffInfo(before, before), []);
  assert.deepEqual(diffInfo([], [T('Rule', 'Veteran')]), [{ label: 'Rule', kind: 'added', after: 'Veteran' }]);
  assert.deepEqual(diffInfo([N('HP', 8)], []), [{ label: 'HP', kind: 'removed', before: 8 }]);
});

test('a campaign card tints what changed since it joined', () => {
  const start = [N('Endurance', 8), T('Rule', 'Shield wall'), T('Weapon', 'Lance')];
  const now = [N('Endurance', 9), T('Weapon', 'Lance'), T('Bonus', 'Veteran')];
  const { rows, lost } = markRows(start, now);
  assert.deepEqual(rows[0], { ...N('Endurance', 9), changed: true, was: 8 });
  assert.equal(rows[1].changed, undefined, 'unchanged rows stay plain');
  assert.equal(rows[2].changed, true, 'a new row is tinted');
  assert.deepEqual(lost, [T('Rule', 'Shield wall')], 'a lost rule is listed apart');
});
