/**
 * Reference links (owner decision 2026-11-09): cards, decks, games, table maps and campaigns point
 * to the rules where they are published (e.g. Wahapedia) instead of copying any rules text. A link
 * is a label and an https address; nothing else is stored. Pure helpers, no imports, so they are
 * unit-tested with plain Node. The database checks the same rules (ref_links_ok, migration 25).
 */

export interface RefLink {
  /** https address */
  u: string;
  /** Label shown on the chip; the page name of the address when empty */
  l?: string;
}

export const MAX_REFS = 8;
export const REF_URL_MAX = 300;
export const REF_LABEL_MAX = 60;

/** Only plain https addresses, no spaces or quotes (they become an href). */
export function isRefUrl(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > REF_URL_MAX || !/^https:\/\/[^\s<>"'`\\[\]]+$/.test(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !!u.hostname && u.hostname.includes('.') && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** Adds https:// to a pasted address that has none ("wahapedia.ru/…"). Returns null if it is not an address. */
export function normaliseUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const v = /^https?:\/\//i.test(s) ? s.replace(/^http:/i, 'https:') : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(s) ? `https://${s}` : s;
  return isRefUrl(v) ? v : null;
}

/** Keeps the links the database accepts: valid address, short label, no duplicates, at most 8. */
export function cleanRefs(list: unknown): RefLink[] {
  if (!Array.isArray(list)) return [];
  const out: RefLink[] = [];
  for (const x of list) {
    if (!x || typeof x !== 'object') continue;
    const u = (x as RefLink).u;
    if (!isRefUrl(u) || out.some((y) => y.u === u)) continue;
    const l = String((x as RefLink).l ?? '').trim().slice(0, REF_LABEL_MAX);
    out.push(l ? { u, l } : { u });
    if (out.length >= MAX_REFS) break;
  }
  return out;
}

/** Site name of an address, without "www.". */
export function refHost(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Readable name of an address when it has no label: last part of the path or the anchor. */
export function refTitle(r: RefLink): string {
  if (r.l) return r.l;
  try {
    const url = new URL(r.u);
    const part = decodeURIComponent(url.hash.slice(1) || url.pathname.split('/').filter(Boolean).pop() || '');
    const words = part.replace(/[-_]+/g, ' ').trim();
    return words ? words[0].toUpperCase() + words.slice(1) : url.hostname.replace(/^www\./, '');
  } catch {
    return r.u;
  }
}

/* ---------- Links on unit cards ---------- */
// A unit card keeps its links in its info list, as text rows whose value is one address: they travel
// with the card everywhere it goes (decks, share links, games, campaign copies) without a new field.

interface Row { l: string; t: 'n' | 't'; v: number | string }

export const isRefRow = (x: Row) => x.t === 't' && isRefUrl(String(x.v).trim());
export const refsOfRows = (rows: Row[]): RefLink[] => rows.filter(isRefRow).map((x) => ({ u: String(x.v).trim(), l: x.l.trim() || undefined }));
export const textRows = <T extends Row>(rows: T[]): T[] => rows.filter((x) => !isRefRow(x));
/** Adds a link as a row (label = link title, cut to the 30 characters of a row label). */
export function addRefRow<T extends Row>(rows: T[], r: RefLink, labelMax = 30): (T | Row)[] {
  if (rows.some((x) => isRefRow(x) && String(x.v).trim() === r.u)) return rows;
  return [...rows, { l: refTitle(r).slice(0, labelMax), t: 't', v: r.u }];
}
