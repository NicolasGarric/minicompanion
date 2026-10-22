import { useEffect, useState } from 'react';
import { k, useLang, useT } from '../../core/i18n';
import { playError } from '../lib/games';
import { useSession } from '../../core/auth/session';
import { Icon } from '../../core/ui/ui';
import { supabase, backendConfigured } from '../../core/auth/supabase';
import { BackendNotice } from '../../core/auth/BackendNotice';
import { formatWhen } from '../components/GameCard';

interface TournamentRow {
  id: string;
  slug: string;
  name: string;
  starts_at: string;
  format_id: string;
  venue_name: string;
  store_name: string | null;
  max_players: number;
  registered: number;
  spots_left: number;
}

/** PLAY, "Tournaments" tab: upcoming published events, soonest first. */
export function PlayHome() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [rows, setRows] = useState<TournamentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<{ slug: string; name: string; game_system: string | null; venue_name: string }[]>([]);
  const [mine, setMine] = useState<{ slug: string; name: string; status: string; starts_at: string }[]>([]);
  const session = useSession((s) => s.session);

  useEffect(() => {
    if (!supabase) return;
    supabase.rpc('search_tournaments').then(({ data, error: e }) => (e ? setError(playError(e) ?? 'generic') : setRows((data ?? []) as TournamentRow[])));
    // Events being played right now (the search only lists upcoming ones).
    supabase.from('tournaments').select('slug, name, game_system, venue_name').eq('status', 'in_progress').order('starts_at').then(({ data }) => setLive(data ?? []));
  }, []);
  useEffect(() => {
    if (!supabase || !session) return setMine([]);
    supabase
      .from('tournaments')
      .select('slug, name, status, starts_at')
      .eq('organiser_id', session.user.id)
      .in('status', ['draft', 'published', 'in_progress'])
      .order('starts_at')
      .then(({ data }) => setMine(data ?? []));
  }, [session]);

  if (!backendConfigured) return <BackendNotice />;
  return (
    <div className="narrow">
      <div className="page-head">
        <div>
          <h1>{t('play.title')}</h1>
          <p className="lead">{t('play.lead')}</p>
        </div>
        <a className="btn primary" href={session ? '#/play/t-new' : '#/signin'}>
          <Icon name="plus" size={16} /> {t('tour.organise')}
        </a>
      </div>
      {live.length > 0 && (
        <section className="card accent">
          <h2><span className="live-dot" aria-hidden /> {t('tour.liveNow')}</h2>
          <ul className="notif-list">
            {live.map((l) => (
              <li key={l.slug}>
                <a href={`#/play/t/${l.slug}`}><strong>{l.name}</strong></a>
                <span className="muted">{[l.game_system, l.venue_name].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {mine.length > 0 && (
        <section className="card">
          <h2>{t('tour.myEvents')}</h2>
          <ul className="notif-list">
            {mine.map((m) => (
              <li key={m.slug}>
                <a href={`#/play/t/${m.slug}`}>{m.name}</a>
                <span className="tag">{t(k(`tour.status.${m.status}`))}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && <p className="error" role="alert">{t(k(`games.error.${error}`))}</p>}
      {!rows && !error && <span className="spinner" />}
      {rows?.length === 0 && <p className="hint">{t('play.none')}</p>}
      {!!rows?.length && (
        <ul className="game-list">
          {rows.map((r) => (
            <li key={r.id}>
              <a className="game-card" href={`#/play/t/${r.slug}`}>
                <span className="game-what"><strong>{r.name}</strong></span>
                <span className="game-when">{formatWhen(r.starts_at, lang)}</span>
                <span className="game-where muted">{r.store_name ?? r.venue_name}</span>
                <span className="game-tags">
                  <span className={`tag ${r.spots_left > 0 ? 'ok' : ''}`}>{t('games.seats', { taken: r.registered, max: r.max_players })}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
