import { supabase } from '../core/auth/supabase';
import { armyStats, streak, useHobby } from '../paint/hobby/store';
import { db } from '../paint/storage/db';
import { paintById, useStore } from '../paint/store';

/**
 * Levels, titles and stamps from real activity: miniatures painted, painting time, armies, and,
 * with an account, games, wins, tournaments, challenges, mentoring, predictions and swaps
 * (my_hobby_stats). Also the numbers of the year in review. No paid reward anywhere.
 */
export interface ServerStats {
  games: number; wins: number; opponents: number; tournaments: number; tournament_matches: number; stores: number;
  contest_entries: number; challenge_entries: number; mentees: number; predictions_right: number; swaps: number;
}
const ZERO: ServerStats = { games: 0, wins: 0, opponents: 0, tournaments: 0, tournament_matches: 0, stores: 0, contest_entries: 0, challenge_entries: 0, mentees: 0, predictions_right: 0, swaps: 0 };

export async function serverStats(year?: number): Promise<ServerStats> {
  if (!supabase) return ZERO;
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return ZERO;
  const r = await supabase.rpc('my_hobby_stats', { p_year: year ?? null });
  return r.error || !r.data ? ZERO : { ...ZERO, ...(r.data as Partial<ServerStats>) };
}

export interface Activity extends ServerStats {
  painted: number;
  minutes: number;
  sessions: number;
  streak: number;
  armies: number;
  armiesDone: number;
}

export function localActivity(year?: number): Omit<Activity, keyof ServerStats> {
  const h = useHobby.getState();
  const inYear = (t: number) => year === undefined || new Date(t).getFullYear() === year;
  return {
    painted: h.paintedLog.filter((p) => inYear(p.at)).reduce((s, p) => s + p.n, 0),
    minutes: h.sessions.filter((s) => inYear(s.start)).reduce((s, x) => s + x.minutes, 0),
    sessions: h.sessions.filter((s) => inYear(s.start)).length,
    streak: streak(h.sessions),
    armies: h.armies.length,
    armiesDone: h.armies.filter((a) => a.units.length && armyStats(a).progress >= 1).length,
  };
}

/** XP: every point comes from something done for real. */
export function xpOf(a: Activity): number {
  return a.painted * 20 + Math.floor(a.minutes / 10) * 5 + a.armies * 30 + a.armiesDone * 200
    + a.games * 40 + a.wins * 20 + a.tournaments * 150 + a.stores * 50 + a.challenge_entries * 100 + a.contest_entries * 80
    + a.mentees * 200 + a.predictions_right * 10 + a.swaps * 10;
}

/** Total XP needed to reach a level (level 1 = 0). */
export const xpForLevel = (level: number) => Math.round(120 * (level - 1) ** 1.6);
export function levelOf(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return { level, from: xpForLevel(level), to: xpForLevel(level + 1) };
}

/** Level titles (translation key suffixes), unlocked at these levels. */
export const TITLES: [number, string][] = [
  [1, 'primer'], [3, 'wash'], [5, 'drybrush'], [8, 'edge'], [12, 'palette'], [16, 'workshop'], [20, 'legend'],
];
export const titleFor = (level: number) => [...TITLES].reverse().find(([l]) => level >= l)![1];

/** Stamps: one-off achievements. */
export const STAMPS: { id: string; done: (a: Activity) => boolean }[] = [
  { id: 'first_paint', done: (a) => a.painted >= 1 },
  { id: 'ten_painted', done: (a) => a.painted >= 10 },
  { id: 'hundred_painted', done: (a) => a.painted >= 100 },
  { id: 'army_done', done: (a) => a.armiesDone >= 1 },
  { id: 'streak7', done: (a) => a.streak >= 7 },
  { id: 'first_game', done: (a) => a.games + a.tournament_matches >= 1 },
  { id: 'first_win', done: (a) => a.wins >= 1 },
  { id: 'tournament', done: (a) => a.tournaments >= 1 },
  { id: 'globetrotter', done: (a) => a.stores >= 3 },
  { id: 'challenger', done: (a) => a.challenge_entries >= 1 },
  { id: 'mentor', done: (a) => a.mentees >= 1 },
  { id: 'oracle', done: (a) => a.predictions_right >= 5 },
  { id: 'trader', done: (a) => a.swaps >= 1 },
];

/** The title the player chose to show (level title or stamp), kept on this device. */
const SHOWN_KEY = 'cf.shownTitle';
export const shownTitle = () => {
  try {
    return localStorage.getItem(SHOWN_KEY);
  } catch {
    return null;
  }
};
export const setShownTitle = (key: string) => {
  try {
    localStorage.setItem(SHOWN_KEY, key);
  } catch {
    /* not remembered */
  }
};

export async function activity(year?: number): Promise<Activity> {
  return { ...(await serverStats(year)), ...localActivity(year) };
}

/** Most used paint of the year across PAINT projects (by number of zones). */
export async function colourOfYear(year: number): Promise<{ hex: string; name: string } | null> {
  const metas = (await db.listProjects()).filter((m) => new Date(m.updatedAt).getFullYear() === year).slice(0, 30);
  const count = new Map<string, { hex: string; name: string; n: number }>();
  const library = useStore.getState().library;
  for (const m of metas) {
    const p = await db.loadProject(m.id);
    for (const z of p?.zones ?? []) {
      if (z.isBackground || !z.visible) continue;
      const paint = paintById(z.base.paintId, library);
      const key = paint?.id ?? z.base.hex;
      const c = count.get(key) ?? { hex: z.base.hex, name: paint?.name ?? z.base.hex.toUpperCase(), n: 0 };
      c.n++;
      count.set(key, c);
    }
  }
  return [...count.values()].sort((a, b) => b.n - a.n)[0] ?? null;
}
