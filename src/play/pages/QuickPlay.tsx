import { useEffect, useMemo, useState } from 'react';
import { k, useLang, useT } from '../../core/i18n';
import { backendConfigured } from '../../core/auth/supabase';
import { BackendNotice } from '../../core/auth/BackendNotice';
import { useSession } from '../../core/auth/session';
import { Icon } from '../../core/ui/ui';
import { GameCard } from '../components/GameCard';
import { listGames, playError, popularTexts, type Game, type GameFilters } from '../lib/games';
import { sortedCountries } from '../lib/countries';

/** Quick play: upcoming casual games, filtered by game, format and place. */
export function QuickPlay() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const session = useSession((s) => s.session);
  const [filters, setFilters] = useState<GameFilters>({ country: '', openOnly: false });
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [popular, setPopular] = useState<string[]>([]);
  const [formats, setFormats] = useState<string[]>([]);
  const countries = useMemo(() => sortedCountries(lang), [lang]);

  useEffect(() => {
    if (!backendConfigured) return;
    popularTexts().then((r) => setPopular(r.map((x) => x.game_system)));
  }, []);

  // Formats of the chosen game, as chips (what players typed for it).
  useEffect(() => {
    if (!backendConfigured || !filters.game?.trim()) return setFormats([]);
    const id = setTimeout(() => popularTexts(filters.game).then((r) => setFormats(r.map((x) => x.format).filter((f): f is string => !!f))), 300);
    return () => clearTimeout(id);
  }, [filters.game]);

  useEffect(() => {
    if (!backendConfigured) return;
    const id = setTimeout(() => {
      listGames(filters).then(setGames, (e) => setError(playError(e) ?? 'generic'));
    }, 250);
    return () => clearTimeout(id);
  }, [filters]);

  if (!backendConfigured) return <BackendNotice />;
  const set = (p: Partial<GameFilters>) => setFilters((f) => ({ ...f, ...p }));

  return (
    <div className="narrow quick-play">
      <div className="page-head">
        <div>
          <h1>{t('quick.title')}</h1>
          <p className="lead">{t('quick.lead')}</p>
        </div>
        <a className="btn primary" href={session ? '#/play/new' : '#/signin'}>
          <Icon name="plus" size={16} /> {t('quick.create')}
        </a>
      </div>

      <div className="game-filters">
        <input className="text-input" list="popular-games" placeholder={t('quick.gamePlaceholder')} value={filters.game ?? ''} onChange={(e) => set({ game: e.target.value, format: '' })} aria-label={t('games.game')} />
        <datalist id="popular-games">{popular.map((g) => <option key={g} value={g} />)}</datalist>
        <select className="select" value={filters.country} onChange={(e) => set({ country: e.target.value })} aria-label={t('games.country')}>
          <option value="">{t('quick.allCountries')}</option>
          {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <input className="text-input" placeholder={t('games.city')} value={filters.city ?? ''} onChange={(e) => set({ city: e.target.value })} aria-label={t('games.city')} />
        <select className="select" value={filters.level ?? ''} onChange={(e) => set({ level: e.target.value as GameFilters['level'] })} aria-label={t('games.level')}>
          <option value="">{t('quick.allLevels')}</option>
          {(['beginner', 'casual', 'competitive'] as const).map((l) => <option key={l} value={l}>{t(`games.level.${l}`)}</option>)}
        </select>
        <label className="check">
          <input type="checkbox" checked={!!filters.openOnly} onChange={(e) => set({ openOnly: e.target.checked })} /> {t('quick.openOnly')}
        </label>
      </div>
      {formats.length > 0 && (
        <div className="chips" role="group" aria-label={t('games.format')}>
          <button className={`chip ${!filters.format ? 'on' : ''}`} onClick={() => set({ format: '' })}>{t('quick.allFormats')}</button>
          {formats.map((f) => (
            <button key={f} className={`chip ${filters.format === f ? 'on' : ''}`} onClick={() => set({ format: f })}>{f}</button>
          ))}
        </div>
      )}

      {error && <p className="error" role="alert">{t(k(`games.error.${error}`))}</p>}
      {!games && !error && <span className="spinner" />}
      {games?.length === 0 && <p className="hint">{t('quick.none')}</p>}
      {!!games?.length && <ul className="game-list">{games.map((g) => <GameCard key={g.id} game={g} />)}</ul>}
    </div>
  );
}
