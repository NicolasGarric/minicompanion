import { useEffect, useMemo, useState } from 'react';
import { k, useLang, useT } from '../../core/i18n';
import { CITIES } from '../../core/data/cities';
import { TournamentMap } from '../components/TournamentMap';
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
  type: string;
  venue_name: string;
  lat: number;
  lng: number;
  store_name: string | null;
  max_players: number;
  registered: number;
  spots_left: number;
}

const FORMATS = ['skirmish', 'clash', 'battle'];
const TYPES = ['beginner', 'casual', 'competitive', 'narrative', 'painting_contest'];
const RADII = [5, 15, 50];

/** Great-circle distance in km (the list is small: filtering happens in the browser). */
function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/**
 * PLAY, "Tournaments" tab: upcoming published events on a map and in a list, soonest first.
 * Filters: around a city (the profile's by default) or around me, distance, game size, event type.
 * "Around me" asks for the position on click only; it stays in this page's memory, never stored or sent.
 */
export function PlayHome() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [rows, setRows] = useState<TournamentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<{ slug: string; name: string; game_system: string | null; venue_name: string }[]>([]);
  const [mine, setMine] = useState<{ slug: string; name: string; status: string; starts_at: string }[]>([]);
  const session = useSession((s) => s.session);
  const homeCity = useSession((s) => s.profile?.home_city ?? '');
  const [origin, setOrigin] = useState<string | null>(null); // city id, 'me' or '' (anywhere); null = not chosen yet
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [geo, setGeo] = useState<'idle' | 'loading' | 'denied'>('idle');
  const [radius, setRadius] = useState(15);
  const [format, setFormat] = useState('');
  const [type, setType] = useState('');

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

  const from = origin ?? homeCity; // starts on the profile's city
  const center = from === 'me' ? here : CITIES.find((c) => c.id === from) ?? null;
  const shown = useMemo(
    () =>
      (rows ?? [])
        .map((r) => ({ ...r, km: center ? kmBetween(center, r) : null }))
        .filter((r) => (!format || r.format_id === format) && (!type || r.type === type) && (r.km === null || r.km <= radius)),
    [rows, center, radius, format, type],
  );

  const aroundMe = () => {
    if (!navigator.geolocation) return setGeo('denied');
    setGeo('loading');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setHere({ lat: p.coords.latitude, lng: p.coords.longitude });
        setOrigin('me');
        setGeo('idle');
      },
      () => setGeo('denied'),
      { timeout: 8000, maximumAge: 600000 },
    );
  };

  if (!backendConfigured) return <BackendNotice />;
  return (
    <div className="narrow">
      <div className="page-head">
        <div>
          <h1>{t('play.title')}</h1>
          <p className="lead">{t('play.lead')}</p>
        </div>
        <a className="btn primary" href={session ? '/play/t-new' : '/signin'}>
          <Icon name="plus" size={16} /> {t('tour.organise')}
        </a>
      </div>
      {live.length > 0 && (
        <section className="card accent">
          <h2><span className="live-dot" aria-hidden /> {t('tour.liveNow')}</h2>
          <ul className="notif-list">
            {live.map((l) => (
              <li key={l.slug}>
                <a href={`/play/t/${l.slug}`}><strong>{l.name}</strong></a>
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
            {mine.slice(0, 6).map((m) => (
              <li key={m.slug}>
                <a href={`/play/t/${m.slug}`}>{m.name}</a>
                <span className="tag">{t(k(`tour.status.${m.status}`))}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card tour-filters" aria-label={t('play.filters')}>
        <div className="field-grid">
          <label className="field">
            <span>{t('stores.city')}</span>
            <select className="select" value={from} onChange={(e) => setOrigin(e.target.value)}>
              <option value="">{t('stores.allCities')}</option>
              {here && <option value="me">{t('stores.nearMe')}</option>}
              {CITIES.map((c) => <option key={c.id} value={c.id}>{t(k(`city.${c.id}`))}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{t('play.distance')}</span>
            <select className="select" value={radius} disabled={!center} onChange={(e) => setRadius(Number(e.target.value))}>
              {RADII.map((r) => <option key={r} value={r}>{t('play.withinKm', { n: r })}</option>)}
              <option value={100000}>{t('play.anyDistance')}</option>
            </select>
          </label>
          <label className="field">
            <span>{t('tour.size')}</span>
            <select className="select" value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="">{t('quick.allFormats')}</option>
              {FORMATS.map((x) => <option key={x} value={x}>{t(k(`tour.format.${x}`))}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{t('tour.typeLabel')}</span>
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">{t('play.allTypes')}</option>
              {TYPES.map((x) => <option key={x} value={x}>{t(k(`tour.type.${x}`))}</option>)}
            </select>
          </label>
        </div>
        <div className="field-row wrap">
          <button type="button" className="btn small" disabled={geo === 'loading'} onClick={aroundMe}>
            <Icon name="map" size={14} /> {geo === 'loading' ? t('stores.locating') : t('play.aroundMe')}
          </button>
          <small className="hint grow">{geo === 'denied' ? t('stores.geoDenied') : t('play.geoHint')}</small>
        </div>
      </section>

      {rows && <TournamentMap points={shown.map((r) => ({ id: r.id, slug: r.slug, name: r.name, lat: r.lat, lng: r.lng, when: formatWhen(r.starts_at, lang) }))} center={center} radiusKm={center && radius < 100000 ? radius : null} />}

      {error && <p className="error" role="alert">{t(k(`games.error.${error}`))}</p>}
      {!rows && !error && <span className="spinner" />}
      {rows?.length === 0 && <p className="hint">{t('play.none')}</p>}
      {!!rows?.length && !shown.length && <p className="hint">{t('play.noMatch')}</p>}
      {!!shown.length && (
        <ul className="game-list">
          {shown.map((r) => (
            <li key={r.id}>
              <a className="game-card" href={`/play/t/${r.slug}`}>
                <span className="game-what"><strong>{r.name}</strong></span>
                <span className="game-when">{formatWhen(r.starts_at, lang)}</span>
                <span className="game-where muted">
                  {r.store_name ?? r.venue_name}
                  {r.km !== null && ` · ${t('play.kmAway', { n: new Intl.NumberFormat(lang, { maximumFractionDigits: r.km < 10 ? 1 : 0 }).format(r.km) })}`}
                </span>
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
