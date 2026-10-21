import { create } from 'zustand';
import { en, type MessageKey } from './en';
import { ja } from './ja';

export type Lang = 'en' | 'ja';
export type { MessageKey };

const dictionaries: Record<Lang, Record<MessageKey, string>> = { en, ja };
const STORAGE_KEY = 'cf.lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ja') return saved;
  } catch {
    /* storage unavailable: fall back to the browser language */
  }
  return navigator.language?.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

export const useLang = create<{ lang: Lang; setLang: (l: Lang) => void }>((set) => ({
  lang: initialLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* preference not remembered, harmless */
    }
    document.documentElement.lang = lang;
    set({ lang });
  },
}));

document.documentElement.lang = useLang.getState().lang;

export type Vars = Record<string, string | number>;

/** Translation outside React (store, canvas). */
export function translate(key: MessageKey, vars?: Vars, lang: Lang = useLang.getState().lang): string {
  let s = dictionaries[lang][key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Hook: re-renders the component when the language changes. */
export function useT() {
  const lang = useLang((s) => s.lang);
  return (key: MessageKey, vars?: Vars) => translate(key, vars, lang);
}

/** For keys built dynamically (roles, types…). */
export const k = (s: string) => s as MessageKey;
