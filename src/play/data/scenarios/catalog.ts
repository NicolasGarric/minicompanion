import type { Lang } from '../../../core/i18n/langs.ts';
import { CAMP_COLORS, PLACE_VALUE, type Board } from '../../lib/narrativeBoard.ts';
import { AFTERMATHS, MISSIONS, RULES, T9_ORDER, tr, type T9 } from './blocks.ts';
import { CAMPAIGNS_1 } from './campaigns1.ts';
import { CAMPAIGNS_2 } from './campaigns2.ts';
import { CAMPAIGNS_3 } from './campaigns3.ts';
import { CAMPAIGNS_4 } from './campaigns4.ts';
import { CAMPAIGNS_5 } from './campaigns5.ts';
import { STANDALONE } from './standalone.ts';
import type { CampaignTemplate, Scenario } from './types.ts';

/**
 * The scenario library: 10 campaigns of 5 scenarios, plus 12 standalone ones. A campaign board stores
 * scenario ids ("amber_veil.3", "free.7") and lore ids ("amber_veil.4"), not texts, so every player
 * reads them in their own language.
 */
export const TEMPLATES: CampaignTemplate[] = [...CAMPAIGNS_1, ...CAMPAIGNS_2, ...CAMPAIGNS_3, ...CAMPAIGNS_4, ...CAMPAIGNS_5];
export { STANDALONE, tr };
export type { CampaignTemplate, Scenario, T9 };

export interface ScenarioRef { id: string; scenario: Scenario; campaign: CampaignTemplate | null; n: number }

export const SCENARIOS: ScenarioRef[] = [
  ...TEMPLATES.flatMap((c) => c.scenarios.map((scenario, i) => ({ id: `${c.key}.${i + 1}`, scenario, campaign: c, n: i + 1 }))),
  ...STANDALONE.map((scenario, i) => ({ id: `free.${i + 1}`, scenario, campaign: null, n: i + 1 })),
];
const BY_ID = new Map(SCENARIOS.map((s) => [s.id, s]));
export const scenarioById = (id: string | null | undefined) => (id ? BY_ID.get(id) ?? null : null);

/** Background text of a place of a ready-made campaign ("key.placeId"). */
export function loreText(id: string | null | undefined, lang: Lang): string {
  if (!id) return '';
  const [key, place] = id.split('.');
  const lore = TEMPLATES.find((c) => c.key === key)?.places.find((p) => String(p.id) === place)?.lore;
  return lore ? tr(lore, lang) : '';
}

/** {A} and {B} replaced by the camp names (swapped when camp B is the attacker of the mission). */
const fill = (text: string, a: string, b: string) => text.replace(/\{A\}/g, a).replace(/\{B\}/g, b);
export function scenarioTexts(s: Scenario, lang: Lang, campA: string, campB: string) {
  const [ma, mb] = s.swap ? [campB, campA] : [campA, campB];
  return {
    title: tr(s.title, lang),
    hook: fill(tr(s.hook, lang), campA, campB),
    mission: fill(tr(MISSIONS[s.mission], lang), ma, mb),
    rule: tr(RULES[s.rule], lang),
    aftermath: tr(AFTERMATHS[s.after], lang),
  };
}

export const templateTitle = (t: CampaignTemplate, lang: Lang) => tr(t.title, lang);
export const templatePitch = (t: CampaignTemplate, lang: Lang) => tr(t.pitch, lang);

/**
 * Title and description of a campaign made from a template, in the reader's language, as long as
 * the master kept the template's own text (in any language); their own text is shown as written.
 */
export function localizedCampaign(row: { title: string; description: string | null; template_key: string | null }, lang: Lang) {
  const t = TEMPLATES.find((x) => x.key === row.template_key);
  if (!t) return { title: row.title, description: row.description };
  return {
    title: t.title.includes(row.title) ? tr(t.title, lang) : row.title,
    description: row.description && t.pitch.includes(row.description) ? tr(t.pitch, lang) : row.description,
  };
}

/** The board of a template; camps keep the names the creator gave them. Table maps are rolled by the caller. */
export function templateBoard(t: CampaignTemplate, campNames: [string, string]): Board {
  return {
    bg: 'blue',
    places: t.places.map((p) => ({
      id: p.id, name: p.name, type: p.type, x: p.x, y: p.y, owner: p.owner ?? null, capital: !!p.capital, fort: 0,
      value: PLACE_VALUE[p.type], scenario: '', notes: '', map: null,
      sc: p.sc ? `${t.key}.${p.sc}` : null, lore: p.lore ? `${t.key}.${p.id}` : null,
    })),
    routes: t.routes.map(([a, b, type, owner]) => ({ a, b, type, owner: owner ?? null, cut: false })),
    zones: t.zones.map(([x, y, r, type]) => ({ x, y, r, type })),
    camps: [
      { id: 'A', name: campNames[0], color: CAMP_COLORS[0], shape: 'shield', sign: 'eye', motto: '', res: 3, heroes: [] },
      { id: 'B', name: campNames[1], color: CAMP_COLORS[1], shape: 'hex', sign: 'claw', motto: '', res: 3, heroes: [] },
    ],
    custom: [],
    victory: { rule: 'capital', n: 8 },
  };
}

export { T9_ORDER };
