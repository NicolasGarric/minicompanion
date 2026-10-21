import { useEffect, useMemo, useState } from 'react';
import { distanceKm, osmEmbedUrl, osmLink, sampleStoreProvider, type Store, type StoreProvider } from './stores';
import { track } from '../analytics';
import { k, useT } from '../i18n';
import { Icon } from '../ui/ui';

export function StoreFinder({ provider = sampleStoreProvider }: { provider?: StoreProvider }) {
  const t = useT();
  const [stores, setStores] = useState<Store[]>([]);
  const [city, setCity] = useState('');
  const [beginnerOnly, setBeginnerOnly] = useState(false);
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [geoState, setGeoState] = useState<'idle' | 'loading' | 'denied'>('idle');
  const [selected, setSelected] = useState<Store | null>(null);

  useEffect(() => {
    track('store_finder_opened');
    provider.list().then(setStores);
  }, [provider]);

  const cities = useMemo(() => [...new Set(stores.map((s) => s.city))].sort(), [stores]);

  const list = useMemo(() => {
    const out = stores
      .filter((s) => (!city || s.city === city) && (!beginnerOnly || s.features.includes('beginner')))
      .map((s) => ({ store: s, km: here ? distanceKm(here, s) : null }));
    if (here) out.sort((a, b) => a.km! - b.km!);
    return out;
  }, [stores, city, beginnerOnly, here]);

  const locate = () => {
    if (!navigator.geolocation) return setGeoState('denied');
    setGeoState('loading');
    // Position is used in the browser only, to sort the list; it is never stored or sent.
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setHere({ lat: p.coords.latitude, lng: p.coords.longitude });
        setCity('');
        setGeoState('idle');
      },
      () => setGeoState('denied'),
      { timeout: 8000, maximumAge: 600000 },
    );
  };

  return (
    <div className="store-finder">
      {provider.source === 'sample' && <p className="notice">{t('stores.sampleNotice')}</p>}
      <div className="store-filters">
        <button className="btn small" onClick={locate} disabled={geoState === 'loading'}>
          <Icon name="map" size={14} /> {geoState === 'loading' ? t('stores.locating') : t('stores.nearMe')}
        </button>
        <select className="select" value={city} onChange={(e) => setCity(e.target.value)} aria-label={t('stores.city')}>
          <option value="">{t('stores.allCities')}</option>
          {cities.map((c) => <option key={c} value={c}>{t(k(`city.${c}`))}</option>)}
        </select>
        <label className="check">
          <input type="checkbox" checked={beginnerOnly} onChange={(e) => setBeginnerOnly(e.target.checked)} /> {t('stores.beginnerOnly')}
        </label>
      </div>
      {geoState === 'denied' && <p className="hint">{t('stores.geoDenied')}</p>}

      <div className="store-layout">
        <ul className="store-list">
          {list.map(({ store: s, km }) => (
            <li key={s.id}>
              <button className={`store-item ${selected?.id === s.id ? 'on' : ''}`} onClick={() => setSelected(s)}>
                <strong>{s.name}</strong>
                <small>{t(k(`city.${s.city}`))} · {s.address}</small>
                <span className="store-tags">
                  {s.features.map((f) => <span key={f} className="tag">{t(k(`feature.${f}`))}</span>)}
                  {km !== null && <span className="tag dist">{km < 10 ? km.toFixed(1) : Math.round(km)} km</span>}
                </span>
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="hint">{t('stores.none')}</li>}
        </ul>
        <div className="store-map">
          {selected ? (
            <>
              <iframe title={selected.name} src={osmEmbedUrl(selected)} loading="lazy" referrerPolicy="no-referrer" />
              <a className="link small" href={osmLink(selected)} target="_blank" rel="noopener noreferrer">{t('stores.openMap')} ↗</a>
            </>
          ) : (
            <div className="map-placeholder"><Icon name="map" size={28} /><span>{t('stores.pick')}</span></div>
          )}
        </div>
      </div>
    </div>
  );
}
