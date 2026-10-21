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
