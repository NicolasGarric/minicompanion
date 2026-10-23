import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { distanceKm, loadShops, osmElementUrl, searchPlace, SHOP_KINDS, type ShopKind, type Store } from './stores';
import { track } from '../analytics';
import { k, useLang, useT } from '../i18n';
import { Icon } from '../ui/ui';
import { CITIES } from '../data/cities';
import { useSession } from '../auth/session';

const MAX_LISTED = 40;
const KIND_COLOR: Record<ShopKind, string> = { games: '#ff4f7b', model: '#1d2a5b', hobby: '#ffd23f' };

interface View {
  center: { lat: number; lng: number };
  bounds: { s: number; w: number; n: number; e: number };
}

/**
 * Real shops near a place, worldwide (OpenStreetMap data). The map drives the list: move or zoom it,
 * search a city, or use "Near me" (position asked on click, used in the browser only, never stored or sent).
 */
export function StoreFinder() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const homeCity = useSession((s) => s.profile?.home_city ?? '');
  const [shops, setShops] = useState<Store[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [kinds, setKinds] = useState<ShopKind[]>(SHOP_KINDS);
  const [view, setView] = useState<View | null>(null);
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [geo, setGeo] = useState<'idle' | 'loading' | 'denied'>('idle');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<'idle' | 'busy' | 'none' | 'error'>('idle');
  const [selected, setSelected] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  // Popups are built on open, in the current language, without rebuilding the pins.
  const tRef = useRef(t);
  tRef.current = t;
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<{ L: typeof Leaflet; map: Leaflet.Map; layer: Leaflet.LayerGroup; me: Leaflet.LayerGroup; markers: Map<string, Leaflet.CircleMarker> } | null>(null);

  useEffect(() => {
    track('store_finder_opened');
    loadShops().then(setShops, () => setFailed(true));
  }, []);

  // Map, created once. Canvas markers: thousands of shops stay smooth.
  useEffect(() => {
    let cancelled = false;
    Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([mod]) => {
      if (cancelled || !box.current) return;
      const L = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet);
      const start = CITIES.find((c) => c.id === homeCity) ?? CITIES[0];
      const m = L.map(box.current, { preferCanvas: true, scrollWheelZoom: false }).setView([start.lat, start.lng], 12);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(m);
      const sync = () => {
        const b = m.getBounds();
        const c = m.getCenter();
        setView({ center: { lat: c.lat, lng: c.lng }, bounds: { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() } });
      };
      m.on('moveend', sync);
      map.current = { L, map: m, layer: L.layerGroup().addTo(m), me: L.layerGroup().addTo(m), markers: new Map() };
      setMapReady(true);
      sync();
    });
    return () => {
      cancelled = true;
      map.current?.map.remove();
      map.current = null;
    };
  }, []);

  // Pins for the chosen kinds
  const visibleShops = useMemo(() => (shops ?? []).filter((s) => kinds.includes(s.kind)), [shops, kinds]);
  useEffect(() => {
    const cur = map.current;
    if (!cur) return;
    cur.layer.clearLayers();
    cur.markers.clear();
    for (const s of visibleShops) {
      const mk = cur.L.circleMarker([s.lat, s.lng], { radius: 7, color: '#1d2a5b', weight: 2, fillColor: KIND_COLOR[s.kind], fillOpacity: 1 })
        .bindPopup(() => popupOf(s, tRef.current))
        .on('click', () => setSelected(s.id))
        .addTo(cur.layer);
      cur.markers.set(s.id, mk);
    }
  }, [visibleShops, mapReady]);

  // Me
  useEffect(() => {
    const cur = map.current;
    if (!cur) return;
    cur.me.clearLayers();
    if (here) cur.L.circleMarker([here.lat, here.lng], { radius: 6, color: '#1d2a5b', weight: 3, fillColor: '#ffffff', fillOpacity: 1 }).addTo(cur.me);
  }, [here, mapReady]);

  // The list: shops in the map view, nearest first (from me when I'm on the map, else from its centre)
  const inView = useMemo(() => {
    if (!view) return [];
    const { s, w, n, e } = view.bounds;
    const from = here && here.lat >= s && here.lat <= n && here.lng >= w && here.lng <= e ? here : view.center;
    return visibleShops
      .filter((x) => x.lat >= s && x.lat <= n && x.lng >= w && x.lng <= e)
      .map((x) => ({ shop: x, km: distanceKm(from, x) }))
      .sort((a, b) => a.km - b.km);
  }, [visibleShops, view, here]);

  const locate = () => {
    if (!navigator.geolocation) return setGeo('denied');
    setGeo('loading');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        setHere(pos);
        setGeo('idle');
        map.current?.map.setView([pos.lat, pos.lng], 13);
      },
      () => setGeo('denied'),
      { timeout: 8000, maximumAge: 600000 },
    );
  };

  const find = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || search === 'busy') return;
    setSearch('busy');
    try {
      const hit = await searchPlace(query.trim(), lang);
      if (!hit) return setSearch('none');
      map.current?.map.fitBounds(hit.bounds, { maxZoom: 14 });
      setSearch('idle');
    } catch {
      setSearch('error');
    }
  };

  const focus = (s: Store) => {
    setSelected(s.id);
    const cur = map.current;
    if (!cur) return;
    cur.map.setView([s.lat, s.lng], Math.max(cur.map.getZoom(), 15));
    cur.markers.get(s.id)?.openPopup();
    box.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const fmtKm = (km: number) => `${new Intl.NumberFormat(lang, { maximumFractionDigits: km < 10 ? 1 : 0 }).format(km)} km`;

  return (
    <div className="store-finder">
      <form className="store-search" onSubmit={find}>
        <input
          className="text-input"
          type="search"
          value={query}
          onChange={(e) => (setQuery(e.target.value), setSearch('idle'))}
          placeholder={t('stores.searchPlaceholder')}
          aria-label={t('stores.searchPlaceholder')}
        />
        <button className="btn small primary" disabled={search === 'busy'}>{t('stores.search')}</button>
        <button type="button" className="btn small" onClick={locate} disabled={geo === 'loading'}>
          <Icon name="map" size={14} /> {geo === 'loading' ? t('stores.locating') : t('stores.nearMe')}
        </button>
      </form>
      {search === 'none' && <p className="hint">{t('stores.placeNotFound')}</p>}
      {search === 'error' && <p className="hint">{t('error.generic')}</p>}
      {geo === 'denied' && <p className="hint">{t('stores.geoDenied')}</p>}

      <div className="chips store-kinds">
        {SHOP_KINDS.map((x) => (
          <button
            key={x}
            type="button"
            className={`chip ${kinds.includes(x) ? 'on' : ''}`}
            aria-pressed={kinds.includes(x)}
            onClick={() => setKinds((ks) => (ks.includes(x) ? (ks.length > 1 ? ks.filter((y) => y !== x) : ks) : [...ks, x]))}
          >
            <span className="kind-dot" style={{ background: KIND_COLOR[x] }} aria-hidden /> {t(k(`stores.kind.${x}`))}
          </button>
        ))}
      </div>

      <div ref={box} className="store-map-live" role="region" aria-label={t('stores.title')} />
      <p className="hint small">{t('stores.privacyHint')}</p>

      {failed && <p className="error">{t('error.generic')}</p>}
      {!shops && !failed && <span className="spinner" />}
      {shops && (
        <>
          <p className="muted">
            {inView.length > MAX_LISTED ? t('stores.zoomIn', { count: inView.length }) : t('stores.inView', { count: inView.length })}
          </p>
          <ul className="store-list">
            {inView.slice(0, MAX_LISTED).map(({ shop: s, km }) => (
              <li key={s.id}>
                <button className={`store-item ${selected === s.id ? 'on' : ''}`} onClick={() => focus(s)}>
                  <strong>{s.name}</strong>
                  {s.address && <small>{s.address}</small>}
                  <span className="store-tags">
                    <span className="tag"><span className="kind-dot" style={{ background: KIND_COLOR[s.kind] }} aria-hidden /> {t(k(`stores.kind.${s.kind}`))}</span>
                    <span className="tag dist">{fmtKm(km)}</span>
                  </span>
                </button>
              </li>
            ))}
            {inView.length === 0 && <li className="hint">{t('stores.noneHere')}</li>}
          </ul>
        </>
      )}
      <p className="hint small osm-credit">
        {t('stores.osmCredit')}{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">ODbL</a> ·{' '}
        <a href="https://wiki.openstreetmap.org/wiki/How_to_contribute" target="_blank" rel="noreferrer">{t('stores.addOnOsm')} ↗</a>
      </p>
    </div>
  );
}

/** Popup content, built as DOM (no HTML strings from the data). */
function popupOf(s: Store, t: ReturnType<typeof useT>) {
  const el = document.createElement('div');
  el.className = 'map-pop';
  const name = document.createElement('strong');
  name.textContent = s.name;
  el.append(name);
  if (s.address) el.append(Object.assign(document.createElement('small'), { textContent: s.address }));
  const links = document.createElement('span');
  if (/^https?:\/\//.test(s.website)) {
    links.append(Object.assign(document.createElement('a'), { href: s.website, target: '_blank', rel: 'noreferrer', textContent: t('stores.website') }), ' · ');
  }
  links.append(Object.assign(document.createElement('a'), { href: osmElementUrl(s), target: '_blank', rel: 'noreferrer', textContent: 'OpenStreetMap ↗' }));
  el.append(links);
  return el;
}
