import { useEffect, useState } from 'react';

/**
 * Hash router. Routes are declared as patterns; `:name` captures one segment, `*name` the rest.
 * Hash routing keeps hosting static (any CDN) and keeps old share links working.
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
  { pattern: 'play/t/:slug', name: 'play.tournament', section: 'play' },
  { pattern: 'play/leagues', name: 'play.leagues', section: 'play' },
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

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0];
  for (const r of ROUTES) {
    const params = match(r.pattern, path);
    if (params) return { name: r.name, params, section: r.section };
  }
  return { name: 'notFound', params: {}, section: 'none' };
}

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  const target = `#/${path.replace(/^\//, '')}`;
  if (location.hash === target) return;
  if (opts.replace) {
    history.replaceState(null, '', target);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = target;
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => {
      const path = location.hash.replace(/^#\/?/, '');
      if (LEGACY[path]) return navigate(LEGACY[path], { replace: true });
      setRoute(parseHash(location.hash));
      window.scrollTo(0, 0);
    };
    on();
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
