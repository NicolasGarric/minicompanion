/**
 * Recommended competitive layouts (layouts2026.ts, measured from the published images) turned into
 * our tables: the deployment card, terrain pieces drawn as our ruins, objective points with their kind,
 * and reference links to the published layout, deployment card and primary missions (names only).
 */
import type { RefLink } from '../../core/lib/refLinks.ts';
import { DECK_URL, cardRef } from './deployCards.ts';
import { LAYOUT_ROWS, type Disposition, type LayoutRow } from './layouts2026.ts';
import type { ObjectiveKind } from './deployCards.ts';
import { zonesFor, type Table } from './tableGen.ts';
import type { Piece } from './terrain.ts';

export type { Disposition } from './layouts2026.ts';
export const DISPOSITIONS: Disposition[] = ['take', 'purge', 'disrupt', 'recon', 'assets'];
export const VARIANTS = ['A', 'B', 'C'] as const;
export type Variant = (typeof VARIANTS)[number];

/** Published names, used as labels of the links to the published cards. */
export const DISPOSITION_NAME: Record<Disposition, string> = {
  take: 'Take and Hold', purge: 'Purge the Foe', disrupt: 'Disruption', recon: 'Reconnaissance', assets: 'Priority Assets',
};
/** Primary mission of a player from their force disposition and the opponent's (published pairing table). */
const PRIMARY: Record<Disposition, Record<Disposition, string>> = {
  take: { take: 'Battlefield Dominance', purge: 'Immovable Object', disrupt: 'Determined Acquisition', recon: 'Purge and Secure', assets: 'Inescapable Dominion' },
  purge: { take: 'Unstoppable Force', purge: 'Meatgrinder', disrupt: 'Punishment', recon: 'Consecrate', assets: 'Destroyer’s Wrath' },
  disrupt: { take: 'Death Trap', purge: 'Delaying Action', disrupt: 'Outmanoeuvre', recon: 'Smoke and Mirrors', assets: 'Locate and Deny' },
  recon: { take: 'Reconnaissance Sweep', purge: 'Triangulation', disrupt: 'Surveil the Foe', recon: 'Gather Intel', assets: 'Search and Scour' },
  assets: { take: 'Secure Asset', purge: 'Vital Link', disrupt: 'Extract Relic', recon: 'Vanguard Operation', assets: 'Sabotage' },
};
export const primaryMission = (mine: Disposition, theirs: Disposition) => PRIMARY[mine][theirs];

const PAGE = DECK_URL.replace(/#.*$/, '');
const KINDS: ObjectiveKind[] = ['homeA', 'homeB', 'expansion', 'central'];

/** The layout for a pair of dispositions (in any order) and a variant. */
export function findLayout(a: Disposition, b: Disposition, v: Variant): LayoutRow | undefined {
  return LAYOUT_ROWS.find((r) => r.v === v && ((r.a === a && r.b === b) || (r.a === b && r.b === a)));
}

/** A recommended layout as a table: 44" x 60", our ruins on the published footprints. */
export function layoutTable(a: Disposition, b: Disposition, v: Variant): Table | null {
  const row = findLayout(a, b, v);
  if (!row) return null;
  const pieces: Piece[] = row.p.map(([shape, x, y, w, h, rot, dense], i) => ({
    kind: 'ruin', shape: shape ? 'wedge' : 'rect', x, y, w, h, rot, cover: dense ? 'heavy' : 'light', traits: [], seed: 1000 + i,
  }));
  const refs: RefLink[] = [
    { u: `${PAGE}#Mission-Generator`, l: `${DISPOSITION_NAME[row.a]} vs ${DISPOSITION_NAME[row.b]} · Layout ${v}`.slice(0, 60) },
    cardRef(row.card),
    // One link (addresses must differ): both primary missions in the label, the first player's first
    { u: `${PAGE}#Primary-Mission-deck`, l: (a === b ? primaryMission(a, b) : `${primaryMission(a, b)} / ${primaryMission(b, a)}`).slice(0, 60) },
  ];
  return {
    seed: 0,
    mode: 'custom',
    name: `${DISPOSITION_NAME[a]} / ${DISPOSITION_NAME[b]} · ${v}`.slice(0, 60),
    width: 44,
    height: 60,
    deployment: row.card,
    zones: zonesFor(row.card, 44, 60),
    pieces,
    objectives: row.o.map(([x, y, k]) => ({ x, y, kind: KINDS[k] })),
    mission: '',
    extra: 'none',
    rounds: 5,
    refs,
  };
}
