import type { Deployment, Theme } from '../../lib/tableGen.ts';
import type { PlaceType, RouteType, ZoneType } from '../../lib/narrativeBoard.ts';
import type { AftermathKey, MissionKey, RuleKey, T9 } from './blocks.ts';

/** A complete scenario: story (title, hook), mission, special rule, deployment, aftermath, table theme. */
export interface Scenario {
  title: T9;
  hook: T9;
  mission: MissionKey;
  rule: RuleKey;
  deploy: Exclude<Deployment, 'none'>;
  after: AftermathKey;
  /** Terrain theme of the table map rolled for it */
  theme: Theme;
  /** Camp B attacks: {A} and {B} are swapped in the mission text */
  swap?: boolean;
}

export interface PlaceSeed {
  id: number;
  name: string;
  type: PlaceType;
  x: number;
  y: number;
  owner?: 'A' | 'B';
  capital?: boolean;
  /** Scenario number (1-5) of the campaign played here */
  sc?: number;
  /** Background of the place */
  lore?: T9;
}

export interface CampaignTemplate {
  key: string;
  title: T9;
  pitch: T9;
  /** Invented proper noun, the same in every language */
  sector: string;
  places: PlaceSeed[];
  routes: [number, number, RouteType, ('A' | 'B')?][];
  zones: [number, number, number, ZoneType][];
  /** Exactly five, played in order */
  scenarios: [Scenario, Scenario, Scenario, Scenario, Scenario];
}
