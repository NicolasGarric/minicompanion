import type { ReactNode } from 'react';
import { useLang, useT, type Lang } from '../i18n';
import { navigate, type RouteName } from '../lib/router';
import { APP_NAME } from '../lib/share';

export function Logo() {
  return (
    <span className="logo">
      {/* Original mark, not derived from any brand */}
      <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e3b04b" />
            <stop offset="1" stopColor="#9a2b2b" />
          </linearGradient>
        </defs>
        <path d="M32 6l22 11v17c0 13-10 21-22 24C20 55 10 47 10 34V17z" fill="url(#lg)" />
        <circle cx="32" cy="30" r="8" fill="#14161c" />
      </svg>
      <span>{APP_NAME}</span>
    </span>
  );
}

export function LangSwitch() {
  const { lang, setLang } = useLang();
  const t = useT();
  const options: { value: Lang; label: string }[] = [
    { value: 'en', label: 'EN' },
    { value: 'ja', label: '日本語' },
  ];
  return (
    <div className="lang-switch" role="group" aria-label={t('nav.language')}>
      {options.map((o) => (
        <button key={o.value} type="button" className={lang === o.value ? 'on' : ''} aria-pressed={lang === o.value} onClick={() => setLang(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Short disclaimer, shown on every page. */
export function Footer({ compact }: { compact?: boolean }) {
  const t = useT();
  return (
    <footer className={`site-footer ${compact ? 'compact' : ''}`}>
      <p>
        {t('legal.short')} <a href="#/legal">{t('nav.legal')}</a>
      </p>
    </footer>
  );
}

const NAV: { route: RouteName; path: string; key: 'nav.home' | 'nav.beginner' | 'nav.stores' | 'nav.legal' }[] = [
  { route: 'home', path: '', key: 'nav.home' },
  { route: 'beginner', path: 'beginner', key: 'nav.beginner' },
  { route: 'stores', path: 'stores', key: 'nav.stores' },
  { route: 'legal', path: 'legal', key: 'nav.legal' },
];

/** Layout for every page except the editor. */
export function Shell({ current, children }: { current: RouteName; children: ReactNode }) {
  const t = useT();
  return (
    <div className="shell">
      <header className="site-header">
        <a href="#/" className="home-link" aria-label={t('nav.home')}>
          <Logo />
        </a>
        <nav className="site-nav">
          {NAV.map((n) => (
            <a key={n.route} href={`#/${n.path}`} className={current === n.route ? 'on' : ''} onClick={() => navigate(n.path)}>
              {t(n.key)}
            </a>
          ))}
        </nav>
        <LangSwitch />
      </header>
      <main className="page">{children}</main>
      <Footer />
    </div>
  );
}
