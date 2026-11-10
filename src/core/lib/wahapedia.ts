/**
 * Index of the rules published on Wahapedia (11th edition), for reference links only: page names,
 * section anchors, mission card names and unit page addresses. No rules text is copied. The index is
 * a static file (`public/data/wahapedia-11.json`, rebuilt with `node scripts/fetch-wahapedia-index.mjs`)
 * loaded on demand. Pure helpers below the loader, unit-tested with plain Node.
 */

export type RefKind = 'rules' | 'missions' | 'narrative' | 'boarding' | 'tools' | 'factions';
export const REF_KINDS: RefKind[] = ['rules', 'missions', 'narrative', 'boarding', 'tools', 'factions'];

export interface WahaIndex {
  v: 1;
  base: string;
  checked: string;
  /** k kind, s slug, t title, i sections [label, anchor, depth], c mission cards [name, anchor of their deck] */
  pages: { k: Exclude<RefKind, 'factions'>; s: string; t: string; i: [string, string, number][]; c: [string, string][] }[];
  /** s slug, t name, a anchors of the page, u units: name (path = name with dashes) or [name, path] */
  factions: { s: string; t: string; a: string[]; u: (string | [string, string])[] }[];
}

export interface RefEntry {
  kind: RefKind;
  /** Page or faction the entry belongs to */
  group: string;
  label: string;
  url: string;
  type: 'page' | 'section' | 'card' | 'unit';
  depth?: number;
}

const enc = (s: string) => encodeURI(s).replace(/#/g, '%23').replace(/'/g, '%27');

export function pageUrl(ix: Pick<WahaIndex, 'base'>, slug: string, anchor?: string) {
  return `${ix.base}the-rules/${slug}/${anchor ? `#${enc(anchor)}` : ''}`;
}
export function factionUrl(ix: Pick<WahaIndex, 'base'>, slug: string, anchor?: string) {
  return `${ix.base}factions/${slug}/${anchor ? `#${enc(anchor)}` : ''}`;
}
export function unitUrl(ix: Pick<WahaIndex, 'base'>, faction: string, path: string) {
  return `${ix.base}factions/${faction}/${enc(path)}`;
}
/** Address of a unit page from its name, as the site builds it (spaces become dashes). */
export const unitPath = (name: string) => name.trim().replace(/\s+/g, '-');

/** Readable name of a faction anchor ("Army-Rules" → "Army Rules"). */
export const anchorLabel = (a: string) => a.replace(/-/g, ' ');

/** Every entry of the index, in site order. */
export function entriesOf(ix: WahaIndex): RefEntry[] {
  const out: RefEntry[] = [];
  for (const p of ix.pages) {
    out.push({ kind: p.k, group: p.t, label: p.t, url: pageUrl(ix, p.s), type: 'page' });
    for (const [label, a, depth] of p.i) out.push({ kind: p.k, group: p.t, label, url: pageUrl(ix, p.s, a), type: 'section', depth });
    for (const [label, a] of p.c) out.push({ kind: p.k, group: p.t, label, url: pageUrl(ix, p.s, a), type: 'card' });
  }
  for (const f of ix.factions) {
    out.push({ kind: 'factions', group: f.t, label: f.t, url: factionUrl(ix, f.s), type: 'page' });
    for (const a of f.a) out.push({ kind: 'factions', group: f.t, label: anchorLabel(a), url: factionUrl(ix, f.s, a), type: 'section' });
    for (const u of f.u) {
      const [label, path] = typeof u === 'string' ? [u, unitPath(u)] : u;
      out.push({ kind: 'factions', group: f.t, label, url: unitUrl(ix, f.s, path), type: 'unit' });
    }
  }
  return out;
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, "'");

/**
 * Entries whose label (or page / faction name) has every word searched; label matches first,
 * then whole-word matches, then pages before sections.
 */
export function searchEntries(all: RefEntry[], q: string, opts: { kinds?: RefKind[]; limit?: number } = {}): RefEntry[] {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const kinds = opts.kinds?.length ? new Set(opts.kinds) : null;
  const scored: { e: RefEntry; s: number; i: number }[] = [];
  all.forEach((e, i) => {
    if (kinds && !kinds.has(e.kind)) return;
    const label = fold(e.label);
    const hay = `${label} ${fold(e.group)}`;
    if (!words.every((w) => hay.includes(w))) return;
    let s = 0;
    if (words.every((w) => label.includes(w))) s += 4;
    if (label.startsWith(words[0])) s += 2;
    if (words.every((w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(label))) s += 1;
    if (e.type === 'page') s += 1;
    scored.push({ e, s, i });
  });
  return scored.sort((a, b) => b.s - a.s || a.i - b.i).slice(0, opts.limit ?? 40).map((x) => x.e);
}

/** Is this address one of the index (so it gets the site's name and a check mark)? */
export const isWahapedia = (u: string) => /^https:\/\/(www\.)?wahapedia\.ru\//.test(u);

/* ---------- Loader ---------- */

let cache: Promise<{ ix: WahaIndex; all: RefEntry[] }> | null = null;
/** The index, loaded once per visit. */
export function loadWahapedia(): Promise<{ ix: WahaIndex; all: RefEntry[] }> {
  cache ??= fetch('/data/wahapedia-11.json')
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<WahaIndex>;
    })
    .then((ix) => ({ ix, all: entriesOf(ix) }))
    .catch((e) => {
      cache = null;
      throw e;
    });
  return cache;
}
