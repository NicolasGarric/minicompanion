import { useEffect, useRef } from 'react';
import type * as Leaflet from 'leaflet';
import { useT } from '../i18n';
import { deviceRegion, type Point } from '../lib/geo';

/** Small map to place one point: tap it, or use its centre (keyboard). Leaflet is loaded on first use. */
export function PointMap({ value, near, onChange }: { value: Point | null; near?: Point | null; onChange: (p: Point) => void }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<{ L: typeof Leaflet; map: Leaflet.Map; layer: Leaflet.LayerGroup } | null>(null);
  const change = useRef(onChange);
  change.current = onChange;

  const draw = (p: Point | null) => {
    const cur = map.current;
    if (!cur) return;
    cur.layer.clearLayers();
    if (p) cur.L.circleMarker([p.lat, p.lng], { radius: 8, color: '#1d2a5b', weight: 3, fillColor: '#ff4f7b', fillOpacity: 1 }).addTo(cur.layer);
  };
  const round = (p: { lat: number; lng: number; wrap?: () => { lat: number; lng: number } }): Point => {
    const w = p.wrap ? p.wrap() : p; // a world panned around several times
    return { lat: Math.round(w.lat * 1e4) / 1e4, lng: Math.round(w.lng * 1e4) / 1e4 };
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(
      ([mod]) => {
        if (cancelled || !box.current) return;
        const L = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet);
        const r = value ?? near ?? deviceRegion();
        const m = L.map(box.current, { scrollWheelZoom: false }).setView(r ? [r.lat, r.lng] : [25, 10], r ? 7 : 2);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
        }).addTo(m);
        m.on('click', (e) => change.current(round(e.latlng)));
        map.current = { L, map: m, layer: L.layerGroup().addTo(m) };
        draw(value);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
      map.current?.map.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => draw(value), [value]);
  // Another country: look there, unless the point is already placed
  useEffect(() => {
    if (near && !value) map.current?.map.setView([near.lat, near.lng], 7);
  }, [near?.lat, near?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div ref={box} className="city-map" role="region" aria-label={t('city.mapLabel')} />
      <button type="button" className="btn small" onClick={() => map.current && onChange(round(map.current.map.getCenter()))}>{t('city.center')}</button>
    </>
  );
}
