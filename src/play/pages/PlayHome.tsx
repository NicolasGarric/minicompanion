import { useEffect, useState } from 'react';
import { useLang, useT } from '../../core/i18n';
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
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.rpc('search_tournaments').then(({ data, error: e }) => (e ? setError(true) : setRows((data ?? []) as TournamentRow[])));
  }, []);

  if (!backendConfigured) return <BackendNotice />;
  return (
    <div className="narrow">
      <h1>{t('play.title')}</h1>
      <p className="lead">{t('play.lead')}</p>
      {error && <p className="error">{t('error.generic')}</p>}
      {!rows && !error && <span className="spinner" />}
      {rows?.length === 0 && <p className="hint">{t('play.none')}</p>}
      {!!rows?.length && (
        <ul className="game-list">
          {rows.map((r) => (
            <li key={r.id}>
              <div className="game-card">
                <span className="game-what"><strong>{r.name}</strong></span>
                <span className="game-when">{formatWhen(r.starts_at, lang)}</span>
                <span className="game-where muted">{r.store_name ?? r.venue_name}</span>
                <span className="game-tags">
                  <span className={`tag ${r.spots_left > 0 ? 'ok' : ''}`}>{t('games.seats', { taken: r.registered, max: r.max_players })}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
