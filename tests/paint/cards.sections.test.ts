import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanInfo, isSection, moveToSection, searchCards, sectionRow, splitSections, type InfoLine } from '../../src/paint/hobby/cards.ts';

const rows: InfoLine[] = [
  { l: 'Move', t: 'n', v: 6 },
  sectionRow('Ranged weapons'),
  { l: 'Fog rifle', t: 't', v: '24"' },
  sectionRow('Abilities'),
  { l: 'Veil', t: 't', v: 'Hidden' },
];

test('sections split the rows in the player order', () => {
  const { lead, sections } = splitSections(rows);
  assert.deepEqual(lead.map((x) => x.l), ['Move']);
  assert.deepEqual(sections.map((s) => [s.title, s.rows.map((x) => x.l)]), [['Ranged weapons', ['Fog rifle']], ['Abilities', ['Veil']]]);
});

test('a row moves to the end of a section, or before the first one', () => {
  assert.deepEqual(moveToSection(rows, 0, 1).map((x) => x.l), ['Ranged weapons', 'Fog rifle', 'Abilities', 'Veil', 'Move']);
  assert.deepEqual(moveToSection(rows, 4, 0).map((x) => x.l), ['Move', 'Ranged weapons', 'Fog rifle', 'Veil', 'Abilities']);
  assert.deepEqual(moveToSection(rows, 2, -1).map((x) => x.l), ['Move', 'Fog rifle', 'Ranged weapons', 'Abilities', 'Veil']);
});

test('a section is a plain text row: it survives cleaning and is not searched by its marker', () => {
  const kept = cleanInfo(rows);
  assert.equal(kept.filter(isSection).length, 2);
  assert.equal(searchCards([{ name: 'X', info: rows }], 'section').length, 0);
  assert.equal(searchCards([{ name: 'X', info: rows }], 'ranged').length, 1);
});
