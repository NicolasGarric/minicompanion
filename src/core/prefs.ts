import { create } from 'zustand';

/** Small per-device preferences shared by every module (localStorage). */
interface Prefs {
  /** Retailer search URL chosen by the user, with a `{q}` placeholder. Empty = neutral web search. */
  retailerTemplate: string;
  setRetailerTemplate: (v: string) => void;
}

const KEY = 'cf.prefs';

function load(): Pick<Prefs, 'retailerTemplate'> {
  try {
    return { retailerTemplate: '', ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { retailerTemplate: '' };
  }
}

export const usePrefs = create<Prefs>((set, get) => ({
  ...load(),
  setRetailerTemplate: (retailerTemplate) => {
    set({ retailerTemplate });
    try {
      localStorage.setItem(KEY, JSON.stringify({ retailerTemplate: get().retailerTemplate }));
    } catch {
      /* preference not remembered, harmless */
    }
  },
}));
