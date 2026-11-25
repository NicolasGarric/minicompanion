import { useMemo, useState } from 'react';
import { CITIES, cityById } from '../data/cities';
import { k, useLang, useT } from '../i18n';
import { countryPoint, deviceRegion, type Point } from '../lib/geo';
import { searchCities, type FoundCity } from '../stores/stores';
import { countryName, likelyCountry, sortedCountries } from '../../play/lib/countries';
import { PointMap } from './PointMap';

/** A city from the search, or typed by the player (its place on the map may be unknown). */
export type PickedCity = Omit<FoundCity, 'lat' | 'lng'> & { place: Point | null };

/** Name to show for a stored city: translated when it is one of the known ids, as written otherwise. */
export function useCityLabel() {
  const t = useT();
  return (name: string) => (cityById(name) ? t(k(`city.${name}`)) : name);
}

/**
 * Any city in the world: type, press Search (or Enter), choose in the list. Nothing is sent while typing.
 * A city the search does not know is written freely, with its country and a point on the map.
 * Not a <form>: it sits inside the page's own form.
 */
export function CityPicker({ id, value, needPlace, onPick, onClear }: {
  id: string;
  /** Stored city name, '' = none */
  value: string;
  /** The city must be on the map (distances, tournaments) */
  needPlace?: boolean;
  onPick: (c: PickedCity) => void;
  onClear?: () => void;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const label = useCityLabel();
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<FoundCity[] | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');

  const find = async () => {
    if (q.trim().length < 2 || state === 'busy') return;
    setState('busy');
    try {
      setFound(await searchCities(q.trim(), lang, CITIES.map((c) => c.id)));
      setState('idle');
    } catch {
      setFound(null);
      setState('error');
    }
  };
  const pick = (c: PickedCity) => {
    onPick(c);
    setOpen(false);
    setManual(false);
    setFound(null);
    setQ('');
  };

  if (value && !open) {
    return (
      <div className="city-picker">
        <div className="city-current">
          <strong>{label(value)}</strong>
          <button type="button" className="btn small" onClick={() => setOpen(true)}>{t('city.change')}</button>
          {onClear && <button type="button" className="btn small ghost" onClick={onClear}>{t('city.clear')}</button>}
        </div>
      </div>
    );
  }
  if (manual) return <ManualCity id={id} start={q} needPlace={needPlace} onPick={pick} onBack={() => setManual(false)} />;
  return (
    <div className="city-picker">
      <div className="city-search">
        <input
          id={id}
          className="text-input"
          type="search"
          maxLength={80}
          value={q}
          placeholder={t('city.placeholder')}
          aria-label={t('city.placeholder')}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
            e.preventDefault();
            void find();
          }}
        />
        <button type="button" className="btn small primary" disabled={state === 'busy' || q.trim().length < 2} onClick={() => void find()}>{t('stores.search')}</button>
      </div>
      {state === 'error' && <p className="error" role="alert">{t('error.generic')}</p>}
      {found?.length === 0 && <p className="hint" role="status">{t('stores.placeNotFound')}</p>}
      {!!found?.length && (
        <ul className="city-results" aria-label={t('city.choose')}>
          {found.map((c) => (
            <li key={`${c.lat},${c.lng}`}>
              <button type="button" onClick={() => pick({ ...c, place: { lat: c.lat, lng: c.lng } })}>
                <strong>{label(c.name)}</strong> <span className="muted">{[c.region !== c.name && c.region, c.country !== c.name && c.country].filter(Boolean).join(', ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <small className="hint">{t('city.hint')}</small>
      <button type="button" className="link city-manual-link" onClick={() => setManual(true)}>{t('city.notListed')}</button>
    </div>
  );
}

/** A city written by the player. */
function ManualCity({ id, start, needPlace, onPick, onBack }: { id: string; start: string; needPlace?: boolean; onPick: (c: PickedCity) => void; onBack: () => void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const countries = useMemo(() => sortedCountries(lang), [lang]);
  const [name, setName] = useState(start.trim());
  const [country, setCountry] = useState(likelyCountry);
  const [place, setPlace] = useState<Point | null>(null);
  // The device's own region when it is in that country, else the country's main city
  const region = deviceRegion();
  const near = region?.country === country ? region : countryPoint(country);
  const ok = name.trim().length >= 2 && (!needPlace || place !== null);
  const use = () => ok && onPick({ name: name.trim().replace(/\s+/g, ' '), region: '', country: countryName(country, lang), countryCode: country, place });

  return (
    <div className="city-picker city-manual">
      <label className="field">
        <span>{t('city.name')}</span>
        <input
          id={`${id}-name`}
          className="text-input"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
            e.preventDefault();
            use();
          }}
        />
      </label>
      <label className="field">
        <span>{t('games.country')}</span>
        <select id={`${id}-country`} className="select" value={country} onChange={(e) => setCountry(e.target.value)}>
          {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </label>
      <small className="hint">{t(place ? 'city.placed' : needPlace ? 'city.tapMap' : 'city.tapMapOptional')}</small>
      <PointMap value={place} near={near} onChange={setPlace} />
      <div className="nav-row">
        <button type="button" className="btn small ghost" onClick={onBack}>{t('city.back')}</button>
        <button type="button" className="btn small primary" disabled={!ok} onClick={use}>{t('city.use')}</button>
      </div>
    </div>
  );
}
