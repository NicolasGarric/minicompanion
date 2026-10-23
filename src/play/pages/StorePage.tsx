import { safeHref } from '../../core/lib/url';
import { useEffect, useState } from 'react';
import { setPageMeta } from '../../core/seo';
import { k, useLang, useT } from '../../core/i18n';
import { backendConfigured } from '../../core/auth/supabase';
import { BackendNotice } from '../../core/auth/BackendNotice';
import { useSession } from '../../core/auth/session';
import { Icon, IconButton } from '../../core/ui/ui';
import { GameCard, formatWhen } from '../components/GameCard';
import type { Game } from '../lib/games';
import {
  addSlot,
  getStore,
  isStoreStaff,
  listLeagues,
  playError,
  removeSlot,
  storeGames,
  storeSlots,
  storeTournaments,
  type League,
  type StoreSlot,
} from '../lib/social';

/** A store: regular nights (edited by its staff), upcoming games, tournaments and leagues. */
export function StorePage({ id }: { id: string }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const session = useSession((s) => s.session);
  const [store, setStore] = useState<Awaited<ReturnType<typeof getStore>> | undefined>(undefined);
  useEffect(() => {
    if (store) setPageMeta({ title: store.name, description: store.address });
  }, [store]);
  const [slots, setSlots] = useState<StoreSlot[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [tours, setTours] = useState<Awaited<ReturnType<typeof storeTournaments>>>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [staff, setStaff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slot, setSlot] = useState({ weekday: 6, starts_at: '13:00', ends_at: '19:00', tables: '6', note: '' });

  const load = async () => {
    try {
      setStore(await getStore(id));
      setSlots(await storeSlots(id));
      setGames(await storeGames(id));
      setTours(await storeTournaments(id));
      setLeagues(await listLeagues({ current: true, store: id }));
      if (session) setStaff(await isStoreStaff(id));
    } catch (e) {
      setError(playError(e) ?? 'generic');
      setStore(null);
    }
  };
  useEffect(() => {
    if (backendConfigured) load();
  }, [id, session]);

  if (!backendConfigured) return <BackendNotice />;
  if (store === undefined) return <div className="narrow"><span className="spinner" /></div>;
  if (!store) return <div className="narrow"><p className="hint">{t('store.notFound')}</p></div>;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addSlot({ store_id: id, weekday: slot.weekday, starts_at: slot.starts_at, ends_at: slot.ends_at, tables: slot.tables ? Number(slot.tables) : null, note: slot.note || null });
      await load();
    } catch (err) {
      setError(playError(err) ?? 'generic');
    }
  };

  return (
    <div className="narrow game-detail">
      <h1>{store.name}</h1>
      <section className="card game-facts">
        <p><Icon name="map" size={16} /> {store.address}</p>
        {safeHref(store.website) && <p><Icon name="link" size={16} /> <a href={safeHref(store.website)} target="_blank" rel="noopener noreferrer">{store.website}</a></p>}
      </section>

      <section className="card">
        <h2>{t('store.nights')}</h2>
        {slots.length === 0 ? (
          <p className="hint">{t('store.noNights')}</p>
        ) : (
          <ul className="slot-list">
            {slots.map((s) => (
              <li key={s.id}>
                <strong>{t(k(`weekday.${s.weekday}`))}</strong> {s.starts_at.slice(0, 5)}–{s.ends_at.slice(0, 5)}
                {s.tables && <span className="tag">{t('store.tables', { count: s.tables })}</span>}
                {s.note && <span className="muted"> · {s.note}</span>}
                {staff && <IconButton icon="trash" label={t('store.removeNight')} size={14} onClick={() => removeSlot(s.id).then(load)} />}
              </li>
            ))}
          </ul>
        )}
        {staff && (
          <form className="field-row wrap slot-form" onSubmit={add}>
            <select className="select" value={slot.weekday} onChange={(e) => setSlot({ ...slot, weekday: Number(e.target.value) })} aria-label={t('store.day')}>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{t(k(`weekday.${d}`))}</option>)}
            </select>
            <input className="text-input" type="time" value={slot.starts_at} onChange={(e) => setSlot({ ...slot, starts_at: e.target.value })} aria-label={t('store.from')} />
            <input className="text-input" type="time" value={slot.ends_at} onChange={(e) => setSlot({ ...slot, ends_at: e.target.value })} aria-label={t('store.to')} />
            <input className="text-input num" type="number" min={1} max={100} value={slot.tables} onChange={(e) => setSlot({ ...slot, tables: e.target.value })} aria-label={t('store.tablesLabel')} />
            <input className="text-input" maxLength={200} value={slot.note} onChange={(e) => setSlot({ ...slot, note: e.target.value })} placeholder={t('store.notePlaceholder')} />
            <button className="btn small primary">{t('store.addNight')}</button>
          </form>
        )}
      </section>

      {tours.length > 0 && (
        <section className="card">
          <h2>{t('nav.play.tournaments')}</h2>
          <ul className="notif-list">
            {tours.map((x) => <li key={x.id}><a href={`/play/t/${x.slug}`}>{x.name}</a> <small className="muted">{formatWhen(x.starts_at, lang)}</small></li>)}
          </ul>
        </section>
      )}
      {leagues.length > 0 && (
        <section className="card">
          <h2>{t('nav.play.leagues')}</h2>
          <ul className="notif-list">
            {leagues.map((l) => <li key={l.id}><a href={`/play/league/${l.id}`}>{l.name}</a> <small className="muted">{l.game_system}</small></li>)}
          </ul>
        </section>
      )}
      <h2>{t('store.games')}</h2>
      {games.length === 0 ? <p className="hint">{t('store.noGames')}</p> : <ul className="game-list">{games.map((g) => <GameCard key={g.id} game={g} />)}</ul>}
      {error && <p className="error" role="alert">{t(k(`games.error.${error}`))}</p>}
    </div>
  );
}
