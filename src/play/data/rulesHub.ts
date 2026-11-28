/**
 * Rules hub (/play/rules, owner request 2026-11-28): for each game, links to the rules and tools its
 * publisher gives away, what is free, the licence and whether its text could be shown in the app.
 * Links only: no rules text, profile, points or picture of any publisher is copied (owner rule,
 * after the Games Workshop DMCA against the BSData repositories on 2026-11-12).
 *
 * Every entry was checked on the web on `checked`. `http` = the address answered 200 to a plain
 * request; `search` = the site refuses automated requests (403 / timeout), the page was confirmed
 * through search results and press coverage. Recheck before trusting a link: these pages move.
 *
 * Game and publisher names are trademarks of their owners, written in Latin letters in every
 * language (nominative use, to say which game a link is about). Pure data, no imports: unit-tested.
 */

/** What the publisher gives away for free. */
export type Free = 'full' | 'core' | 'starter' | 'extras' | 'check';
/** Licence of the rules text. */
export type Licence = 'owner' | 'cc_by_sa_4' | 'cc_by_nd_4';
/** What a link points to. */
export type LinkKind = 'rules' | 'downloads' | 'app' | 'builder' | 'cards' | 'site';
export type Family = 'gw' | 'major' | 'open';
export type Genre = 'scifi' | 'fantasy' | 'historical' | 'skirmish' | 'sport' | 'mecha' | 'any';

export interface HubLink {
  k: LinkKind;
  u: string;
  /** How the link was checked */
  by: 'http' | 'search';
}

export interface HubGame {
  id: string;
  name: string;
  publisher: string;
  family: Family;
  genre: Genre;
  free: Free;
  licence: Licence;
  links: HubLink[];
  /** Detailed rules index inside MiniCompanion (Warhammer 40,000: the Wahapedia index) */
  index?: 'wahapedia';
}

export const CHECKED = '2026-11-28';

const WC = 'https://www.warhammer-community.com/en-gb/downloads/';
const gw = (id: string, name: string, genre: Genre, slug: string, free: Free, extra: HubLink[] = []): HubGame => ({
  id, name, publisher: 'Games Workshop', family: 'gw', genre, free, licence: 'owner',
  links: [{ k: 'downloads', u: `${WC}${slug}/`, by: 'http' }, ...extra],
});

export const GAMES: HubGame[] = [
  // --- Games Workshop: links only, nothing copied -------------------------------------------------
  { ...gw('wh40k', 'Warhammer 40,000', 'scifi', 'warhammer-40000', 'core'), index: 'wahapedia' },
  gw('aos', 'Warhammer Age of Sigmar', 'fantasy', 'warhammer-age-of-sigmar', 'core'),
  gw('killteam', 'Kill Team', 'skirmish', 'kill-team', 'core'),
  gw('oldworld', 'Warhammer: The Old World', 'fantasy', 'warhammer-the-old-world', 'extras'),
  gw('heresy', 'Warhammer: The Horus Heresy', 'scifi', 'warhammer-the-horus-heresy', 'check'),
  gw('mesbg', 'Middle-earth Strategy Battle Game', 'fantasy', 'middle-earth-strategy-battle-game', 'starter'),
  gw('necromunda', 'Necromunda', 'skirmish', 'necromunda', 'check'),
  gw('bloodbowl', 'Blood Bowl', 'sport', 'blood-bowl', 'check'),
  gw('warcry', 'Warcry', 'skirmish', 'warcry', 'check'),
  gw('underworlds', 'Warhammer Underworlds', 'skirmish', 'warhammer-underworlds', 'check'),
  gw('legions', 'Legions Imperialis', 'scifi', 'legions-imperialis', 'check'),
  gw('titanicus', 'Adeptus Titanicus', 'mecha', 'adeptus-titanicus', 'check'),

  // --- Other big games (ICv2 hobby charts, fall 2025, and the most played) -------------------------
  {
    id: 'battletech', name: 'BattleTech · Alpha Strike', publisher: 'Catalyst Game Labs', family: 'major', genre: 'mecha', free: 'starter', licence: 'owner',
    links: [{ k: 'downloads', u: 'https://bg.battletech.com/downloads/', by: 'search' }, { k: 'cards', u: 'https://masterunitlist.battletech.com/', by: 'search' }],
  },
  {
    id: 'starcraft', name: 'StarCraft: Tabletop Miniatures Game', publisher: 'Archon Studio', family: 'major', genre: 'scifi', free: 'full', licence: 'owner',
    links: [{ k: 'rules', u: 'https://starcraft-tmg.com/files/downloads/StarCraft-TMG_EN.pdf', by: 'http' }, { k: 'site', u: 'https://starcraft-tmg.com/', by: 'http' }],
  },
  {
    id: 'warmachine', name: 'Warmachine', publisher: 'Steamforged Games', family: 'major', genre: 'mecha', free: 'full', licence: 'owner',
    links: [{ k: 'rules', u: 'https://steamforged.com/products/warmachine-rules-only-pdf', by: 'search' }, { k: 'downloads', u: 'https://steamforged.com/collections/free-resource-vault', by: 'search' }],
  },
  {
    id: 'swlegion', name: 'Star Wars: Legion', publisher: 'Atomic Mass Games', family: 'major', genre: 'scifi', free: 'core', licence: 'owner',
    links: [{ k: 'site', u: 'https://www.atomicmassgames.com/', by: 'search' }],
  },
  {
    id: 'shatterpoint', name: 'Star Wars: Shatterpoint', publisher: 'Atomic Mass Games', family: 'major', genre: 'skirmish', free: 'core', licence: 'owner',
    links: [{ k: 'site', u: 'https://www.atomicmassgames.com/', by: 'search' }],
  },
  {
    id: 'mcp', name: 'Marvel: Crisis Protocol', publisher: 'Atomic Mass Games', family: 'major', genre: 'skirmish', free: 'core', licence: 'owner',
    links: [{ k: 'site', u: 'https://www.atomicmassgames.com/', by: 'search' }],
  },
  {
    id: 'infinity', name: 'Infinity N5', publisher: 'Corvus Belli', family: 'major', genre: 'skirmish', free: 'full', licence: 'owner',
    links: [{ k: 'rules', u: 'https://downloads.corvusbelli.com/infinity/rules/infinity-rules-n5-en-v1.1.pdf', by: 'http' }, { k: 'builder', u: 'https://infinityuniverse.com/army/', by: 'http' }],
  },
  {
    id: 'conquest', name: 'Conquest', publisher: 'Para Bellum Wargames', family: 'major', genre: 'fantasy', free: 'full', licence: 'owner',
    links: [{ k: 'rules', u: 'https://www.para-bellum.com/getting-started/', by: 'http' }],
  },
  {
    id: 'trench', name: 'Trench Crusade', publisher: 'Factory Fortress', family: 'major', genre: 'skirmish', free: 'full', licence: 'owner',
    links: [{ k: 'rules', u: 'https://www.trenchcrusade.com/rules', by: 'search' }],
  },
  {
    id: 'kow', name: 'Kings of War', publisher: 'Mantic Games', family: 'major', genre: 'fantasy', free: 'core', licence: 'owner',
    links: [{ k: 'app', u: 'https://companion.manticgames.com/', by: 'http' }],
  },
  {
    id: 'halo', name: 'Halo: Flashpoint', publisher: 'Mantic Games', family: 'major', genre: 'scifi', free: 'core', licence: 'owner',
    links: [{ k: 'app', u: 'https://companion.manticgames.com/', by: 'http' }],
  },
  {
    id: 'asoiaf', name: 'A Song of Ice and Fire: Tabletop Miniatures Game', publisher: 'CMON', family: 'major', genre: 'fantasy', free: 'full', licence: 'owner',
    links: [{ k: 'site', u: 'https://asoiaf.cmon.com/', by: 'search' }],
  },
  {
    id: 'malifaux', name: 'Malifaux', publisher: 'Wyrd Games', family: 'major', genre: 'skirmish', free: 'core', licence: 'owner',
    links: [{ k: 'site', u: 'https://www.wyrd-games.net/', by: 'http' }],
  },
  {
    id: 'boltaction', name: 'Bolt Action', publisher: 'Warlord Games', family: 'major', genre: 'historical', free: 'extras', licence: 'owner',
    links: [{ k: 'downloads', u: 'https://warlord-community.warlordgames.com/', by: 'http' }],
  },
  {
    id: 'opr', name: 'Grimdark Future · Age of Fantasy', publisher: 'OnePageRules', family: 'major', genre: 'any', free: 'core', licence: 'owner',
    links: [{ k: 'rules', u: 'https://onepagerules.com/get-started', by: 'http' }, { k: 'builder', u: 'https://army-forge.onepagerules.com/', by: 'http' }],
  },

  // --- Open licence: text could be shown in the app, with attribution and the licence terms -------
  {
    id: 'landwar', name: 'LANDWAR', publisher: 'subject9x', family: 'open', genre: 'any', free: 'full', licence: 'cc_by_sa_4',
    links: [{ k: 'rules', u: 'https://subject9x.itch.io/landwar', by: 'http' }],
  },
  {
    id: 't9a', name: 'The 9th Age: Fantasy Battles', publisher: 'The 9th Age', family: 'open', genre: 'fantasy', free: 'full', licence: 'cc_by_nd_4',
    links: [{ k: 'site', u: 'https://www.the-ninth-age.com/', by: 'http' }],
  },
];

export const FAMILIES: Family[] = ['gw', 'major', 'open'];
export const GENRES: Genre[] = ['scifi', 'fantasy', 'skirmish', 'mecha', 'historical', 'sport', 'any'];

/** Could the rules text be shown inside the app? Only under an open licence, never for 'owner'. */
export const embeddable = (l: Licence): 'no' | 'yes' | 'verbatim' => (l === 'cc_by_sa_4' ? 'yes' : l === 'cc_by_nd_4' ? 'verbatim' : 'no');

export const LICENCE_URL: Partial<Record<Licence, string>> = {
  cc_by_sa_4: 'https://creativecommons.org/licenses/by-sa/4.0/',
  cc_by_nd_4: 'https://creativecommons.org/licenses/by-nd/4.0/',
};

/** Case- and accent-insensitive search on game and publisher names. */
export function searchGames(games: HubGame[], q: string, opts: { family?: Family; genre?: Genre } = {}): HubGame[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const words = norm(q).split(/\s+/).filter(Boolean);
  return games.filter((g) => {
    if (opts.family && g.family !== opts.family) return false;
    if (opts.genre && g.genre !== opts.genre) return false;
    const hay = norm(`${g.name} ${g.publisher}`);
    return words.every((w) => hay.includes(w));
  });
}
