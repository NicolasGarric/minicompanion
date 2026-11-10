import type { GameReport, GameResult, GuestResult } from './social';

/** One line of a battle report: a player with an account, or a guest typed by the host. */
export interface ReportRow {
  key: string;
  name: string;
  placement: number;
  score: number | null;
  army: string | null;
  guest: boolean;
  result?: GameResult;
}

/** Players and guests together, by placement (players first on a tie). */
export function reportRows(report: Pick<GameReport, 'results'> & { guests?: GuestResult[] }): ReportRow[] {
  return [
    ...report.results.map((r) => ({ key: r.player_id, name: r.profile?.display_name ?? '?', placement: r.placement, score: r.score, army: r.army, guest: false, result: r })),
    ...(report.guests ?? []).map((g, i) => ({ key: `guest-${i}`, name: g.name, placement: g.placement, score: g.score, army: g.army, guest: true })),
  ].sort((a, b) => a.placement - b.placement || Number(a.guest) - Number(b.guest));
}

/** Cleans the guest lines of the form: trimmed names, empty lines dropped, at most `room` guests. */
export function cleanGuests(rows: { name: string; placement: number; score: string; army: string }[], room: number): GuestResult[] {
  return rows
    .map((g) => ({ name: g.name.trim().slice(0, 40), placement: g.placement, score: g.score.trim() === '' || !Number.isFinite(Number(g.score)) ? null : Math.round(Number(g.score)), army: g.army.trim().slice(0, 80) || null }))
    .filter((g) => g.name)
    .slice(0, Math.max(0, room));
}
