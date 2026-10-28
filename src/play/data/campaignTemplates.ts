import type { Lang } from '../../core/i18n/langs.ts';
import { CAMP_COLORS, PLACE_VALUE, type Board, type PlaceType, type RouteType, type ZoneType } from '../lib/narrativeBoard.ts';

/**
 * Ready-made narrative campaigns: an invented sector, a network, two camps named by the players,
 * a scenario on the key places. Texts in English, French and Japanese; other languages get English.
 * Place names are invented proper nouns, the same in every language. No faction or rule of any game.
 */
type Text = { en: string; fr: string; ja: string };
const pick = (t: Text, lang: Lang) => (lang === 'fr' || lang === 'ja' ? t[lang] : t.en);

interface PlaceSeed { id: number; name: string; type: PlaceType; x: number; y: number; owner?: 'A' | 'B'; capital?: boolean; scenario?: Text; notes?: Text }
export interface CampaignTemplate {
  key: string;
  title: Text;
  sector: string;
  pitch: Text;
  places: PlaceSeed[];
  routes: [number, number, RouteType, ('A' | 'B')?][];
  zones: [number, number, number, ZoneType][];
}

export const TEMPLATES: CampaignTemplate[] = [
  {
    key: 'amber_veil',
    title: { en: 'The Amber Veil', fr: 'Le Voile d’Ambre', ja: '琥珀のヴェール' },
    sector: 'Voile d’Ambre',
    pitch: {
      en: 'A race for the routes of a nebula. Whoever holds the network holds the sector.',
      fr: 'Une course aux routes dans une nébuleuse. Qui tient le réseau tient le secteur.',
      ja: '星雲の航路をめぐる争奪戦。ネットワークを握る者がセクターを制する。',
    },
    places: [
      { id: 1, name: 'Quorvane', type: 'station', x: 120, y: 300, owner: 'A', capital: true,
        scenario: { en: 'First contact at Quorvane', fr: 'Premier contact à Quorvane', ja: 'クオルヴェインの初接触' },
        notes: { en: 'Relay station: every convoy entering the Veil passes its docks.', fr: 'Station-relais : tout convoi qui entre dans le Voile passe par ses quais.', ja: '中継ステーション。ヴェールに入る輸送船はすべてここの埠頭を通る。' } },
      { id: 2, name: 'Sylith Prime', type: 'planet', x: 250, y: 160, owner: 'A',
        scenario: { en: 'The hanging gardens', fr: 'Les jardins suspendus', ja: '空中庭園' } },
      { id: 3, name: 'Vey', type: 'moon', x: 300, y: 250 },
      { id: 4, name: 'Ambrecœur', type: 'nebula', x: 420, y: 120,
        scenario: { en: 'Inside the veil', fr: 'Dans le voile', ja: 'ヴェールの内側' },
        notes: { en: 'Sensors see nothing beyond 18″ here.', fr: 'Ici, les capteurs ne voient rien au-delà de 18″.', ja: 'ここではセンサーは18″より先を捉えられない。' } },
      { id: 5, name: 'Hollis', type: 'belt', x: 430, y: 330,
        scenario: { en: 'The miners’ rush', fr: 'La ruée des mineurs', ja: '採掘者のラッシュ' } },
      { id: 6, name: 'Tarsène', type: 'planet', x: 300, y: 470 },
      { id: 7, name: 'Imbrel', type: 'wreck', x: 560, y: 230,
        scenario: { en: 'The nameless wreck', fr: 'L’épave sans nom', ja: '名もなき残骸' },
        notes: { en: 'A cathedral-ship. Its signal changes every night.', fr: 'Un vaisseau-cathédrale. Son signal change chaque nuit.', ja: '聖堂船の残骸。その信号は毎晩変わる。' } },
      { id: 8, name: 'Corvo', type: 'planet', x: 600, y: 430, owner: 'B' },
      { id: 9, name: 'Nyss', type: 'moon', x: 690, y: 300, owner: 'B' },
      { id: 10, name: 'Durn-Kael', type: 'planet', x: 790, y: 180, owner: 'B', capital: true,
        scenario: { en: 'The siege of Durn-Kael', fr: 'Le siège de Durn-Kael', ja: 'ダーン＝ケイル包囲戦' },
        notes: { en: 'A fortress-city inside a crater.', fr: 'Une ville-forteresse dans un cratère.', ja: 'クレーターの中の要塞都市。' } },
      { id: 11, name: 'Pallas-Ys', type: 'station', x: 780, y: 470 },
    ],
    routes: [[1, 2, 'normal'], [1, 3, 'normal'], [2, 4, 'long'], [3, 5, 'normal'], [1, 6, 'normal'], [6, 5, 'unstable'], [4, 7, 'normal'], [5, 7, 'normal'],
      [5, 8, 'normal'], [7, 9, 'normal'], [8, 9, 'normal'], [9, 10, 'normal'], [7, 10, 'long'], [8, 11, 'normal'], [11, 10, 'unstable'], [6, 8, 'secret', 'A']],
    zones: [[430, 130, 95, 'nebula'], [470, 360, 70, 'debris'], [790, 330, 175, 'border']],
  },
];

/** The board of a template in the creator's language (camps keep the neutral names A / B). */
export function templateBoard(t: CampaignTemplate, lang: Lang, campNames: [string, string]): Board {
  return {
    bg: 'blue',
    places: t.places.map((p) => ({
      id: p.id, name: p.name, type: p.type, x: p.x, y: p.y, owner: p.owner ?? null, capital: !!p.capital, fort: 0,
      value: PLACE_VALUE[p.type], scenario: p.scenario ? pick(p.scenario, lang) : '', notes: p.notes ? pick(p.notes, lang) : '', map: null,
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

export const templateTitle = (t: CampaignTemplate, lang: Lang) => pick(t.title, lang);
export const templatePitch = (t: CampaignTemplate, lang: Lang) => pick(t.pitch, lang);
