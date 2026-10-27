/**
 * Army list parser. Players paste plain text exported by any list-building app; we only extract
 * the faction and the total points to warn about the format limit. We keep the player's text as-is
 * and never look up or store any rules, datasheets or unit profiles.
 */

export type PointsSource = 'total' | 'header' | 'sum' | 'none';

export interface ParsedList {
  faction: string | null;
  points: number | null;
  /** How the points were found, so the UI can say how confident it is. */
  source: PointsSource;
}

const POINTS = String.raw`(\d{1,2}[,.\s]?\d{3}|\d{2,4})\s*(?:pts?|points?|ポイント|ｐｔｓ?)`;
const TOTAL_LINE = new RegExp(String.raw`(?:total|army total|grand total|合計|総計|総ポイント)[^\d\n]{0,20}` + POINTS, 'i');
const TOTAL_LINE_BARE = /(?:total|合計|総計)[^\d\n]{0,20}(\d{2,5})\b/i;
const ANY_POINTS = new RegExp(POINTS, 'gi');
const FACTION_LINE = /^\s*(?:faction|army|陣営|勢力|アーミー)\s*[:：]\s*(.+)$/im;

const toInt = (s: string) => Number(s.replace(/[,.\s]/g, ''));

/** First meaningful line without decorations and without its points value. */
function headerFaction(lines: string[]): string | null {
  for (const raw of lines) {
    const line = raw
      .replace(new RegExp(POINTS, 'gi'), '')
      .replace(/[[\]()（）|+*#=_~-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (line.length >= 2 && !/^\d+$/.test(line)) return line.slice(0, 80);
  }
  return null;
}

export function parseArmyList(text: string): ParsedList {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { faction: null, points: null, source: 'none' };

  const faction = FACTION_LINE.exec(text)?.[1].trim().slice(0, 80) ?? headerFaction(lines);

  // 1. An explicit total line wins ("Total: 1,995 pts", "合計 995ポイント").
  const total = TOTAL_LINE.exec(text) ?? TOTAL_LINE_BARE.exec(text);
  if (total) return { faction, points: toInt(total[1]), source: 'total' };

  // 2. A points value on the first line is usually the army total ("My army (1995 points)").
  const header = new RegExp(POINTS, 'i').exec(lines[0]);
  if (header) return { faction, points: toInt(header[1]), source: 'header' };

  // 3. Otherwise add up every "N pts" found in the list.
  const values = [...text.matchAll(ANY_POINTS)].map((m) => toInt(m[1]));
  if (values.length > 0) return { faction, points: values.reduce((a, b) => a + b, 0), source: 'sum' };

  return { faction, points: null, source: 'none' };
}

export function isOverLimit(parsed: ParsedList, limit: number): boolean {
  return parsed.points !== null && parsed.points > limit;
}

export interface ListUnit {
  name: string;
  /** Miniatures in the unit when the line says it ("10x", "x20", "5 models"), else 1 */
  count: number;
  points: number | null;
}

const COUNT_LEAD = /^(\d{1,3})\s*[x×]\s+|^(\d{1,3})[x×](?=\S)/i;
const COUNT_TRAIL = /\s[x×]\s?(\d{1,3})\b/i;
const COUNT_MODELS = /\b(\d{1,3})\s*(?:models?|minis?|miniatures?|figures?|figs?)\b|(\d{1,3})\s*体/i;
const BULLET = /^[\s•·*+\-–—>]+/;

/**
 * Units of a pasted list, for the "Paint this army" shortcut to My pile: every line with a points
 * value is a unit (lines without points are usually wargear or notes), except the total line and a
 * header carrying the army total. Only the player's own words are kept.
 */
export function listUnits(text: string): ListUnit[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const parsed = parseArmyList(text);
  const out: ListUnit[] = [];
  lines.forEach((raw, i) => {
    if (TOTAL_LINE.test(raw) || TOTAL_LINE_BARE.test(raw) || FACTION_LINE.test(raw)) return;
    if (i === 0 && parsed.source === 'header') return;
    const pts = new RegExp(POINTS, 'i').exec(raw);
    if (!pts) return;
    let line = raw.replace(BULLET, '').replace(new RegExp(POINTS, 'gi'), ' ');
    let count = 1;
    const lead = COUNT_LEAD.exec(line);
    const trail = COUNT_TRAIL.exec(line);
    const models = COUNT_MODELS.exec(line);
    if (lead) (count = Number(lead[1] ?? lead[2])), (line = line.slice(lead[0].length));
    else if (trail) (count = Number(trail[1])), (line = line.replace(trail[0], ' '));
    else if (models) (count = Number(models[1] ?? models[2])), (line = line.replace(models[0], ' '));
    const name = line
      .replace(/\.{2,}|…+/g, ' ')
      .replace(/[[\]()（）{}|#=_~]+/g, ' ')
      .replace(/\s[-–—:]+(\s|$)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[-–—:,]+$/, '')
      .trim();
    if (name.length < 2) return;
    out.push({ name: name.slice(0, 60), count: Math.max(1, Math.min(999, count)), points: toInt(pts[1]) });
  });
  return out.slice(0, 80);
}
