import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStandings, pairSwiss, roundRobinSchedule, suggestedSwissRounds, type PlayedMatch } from '../../src/play/lib/pairing.ts';

/** Deterministic pseudo-random generator so failures are reproducible. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const players = (n: number) => Array.from({ length: n }, (_, i) => `p${String(i + 1).padStart(2, '0')}`);
const pairKey = (a: string, b: string) => [a, b].sort().join('-');

/** Plays a full Swiss event with random results and returns every match. */
function simulateSwiss(n: number, rounds: number, seed: number) {
  const ids = players(n);
  const random = seeded(seed);
  const matches: PlayedMatch[] = [];
  const rematchFlags: boolean[] = [];
  for (let r = 0; r < rounds; r++) {
    const { pairings, rematches } = pairSwiss(computeStandings(ids, matches), random);
    rematchFlags.push(rematches);
    for (const [a, b] of pairings) {
      if (b === null) {
        matches.push({ a, b: null, result: 'a_win' });
        continue;
      }
      const x = random();
      const result = x < 0.45 ? 'a_win' : x < 0.9 ? 'b_win' : 'draw';
      matches.push({ a, b, result, aScore: Math.floor(random() * 90), bScore: Math.floor(random() * 90) });
    }
  }
  return { ids, matches, rematchFlags };
}

test('standings: match points, then strength of schedule, then VP difference', () => {
  const s = computeStandings(['a', 'b', 'c', 'd'], [
    { a: 'a', b: 'b', result: 'a_win', aScore: 60, bScore: 40 },
    { a: 'c', b: 'd', result: 'a_win', aScore: 80, bScore: 10 },
    { a: 'a', b: 'c', result: 'draw', aScore: 50, bScore: 50 },
    { a: 'b', b: 'd', result: 'a_win', aScore: 70, bScore: 20 },
  ]);
  // Match points: a 4 (W+D), c 4 (W+D), b 3, d 0.
  // a and c are tied: a's opponents scored 3 + 4 = 7, c's opponents 0 + 4 = 4, so a ranks first.
  assert.deepEqual(s.map((x) => x.playerId), ['a', 'c', 'b', 'd']);
  assert.deepEqual(s.map((x) => x.matchPoints), [4, 4, 3, 0]);
  assert.equal(s[0].strengthOfSchedule, 7);
  assert.equal(s[1].strengthOfSchedule, 4);
  assert.equal(s[1].vpDiff, 70); // c: 80 + 50 scored, 10 + 50 conceded
});

test('standings: a bye counts as a win', () => {
  const s = computeStandings(['a', 'b', 'c'], [{ a: 'c', b: null, result: 'a_win' }]);
  const c = s.find((x) => x.playerId === 'c')!;
  assert.equal(c.matchPoints, 3);
  assert.equal(c.hadBye, true);
  assert.equal(c.rank, 1);
});

test('swiss: everyone is paired exactly once per round', () => {
  const { pairings } = pairSwiss(computeStandings(players(8), []), seeded(1));
  const seen = pairings.flat().filter(Boolean);
  assert.equal(pairings.length, 4);
  assert.equal(new Set(seen).size, 8);
});

test('swiss: no rematches over a full 8-player, 3-round event', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const { matches, rematchFlags } = simulateSwiss(8, 3, seed);
    const keys = matches.filter((m) => m.b).map((m) => pairKey(m.a, m.b!));
    assert.equal(new Set(keys).size, keys.length, `rematch with seed ${seed}`);
    assert.ok(rematchFlags.every((f) => !f));
  }
});

test('swiss: no rematches for 16 players over 4 rounds and 32 players over 5 rounds', () => {
  for (const [n, rounds] of [[16, 4], [32, 5]] as const) {
    for (let seed = 1; seed <= 20; seed++) {
      const { matches } = simulateSwiss(n, rounds, seed);
      const keys = matches.filter((m) => m.b).map((m) => pairKey(m.a, m.b!));
      assert.equal(new Set(keys).size, keys.length, `${n} players, seed ${seed}`);
    }
  }
});

test('swiss: odd field gives one bye per round and never two byes to the same player', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { matches } = simulateSwiss(7, 3, seed);
    const byes = matches.filter((m) => m.b === null).map((m) => m.a);
    assert.equal(byes.length, 3);
    assert.equal(new Set(byes).size, 3, `double bye with seed ${seed}`);
  }
});

test('swiss: the bye goes to the lowest-ranked player without a bye', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const matches: PlayedMatch[] = [
    { a: 'a', b: 'b', result: 'a_win' },
    { a: 'c', b: 'd', result: 'a_win' },
    { a: 'e', b: null, result: 'a_win' },
  ];
  const standings = computeStandings(ids, matches);
  const { pairings } = pairSwiss(standings);
  const bye = pairings.find(([, b]) => b === null)![0];
  // e already had a bye; b and d lost; the lowest of them in the standings gets it.
  assert.equal(bye, standings.filter((s) => !s.hadBye).at(-1)!.playerId);
  assert.notEqual(bye, 'e');
});

test('swiss: backtracking avoids a rematch the greedy choice would make', () => {
  // Top two already played each other: greedy top-down would pair them again.
  const ids = ['a', 'b', 'c', 'd'];
  const matches: PlayedMatch[] = [
    { a: 'a', b: 'c', result: 'a_win', aScore: 90, bScore: 0 },
    { a: 'b', b: 'd', result: 'a_win', aScore: 80, bScore: 0 },
    { a: 'a', b: 'b', result: 'a_win', aScore: 50, bScore: 40 },
    { a: 'c', b: 'd', result: 'a_win', aScore: 50, bScore: 40 },
  ];
  const { pairings, rematches } = pairSwiss(computeStandings(ids, matches));
  assert.equal(rematches, false);
  const keys = new Set(matches.map((m) => pairKey(m.a, m.b!)));
  for (const [a, b] of pairings) assert.ok(!keys.has(pairKey(a, b!)));
});

test('swiss: allows a rematch only when no other pairing exists', () => {
  const { pairings, rematches } = pairSwiss(computeStandings(['a', 'b'], [{ a: 'a', b: 'b', result: 'draw' }]));
  assert.equal(rematches, true);
  assert.equal(pairings.length, 1);
});

test('swiss: suggested rounds', () => {
  assert.equal(suggestedSwissRounds(8), 3);
  assert.equal(suggestedSwissRounds(9), 4);
  assert.equal(suggestedSwissRounds(32), 5);
});

test('round robin: everyone meets everyone exactly once', () => {
  for (const n of [4, 5, 6, 7, 10]) {
    const ids = players(n);
    const rounds = roundRobinSchedule(ids);
    assert.equal(rounds.length, n % 2 === 0 ? n - 1 : n);
    const keys = rounds.flat().filter(([, b]) => b).map(([a, b]) => pairKey(a, b!));
    assert.equal(keys.length, (n * (n - 1)) / 2);
    assert.equal(new Set(keys).size, keys.length);
    for (const round of rounds) {
      const inRound = round.flat().filter(Boolean);
      assert.equal(new Set(inRound).size, inRound.length, 'nobody plays twice in a round');
    }
    if (n % 2 === 1) {
      const byes = rounds.flat().filter(([, b]) => b === null).map(([a]) => a);
      assert.deepEqual([...byes].sort(), ids, 'each player sits out exactly once');
    }
  }
});
