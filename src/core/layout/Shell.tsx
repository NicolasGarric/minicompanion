import { useEffect, type ReactNode } from 'react';
import { LANGS, useLang, useT, type Lang, type MessageKey } from '../i18n';
import type { Route } from '../router';
import { APP_NAME } from '../brand';
import { BugReportButton } from '../feedback/BugReport';
import { useSession } from '../auth/session';
import { backendConfigured } from '../auth/supabase';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/ui';
import { useUnread } from '../social/unread';
import { onInsert } from '../../play/lib/social';

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
  const signedIn = useSession((s) => !!s.profile);
  // Each language in its own name; the first visit follows the browser language.
  const choose = (next: Lang) => {
    setLang(next);
    // Signed in: the profile remembers it too, so other devices open in the same language.
    if (signedIn) void useSession.getState().updateProfile({ preferred_lang: next });
  };
  return (
    <select className="lang-select" value={lang} onChange={(e) => choose(e.target.value as Lang)} aria-label={t('nav.language')}>
      {LANGS.map((l) => (
        <option key={l.code} value={l.code} lang={l.code}>{l.name}</option>
      ))}
    </select>
  );
}

export function AccountButton() {
  const t = useT();
  const { session, profile } = useSession();
  if (!backendConfigured) return null;
  const unread = useUnread((s) => s.notifications);
  useEffect(() => {
    if (!session) return;
    const refresh = () => useUnread.getState().refresh();
    refresh();
    const off = onInsert('notifications', `user_id=eq.${session.user.id}`, refresh);
    const id = setInterval(refresh, 120000);
    window.addEventListener('focus', refresh);
    return () => {
      off();
      clearInterval(id);
      window.removeEventListener('focus', refresh);
    };
  }, [session]);
  if (!session) return <a className="btn small" href="/signin">{t('auth.signin.cta')}</a>;
  return (
    <>
      <a className="header-icon" href="/messages" aria-label={t('msg.title')} title={t('msg.title')}>
        <Icon name="chat" size={20} />
      </a>
      <a className="header-icon" href="/notifications" aria-label={t('notif.title')} title={t('notif.title')}>
        <Icon name="bell" size={20} />
        {unread > 0 && <span className="badge-count">{unread > 9 ? '9+' : unread}</span>}
      </a>
      <a className="account-btn" href="/account" aria-label={t('nav.account')}>
        <Avatar name={profile?.display_name ?? session.user.email ?? '?'} size={30} />
      </a>
    </>
  );
}

/** Short disclaimer, shown on every page. */
export function Footer({ compact }: { compact?: boolean }) {
  const t = useT();
  return (
    <footer className={`site-footer ${compact ? 'compact' : ''}`}>
      <p>
        {t('legal.short')} <a href="/legal">{t('nav.legal')}</a>
      </p>
      <p>
        <BugReportButton />
      </p>
    </footer>
  );
}

interface NavItem {
  href: string;
  key: MessageKey;
  active: (r: Route) => boolean;
}

/** The two modules are the top level of the navigation; each has its own sub-navigation. */
const SECTIONS: NavItem[] = [
  { href: '/paint', key: 'nav.paint', active: (r) => r.section === 'paint' },
  { href: '/play', key: 'nav.play', active: (r) => r.section === 'play' },
  { href: '/stores', key: 'nav.stores', active: (r) => r.name === 'stores' },
  { href: '/dice', key: 'nav.dice', active: (r) => r.name === 'dice' },
];

const SUB_NAV: Record<'paint' | 'play', NavItem[]> = {
  paint: [
    { href: '/paint', key: 'nav.paint.projects', active: (r) => r.name === 'paint' },
    { href: '/paint/beginner', key: 'nav.beginner', active: (r) => r.name === 'paint.beginner' },
  ],
  play: [
    { href: '/play', key: 'nav.play.tournaments', active: (r) => r.name.startsWith('play.tournament') || r.name === 'play' || r.name === 'play.table' },
    { href: '/play/quick', key: 'nav.play.quick', active: (r) => r.name === 'play.quick' || r.name === 'play.game' || r.name === 'play.new' },
    { href: '/play/leagues', key: 'nav.play.leagues', active: (r) => r.name === 'play.leagues' || r.name === 'play.league' },
    { href: '/play/mine', key: 'nav.play.mine', active: (r) => r.name === 'play.mine' },
  ],
};

/** Layout for every page except the full-screen PAINT editor. */
export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const t = useT();
  const sub = route.section === 'none' ? null : SUB_NAV[route.section];
  return (
    <div className="shell">
      <header className="site-header">
        <a href="/" className="home-link" aria-label={t('nav.home')}>
          <Logo />
        </a>
        <nav className="site-nav" aria-label={t('nav.main')}>
          {SECTIONS.map((n) => (
            <a key={n.href} href={n.href} className={n.active(route) ? 'on' : ''} aria-current={n.active(route) ? 'page' : undefined}>
              {t(n.key)}
            </a>
          ))}
        </nav>
        <div className="header-tools">
          <LangSwitch />
          <AccountButton />
        </div>
      </header>
      {sub && (
        <nav className={`sub-nav sub-nav-${route.section}`} aria-label={t(route.section === 'paint' ? 'nav.paint' : 'nav.play')}>
          {sub.map((n) => (
            <a key={n.href} href={n.href} className={n.active(route) ? 'on' : ''} aria-current={n.active(route) ? 'page' : undefined}>
              {t(n.key)}
            </a>
          ))}
        </nav>
      )}
      <main className="page">{children}</main>
      <Footer />
    </div>
  );
}
