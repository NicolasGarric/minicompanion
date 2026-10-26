import { useEffect, useState } from 'react';

/**
 * Path router (History API): every page has a real URL that search engines can index.
 * Routes are declared as patterns; `:name` captures one segment, `*name` the rest.
 * Old `#/…` links (printed QR codes, bookmarks) are redirected on load; shared schemes stay in the
 * hash (`/#/s/…`) on purpose, so their data is never sent to the server.
 */
export type RouteName =
  | 'home'
  | 'paint'
  | 'paint.editor'
  | 'paint.beginner'
  | 'paint.shared'
  | 'play'
  | 'play.quick'
  | 'play.mine'
  | 'play.new'
  | 'play.game'
  | 'play.tournament'
  | 'play.leagues'
  | 'play.dice'
  | 'play.tournament.new'
  | 'play.tournament.tables'
  | 'play.table'
  | 'play.league'
  | 'play.store'
  | 'player'
  | 'messages'
  | 'messages.thread'
  | 'notifications'
  | 'stores'
  | 'account'
  | 'signin'
  | 'legal'
  | 'stats'
  | 'admin.bugs'
  | 'notFound';

export type Section = 'paint' | 'play' | 'none';

export interface Route {
  name: RouteName;
  params: Record<string, string>;
  section: Section;
}

const ROUTES: { pattern: string; name: RouteName; section: Section }[] = [
  { pattern: '', name: 'home', section: 'none' },
  { pattern: 'paint', name: 'paint', section: 'paint' },
  { pattern: 'paint/editor', name: 'paint.editor', section: 'paint' },
  { pattern: 'paint/beginner', name: 'paint.beginner', section: 'paint' },
  // Public scheme links are already shared in the wild: this path must never change.
  { pattern: 's/*data', name: 'paint.shared', section: 'paint' },
  { pattern: 'play', name: 'play', section: 'play' },
  { pattern: 'play/quick', name: 'play.quick', section: 'play' },
  { pattern: 'play/mine', name: 'play.mine', section: 'play' },
  { pattern: 'play/new', name: 'play.new', section: 'play' },
  { pattern: 'play/game/:id', name: 'play.game', section: 'play' },
  { pattern: 'play/t-new', name: 'play.tournament.new', section: 'play' },
  { pattern: 'play/t/:slug', name: 'play.tournament', section: 'play' },
  { pattern: 'play/t/:slug/tables', name: 'play.tournament.tables', section: 'play' },
  { pattern: 'play/table/:token', name: 'play.table', section: 'play' },
  { pattern: 'play/leagues', name: 'play.leagues', section: 'play' },
  { pattern: 'play/dice', name: 'play.dice', section: 'play' },
  { pattern: 'play/league/:id', name: 'play.league', section: 'play' },
  { pattern: 'play/store/:id', name: 'play.store', section: 'play' },
  { pattern: 'u/:handle', name: 'player', section: 'play' },
  { pattern: 'messages', name: 'messages', section: 'none' },
  { pattern: 'messages/:id', name: 'messages.thread', section: 'none' },
  { pattern: 'notifications', name: 'notifications', section: 'none' },
  { pattern: 'stores', name: 'stores', section: 'none' },
  { pattern: 'account', name: 'account', section: 'none' },
  { pattern: 'signin', name: 'signin', section: 'none' },
  { pattern: 'legal', name: 'legal', section: 'none' },
  { pattern: 'stats', name: 'stats', section: 'none' },
  { pattern: 'admin/bugs', name: 'admin.bugs', section: 'none' },
];

/** Paths used before the Paint / Play split. */
const LEGACY: Record<string, string> = {
  editor: 'paint/editor',
  beginner: 'paint/beginner',
};

function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith('*')) {
      params[p[i].slice(1)] = s.slice(i).join('/');
      return params;
    }
    if (s[i] === undefined) return null;
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return p.length === s.length ? params : null;
}

export function parsePath(pathname: string): Route {
  const path = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  for (const r of ROUTES) {
    const params = match(r.pattern, path);
    if (params) return { name: r.name, params, section: r.section };
  }
  return { name: 'notFound', params: {}, section: 'none' };
}

/** Current route: the shared-scheme hash wins (its data must stay out of the path). */
function current(): Route {
  if (location.hash.startsWith('#/s/')) return parsePath(location.hash.slice(1).split('?')[0]);
  return parsePath(location.pathname);
}

/** Path of the current page without the leading slash, query included (to come back after sign-in). */
export const currentPath = () => `${location.pathname.replace(/^\//, '')}${location.search}`;

const CHANGE = 'routechange';

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  const target = `/${path.replace(/^[#/]+/, '')}`;
  if (`${location.pathname}${location.search}` === target && !location.hash) return;
  history[opts.replace ? 'replaceState' : 'pushState'](null, '', target);
  window.dispatchEvent(new Event(CHANGE));
}

/** Old hash URLs (`/#/play/t/x`) and legacy paths become clean paths, without a reload. */
function upgradeUrl() {
  const hash = location.hash;
  if (hash.startsWith('#/') && !hash.startsWith('#/s/')) {
    history.replaceState(null, '', `/${hash.slice(2)}`);
  }
  const legacy = LEGACY[location.pathname.replace(/^\//, '')];
  if (legacy) history.replaceState(null, '', `/${legacy}`);
}

/** Same-origin link clicks stay in the app (no reload); new tabs, downloads and modifiers behave normally. */
function onClick(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element | null)?.closest?.('a');
  if (!a || a.target || a.hasAttribute('download')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || /^\/(assets|data|demo)\//.test(url.pathname)) return;
  if (url.hash.startsWith('#/s/')) return;
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return; // in-page anchor
  e.preventDefault();
  navigate(`${url.pathname}${url.search}`);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => (upgradeUrl(), current()));
  useEffect(() => {
    const on = () => {
      upgradeUrl();
      setRoute(current());
      window.scrollTo(0, 0);
    };
    window.addEventListener(CHANGE, on);
    window.addEventListener('popstate', on);
    window.addEventListener('hashchange', on);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener(CHANGE, on);
      window.removeEventListener('popstate', on);
      window.removeEventListener('hashchange', on);
      document.removeEventListener('click', onClick);
    };
  }, []);
  return route;
}
