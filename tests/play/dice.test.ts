import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, atLeastK, diceStats, rollDice, successChance, type DiceConfig } from '../../src/play/lib/dice.ts';

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('success chance per threshold and reroll', () => {
  close(successChance(4, 'none'), 0.5);
  close(successChance(3, 'ones'), 2 / 3 + 2 / 3 / 6);
  close(successChance(4, 'fails'), 0.75);
  close(successChance(7, 'none'), 0);
});

test('expected values follow the chain', () => {
  const s = diceStats(DEFAULT_CONFIG); // 12 dice, 3+, 4+, save 5+, 1 damage
  close(s.perDie, (2 / 3) * 0.5 * (2 / 3));
  close(s.expected[3], 12 * s.perDie);
  close(s.expectedDamage, 12 * s.perDie);
});

test('damage distribution sums to 1 and matches the mean, with dice damage', () => {
  const c: DiceConfig = { ...DEFAULT_CONFIG, dice: 10, save: 7, damage: 'D3' };
  const s = diceStats(c);
  close(s.damage.reduce((a, b) => a + b, 0), 1);
  close(s.damage.reduce((a, p, k) => a + p * k, 0), s.expectedDamage);
  close(atLeastK(s.damage, 0), 1);
});

test('fixed damage multiplies the unsaved count', () => {
  const s = diceStats({ ...DEFAULT_CONFIG, dice: 3, damage: 2 });
  assert.equal(s.damage.length, 7);
  close(s.damage[1], 0);
  close(s.damage[2], 3 * s.perDie * (1 - s.perDie) ** 2);
});

test('a roll is reproducible and consistent', () => {
  const a = rollDice({ ...DEFAULT_CONFIG, damage: 'D6' }, 42);
  const b = rollDice({ ...DEFAULT_CONFIG, damage: 'D6' }, 42);
  assert.deepEqual(a.tokens.map((t) => t.failedAt), b.tokens.map((t) => t.failedAt));
  assert.equal(a.lists[0].length, 12);
  for (let k = 0; k < 3; k++) assert.equal(a.lists[k + 1].length + a.fails[k], a.lists[k].length);
  assert.equal(a.totalDamage, a.lists[3].reduce((s, t) => s + t.damage, 0));
  for (const t of a.lists[3]) assert.ok(t.damage >= 1 && t.damage <= 6);
});

test('no save lets every wound through', () => {
  const r = rollDice({ ...DEFAULT_CONFIG, save: 7 }, 3);
  assert.equal(r.lists[3].length, r.lists[2].length);
});
