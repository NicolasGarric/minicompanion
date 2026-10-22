import { useEffect, useState } from 'react';
import { useLang, useT } from '../../core/i18n';
import { navigate } from '../../core/router';
import { backendConfigured } from '../../core/auth/supabase';
import { BackendNotice } from '../../core/auth/BackendNotice';
import { requireSignIn, useSession } from '../../core/auth/session';
import { Icon } from '../../core/ui/ui';
import { GameCard } from '../components/GameCard';
import { listStores, type Game } from '../lib/games';
import {
  createLeague,
  getLeague,
  joinLeague,
  leagueGames,
  leaveLeague,
  listLeagues,
  myLeagues,
  playError,
  standings,
  type League,
  type Standing,
} from '../lib/social';

const day = (d: string, lang: string) => new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric' }).format(new Date(d));

/** Leagues tab: current and past seasons, and the form to start one. */
export function Leagues() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const session = useSession((s) => s.session);
  const [list, setList] = useState<League[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(false);

  useEffect(() => {
    if (backendConfigured) listLeagues().then(setList, (e) => setError(playError(e) ?? 'generic'));
  }, []);

  if (!backendConfigured) return <BackendNotice />;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="narrow">
      <div className="page-head">
        <div>
          <h1>{t('league.title')}</h1>
          <p className="lead">{t('league.lead')}</p>
        </div>
        <button className="btn primary" onClick={() => (session ? setForm(!form) : requireSignIn())}>
          <Icon name="plus" size={16} /> {t('league.create')}
        </button>
      </div>
      {form && session && <LeagueForm me={session.user.id} />}
      {error && <p className="error" role="alert">{t(`games.error.${error}` as 'games.error.generic')}</p>}
      {!list && !error && <span className="spinner" />}
      {list?.length === 0 && <p className="hint">{t('league.none')}</p>}
      {!!list?.length && (
        <ul className="game-list">
          {list.map((l) => (
            <li key={l.id}>
              <a className={`game-card ${l.ends_on < today ? 'past' : ''}`} href={`#/play/league/${l.id}`}>
                <span className="game-what">
                  <strong>{l.name}</strong>
                  <small className="muted">{l.game_system}</small>
                </span>
                <span className="game-when">{day(l.starts_on, lang)} → {day(l.ends_on, lang)}</span>
                <span className="game-where muted">{[l.store?.name, l.city].filter(Boolean).join(' · ')}</span>
                <span className="game-tags">
                  <span className="tag">{t('league.members', { count: l.members?.[0]?.count ?? 0 })}</span>
                  {l.ends_on < today && <span className="tag">{t('league.ended')}</span>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LeagueForm({ me }: { me: string }) {
  const t = useT();
  const [stores, setStores] = useState<{ id: string; name: string; city: string }[]>([]);
  const start = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + 42 * 864e5).toISOString().slice(0, 10);
  const [f, setF] = useState({ name: '', game_system: '', store_id: '', city: '', starts_on: start, ends_on: end, description: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    listStores().then(setStores);
  }, []);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const id = await createLeague({ ...f, organiser_id: me, store_id: f.store_id || null, city: f.city || null, description: f.description || null });
      navigate(`play/league/${id}`);
    } catch (err) {
      setError(playError(err) ?? 'generic');
      setBusy(false);
    }
  };
  return (
    <form className="card field-col" onSubmit={submit}>
      <label className="field">
        <span>{t('league.name')}</span>
        <input className="text-input" required minLength={3} maxLength={80} value={f.name} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className="field-grid">
        <label className="field">
          <span>{t('games.game')}</span>
          <input className="text-input" required minLength={2} maxLength={60} value={f.game_system} onChange={(e) => set({ game_system: e.target.value })} />
        </label>
        <label className="field">
          <span>{t('games.store')}</span>
          <select className="select" value={f.store_id} onChange={(e) => set({ store_id: e.target.value, city: stores.find((s) => s.id === e.target.value)?.city ?? f.city })}>
            <option value="">{t('games.noStore')}</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t('games.city')}</span>
          <input className="text-input" maxLength={80} value={f.city} onChange={(e) => set({ city: e.target.value })} />
        </label>
      </div>
      <div className="field-grid">
        <label className="field">
          <span>{t('lfg.from')}</span>
          <input className="text-input" type="date" required value={f.starts_on} onChange={(e) => set({ starts_on: e.target.value })} />
        </label>
        <label className="field">
          <span>{t('lfg.to')}</span>
          <input className="text-input" type="date" required min={f.starts_on} value={f.ends_on} onChange={(e) => set({ ends_on: e.target.value })} />
        </label>
      </div>
      <label className="field">
        <span>{t('league.rules')}</span>
        <textarea className="text-input" rows={3} maxLength={1000} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder={t('league.rulesPlaceholder')} />
      </label>
      {error && <p className="error" role="alert">{t(`games.error.${error}` as 'games.error.generic')}</p>}
      <div className="nav-row">
        <button className="btn primary" disabled={busy}>{t('league.publish')}</button>
      </div>
    </form>
  );
}

/** One league: standings (win 3, draw 1), members, games, join / leave. */
export function LeagueDetail({ id }: { id: string }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const session = useSession((s) => s.session);
  const me = session?.user.id;
  const [league, setLeague] = useState<League | null | undefined>(undefined);
  const [table, setTable] = useState<Standing[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [member, setMember] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLeague(await getLeague(id));
      setTable(await standings(id));
      setGames(await leagueGames(id));
      if (me) setMember((await myLeagues(me)).includes(id));
    } catch (e) {
      setError(playError(e) ?? 'generic');
      setLeague(null);
    }
  };
  useEffect(() => {
    if (backendConfigured) load();
  }, [id, me]);

  if (!backendConfigured) return <BackendNotice />;
  if (league === undefined) return <div className="narrow"><span className="spinner" /></div>;
  if (!league) return <div className="narrow"><p className="hint">{t('league.notFound')}</p></div>;
  const open = league.ends_on >= new Date().toISOString().slice(0, 10);

  const toggle = async () => {
    if (!me) return requireSignIn();
    try {
      await (member ? leaveLeague(id, me) : joinLeague(id, me));
      await load();
    } catch (e) {
      setError(playError(e) ?? 'generic');
    }
  };

  return (
    <div className="narrow game-detail">
      <a className="small" href="#/play/leagues">← {t('nav.play.leagues')}</a>
      <div className="page-head">
        <div>
          <h1>{league.name}</h1>
          <p className="lead">{league.game_system} · {day(league.starts_on, lang)} → {day(league.ends_on, lang)}</p>
        </div>
        {open && (
          <button className={`btn ${member ? 'ghost' : 'primary'}`} onClick={toggle}>{t(member ? 'league.leave' : 'league.join')}</button>
        )}
      </div>
      <section className="card game-facts">
        {league.store_id && league.store && <p><Icon name="home" size={16} /> <a href={`#/play/store/${league.store_id}`}>{league.store.name}</a></p>}
        {league.city && <p><Icon name="map" size={16} /> {league.city}</p>}
        {league.description && <p className="game-note">{league.description}</p>}
        {member && open && (
          <p>
            <a className="btn small" href={`#/play/new?league=${league.id}`}><Icon name="plus" size={14} /> {t('league.hostGame')}</a>
          </p>
        )}
      </section>

      <section className="card">
        <h2>{t('league.standings')}</h2>
        {table.length === 0 ? (
          <p className="hint">{t('league.noMembers')}</p>
        ) : (
          <div className="table-wrap">
            <table className="standings">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('league.player')}</th>
                  <th>{t('league.played')}</th>
                  <th>{t('league.w')}</th>
                  <th>{t('league.d')}</th>
                  <th>{t('league.l')}</th>
                  <th>{t('league.pts')}</th>
                </tr>
              </thead>
              <tbody>
                {table.map((r, i) => (
                  <tr key={r.player_id} className={r.player_id === me ? 'me' : ''}>
                    <td>{i + 1}</td>
                    <td>{r.display_name}</td>
                    <td>{r.played}</td>
                    <td>{r.wins}</td>
                    <td>{r.draws}</td>
                    <td>{r.losses}</td>
                    <td><strong>{r.points}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">{t('league.scoring')}</p>
      </section>

      <h2>{t('league.games')}</h2>
      {games.length === 0 ? <p className="hint">{t('league.noGames')}</p> : <ul className="game-list">{games.map((g) => <GameCard key={g.id} game={g} />)}</ul>}
      {error && <p className="error" role="alert">{t(`games.error.${error}` as 'games.error.generic')}</p>}
    </div>
  );
}
