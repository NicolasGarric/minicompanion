/**
 * Languages of the app (no dependency: the build scripts import this file too). One language at a time, chosen in the header (owner decision 2026-10-23);
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

/**
 * Public pages also exist under a language prefix ("/ja/play", owner decision 2026-10-27) so search
 * engines can index each language; English has no prefix. `hreflang` values follow Google's codes.
 */
export const URL_LANGS = LANGS.map((l) => l.code).filter((c) => c !== 'en') as Exclude<Lang, 'en'>[];
export const HREFLANG: Record<Lang, string> = { en: 'en', fr: 'fr', es: 'es', de: 'de', it: 'it', pt: 'pt-BR', ja: 'ja', zh: 'zh-Hans', ko: 'ko' };
/** "/ja/play/t/x" -> { lang: 'ja', rest: '/play/t/x' }; no prefix -> lang null. */
export function splitLangPath(pathname: string): { lang: Exclude<Lang, 'en'> | null; rest: string } {
  const seg = pathname.split('/')[1] as Exclude<Lang, 'en'>;
  if (!URL_LANGS.includes(seg)) return { lang: null, rest: pathname || '/' };
  return { lang: seg, rest: pathname.slice(seg.length + 1) || '/' };
}
/** The address of a page in a language ("/play" + ja -> "/ja/play"; English keeps "/play"). */
export const localizedPath = (rest: string, lang: Lang) => (lang === 'en' ? rest : `/${lang}${rest === '/' ? '' : rest}`);

