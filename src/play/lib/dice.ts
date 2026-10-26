/**
 * Dice maths for the PLAY "Stats" tab: a generic attack sequence of three D6 phases
 * (hit, wound, opponent's save) followed by damage per unsaved die. Exact probabilities for the
 * tables and a seeded roll for the animation. Game-neutral on purpose (no rules of any brand).
 */

export type Reroll = 'none' | 'ones' | 'fails';
/** Damage per unsaved die: a fixed value or a die. */
export type Damage = 1 | 2 | 3 | 4 | 5 | 6 | 'D3' | 'D6';

export interface DiceConfig {
  dice: number;
  hit: { target: number; reroll: Reroll };
  wound: { target: number; reroll: Reroll };
  /** 2–6, or 7 for "no save" */
  save: number;
  damage: Damage;
}

export const DEFAULT_CONFIG: DiceConfig = { dice: 12, hit: { target: 3, reroll: 'none' }, wound: { target: 4, reroll: 'none' }, save: 5, damage: 1 };
export const MAX_DICE = 40;
export const DAMAGES: Damage[] = [1, 2, 3, 4, 5, 6, 'D3', 'D6'];
export const NO_SAVE = 7;

/** Chance that one D6 rolls `target` or more. */
export const atLeast = (target: number) => (target > 6 ? 0 : (7 - target) / 6);

/** Chance of success for one die, rerolls included. */
export function successChance(target: number, reroll: Reroll): number {
  const p = atLeast(target);
  if (reroll === 'ones') return p + p / 6;
  if (reroll === 'fails') return p + (1 - p) * p;
  return p;
}

export type PhaseKey = 'hit' | 'wound' | 'save';
export interface Phase {
  key: PhaseKey;
  target: number;
  reroll: Reroll;
  /** Chance that a die goes on to the next phase (for the save: the save fails) */
  pass: number;
}

export function phases(c: DiceConfig): Phase[] {
  return [
    { key: 'hit', target: c.hit.target, reroll: c.hit.reroll, pass: successChance(c.hit.target, c.hit.reroll) },
    { key: 'wound', target: c.wound.target, reroll: c.wound.reroll, pass: successChance(c.wound.target, c.wound.reroll) },
    { key: 'save', target: c.save, reroll: 'none', pass: 1 - atLeast(c.save) },
  ];
}

/** Distribution of one damage roll: index = damage. */
export function damageDistribution(d: Damage): number[] {
  if (typeof d === 'number') return Array.from({ length: d + 1 }, (_, i) => (i === d ? 1 : 0));
  const faces = d === 'D3' ? 3 : 6;
  return [0, ...Array.from({ length: faces }, () => 1 / faces)];
}
export const damageMean = (d: Damage) => (typeof d === 'number' ? d : d === 'D3' ? 2 : 3.5);

/** P(k successes out of n) for k = 0…n. */
export function binomial(n: number, p: number): number[] {
  const out: number[] = [];
  let c = 1;
  for (let k = 0; k <= n; k++) {
    out.push(c * p ** k * (1 - p) ** (n - k));
    c = (c * (n - k)) / (k + 1);
  }
  return out;
}

function convolve(a: number[], b: number[]): number[] {
  const out = new Array(a.length + b.length - 1).fill(0);
  a.forEach((x, i) => { if (x) b.forEach((y, j) => { out[i + j] += x * y; }); });
  return out;
}

export interface DiceStats {
  phases: Phase[];
  /** Chance that one starting die becomes an unsaved die */
  perDie: number;
  /** Expected dice left after each phase: [start, hits, wounds, unsaved] */
  expected: number[];
  expectedDamage: number;
  /** P(total damage = k) */
  damage: number[];
}

export function diceStats(c: DiceConfig): DiceStats {
  const ph = phases(c);
  const perDie = ph.reduce((a, p) => a * p.pass, 1);
  const expected = [c.dice];
  ph.forEach((p, i) => expected.push(expected[i] * p.pass));
  // Total damage = sum of `u` damage rolls, u being binomial.
  const unsaved = binomial(c.dice, perDie), one = damageDistribution(c.damage);
  let sum = [1];
  const damage = new Array(c.dice * (one.length - 1) + 1).fill(0);
  unsaved.forEach((pu, u) => {
    if (u > 0) sum = convolve(sum, one);
    sum.forEach((x, k) => { damage[k] += pu * x; });
  });
  return { phases: ph, perDie, expected, expectedDamage: c.dice * perDie * damageMean(c.damage), damage };
}

/** P(X ≥ k) from a distribution. */
export const atLeastK = (dist: number[], k: number) => dist.slice(Math.max(0, k)).reduce((a, b) => a + b, 0);

/* ---------- One roll, for the animation ---------- */

export interface RolledDie {
  /** First roll; `value` differs when the die was rerolled. 0 = no roll (no save). */
  first: number;
  value: number;
  rerolled: boolean;
  pass: boolean;
  /** Position among the dice of this phase */
  index: number;
}

export interface Token {
  id: number;
  dice: RolledDie[];
  /** Phase where the die stopped (0–2), or 3 when it got through */
  failedAt: number;
  /** Position among the dice that failed in the same phase */
  failIndex: number;
  /** Damage roll of an unsaved die (first value shown, then the result) */
  damage: number;
}

export interface Roll {
  seed: number;
  config: DiceConfig;
  tokens: Token[];
  /** Tokens alive at the start of each phase; [3] = unsaved dice */
  lists: Token[][];
  fails: number[];
  totalDamage: number;
}

export function seededRandom(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rollDice(c: DiceConfig, seed: number): Roll {
  const rnd = seededRandom(seed);
  const d = (faces: number) => 1 + Math.floor(rnd() * faces);
  const tokens: Token[] = Array.from({ length: c.dice }, (_, id) => ({ id, dice: [], failedAt: 3, failIndex: 0, damage: 0 }));
  const lists: Token[][] = [];
  const fails: number[] = [];
  let alive = tokens;
  phases(c).forEach((ph, k) => {
    lists[k] = alive;
    const next: Token[] = [];
    let failed = 0;
    alive.forEach((tok, index) => {
      if (ph.target > 6) {
        tok.dice[k] = { first: 0, value: 0, rerolled: false, pass: true, index };
        next.push(tok);
        return;
      }
      const first = d(6);
      let value = first;
      const reroll = (ph.reroll === 'ones' && first === 1) || (ph.reroll === 'fails' && first < ph.target);
      if (reroll) value = d(6);
      const success = value >= ph.target;
      const pass = ph.key === 'save' ? !success : success;
      tok.dice[k] = { first, value, rerolled: reroll, pass, index };
      if (pass) next.push(tok);
      else {
        tok.failedAt = k;
        tok.failIndex = failed++;
      }
    });
    fails[k] = failed;
    alive = next;
  });
  lists[3] = alive;
  for (const tok of alive) tok.damage = typeof c.damage === 'number' ? c.damage : d(c.damage === 'D3' ? 3 : 6);
  return { seed, config: c, tokens, lists, fails, totalDamage: alive.reduce((a, t) => a + t.damage, 0) };
}
