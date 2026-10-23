import { useEffect, useMemo, useState } from 'react';
import { k, LANGS, useLang, useT } from '../../core/i18n';
import { navigate } from '../../core/router';
import { backendConfigured } from '../../core/auth/supabase';
import { BackendNotice } from '../../core/auth/BackendNotice';
import { requireSignIn, useSession } from '../../core/auth/session';
import { CITIES } from '../../core/data/cities';
import { sortedCountries } from '../lib/countries';
import { createGame, gameError, listStores, popularTexts, type NewGame } from '../lib/games';
import { listLeagues, myLeagues, type League } from '../lib/social';

/** Tomorrow 18:00, as the value of a datetime-local input. */
function defaultStart() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(18, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Create a casual game: game, format, date, place (country, city, exact address). */
export function GameNew() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { ready, session, profile } = useSession();
  const countries = useMemo(() => sortedCountries(lang), [lang]);
  const [stores, setStores] = useState<{ id: string; name: string; city: string }[]>([]);
  const [popular, setPopular] = useState<string[]>([]);
  const [formats, setFormats] = useState<string[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    game_system: '', format: '', points: '', starts_at: defaultStart(), duration_minutes: '120', max_players: '2',
    level: 'casual', language: lang, country: 'JP', city: profile?.home_city ?? '', area: '', address: '', store_id: '', note: '',
    league_id: new URLSearchParams(location.search).get('league') ?? '',
  });

  useEffect(() => {
    if (ready && !session) requireSignIn();
  }, [ready, session]);
  // Leagues I play in (current ones): a game can count for one of them.
  useEffect(() => {
    if (!session || !backendConfigured) return;
    Promise.all([listLeagues({ current: true }), myLeagues(session.user.id)]).then(([all, mine]) => {
      const list = all.filter((l) => mine.includes(l.id));
      setLeagues(list);
      const pre = list.find((l) => l.id === f.league_id);
      if (pre) setF((x) => ({ ...x, game_system: x.game_system || pre.game_system, store_id: x.store_id || pre.store_id || '' }));
    }, () => undefined);
  }, [session]);
  useEffect(() => {
    if (!backendConfigured) return;
    listStores().then(setStores);
    popularTexts().then((r) => setPopular(r.map((x) => x.game_system)));
  }, []);
  useEffect(() => {
    if (!f.game_system.trim()) return setFormats([]);
    const id = setTimeout(() => popularTexts(f.game_system).then((r) => setFormats(r.map((x) => x.format).filter((v): v is string => !!v))), 300);
    return () => clearTimeout(id);
  }, [f.game_system]);

  if (!backendConfigured) return <BackendNotice />;
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  const pickStore = (id: string) => {
    const s = stores.find((x) => x.id === id);
    set(s ? { store_id: id, city: s.city, area: s.name } : { store_id: '' });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const game: NewGame = {
        ...f,
        points: f.points ? Number(f.points) : null,
        starts_at: new Date(f.starts_at).toISOString(),
        duration_minutes: Number(f.duration_minutes),
        max_players: Number(f.max_players),
        level: f.level as NewGame['level'],
        language: f.language as NewGame['language'],
        store_id: f.store_id || null,
        league_id: f.league_id || null,
      };
      const id = await createGame(game);
      navigate(`play/game/${id}`);
    } catch (err) {
      setError(gameError(err) ?? 'generic');
      setBusy(false);
    }
  };

  return (
    <div className="narrow">
      <h1>{t('games.newTitle')}</h1>
      <form className="card field-col game-form" onSubmit={submit}>
        <h2>{t('games.sectionGame')}</h2>
        <label className="field">
          <span>{t('games.game')}</span>
          <input className="text-input" required minLength={2} maxLength={60} list="new-popular-games" value={f.game_system} onChange={(e) => set({ game_system: e.target.value })} placeholder={t('games.gamePlaceholder')} />
          <datalist id="new-popular-games">{popular.map((g) => <option key={g} value={g} />)}</datalist>
          <small className="hint">{t('games.gameHint')}</small>
        </label>
        <div className="field-grid">
          <label className="field">
            <span>{t('games.format')}</span>
            <input className="text-input" maxLength={60} list="new-formats" value={f.format} onChange={(e) => set({ format: e.target.value })} placeholder={t('games.formatPlaceholder')} />
            <datalist id="new-formats">{formats.map((x) => <option key={x} value={x} />)}</datalist>
          </label>
          <label className="field">
            <span>{t('games.pointsLabel')}</span>
            <input className="text-input" type="number" min={1} max={100000} value={f.points} onChange={(e) => set({ points: e.target.value })} />
          </label>
        </div>
        <div className="field-grid">
          <label className="field">
            <span>{t('games.level')}</span>
            <select className="select" value={f.level} onChange={(e) => set({ level: e.target.value })}>
              {(['beginner', 'casual', 'competitive'] as const).map((l) => <option key={l} value={l}>{t(`games.level.${l}`)}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{t('games.players')}</span>
            <select className="select" value={f.max_players} onChange={(e) => set({ max_players: e.target.value })}>
              {[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{t('games.language')}</span>
            <select className="select" value={f.language} onChange={(e) => set({ language: e.target.value as typeof f.language })}>
              {LANGS.map((l) => <option key={l.code} value={l.code} lang={l.code}>{l.name}</option>)}
              <option value="both">{t('games.lang.both')}</option>
            </select>
          </label>
        </div>

        {leagues.length > 0 && (
          <label className="field">
            <span>{t('games.league')}</span>
            <select className="select" value={f.league_id} onChange={(e) => set({ league_id: e.target.value })}>
              <option value="">{t('games.noLeague')}</option>
              {leagues.map((l) => <option key={l.id} value={l.id}>{l.name} · {l.game_system}</option>)}
            </select>
          </label>
        )}

        <h2>{t('games.sectionWhen')}</h2>
        <div className="field-grid">
          <label className="field">
            <span>{t('games.date')}</span>
            <input className="text-input" type="datetime-local" required value={f.starts_at} onChange={(e) => set({ starts_at: e.target.value })} />
          </label>
          <label className="field">
            <span>{t('games.duration')}</span>
            <select className="select" value={f.duration_minutes} onChange={(e) => set({ duration_minutes: e.target.value })}>
              {[60, 90, 120, 150, 180, 240, 360, 480].map((m) => <option key={m} value={m}>{t('games.minutes', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') })}</option>)}
            </select>
          </label>
        </div>

        <h2>{t('games.sectionWhere')}</h2>
        {stores.length > 0 && (
          <label className="field">
            <span>{t('games.store')}</span>
            <select className="select" value={f.store_id} onChange={(e) => pickStore(e.target.value)}>
              <option value="">{t('games.noStore')}</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.city}</option>)}
            </select>
          </label>
        )}
        <div className="field-grid">
          <label className="field">
            <span>{t('games.country')}</span>
            <select className="select" required value={f.country} onChange={(e) => set({ country: e.target.value })}>
              {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{t('games.city')}</span>
            <input className="text-input" required maxLength={80} list="new-cities" value={f.city} onChange={(e) => set({ city: e.target.value })} />
            <datalist id="new-cities">{f.country === 'JP' && CITIES.map((c) => <option key={c.id} value={c.id} />)}</datalist>
          </label>
        </div>
        <label className="field">
          <span>{t('games.area')}</span>
          <input className="text-input" maxLength={80} value={f.area} onChange={(e) => set({ area: e.target.value })} placeholder={t('games.areaPlaceholder')} />
          <small className="hint">{t('games.areaHint')}</small>
        </label>
        <label className="field">
          <span>{t('games.address')}</span>
          <input className="text-input" required minLength={3} maxLength={200} value={f.address} onChange={(e) => set({ address: e.target.value })} />
          <small className="hint">{t('games.addressHint')}</small>
        </label>
        <label className="field">
          <span>{t('games.note')}</span>
          <textarea className="text-input" rows={3} maxLength={500} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder={t('games.notePlaceholder')} />
        </label>

        {error && <p className="error" role="alert">{t(k(`games.error.${error}`))}</p>}
        <div className="nav-row">
          <a className="btn ghost" href="/play/quick">{t('common.back')}</a>
          <button className="btn primary" disabled={busy}>{busy ? <span className="spinner small" /> : t('games.publish')}</button>
        </div>
      </form>
    </div>
  );
}
