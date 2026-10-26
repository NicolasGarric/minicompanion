import { useEffect, useState } from 'react';
import { k, useLang, useT } from '../../core/i18n';
import { backendConfigured } from '../../core/auth/supabase';
import { BackendNotice } from '../../core/auth/BackendNotice';
import { requireSignIn, useSession } from '../../core/auth/session';
import { myGames, type Game } from '../lib/games';
import { markAllRead, notifications, playError, type AppNotification } from '../lib/social';
import { formatWhen } from '../components/GameCard';
import { myRoundsSoon } from '../lib/tournaments';
import { useUnread } from '../../core/social/unread';

/** Where a notification leads. */
function linkOf(n: AppNotification) {
  if (n.kind === 'message') return `/messages/${n.payload.from_id}`;
  if (n.kind.startsWith('mentor_')) return '/play/mentors';
  if (n.payload.slug) return `/play/t/${n.payload.slug}`;
  return n.payload.game_id ? `/play/game/${n.payload.game_id}` : '/play/quick';
}

/** In-app alerts, plus reminders of my games and tournament rounds in the next 24 hours (computed, not stored). */
export function Notifications() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { ready, session } = useSession();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [soon, setSoon] = useState<Game[]>([]);
  const [rounds, setRounds] = useState<Awaited<ReturnType<typeof myRoundsSoon>>>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (ready && !session) requireSignIn();
    if (!session) return;
    notifications().then(
      (list) => {
        setItems(list);
        // Opening the page marks everything read (the list keeps showing what was new).
        if (list.some((n) => !n.read_at)) markAllRead(session.user.id).then(() => useUnread.getState().refresh());
      },
      (e) => (playError(e), setError(true)),
    );
    myGames(session.user.id).then(({ hosted, joined }) => {
      const now = Date.now();
      setSoon(
        [...hosted, ...joined.filter((g) => g.my_status === 'accepted')].filter(
          (g) => g.status !== 'cancelled' && Date.parse(g.starts_at) > now && Date.parse(g.starts_at) - now < 864e5,
        ),
      );
    }, () => undefined);
    myRoundsSoon(session.user.id).then(setRounds, () => undefined);
  }, [ready, session]);

  if (!backendConfigured) return <BackendNotice />;
  return (
    <div className="narrow">
      <h1>{t('notif.title')}</h1>
      {soon.length + rounds.length > 0 && (
        <section className="card accent">
          <h2>{t('notif.soon')}</h2>
          <ul className="notif-list">
            {soon.map((g) => (
              <li key={g.id}>
                <a href={`/play/game/${g.id}`}>{g.game_system}</a> · {formatWhen(g.starts_at, lang)}
              </li>
            ))}
            {rounds.map((r) => (
              <li key={`${r.tournament?.slug}-${r.number}`}>
                <a href={`/play/t/${r.tournament?.slug}`}>{r.tournament?.name} · {t('tour.roundN', { n: r.number })}</a> · {formatWhen(r.starts_at, lang)}
                {r.venue_name ? ` · ${r.venue_name}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && <p className="error">{t('error.generic')}</p>}
      {!items && !error && <span className="spinner" />}
      {items?.length === 0 && soon.length + rounds.length === 0 && <p className="hint">{t('notif.none')}</p>}
      {!!items?.length && (
        <ul className="notif-list">
          {items.map((n) => (
            <li key={n.id} className={n.read_at ? '' : 'unread'}>
              <a href={linkOf(n)}>
                {t(k(`notif.${n.kind}${['join_answer', 'report_answer', 'match_answer', 'mentor_answer'].includes(n.kind) ? `.${n.payload.status}` : ''}`), {
                  from: n.payload.from ?? '',
                  game: n.payload.game ?? '',
                  city: n.payload.city ?? '',
                  tournament: n.payload.tournament ?? '',
                  round: n.payload.round ?? '',
                  table: n.payload.table ?? '',
                })}
              </a>
              <small className="muted">{formatWhen(n.created_at, lang)}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
