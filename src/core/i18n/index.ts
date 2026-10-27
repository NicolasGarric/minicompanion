import { create } from 'zustand';
import { en, type MessageKey } from './en';

export { HREFLANG, LANGS, localizedPath, splitLangPath, URL_LANGS, type Lang } from './langs';
import { LANGS, splitLangPath, type Lang } from './langs';
export type { MessageKey };

type Dictionary = Record<MessageKey, string>;
/**
 * English is bundled (reference and fallback); the other dictionaries are separate chunks loaded
 * when their language is picked, so the main bundle carries one language instead of nine.
 */
const dictionaries: Partial<Record<Lang, Dictionary>> = { en };
const loaders: Record<Exclude<Lang, 'en'>, () => Promise<Dictionary>> = {
  fr: () => import('./fr').then((m) => m.fr),
  es: () => import('./es').then((m) => m.es),
  de: () => import('./de').then((m) => m.de),
  it: () => import('./it').then((m) => m.it),
  pt: () => import('./pt').then((m) => m.pt),
  ja: () => import('./ja').then((m) => m.ja),
  zh: () => import('./zh').then((m) => m.zh),
  ko: () => import('./ko').then((m) => m.ko),
};

/** Loads a dictionary once; on a network error the app keeps showing English for that language. */
export async function loadLang(lang: Lang): Promise<void> {
  if (dictionaries[lang]) return;
  try {
    dictionaries[lang] = await loaders[lang as Exclude<Lang, 'en'>]();
  } catch {
    /* offline or chunk missing: English fallback */
  }
}
export const isLoaded = (lang: Lang) => !!dictionaries[lang];
const STORAGE_KEY = 'cf.lang';
const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.code === v);
export const localeOf = (lang: Lang) => LANGS.find((l) => l.code === lang)?.locale ?? 'en-GB';
/** A language in its own name ("Deutsch", "한국어"), as language pickers show it. */
export const langName = (code: string) => LANGS.find((l) => l.code === code)?.name ?? code;

function initialLang(): Lang {
  // A language address ("/ja/…") wins: it is the page the visitor asked for.
  const fromUrl = splitLangPath(location.pathname).lang;
  if (fromUrl) return fromUrl;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* storage unavailable: fall back to the browser language */
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag?.toLowerCase().split('-')[0];
    if (isLang(base)) return base;
  }
  return 'en';
}

export const useLang = create<{ lang: Lang; setLang: (l: Lang) => Promise<void> }>((set) => ({
  lang: initialLang(),
  setLang: async (lang) => {
    await loadLang(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* preference not remembered, harmless */
    }
    document.documentElement.lang = localeOf(lang);
    set({ lang });
  },
}));

document.documentElement.lang = localeOf(useLang.getState().lang);

export type Vars = Record<string, string | number>;

/** Translation outside React (store, canvas). */
export function translate(key: MessageKey, vars?: Vars, lang: Lang = useLang.getState().lang): string {
  let s = dictionaries[lang]?.[key] ?? en[key] ?? key;
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
