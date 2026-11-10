/**
 * Competitive deployment cards (Chapter Approved 2026-27 mission deck, as published on Wahapedia):
 * the measures only (zones, objective points), read from the cards on 2026-11-10. Our own names and our
 * own drawing; the published card is linked from the map (reference link), nothing else is copied.
 *
 * Every card is drawn on a 44" x 60" battlefield seen in portrait: x across (0-44), y down (0-60),
 * side A (attacker) first. Other table sizes scale the card; landscape tables turn it a quarter.
 * Objective points: one home objective per side, two expansion objectives, the central one (on a 6
 * on a D6, two central points 6" either side of the centre, along the line between the territories).
 * Each objective point is covered by a terrain feature (a terrain objective).
 */
export type CardId = 'cp_strips' | 'cp_wedges' | 'cp_bands' | 'cp_quarters' | 'cp_stagger' | 'cp_step';
export type ObjectiveKind = 'homeA' | 'homeB' | 'expansion' | 'central';
export interface Objective {
  x: number;
  y: number;
  kind?: ObjectiveKind;
}

type Pt = [number, number];
interface Card {
  /** Name on the published card, for the reference link label */
  published: string;
  zones: [Pt[], Pt[]];
  homeA: Pt;
  expansion: Pt;
  /** Direction of the line between the two territories (through the centre) */
  divider: Pt;
}

export const CARD_W = 44;
export const CARD_H = 60;
export const DECK_URL = 'https://wahapedia.ru/wh40k11ed/the-rules/mission-deck-2026-27/#Deployment-deck';

/** Quarter circle of 9" around the centre, cut out of a quarter (from angle a0 to a1, in degrees). */
const arc = (a0: number, a1: number, steps = 6): Pt[] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
    return [round(22 + 9 * Math.cos(a)), round(30 + 9 * Math.sin(a))] as Pt;
  });
const round = (n: number) => Math.round(n * 100) / 100;

export const CARDS: Record<CardId, Card> = {
  // 12" strips along both long edges
  cp_strips: { published: 'Dawn of War', zones: [[[0, 0], [12, 0], [12, 60], [0, 60]], [[32, 0], [44, 0], [44, 60], [32, 60]]], homeA: [10, 30], expansion: [25, 10], divider: [0, 1] },
  // Triangles from the short edge to the middle of the long edge
  cp_wedges: { published: 'Crucible of Battle', zones: [[[0, 0], [44, 0], [0, 30]], [[44, 60], [0, 60], [44, 30]]], homeA: [10, 12], expansion: [34, 15], divider: [44, -30] },
  // 18" bands along both short edges
  cp_bands: { published: 'Hammer and Anvil', zones: [[[0, 0], [44, 0], [44, 18], [0, 18]], [[0, 42], [44, 42], [44, 60], [0, 60]]], homeA: [10, 14], expansion: [36, 24], divider: [1, 0] },
  // Opposite quarters, 9" kept clear around the centre
  cp_quarters: {
    published: 'Search and Destroy',
    zones: [
      [[0, 0], [22, 0], ...arc(270, 180), [0, 30]],
      [[44, 60], [22, 60], ...arc(90, 0), [44, 30]],
    ],
    homeA: [10, 14], expansion: [34, 14], divider: [44, -60],
  },
  // Long-edge strips, 14" deep on one half and 8" on the other
  cp_stagger: {
    published: 'Sweeping Engagement',
    zones: [[[0, 0], [14, 0], [14, 30], [8, 30], [8, 60], [0, 60]], [[44, 60], [30, 60], [30, 30], [36, 30], [36, 0], [44, 0]]],
    homeA: [10, 14], expansion: [30, 10], divider: [-6, 60],
  },
  // Short-edge bands, 20" deep on one half and 12" on the other
  cp_step: {
    published: 'Tipping Point',
    zones: [[[0, 0], [44, 0], [44, 12], [22, 12], [22, 20], [0, 20]], [[44, 60], [0, 60], [0, 48], [22, 48], [22, 40], [44, 40]]],
    homeA: [11, 14], expansion: [38, 24], divider: [44, -8],
  },
};
export const CARD_IDS = Object.keys(CARDS) as CardId[];
export const isCard = (d: string): d is CardId => d in CARDS;

/** From the card (44 x 60 portrait) to a table of W x H; a landscape table gets the card turned. */
function place(W: number, H: number) {
  return W > H ? ([x, y]: Pt): Pt => [round((y * W) / CARD_H), round((x * H) / CARD_W)] : ([x, y]: Pt): Pt => [round((x * W) / CARD_W), round((y * H) / CARD_H)];
}

export function cardZones(id: CardId, W: number, H: number): Pt[][] {
  const to = place(W, H);
  return CARDS[id].zones.map((z) => z.map(to));
}

/** The objective points of a card; `twoCentral` = the D6 roll of 6 (two central points 6" apart from the centre). */
export function cardObjectives(id: CardId, W: number, H: number, twoCentral = false): Objective[] {
  const c = CARDS[id];
  const mirror = ([x, y]: Pt): Pt => [CARD_W - x, CARD_H - y];
  const [dx, dy] = c.divider, len = Math.hypot(dx, dy);
  const centrals: Pt[] = twoCentral ? [[22 - (6 * dx) / len, 30 - (6 * dy) / len], [22 + (6 * dx) / len, 30 + (6 * dy) / len]] : [[22, 30]];
  const to = place(W, H);
  const at = (p: Pt, kind: ObjectiveKind): Objective => {
    const [x, y] = to(p);
    return { x, y, kind };
  };
  return [
    ...centrals.map((p) => at(p, 'central')),
    at(c.homeA, 'homeA'),
    at(mirror(c.homeA), 'homeB'),
    at(c.expansion, 'expansion'),
    at(mirror(c.expansion), 'expansion'),
  ];
}

/** Reference link to the published deployment card. */
export const cardRef = (id: CardId) => ({ u: DECK_URL, l: CARDS[id].published });
