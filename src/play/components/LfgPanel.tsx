import { useEffect, useMemo, useState } from 'react';
import { k, useLang, useT } from '../../core/i18n';
import { useSession } from '../../core/auth/session';
import { Icon } from '../../core/ui/ui';
import { countryName, sortedCountries } from '../lib/countries';
import type { GameFilters, GameLevel } from '../lib/games';
import { closePost, createPost, listPosts, playError, type LfgPost } from '../lib/social';

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

/** "Looking for a game" posts: list (same filters as the games) and the post form. */
export function LfgPanel({ filters }: { filters: GameFilters }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const session = useSession((s) => s.session);
  const me = session?.user.id;
  const [posts, setPosts] = useState<LfgPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(false);

  const load = () =>
    listPosts({ game: filters.game, country: filters.country, city: filters.city, level: filters.level || undefined }).then(setPosts, (e) => setError(playError(e) ?? 'generic'));
  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [filters.game, filters.country, filters.city, filters.level]);

  const fmtDay = (d: string) => new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric' }).format(new Date(d));

  return (
    <div className="lfg">
      <div className="field-row wrap">
        <p className="hint grow">{t('lfg.lead')}</p>
        {session ? (
          <button className="btn" onClick={() => setForm(!form)} aria-expanded={form}>
            <Icon name="plus" size={14} /> {t('lfg.post')}
          </button>
        ) : (
          <a className="btn" href="#/signin">{t('lfg.post')}</a>
        )}
      </div>
      {form && me && (
        <LfgForm
          me={me}
          onDone={() => {
            setForm(false);
            load();
          }}
        />
      )}
      {error && <p className="error" role="alert">{t(k(`games.error.${error}`))}</p>}
      {!posts && !error && <span className="spinner" />}
      {posts?.length === 0 && <p className="hint">{t('lfg.none')}</p>}
      {!!posts?.length && (
        <ul className="game-list">
          {posts.map((p) => (
            <li key={p.id} className="game-card lfg-card">
              <span className="game-what">
                <strong>{p.game_system}</strong>
                {p.format && <small className="muted">{p.format}</small>}
              </span>
              <span className="game-when">{fmtDay(p.from_date)} → {fmtDay(p.to_date)}</span>
              <span className="game-where muted">{[p.area, p.city, countryName(p.country, lang)].filter(Boolean).join(', ')}</span>
              {p.note && <span className="game-note small">{p.note}</span>}
              <span className="game-tags">
                <span className="tag">{t(k(`games.level.${p.level}`))}</span>
                {p.author && <a className="small" href={`#/u/${p.author.handle}`}>{p.author.display_name}</a>}
                {me && p.author_id !== me && (
                  <a className="btn small" href={`#/messages/${p.author_id}?post=${p.id}`}>
                    <Icon name="link" size={14} /> {t('lfg.contact')}
                  </a>
                )}
                {me && p.author_id === me && (
                  <button className="btn small ghost" onClick={() => closePost(p.id).then(load)}>{t('lfg.close')}</button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LfgForm({ me, onDone }: { me: string; onDone: () => void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const countries = useMemo(() => sortedCountries(lang), [lang]);
  const [f, setF] = useState({ game_system: '', format: '', level: 'casual' as GameLevel, country: 'JP', city: '', area: '', from_date: today(), to_date: inDays(14), note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createPost({ ...f, author_id: me, format: f.format || null, city: f.city || null, area: f.area || null, note: f.note || null });
      onDone();
    } catch (err) {
      setError(playError(err) ?? 'generic');
      setBusy(false);
    }
  };

  return (
    <form className="card field-col" onSubmit={submit}>
      <div className="field-grid">
        <label className="field">
          <span>{t('games.game')}</span>
          <input className="text-input" required minLength={2} maxLength={60} list="popular-games" value={f.game_system} onChange={(e) => set({ game_system: e.target.value })} />
        </label>
        <label className="field">
          <span>{t('games.format')}</span>
          <input className="text-input" maxLength={60} value={f.format} onChange={(e) => set({ format: e.target.value })} />
        </label>
        <label className="field">
          <span>{t('games.level')}</span>
          <select className="select" value={f.level} onChange={(e) => set({ level: e.target.value as GameLevel })}>
            {(['beginner', 'casual', 'competitive'] as const).map((l) => <option key={l} value={l}>{t(`games.level.${l}`)}</option>)}
          </select>
        </label>
      </div>
      <div className="field-grid">
        <label className="field">
          <span>{t('games.country')}</span>
          <select className="select" value={f.country} onChange={(e) => set({ country: e.target.value })}>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t('games.city')}</span>
          <input className="text-input" maxLength={80} value={f.city} onChange={(e) => set({ city: e.target.value })} />
        </label>
        <label className="field">
          <span>{t('games.area')}</span>
          <input className="text-input" maxLength={80} value={f.area} onChange={(e) => set({ area: e.target.value })} />
        </label>
      </div>
      <div className="field-grid">
        <label className="field">
          <span>{t('lfg.from')}</span>
          <input className="text-input" type="date" required min={today()} value={f.from_date} onChange={(e) => set({ from_date: e.target.value })} />
        </label>
        <label className="field">
          <span>{t('lfg.to')}</span>
          <input className="text-input" type="date" required min={f.from_date} value={f.to_date} onChange={(e) => set({ to_date: e.target.value })} />
        </label>
      </div>
      <label className="field">
        <span>{t('games.note')}</span>
        <textarea className="text-input" rows={2} maxLength={500} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder={t('lfg.notePlaceholder')} />
      </label>
      <p className="hint">{t('lfg.alertHint')}</p>
      {error && <p className="error" role="alert">{t(k(`games.error.${error}`))}</p>}
      <div className="nav-row">
        <button className="btn primary" disabled={busy}>{t('lfg.publish')}</button>
      </div>
    </form>
  );
}
