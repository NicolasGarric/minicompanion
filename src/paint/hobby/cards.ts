/**
 * Unit cards and combat decks (owner decisions 2026-10-29): pure helpers, no imports, so they are
 * unit-tested with plain Node.
 *
 * A card is a unit of My pile with a free info list: rows "label : value", each a number (stats,
 * e.g. "Endurance : 8") or a text (weapon, special rule…), in the player's order. Figures, points
 * and stars are rows like the others. A deck is a scroll order of cards; linked cards (a hero
 * linked to an infantry unit) stay together in one group: groups = [[unit, hero], [unit], …].
 */

export interface InfoLine {
  l: string;
  t: 'n' | 't';
  v: number | string;
}
export type Groups = string[][];

export const MAX_LINES = 40;
export const MAX_CARDS = 60;
export const LABEL_MAX = 30;
export const TEXT_MAX = 500;

/** Keeps a list the database accepts (same rules as card_info_ok). */
export function cleanInfo(lines: InfoLine[]): InfoLine[] {
  return lines
    .filter((x) => x && String(x.l ?? '').trim())
    .slice(0, MAX_LINES)
    .map((x) => {
      const l = String(x.l).trim().slice(0, LABEL_MAX);
      if (x.t === 'n') {
        const n = typeof x.v === 'number' ? x.v : parseFloat(String(x.v).replace(',', '.'));
        return { l, t: 'n' as const, v: Number.isFinite(n) ? Math.max(-999999, Math.min(999999, n)) : 0 };
      }
      return { l, t: 't' as const, v: String(x.v ?? '').slice(0, TEXT_MAX) };
    });
}

/** Turning a row into a number keeps the digits it had; into a text keeps what was written. */
export function toggleType(x: InfoLine): InfoLine {
  if (x.t === 'n') return { ...x, t: 't', v: String(x.v) };
  const n = parseFloat(String(x.v).replace(',', '.'));
  return { ...x, t: 'n', v: Number.isFinite(n) ? n : 0 };
}

/**
 * Units made before the info list carried points, stars and a note: they become the first rows,
 * with labels in the player's language, until the player edits the list.
 */
export function legacyInfo(u: { points?: number; stars?: number; note?: string }, labels: { points: string; stars: string; note: string }): InfoLine[] {
  const out: InfoLine[] = [];
  if (u.points) out.push({ l: labels.points, t: 'n', v: u.points });
  if (u.stars) out.push({ l: labels.stars, t: 't', v: '★'.repeat(u.stars) });
  if (u.note) out.push({ l: labels.note, t: 't', v: u.note });
  return out;
}

/** Sum of the number rows called like `label` (case and spaces ignored), e.g. the points of a deck. */
export function sumOf(cards: { info: InfoLine[] }[], labels: string[]): number {
  const want = new Set(labels.map((x) => x.trim().toLowerCase()));
  let s = 0;
  for (const c of cards) for (const x of c.info) if (x.t === 'n' && want.has(x.l.trim().toLowerCase())) s += Number(x.v) || 0;
  return s;
}

/** Cards whose rows mention the words searched (labels and values), for the rule search. */
export function searchCards<T extends { name: string; info: InfoLine[] }>(cards: T[], q: string): T[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return cards.filter((c) => {
    const hay = [c.name, ...c.info.map((x) => `${x.l} ${x.v}`)].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/* ---------- Scroll order ---------- */

export const flatOrder = (g: Groups) => g.flat();

/** Removes unknown ids, duplicates and empty groups. */
export function cleanGroups(g: Groups, known: Set<string>): Groups {
  const seen = new Set<string>();
  const out: Groups = [];
  for (const grp of g) {
    const kept = grp.filter((id) => known.has(id) && !seen.has(id) && (seen.add(id), true));
    if (kept.length) out.push(kept);
  }
  let n = 0;
  return out.map((grp) => grp.filter(() => n++ < MAX_CARDS)).filter((grp) => grp.length);
}

/** Moves a whole group up (-1) or down (+1). */
export function moveGroup(g: Groups, gi: number, dir: -1 | 1): Groups {
  const j = gi + dir;
  if (gi < 0 || j < 0 || j >= g.length) return g;
  const out = g.slice();
  [out[gi], out[j]] = [out[j], out[gi]];
  return out;
}

/** Joins group gi to the group above it. */
export function linkToAbove(g: Groups, gi: number): Groups {
  if (gi <= 0 || gi >= g.length) return g;
  const out = g.slice();
  out[gi - 1] = [...out[gi - 1], ...out[gi]];
  out.splice(gi, 1);
  return out;
}

/** Takes one card out of its group, right after it. */
export function unlink(g: Groups, gi: number, mi: number): Groups {
  const grp = g[gi];
  if (!grp || grp.length < 2 || mi < 0 || mi >= grp.length) return g;
  const out = g.slice();
  const id = grp[mi];
  out[gi] = grp.filter((_, i) => i !== mi);
  out.splice(gi + 1, 0, [id]);
  return out;
}

/** Moves a card one place earlier inside its group. */
export function memberUp(g: Groups, gi: number, mi: number): Groups {
  const grp = g[gi];
  if (!grp || mi <= 0 || mi >= grp.length) return g;
  const out = g.slice();
  const m = grp.slice();
  [m[mi - 1], m[mi]] = [m[mi], m[mi - 1]];
  out[gi] = m;
  return out;
}

/**
 * Adds a card: a unit linked to another one (in My pile) joins that unit's group; a unit others
 * are linked to brings them along when they are already in the deck alone.
 */
export function addCard(g: Groups, id: string, linkedTo?: string | null): Groups {
  if (g.some((grp) => grp.includes(id)) || g.flat().length >= MAX_CARDS) return g;
  const gi = linkedTo ? g.findIndex((grp) => grp.includes(linkedTo)) : -1;
  if (gi < 0) return [...g, [id]];
  const out = g.slice();
  out[gi] = [...out[gi], id];
  return out;
}

export function removeCard(g: Groups, id: string): Groups {
  return g.map((grp) => grp.filter((x) => x !== id)).filter((grp) => grp.length);
}

/* ---------- Campaign history ---------- */

export interface InfoChange {
  label: string;
  kind: 'up' | 'down' | 'changed' | 'added' | 'removed';
  before?: number | string;
  after?: number | string;
}

const key = (x: InfoLine) => `${x.t}:${x.l.trim().toLowerCase()}`;

/**
 * What changed between two lists, row by row (rows are matched by label and type; a text row with
 * a new text counts as changed). Used for the history under a campaign card and the tinted rows.
 */
export function diffInfo(before: InfoLine[], after: InfoLine[]): InfoChange[] {
  const out: InfoChange[] = [];
  const left = new Map<string, InfoLine[]>();
  for (const x of before) left.set(key(x), [...(left.get(key(x)) ?? []), x]);
  const matched = new Set<InfoLine>();
  for (const x of after) {
    const pool = left.get(key(x)) ?? [];
    // Same label and same value first, then the first one left
    const same = pool.find((y) => !matched.has(y) && y.v === x.v) ?? pool.find((y) => !matched.has(y));
    if (!same) {
      out.push({ label: x.l, kind: 'added', after: x.v });
      continue;
    }
    matched.add(same);
    if (same.v === x.v) continue;
    if (x.t === 'n') out.push({ label: x.l, kind: Number(x.v) > Number(same.v) ? 'up' : 'down', before: same.v, after: x.v });
    else out.push({ label: x.l, kind: 'changed', before: same.v, after: x.v });
  }
  for (const y of before) if (!matched.has(y)) out.push({ label: y.l, kind: 'removed', before: y.v });
  return out;
}

/**
 * How each row of the current list looks on a campaign card compared with the list the card
 * started with: tinted when it changed, with the old value of a number; rows lost are listed apart.
 */
export function markRows(start: InfoLine[], now: InfoLine[]): { rows: (InfoLine & { was?: number | string; changed?: boolean })[]; lost: InfoLine[] } {
  const pool = start.slice();
  const rows = now.map((x) => {
    const i = pool.findIndex((y) => key(y) === key(x) && y.v === x.v);
    if (i >= 0) {
      pool.splice(i, 1);
      return { ...x };
    }
    const j = pool.findIndex((y) => key(y) === key(x));
    if (j >= 0) {
      const was = pool[j].v;
      pool.splice(j, 1);
      return { ...x, changed: true, ...(x.t === 'n' ? { was } : null) };
    }
    return { ...x, changed: true };
  });
  return { rows, lost: pool };
}
