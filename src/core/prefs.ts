import { create } from 'zustand';

/** Small per-device preferences shared by every module (localStorage). */
interface Prefs {
  /** Retailer search URL chosen by the user, with a `{q}` placeholder. Empty = neutral web search. */
  retailerTemplate: string;
  /** Paint brand used for suggestions ('all' = every brand), e.g. the range sold in the user's store. */
  brand: string;
  /** Unit card sections the player folded (owner request 2026-11-28: open / closed state remembered) */
  cardClosed: string[];
  setRetailerTemplate: (v: string) => void;
  setBrand: (v: string) => void;
  toggleCardSection: (id: string) => void;
}

const KEY = 'cf.prefs';

type Stored = Pick<Prefs, 'retailerTemplate' | 'brand' | 'cardClosed'>;
const DEFAULTS: Stored = { retailerTemplate: '', brand: 'all', cardClosed: [] };

function load(): Stored {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

function persist(p: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* preference not remembered, harmless */
  }
}

const stored = (p: Prefs): Stored => ({ retailerTemplate: p.retailerTemplate, brand: p.brand, cardClosed: p.cardClosed });

export const usePrefs = create<Prefs>((set, get) => ({
  ...load(),
  setRetailerTemplate: (retailerTemplate) => {
    set({ retailerTemplate });
    persist(stored(get()));
  },
  setBrand: (brand) => {
    set({ brand });
    persist(stored(get()));
  },
  toggleCardSection: (id) => {
    const c = get().cardClosed;
    set({ cardClosed: c.includes(id) ? c.filter((x) => x !== id) : [...c, id] });
    persist(stored(get()));
  },
}));
