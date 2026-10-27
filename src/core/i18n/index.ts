import { create } from 'zustand';
import { en, type MessageKey } from './en';

/**
 * Languages of the app. One language at a time, chosen in the header (owner decision 2026-10-23);
 * the first visit follows the browser languages. `locale` is used for dates and numbers.
 * Chinese is Simplified, Portuguese is Brazilian.
 */
export const LANGS = [
  { code: 'en', name: 'English', locale: 'en-GB' },
  { code: 'fr', name: 'Français', locale: 'fr-FR' },
  { code: 'es', name: 'Español', locale: 'es-ES' },
  { code: 'de', name: 'Deutsch', locale: 'de-DE' },
  { code: 'it', name: 'Italiano', locale: 'it-IT' },
  { code: 'pt', name: 'Português (Brasil)', locale: 'pt-BR' },
  { code: 'ja', name: '日本語', locale: 'ja-JP' },
  { code: 'zh', name: '简体中文', locale: 'zh-CN' },
  { code: 'ko', name: '한국어', locale: 'ko-KR' },
] as const;

export type Lang = (typeof LANGS)[number]['code'];
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
