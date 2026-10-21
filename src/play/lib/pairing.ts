/**
 * Tournament engine: standings with tie-breakers, Swiss pairings and round-robin schedules.
 * Pure functions with no I/O so they can be unit-tested and reused by any screen.
 *
 * Tie-breakers, in order:
 *   1. match points (win 3, draw 1, loss 0; a bye counts as a win)
 *   2. strength of schedule: sum of the opponents' match points
 *   3. victory point difference (points scored - points conceded)
 *   4. victory points scored
 */

export type Result = 'a_win' | 'b_win' | 'draw';

export interface PlayedMatch {
  a: string;
  /** null = bye for player `a` */
  b: string | null;
  result: Result | null;
  aScore?: number;
  bScore?: number;
}

export interface Standing {
  playerId: string;
  rank: number;
  matchPoints: number;
  wins: number;
  draws: number;
  losses: number;
  strengthOfSchedule: number;
  vpFor: number;
  vpAgainst: number;
  vpDiff: number;
  opponents: string[];
  hadBye: boolean;
}

export type Pairing = [string, string | null];

const WIN = 3;
const DRAW = 1;

export function computeStandings(players: string[], matches: PlayedMatch[]): Standing[] {
  const rows = new Map<string, Standing>(
    players.map((id) => [
      id,
      { playerId: id, rank: 0, matchPoints: 0, wins: 0, draws: 0, losses: 0, strengthOfSchedule: 0, vpFor: 0, vpAgainst: 0, vpDiff: 0, opponents: [], hadBye: false },
    ]),
  );

  for (const m of matches) {
    const a = rows.get(m.a);
    if (!a) continue;
    if (m.b === null) {
      a.hadBye = true;
      a.wins++;
      a.matchPoints += WIN;
      continue;
    }
    const b = rows.get(m.b);
    if (!b) continue;
    a.opponents.push(b.playerId);
    b.opponents.push(a.playerId);
    if (!m.result) continue; // not played yet: counts as an opponent (no rematch) but no points
    a.vpFor += m.aScore ?? 0;
    a.vpAgainst += m.bScore ?? 0;
    b.vpFor += m.bScore ?? 0;
    b.vpAgainst += m.aScore ?? 0;
    if (m.result === 'draw') {
      a.draws++;
      b.draws++;
      a.matchPoints += DRAW;
      b.matchPoints += DRAW;
    } else {
      const [w, l] = m.result === 'a_win' ? [a, b] : [b, a];
      w.wins++;
      l.losses++;
      w.matchPoints += WIN;
    }
  }

  for (const s of rows.values()) {
    s.vpDiff = s.vpFor - s.vpAgainst;
    s.strengthOfSchedule = s.opponents.reduce((acc, o) => acc + (rows.get(o)?.matchPoints ?? 0), 0);
  }

  const sorted = [...rows.values()].sort(
    (x, y) =>
      y.matchPoints - x.matchPoints ||
      y.strengthOfSchedule - x.strengthOfSchedule ||
      y.vpDiff - x.vpDiff ||
      y.vpFor - x.vpFor ||
      x.playerId.localeCompare(y.playerId), // stable, deterministic order
  );
  sorted.forEach((s, i) => (s.rank = i + 1));
  return sorted;
}

/**
 * Swiss pairings for the next round.
 * - Players are paired top-down by standing; nobody meets the same opponent twice.
 * - With an odd count, the lowest-ranked player without a bye gets it.
 * - Backtracking finds a valid set when the greedy choice dead-ends; if no rematch-free set exists
 *   at all (tiny events, many rounds), rematches are allowed as a last resort.
 * - Round 1 (nobody has played yet) is drawn at random; `random` is injectable for tests.
 */
export function pairSwiss(standings: Standing[], random: () => number = Math.random): { pairings: Pairing[]; rematches: boolean } {
  const firstRound = standings.every((s) => s.opponents.length === 0 && !s.hadBye);
  const order = firstRound ? shuffle(standings.map((s) => s.playerId), random) : standings.map((s) => s.playerId);
  const played = new Map(standings.map((s) => [s.playerId, new Set(s.opponents)]));

  let bye: string | null = null;
  if (order.length % 2 === 1) {
    // Lowest-ranked player who has not had a bye yet (on round 1: the last one drawn).
    const byId = new Map(standings.map((s) => [s.playerId, s]));
    bye = [...order].reverse().find((id) => !byId.get(id)!.hadBye) ?? order[order.length - 1];
    order.splice(order.indexOf(bye), 1);
  }

  const strict = backtrack(order, (a, b) => !played.get(a)!.has(b));
  const pairs = strict ?? backtrack(order, () => true)!;
  const pairings: Pairing[] = pairs.map(([a, b]) => [a, b]);
  if (bye) pairings.push([bye, null]);
  return { pairings, rematches: strict === null };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function backtrack(players: string[], allowed: (a: string, b: string) => boolean): [string, string][] | null {
  if (players.length === 0) return [];
  const [first, ...rest] = players;
  for (let i = 0; i < rest.length; i++) {
    if (!allowed(first, rest[i])) continue;
    const remaining = rest.slice(0, i).concat(rest.slice(i + 1));
    const tail = backtrack(remaining, allowed);
    if (tail) return [[first, rest[i]], ...tail];
  }
  return null;
}

/** Suggested number of Swiss rounds to separate a single unbeaten winner. */
export const suggestedSwissRounds = (players: number) => Math.max(1, Math.ceil(Math.log2(Math.max(2, players))));

/**
 * Round-robin schedule (circle method): everyone plays everyone once.
 * With an odd count, one player sits out (bye) each round.
 */
export function roundRobinSchedule(players: string[]): Pairing[][] {
  const list: (string | null)[] = players.length % 2 === 0 ? [...players] : [...players, null];
  const n = list.length;
  const rounds: Pairing[][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: Pairing[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a === null && b === null) continue;
      round.push(a === null ? [b!, null] : b === null ? [a, null] : [a, b]);
    }
    rounds.push(round);
    // Keep the first player fixed, rotate the others clockwise.
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}
