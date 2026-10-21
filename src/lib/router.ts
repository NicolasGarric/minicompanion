import { useEffect, useState } from 'react';

export type RouteName = 'home' | 'editor' | 'beginner' | 'stores' | 'legal' | 'stats' | 'shared';

export interface Route {
  name: RouteName;
  param?: string;
}

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  const [head, ...rest] = path.split('/');
  switch (head) {
    case 'editor':
    case 'beginner':
    case 'stores':
    case 'legal':
    case 'stats':
      return { name: head };
    case 's':
      return { name: 'shared', param: rest.join('/') };
    default:
      return { name: 'home' };
  }
}

export function navigate(path: string) {
  const target = `#/${path.replace(/^\//, '')}`;
  if (location.hash !== target) location.hash = target;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseHash(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
