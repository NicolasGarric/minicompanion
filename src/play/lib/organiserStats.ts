/**
 * Numbers for the organiser dashboard, computed from what the tournament page already loads
 * (registrations with their lists, rounds, matches): no extra query and no new table.
 */

export interface RegLike {
  user_id: string;
  status: 'registered' | 'waitlist' | 'withdrawn' | 'dropped';
  checked_in_at: string | null;
  created_at: string;
}
export interface ListLike {
  status: 'submitted' | 'approved' | 'rejected';
}
export interface MatchLike {
  round_id: string;
  player_b_id: string | null;
  status: 'scheduled' | 'reported' | 'confirmed' | 'disputed' | 'resolved';
}

const DAY = 864e5;
/** Local calendar day "2026-10-27" (the organiser reads days in their own time zone). */
export const dayOf = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export interface CurvePoint {
  day: string;
  /** Sign-ups that day (players who later dropped included: they did sign up) */
  added: number;
  /** Sign-ups so far */
  total: number;
}

/** One point per day from the first sign-up to `until` (today, or the start of the event if earlier). */
export function registrationCurve(regs: RegLike[], until: number): CurvePoint[] {
  const times = regs.filter((r) => r.status !== 'withdrawn').map((r) => Date.parse(r.created_at)).sort((a, b) => a - b);
  if (!times.length) return [];
  const perDay = new Map<string, number>();
  for (const t of times) perDay.set(dayOf(t), (perDay.get(dayOf(t)) ?? 0) + 1);
  const out: CurvePoint[] = [];
  let total = 0;
  const last = startOfDay(Math.max(until, times[times.length - 1]));
  // Noon steps stay on the right day across daylight-saving changes.
  for (let t = startOfDay(times[0]) + DAY / 2; t <= last + DAY / 2; t += DAY) {
    const day = dayOf(t);
    const added = perDay.get(day) ?? 0;
    total += added;
    out.push({ day, added, total });
  }
  return out;
}

export interface Summary {
  registered: number;
  waitlist: number;
  dropped: number;
  checkedIn: number;
  lists: { approved: number; submitted: number; rejected: number; missing: number };
  /** Players still in the event without an approved list (to chase before the deadline) */
  noList: string[];
  /** Registered players not checked in yet */
  notCheckedIn: string[];
  roundsDone: number;
  /** Matches of the active round: reported but not confirmed, disputed, not played yet */
  pending: { toPlay: number; toConfirm: number; disputed: number };
}

export function summarise(
  regs: (RegLike & { list: ListLike | null })[],
  rounds: { id: string; status: 'pending' | 'active' | 'finished' }[],
  matches: MatchLike[],
): Summary {
  const inEvent = regs.filter((r) => r.status === 'registered');
  const lists = { approved: 0, submitted: 0, rejected: 0, missing: 0 };
  for (const r of inEvent) lists[r.list?.status ?? 'missing']++;
  const active = rounds.find((r) => r.status === 'active');
  const current = active ? matches.filter((m) => m.round_id === active.id && m.player_b_id) : [];
  return {
    registered: inEvent.length,
    waitlist: regs.filter((r) => r.status === 'waitlist').length,
    dropped: regs.filter((r) => r.status === 'dropped').length,
    checkedIn: inEvent.filter((r) => r.checked_in_at).length,
    lists,
    noList: inEvent.filter((r) => r.list?.status !== 'approved').map((r) => r.user_id),
    notCheckedIn: inEvent.filter((r) => !r.checked_in_at).map((r) => r.user_id),
    roundsDone: rounds.filter((r) => r.status === 'finished').length,
    pending: {
      toPlay: current.filter((m) => m.status === 'scheduled').length,
      toConfirm: current.filter((m) => m.status === 'reported').length,
      disputed: current.filter((m) => m.status === 'disputed').length,
    },
  };
}

/**
 * RFC 4180 CSV: every cell quoted, so commas, quotes and line breaks in names are safe. Text that
 * a spreadsheet would run as a formula (=, +, -, @ first) gets a leading apostrophe.
 */
export function toCsv(rows: (string | number | null)[][]): string {
  const cell = (c: string | number | null) => {
    const s = typeof c === 'number' ? String(c) : (c ?? '').replace(/^[=+\-@\t\r]/, "'$&");
    return `"${s.replaceAll('"', '""')}"`;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
