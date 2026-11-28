/**
 * Text list import (owner request 2026-11-28): reads a list pasted from a list-building app and
 * returns its units with their role, miniatures, cost and wargear names, so the app can create the
 * army and the played list in one go. Only the player's own text is used: names and numbers, never
 * a profile, rule text or anything looked up elsewhere (parenthesised profiles are dropped).
 *
 * Formats (owner decision 2026-11-28, other apps later when the owner has samples): the official app
 * export ("Name (90 Points)", • / ◦ bullets, CHARACTERS / BATTLELINE… sections, "Attached unit") and a
 * free format (one unit per line with points anywhere). Pure, no imports: unit-tested with plain Node.
 */

export type ImportRole = 'leader' | 'troop' | 'elite' | 'support' | 'other';
export type ImportFormat = 'app' | 'free';

export interface ImportedGear {
  n: number;
  name: string;
}
export interface ImportedUnit {
  name: string;
  role: ImportRole;
  count: number;
  cost: number | null;
  gear: ImportedGear[];
  /** Extra lines kept as text rows: ["Warlord", ""], ["Enhancements", "Bastion Shield"] */
  notes: [string, string][];
  /** Index of the attached group (leader + bodyguard) the unit belongs to */
  group?: number;
  /** Leader of its group (linked to the bodyguard) */
  leader?: boolean;
}
export interface ImportedList {
  format: ImportFormat;
  name: string | null;
  faction: string | null;
  total: number | null;
  limit: number | null;
  units: ImportedUnit[];
}

const PTS = String.raw`(\d{1,3}(?:[.,\s]\d{3})+|\d{1,5})\s*(?:pts?|points?|pt|ポイント)\b`;
const toInt = (s: string) => Number(s.replace(/[.,\s]/g, ''));
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const MAX_UNITS = 80;
const MAX_GEAR = 30;

/** Role from a section title of any format (English words; other languages fall back to "other"). */
export function roleOf(section: string): ImportRole | null {
  const s = section.toLowerCase();
  if (/charact|hero|hq|leader|lord|commander|epic|warlord|personnage|héros/.test(s)) return 'leader';
  if (/battleline|troop|core|infantry|line|ligne|base/.test(s)) return 'troop';
  if (/elite|élite|veteran/.test(s)) return 'elite';
  if (/transport|vehicle|fast|heavy|flyer|fortif|monster|support|artillery|lord of war|beast|cavalry|other|datasheet|soutien/.test(s)) return 'support';
  return null;
}

/** "9x EtaCarn plasma gun" → { n: 9, name }; profiles in parentheses are dropped. */
function gearOf(raw: string): ImportedGear | null {
  const s = clean(raw.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' '));
  const m = /^(\d{1,3})\s*[x×]\s*(.+)$/i.exec(s);
  const name = clean(m ? m[2] : s).replace(/[.:;,]+$/, '');
  if (name.length < 2) return null;
  return { n: m ? Number(m[1]) : 1, name: name.slice(0, 80) };
}

/** Adds gear, merging the same name (10x plasma gun = 1 on the sergeant + 9 on the others). */
function addGear(u: ImportedUnit, g: ImportedGear | null) {
  if (!g) return;
  const same = u.gear.find((x) => x.name.toLowerCase() === g.name.toLowerCase());
  if (same) same.n += g.n;
  else if (u.gear.length < MAX_GEAR) u.gear.push({ ...g });
}

const unit = (name: string, cost: number | null, role: ImportRole): ImportedUnit => ({ name: clean(name).slice(0, 60), role, count: 1, cost, gear: [], notes: [] });

export function detectFormat(text: string): ImportFormat {
  if (/^\s*[•◦]/m.test(text) || /^\s*attached unit\b/im.test(text) || /\(\s*[\d.,\s]+\s*points?\s*\)/i.test(text)) return 'app';
  return 'free';
}

/** Header lines: list name + total (first line with points), faction, battle size limit. */
function preamble(lines: string[], isUnit: (l: string) => boolean, isSection: (l: string) => boolean) {
  let name: string | null = null, faction: string | null = null, total: number | null = null, limit: number | null = null;
  let i = 0;
  for (; i < lines.length; i++) {
    const l = lines[i];
    // The first line is the list header unless a unit starts right away (its bullets follow)
    if (isSection(l) || (isUnit(l) && (i > 0 || /^\s*[•◦]/.test(lines[1] ?? '')))) break;
    const p = new RegExp(PTS, 'i').exec(l);
    const text = clean(l.replace(new RegExp(PTS, 'gi'), ' ').replace(/[[\](){}+]+/g, ' ').replace(/\b(limit|army roster)\b/gi, ' '));
    if (p && name === null && total === null) {
      name = text || null;
      total = toInt(p[1]);
      // "++ Army Roster (Imperium - Space Marines) [1,990pts] ++": the faction is in the parentheses
      const paren = /\(([^)]+)\)/.exec(l.replace(new RegExp(String.raw`\(\s*` + PTS + String.raw`\s*\)`, 'gi'), ''));
      if (paren && !faction) faction = clean(paren[1]).slice(0, 80);
    } else if (p && !/detachment|détachement/i.test(l)) {
      const v = toInt(p[1]);
      if (total === null || v >= total) limit = v;
    } else if (!p && !faction && text && !/:/.test(l)) faction = text.slice(0, 80);
  }
  return { name: name?.slice(0, 80) ?? null, faction, total, limit, start: i };
}

// --- Official app export --------------------------------------------------------------------------
const APP_UNIT = new RegExp(String.raw`^([^•◦\s].*?)\s*\(\s*` + PTS + String.raw`\s*\)\s*$`, 'i');
const APP_SECTION = /^[A-Z][A-Z0-9 '&\-/]{2,}$/;

function parseApp(lines: string[]): ImportedList {
  const pre = preamble(lines, (l) => APP_UNIT.test(l) && !/detachment|strike force|incursion|onslaught|combat patrol/i.test(l), (l) => APP_SECTION.test(l.trim()));
  const body = lines.slice(pre.start);
  const deep = (raw: string) => /^\s*◦/.test(raw) || /^\s{2,}[•◦\-*]/.test(raw);
  const units: ImportedUnit[] = [];
  let role: ImportRole = 'other', group = -1, inAttached = false, cur: ImportedUnit | null = null, models = 0;
  const finish = () => {
    if (cur) cur.count = models || 1;
    cur = null;
    models = 0;
  };
  body.forEach((raw, i) => {
    const l = raw.trim();
    if (!l || /^exported with/i.test(l)) return;
    if (APP_SECTION.test(l)) {
      finish();
      inAttached = /attached/i.test(l);
      role = roleOf(l) ?? 'other';
      return;
    }
    if (/^attached unit\b/i.test(l)) {
      finish();
      inAttached = true;
      group++;
      return;
    }
    const u = APP_UNIT.exec(l);
    if (u && !/^[•◦]/.test(l)) {
      finish();
      cur = unit(u[1], toInt(u[2]), inAttached ? 'troop' : role);
      if (inAttached && group >= 0) cur.group = group;
      if (units.length < MAX_UNITS) units.push(cur);
      return;
    }
    if (!cur) return;
    const text = l.replace(/^[•◦\-*]\s*/, '');
    if (deep(raw)) return addGear(cur, gearOf(text));
    const kv = /^([^:]{2,30}):\s*(.+)$/.exec(text);
    if (kv && /attached as/i.test(kv[1])) {
      if (/leader|character/i.test(kv[2])) (cur.leader = true), (cur.role = 'leader');
      return;
    }
    if (kv) return void cur.notes.push([clean(kv[1]), clean(kv[2])]);
    if (!/^\d{1,3}\s*[x×]/i.test(text)) return void cur.notes.push([clean(text), '']);
    const g = gearOf(text);
    // A top line followed by ◦ lines is a group of models ("• 9x Einhyr Hearthguard"); otherwise wargear
    if (g && body[i + 1] && deep(body[i + 1])) models += g.n;
    else addGear(cur, g);
  });
  finish();
  return { format: 'app', name: pre.name, faction: pre.faction, total: pre.total, limit: pre.limit, units: fixGroups(units) };
}

/** Keeps only groups with a leader and another unit; the rest are plain units. */
function fixGroups(units: ImportedUnit[]): ImportedUnit[] {
  const by = new Map<number, ImportedUnit[]>();
  for (const u of units) if (u.group != null) by.set(u.group, [...(by.get(u.group) ?? []), u]);
  for (const [, g] of by) {
    if (g.length < 2 || !g.some((u) => u.leader) || g.every((u) => u.leader)) for (const u of g) (delete u.group, delete u.leader);
  }
  return units;
}

// --- Free format ---------------------------------------------------------------------------------
const COUNT_LEAD = /^(\d{1,3})\s*[x×]\s*/i;
const COUNT_TRAIL = /\s[x×]\s?(\d{1,3})\b/i;

function parseFree(lines: string[]): ImportedList {
  const ptsOf = (l: string) => {
    const p = new RegExp(PTS, 'i').exec(l);
    return p ? toInt(p[1]) : null;
  };
  // The first line is a header only when it carries points worth at least all the other lines
  const values = lines.map(ptsOf);
  const rest = values.slice(1).reduce<number>((s, v) => s + (v ?? 0), 0);
  const header = values[0] != null && values.slice(1).some((v) => v != null) && values[0] >= rest;
  const units: ImportedUnit[] = [];
  let role: ImportRole = 'other';
  for (const raw of lines.slice(header ? 1 : 0)) {
    const l = raw.trim();
    if (!l || /^(total|army total|grand total|合計)/i.test(l)) continue;
    const p = new RegExp(PTS, 'i').exec(l);
    if (!p) {
      const r = roleOf(l);
      if (r && l.length < 40) role = r;
      continue;
    }
    let name = l.replace(new RegExp(PTS, 'gi'), ' ').replace(/^[\s•·*+\-–—>]+/, '');
    let count = 1;
    const lead = COUNT_LEAD.exec(name), trail = COUNT_TRAIL.exec(name);
    if (lead) (count = Number(lead[1])), (name = name.slice(lead[0].length));
    else if (trail) (count = Number(trail[1])), (name = name.replace(trail[0], ' '));
    name = clean(name.replace(/[[\](){}|#=_~]+/g, ' ').replace(/\.{2,}|…+/g, ' ').replace(/\s[-–—:]+(\s|$)/g, ' ')).replace(/[-–—:,.]+$/, '').trim();
    if (name.length < 2) continue;
    const u = unit(name, toInt(p[1]), role);
    u.count = Math.max(1, Math.min(999, count));
    if (units.length < MAX_UNITS) units.push(u);
  }
  const head = header ? clean(lines[0].replace(new RegExp(PTS, 'gi'), ' ').replace(/[[\](){}]+/g, ' ')) : '';
  return { format: 'free', name: head || null, faction: null, total: header ? values[0] : null, limit: null, units };
}

export function parseListText(text: string): ImportedList {
  const lines = text.replace(/\r/g, '').replace(/‑/g, '-').split('\n').filter((l) => l.trim());
  const format = detectFormat(text);
  const out = format === 'app' ? parseApp(lines) : parseFree(lines);
  if (out.total === null && out.units.length) {
    const sum = out.units.reduce((s, u) => s + (u.cost ?? 0), 0);
    out.total = sum || null;
  }
  return out;
}

/** Total of the units' costs. */
export const sumCosts = (units: Pick<ImportedUnit, 'cost'>[]) => units.reduce((s, u) => s + (u.cost ?? 0), 0);
