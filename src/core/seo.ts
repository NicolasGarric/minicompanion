import { useEffect } from 'react';
import { APP_NAME } from './brand';
import { translate, useLang, type MessageKey } from './i18n';
import type { Route, RouteName } from './router';

/**
 * Page metadata for search engines and link previews: title, description, canonical URL, robots.
 * Static HTML with the same tags is also generated at build time (scripts/build-seo.mjs) for crawlers
 * that do not run JavaScript; this keeps them right while people navigate inside the app.
 */
const PAGES: Partial<Record<RouteName, [MessageKey, MessageKey]>> = {
  home: ['platform.title', 'platform.lead'],
  paint: ['home.title', 'home.lead'],
  'paint.beginner': ['beginner.title', 'home.beginnerText'],
  play: ['play.title', 'play.lead'],
  'play.quick': ['quick.title', 'quick.lead'],
  'play.leagues': ['league.title', 'league.lead'],
  dice: ['dice.title', 'dice.lead'],
  'paint.challenges': ['challenge.pageTitle', 'challenge.pageLead'],
  'play.tablegen': ['table.title', 'table.lead'],
  'play.mentors': ['mentor.title', 'mentor.lead'],
  'play.swap': ['swap.title', 'swap.lead'],
  stores: ['stores.title', 'stores.lead'],
  legal: ['legal.title', 'legal.about'],
};

/** Personal or tool pages: useful to people, not to search results. */
const PRIVATE: RouteName[] = [
  'paint.editor', 'paint.shared', 'play.game', 'play.mine', 'play.new', 'play.tournament.new', 'play.tournament.tables', 'play.table',
  'messages', 'messages.thread', 'notifications', 'account', 'signin', 'stats', 'admin.bugs', 'admin', 'notFound',
  'paint.deck', 'paint.pile', 'paint.army', 'paint.sessions', 'paint.shelf', 'me.level', 'me.card', 'me.year',
];

function setMeta(attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.append(el);
  }
  el.content = value;
}

export function setPageMeta({ title, description, noindex = false }: { title: string; description?: string; noindex?: boolean }) {
  const full = title === APP_NAME ? title : `${title} · ${APP_NAME}`;
  document.title = full;
  setMeta('property', 'og:title', full);
  if (description) {
    const d = description.length > 160 ? `${description.slice(0, 157)}…` : description;
    setMeta('name', 'description', d);
    setMeta('property', 'og:description', d);
  }
  setMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
  const url = `${location.origin}${location.pathname}`;
  setMeta('property', 'og:url', url);
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.append(link);
  }
  link.href = url;
}

/** Route-level metadata; pages about one thing (tournament, player…) refine it themselves. */
export function useRouteMeta(route: Route) {
  const lang = useLang((s) => s.lang);
  useEffect(() => {
    const keys = PAGES[route.name];
    if (keys) setPageMeta({ title: route.name === 'home' ? APP_NAME : translate(keys[0], undefined, lang), description: translate(keys[1], undefined, lang) });
    else setPageMeta({ title: APP_NAME, noindex: PRIVATE.includes(route.name) });
  }, [route, lang]);
}

/** Structured data (schema.org JSON-LD) for the current page; removed when the page goes away. */
export function useJsonLd(id: string, data: object | null) {
  const json = data ? JSON.stringify(data) : null;
  useEffect(() => {
    if (!json) return;
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = `ld-${id}`;
    el.textContent = json;
    document.getElementById(el.id)?.remove();
    document.head.append(el);
    return () => el.remove();
  }, [id, json]);
}
