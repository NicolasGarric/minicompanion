import { useCallback, useEffect, useRef, useState } from 'react';
import { k, langName, useLang, useT } from '../../core/i18n';
import { backendConfigured } from '../../core/auth/supabase';
import { BackendNotice } from '../../core/auth/BackendNotice';
import { requireSignIn, useSession } from '../../core/auth/session';
import { navigate } from '../../core/router';
import { Icon } from '../../core/ui/ui';
import { ShareSheet } from '../../core/ui/ShareSheet';
import { countryName } from '../lib/countries';
import { cancelGame, deleteGame, gameError, getGame, playError, leaveGame, requestJoin, respondJoin, setGameMap, setGameRefs, type Game, type GamePlayer } from '../lib/games';
import { decodeTable } from '../lib/tableCodec';
import { RefChips, RefLinksEditor } from '../../core/ui/RefLinks';
import type { Table } from '../lib/tableGen';
import { drawTable } from '../visual/tableMap';
import { formatWhen } from '../components/GameCard';
import { ReportSection } from '../components/ReportSection';
import { GameChat } from '../components/GameChat';
import { downloadIcs } from '../lib/ics';
import { useHobby } from '../../paint/hobby/store';
import { gameDecks, setGameDeck } from '../../paint/hobby/sync';

/** One game: details, players, and the actions of the viewer (host, player or visitor). */
export function GameDetail({ id }: { id: string }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const session = useSession((s) => s.session);
  const profile = useSession((s) => s.profile);
  const me = session?.user.id ?? null;
  // Arrived from an invitation link (?from=<handle> of the player who shared it)
  const from = /^[a-z0-9_]{3,24}$/.test(new URLSearchParams(location.search).get('from') ?? '') ? new URLSearchParams(location.search).get('from') : null;
  const [inviting, setInviting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [data, setData] = useState<{ game: Game; players: GamePlayer[]; address: string | null } | null | undefined>(undefined);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      getGame(id).then(setData, (e) => {
        playError(e);
        setData(null);
      }),
    [id],
  );
  useEffect(() => {
    if (backendConfigured) load();
  }, [load, me]);

  if (!backendConfigured) return <BackendNotice />;
  if (data === undefined) return <div className="narrow"><span className="spinner" /></div>;
  if (data === null) return <div className="narrow"><p className="hint">{t('games.notFound')}</p><a href="/play/quick">← {t('nav.play.quick')}</a></div>;

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

  const open = !past && game.status !== 'cancelled';
  const place = [game.area, game.city].filter(Boolean).join(', ');
  const seatsLeft = Math.max(0, game.max_players - game.players_count);
  const inviteUrl = `${location.origin}${location.pathname}${profile?.handle ? `?from=${profile.handle}` : ''}`;
  const inviteText = t('games.invite.text', {
    game: [game.game_system, game.format, game.points ? t('games.points', { points: game.points }) : null].filter(Boolean).join(' · '),
    when: formatWhen(game.starts_at, lang),
    place,
    seats: seatsLeft,
  });
  const showInvited = from && open && !isHost && !(mine && (mine.status === 'pending' || mine.status === 'accepted'));

  return (
    <div className="narrow game-detail">
      <a href="/play/quick" className="small">← {t('nav.play.quick')}</a>
      {showInvited && (
        <section className="invite-banner" role="note">
          <strong>{from === game.host?.handle ? t('games.invite.byHost', { name: game.host.display_name }) : t('games.invite.byPlayer', { handle: from })}</strong>
          <span>{game.status === 'open' ? t('games.invite.seats', { n: seatsLeft }) : t('games.full')}</span>
          {game.status === 'open' && (
            !session
              ? <button className="btn primary" onClick={() => requireSignIn()}>{t('games.signinToJoin')}</button>
              : <a className="btn primary" href="#join">{t('games.askToJoin')}</a>
          )}
        </section>
      )}
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
        <p><Icon name="globe" size={16} /> {game.language === 'both' ? t('games.lang.both') : langName(game.language)}</p>
        {game.note && <p className="game-note">{game.note}</p>}
        {game.host && (
          <p className="muted">
            {t('games.hostedBy', { name: '' })}
            <a href={`/u/${game.host.handle}`}>{game.host.display_name}</a>
          </p>
        )}
        {game.league_id && <p><Icon name="star" size={16} /> <a href={`/play/league/${game.league_id}`}>{t('games.leagueGame')}</a></p>}
        {game.store_id && game.store && <p><Icon name="home" size={16} /> <a href={`/play/store/${game.store_id}`}>{game.store.name}</a></p>}
        <div className="field-row wrap">
          {open && (
            <button className="btn small primary" onClick={() => setInviting(true)}>
              <Icon name="share" size={14} /> {t('games.invite.cta')}
            </button>
          )}
          {game.status !== 'cancelled' && !past && (
            <button
              className="btn small"
              onClick={() =>
                downloadIcs({
                  id: game.id,
                  title: [game.game_system, game.format].filter(Boolean).join(' · '),
                  start: game.starts_at,
                  end: new Date(Date.parse(game.starts_at) + game.duration_minutes * 60000).toISOString(),
                  location: address ?? [game.area, game.city].filter(Boolean).join(', '),
                  url: location.href,
                })
              }
            >
              <Icon name="calendar" size={14} /> {t('games.addToCalendar')}
            </button>
          )}
          {session && !isHost && (
            <a className="btn small" href={`/messages/${game.host_id}`}>
              <Icon name="chat" size={14} /> {t('games.contactHost')}
            </a>
          )}
        </div>
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

      <GameMap game={game} isHost={isHost} onChanged={load} />
      <GameRefs game={game} isHost={isHost} onChanged={load} />
      {me && (isHost || mine?.status === 'accepted') && game.status !== 'cancelled' && (
        <GameDecks gameId={game.id} me={me} names={new Map([[game.host_id, game.host?.display_name ?? '?'], ...accepted.map((p) => [p.player_id, p.profile?.display_name ?? '?'] as [string, string])])} />
      )}

      {!past && game.status !== 'cancelled' && (
        <section className="card game-actions" id="join">
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

      {past && game.status !== 'cancelled' && <ReportSection game={game} players={players} me={me} />}
      {me && (isHost || mine?.status === 'accepted') && game.status !== 'cancelled' && <GameChat gameId={game.id} me={me} />}
      {(isHost || profile?.is_admin) && (
        <section className="card game-delete">
          {!confirmDelete ? (
            <button className="btn small danger-ghost" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={14} /> {t('games.delete')}</button>
          ) : (
            <>
              <p>{t(past && game.status !== 'cancelled' ? 'games.deleteConfirmPlayed' : 'games.deleteConfirm')}</p>
              <div className="field-row wrap">
                <button className="btn small danger-ghost" disabled={busy} onClick={() => act(async () => { await deleteGame(game.id); navigate('play/mine'); })}>{t('games.deleteYes')}</button>
                <button className="btn small ghost" onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</button>
              </div>
            </>
          )}
        </section>
      )}
      {inviting && <ShareSheet title={t('games.invite.title')} text={inviteText} url={inviteUrl} onClose={() => setInviting(false)} />}
    </div>
  );
}

/** The table map the host attached (drawn from its code), with the host's buttons to set or remove it. */
/** Rules and mission pack of the game, as links to where they are published (host edits). */
function GameRefs({ game, isHost, onChanged }: { game: Game; isHost: boolean; onChanged: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  if (game.refs === undefined || (!isHost && !game.refs?.length)) return null;
  return (
    <section className="card game-refs">
      <h2><Icon name="book" size={18} /> {t('refs.gameTitle')}</h2>
      {isHost && game.status !== 'cancelled' ? (
        <fieldset disabled={busy} className="plain">
          <RefLinksEditor links={game.refs ?? []} hint={t('refs.gameHint')} kinds={['missions', 'rules', 'narrative', 'boarding']}
            onChange={async (refs) => {
              setBusy(true);
              try {
                await setGameRefs(game.id, refs);
                onChanged();
              } catch (e) {
                playError(e);
              }
              setBusy(false);
            }} />
        </fieldset>
      ) : <RefChips links={game.refs ?? []} />}
    </section>
  );
}

function GameMap({ game, isHost, onChanged }: { game: Game; isHost: boolean; onChanged: () => void }) {
  const t = useT();
  const [table, setTable] = useState<Table | null>(null);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!game.table_map) return setTable(null);
    decodeTable(game.table_map).then(setTable, () => setTable(null));
  }, [game.table_map]);

  useEffect(() => {
    if (!table) return;
    const draw = () => {
      if (!canvas.current || !box.current) return;
      const w = box.current.clientWidth, dpr = Math.min(2, devicePixelRatio || 1);
      const h = (w * table.height) / table.width;
      canvas.current.width = w * dpr;
      canvas.current.height = h * dpr;
      canvas.current.style.height = `${h}px`;
      const ctx = canvas.current.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawTable(ctx, table, w, { marks: true });
    };
    draw();
    const ro = new ResizeObserver(draw);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [table]);

  if (!game.table_map && !isHost) return null;
  const editor = `/play/table-generator?game=${game.id}${game.table_map ? `&tab=build&map=${game.table_map}` : ''}`;
  const remove = async () => {
    setBusy(true);
    try {
      await setGameMap(game.id, null);
      onChanged();
    } catch (e) {
      playError(e);
    }
    setBusy(false);
  };

  return (
    <section className="card game-map">
      <h2><Icon name="map" size={18} /> {table?.name || t('games.map.title')}</h2>
      {table ? (
        <>
          <a href={`/play/table-generator?tab=build&map=${game.table_map}`} className="game-map-canvas" ref={box} aria-label={t('games.map.open')}>
            <canvas ref={canvas} role="img" aria-label={t('table.aria', { w: table.width, h: table.height, n: table.pieces.length })} />
          </a>
          <p className="hint">{t('games.map.facts', { w: table.width, h: table.height, n: table.pieces.length, o: table.objectives.length })}</p>
          <RefChips links={table.refs ?? []} />
        </>
      ) : (
        <p className="hint">{t('games.map.none')}</p>
      )}
      <div className="field-row wrap">
        {table && <a className="btn small" href={`/play/table-generator?tab=build&map=${game.table_map}`}><Icon name="eye" size={14} /> {t('games.map.open')}</a>}
        {isHost && <a className="btn small primary" href={editor}><Icon name="hand" size={14} /> {t(table ? 'games.map.change' : 'games.map.choose')}</a>}
        {isHost && table && <button className="btn small danger-ghost" disabled={busy} onClick={remove}><Icon name="trash" size={14} /> {t('games.map.remove')}</button>}
      </div>
    </section>
  );
}

/** Each player can attach one of his combat decks; the others swipe it during the game. */
function GameDecks({ gameId, me, names }: { gameId: string; me: string; names: Map<string, string> }) {
  const t = useT();
  const decks = useHobby((s) => s.decks.filter((d) => d.remoteId));
  const synced = useHobby((s) => s.sync.owner === me);
  const [rows, setRows] = useState<{ player_id: string; deck_id: string }[] | null>(null);
  const [error, setError] = useState(false);
  const load = () => gameDecks(gameId).then(setRows, () => setError(true));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);
  const mineRow = rows?.find((r) => r.player_id === me);
  return (
    <section className="card game-decks">
      <h2><Icon name="layers" size={18} /> {t('cards.gameDecks')}</h2>
      {error && <p className="error">{t('error.generic')}</p>}
      <ul className="game-deck-list">
        {rows?.filter((r) => r.player_id !== me).map((r) => (
          <li key={r.player_id}><a className="btn small" href={`/deck/${r.deck_id}`}><Icon name="eye" size={14} /> {t('cards.deckOf', { name: names.get(r.player_id) ?? '?' })}</a></li>
        ))}
      </ul>
      {rows && !rows.some((r) => r.player_id !== me) && <p className="hint">{t('cards.noGameDecks')}</p>}
      {synced && decks.length > 0 ? (
        <label className="field">
          <span>{t('cards.myGameDeck')}</span>
          <select className="select" value={mineRow?.deck_id ?? ''} onChange={async (e) => {
            try {
              await setGameDeck(gameId, e.target.value || null);
              load();
            } catch {
              setError(true);
            }
          }}>
            <option value="">{t('cards.noDeck')}</option>
            {decks.map((d) => <option key={d.id} value={d.remoteId}>{d.name}</option>)}
          </select>
        </label>
      ) : (
        <p className="hint">{t('cards.gameDeckHow')} <a href="/paint/decks">{t('cards.decks')}</a></p>
      )}
      {mineRow && <a className="small" href={`/deck/${mineRow.deck_id}`}>{t('cards.seeMine')}</a>}
    </section>
  );
}
