import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFormat, parseListText, roleOf, sumCosts } from '../../src/play/lib/listImport.ts';

// Invented list in the layout of the official app export (no real unit names).
const APP = `Mist Night List (1.240 Points)

Order of the Mist
Veil Host (2 Detachment Points)
Incursion (1.250 Points)

ATTACHED UNITS

Attached unit 1

Mist Warden (80 Points)
• Attached as: Leader (Character)
• Warlord
• 1x Lightning lance
• Enhancements: Fog Mantle

Mist Guardians (200 Points)
• Attached as: Bodyguard
• 1x Guardian Captain
◦ 1x Fog pistol
◦ 1x Halberd
• 4x Mist Guardian
◦ 4x Fog pistol
◦ 4x Halberd

CHARACTERS

Lone Seer (60 Points)
• 1x Staff

BATTLELINE

Fog Walkers (100 Points)
• 1x Walker Chief
◦ 1x Mist rifle
• 9x Fog Walker
◦ 9x Mist rifle
◦ 1x Heavy fog cannon

DEDICATED TRANSPORTS

Cloud Skiff (90 Points)
• 1x Armoured hull
• 2x Twin fog cannon

OTHER DATASHEETS

Cloud Skiff (110 Points)
• 1x Armoured hull

Exported with App Version: v1.0.0 (1), Data Version: v1`;

test('official app export: header, sections, models, wargear, attached units', () => {
  const r = parseListText(APP);
  assert.equal(r.format, 'app');
  assert.equal(r.name, 'Mist Night List');
  assert.equal(r.faction, 'Order of the Mist');
  assert.equal(r.total, 1240);
  assert.equal(r.limit, 1250);
  assert.deepEqual(r.units.map((u) => [u.name, u.role, u.count, u.cost]), [
    ['Mist Warden', 'leader', 1, 80],
    ['Mist Guardians', 'troop', 5, 200],
    ['Lone Seer', 'leader', 1, 60],
    ['Fog Walkers', 'troop', 10, 100],
    ['Cloud Skiff', 'support', 1, 90],
    ['Cloud Skiff', 'support', 1, 110],
  ]);
  const [warden, guardians] = r.units;
  assert.equal(warden.leader, true);
  assert.equal(warden.group, 0);
  assert.equal(guardians.group, 0);
  assert.deepEqual(warden.notes, [['Warlord', ''], ['Enhancements', 'Fog Mantle']]);
  // Same wargear on the captain and the others is merged
  assert.deepEqual(guardians.gear, [{ n: 5, name: 'Fog pistol' }, { n: 5, name: 'Halberd' }]);
  assert.deepEqual(r.units[4].gear, [{ n: 1, name: 'Armoured hull' }, { n: 2, name: 'Twin fog cannon' }]);
  assert.equal(sumCosts(r.units), 640);
});

test('free format: one unit per line with points anywhere', () => {
  const r = parseListText('Heroes\nMist Warden - 80 pts\nTroops\n10x Fog Walkers ..... 100pts\nCloud Skiff x2 [180 points]');
  assert.equal(r.format, 'free');
  assert.deepEqual(r.units.map((u) => [u.name, u.role, u.count, u.cost]), [
    ['Mist Warden', 'leader', 1, 80],
    ['Fog Walkers', 'troop', 10, 100],
    ['Cloud Skiff', 'troop', 2, 180],
  ]);
  assert.equal(r.total, 360);
});

test('format detection and roles from section titles', () => {
  assert.equal(detectFormat('• 1x Halberd'), 'app');
  assert.equal(detectFormat('Unit - 50 pts'), 'free');
  assert.equal(roleOf('EPIC HERO'), 'leader');
  assert.equal(roleOf('DEDICATED TRANSPORTS'), 'support');
  assert.equal(roleOf('Something'), null);
});

test('profiles in parentheses are never imported, only names', () => {
  const r = parseListText('Unit (50 Points)\n• 2x Rifle (24", A2, S4)');
  assert.deepEqual(r.units[0].gear, [{ n: 2, name: 'Rifle' }]);
});
