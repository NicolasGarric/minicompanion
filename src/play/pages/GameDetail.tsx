import { useCallback, useEffect, useState } from 'react';
import { k, useLang, useT } from '../../core/i18n';
import { backendConfigured } from '../../core/auth/supabase';
import { BackendNotice } from '../../core/auth/BackendNotice';
import { requireSignIn, useSession } from '../../core/auth/session';
import { Icon } from '../../core/ui/ui';
import { countryName } from '../lib/countries';
import { cancelGame, gameError, getGame, leaveGame, requestJoin, respondJoin, type Game, type GamePlayer } from '../lib/games';
import { formatWhen } from '../components/GameCard';

/** One game: details, players, and the actions of the viewer (host, player or visitor). */
export function GameDetail({ id }: { id: string }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const session = useSession((s) => s.session);
  const me = session?.user.id ?? null;
  const [data, setData] = useState<{ game: Game; players: GamePlayer[]; address: string | null } | null | undefined>(undefined);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => getGame(id).then(setData, () => setData(null)), [id]);
  useEffect(() => {
    if (backendConfigured) load();
  }, [load, me]);

  if (!backendConfigured) return <BackendNotice />;
  if (data === undefined) return <div className="narrow"><span className="spinner" /></div>;
  if (data === null) return <div className="narrow"><p className="hint">{t('games.notFound')}</p><a href="#/play/quick">← {t('nav.play.quick')}</a></div>;

  const { game, players, address } = data;
  const isHost = me === game.host_id;
  const mine = players.find((p) => p.player_id === me);
  const accepted = players.filter((p) => p.status === 'accepted');
  const pending = players.filter((p) => p.status === 'pending');
  const past = new Date(game.starts_at) < new Date();

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(gameError(e) ?? 'generic');
    }
    setBusy(false);
  };

  return (
    <div className="narrow game-detail">
      <a href="#/play/quick" className="small">← {t('nav.play.quick')}</a>
      <div className="page-head">
        <div>
          <h1>{game.game_system}</h1>
          <p className="lead">{[game.format, game.points ? t('games.points', { points: game.points }) : null].filter(Boolean).join(' · ')}</p>
        </div>
        <span className="game-tags">
          <span className="tag">{t(k(`games.level.${game.level}`))}</span>
          <span className="tag">{game.status === 'cancelled' ? t('games.status.cancelled') : t('games.seats', { taken: game.players_count, max: game.max_players })}</span>
        </span>
      </div>

      <section className="card game-facts">
        <p><Icon name="book" size={16} /> {formatWhen(game.starts_at, lang)} · {t('games.minutes', { h: Math.floor(game.duration_minutes / 60), m: String(game.duration_minutes % 60).padStart(2, '0') })}</p>
        <p><Icon name="map" size={16} /> {[game.area, game.city, countryName(game.country, lang)].filter(Boolean).join(', ')}{game.store && ` · ${game.store.name}`}</p>
        <p className={address ? '' : 'muted'}>
          <Icon name="home" size={16} /> {address ?? t('games.addressHidden')}
        </p>
        <p><Icon name="globe" size={16} /> {game.language === 'both' ? t('games.lang.both') : game.language === 'ja' ? '日本語' : 'English'}</p>
        {game.note && <p className="game-note">{game.note}</p>}
        {game.host && <p className="muted">{t('games.hostedBy', { name: game.host.display_name })}</p>}
      </section>

      <section className="card">
        <h2>{t('games.playersTitle', { taken: game.players_count, max: game.max_players })}</h2>
        <ul className="player-list">
          {game.host && <li><strong>{game.host.display_name}</strong> <span className="tag">{t('games.host')}</span></li>}
          {accepted.map((p) => <li key={p.player_id}>{p.profile?.display_name ?? '?'}</li>)}
        </ul>

        {isHost && pending.length > 0 && (
          <>
            <h3>{t('games.requests')}</h3>
            <ul className="request-list">
              {pending.map((p) => (
                <li key={p.player_id}>
                  <span>
                    <strong>{p.profile?.display_name ?? '?'}</strong>
                    {p.message && <small className="muted">“{p.message}”</small>}
                  </span>
                  <span className="field-row">
                    <button className="btn small primary" disabled={busy || game.status !== 'open'} onClick={() => act(() => respondJoin(game.id, p.player_id, true))}>{t('games.accept')}</button>
                    <button className="btn small ghost" disabled={busy} onClick={() => act(() => respondJoin(game.id, p.player_id, false))}>{t('games.decline')}</button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {!past && game.status !== 'cancelled' && (
        <section className="card game-actions">
          {isHost ? (
            <button className="btn danger-ghost" disabled={busy} onClick={() => act(() => cancelGame(game.id))}>{t('games.cancel')}</button>
          ) : !session ? (
            <button className="btn primary" onClick={() => requireSignIn()}>{t('games.signinToJoin')}</button>
          ) : mine && (mine.status === 'pending' || mine.status === 'accepted') ? (
            <>
              <p>{t(k(`games.join.${mine.status}.long`))}</p>
              <button className="btn ghost" disabled={busy} onClick={() => act(() => leaveGame(game.id))}>{t(mine.status === 'pending' ? 'games.withdraw' : 'games.leave')}</button>
            </>
          ) : mine?.status === 'declined' ? (
            <p className="muted">{t('games.join.declined.long')}</p>
          ) : game.status === 'open' ? (
            <>
              <label className="field">
                <span>{t('games.messageLabel')}</span>
                <input className="text-input" maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('games.messagePlaceholder')} />
              </label>
              <button className="btn primary" disabled={busy} onClick={() => act(() => requestJoin(game.id, message))}>{t('games.askToJoin')}</button>
            </>
          ) : (
            <p className="muted">{t('games.full')}</p>
          )}
          {error && <p className="error" role="alert">{t(k(`games.error.${error}`))}</p>}
        </section>
      )}
    </div>
  );
}
