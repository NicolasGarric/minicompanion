import { create } from 'zustand';

/** Small per-device preferences shared by every module (localStorage). */
interface Prefs {
  /** Retailer search URL chosen by the user, with a `{q}` placeholder. Empty = neutral web search. */
  retailerTemplate: string;
  /** Paint brand used for suggestions ('all' = every brand), e.g. the range sold in the user's store. */
  brand: string;
  setRetailerTemplate: (v: string) => void;
  setBrand: (v: string) => void;
}

const KEY = 'cf.prefs';

type Stored = Pick<Prefs, 'retailerTemplate' | 'brand'>;
const DEFAULTS: Stored = { retailerTemplate: '', brand: 'all' };

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

export const usePrefs = create<Prefs>((set, get) => ({
  ...load(),
  setRetailerTemplate: (retailerTemplate) => {
    set({ retailerTemplate });
    persist({ retailerTemplate, brand: get().brand });
  },
  setBrand: (brand) => {
    set({ brand });
    persist({ retailerTemplate: get().retailerTemplate, brand });
  },
}));
