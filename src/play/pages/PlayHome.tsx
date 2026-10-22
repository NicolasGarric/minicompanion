import { useEffect, useState } from 'react';
import { k, useLang, useT } from '../../core/i18n';
import { playError } from '../lib/games';
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

  useEffect(() => {
    if (!supabase) return;
    supabase.rpc('search_tournaments').then(({ data, error: e }) => (e ? setError(playError(e) ?? 'generic') : setRows((data ?? []) as TournamentRow[])));
  }, []);

  if (!backendConfigured) return <BackendNotice />;
  return (
    <div className="narrow">
      <h1>{t('play.title')}</h1>
      <p className="lead">{t('play.lead')}</p>
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
