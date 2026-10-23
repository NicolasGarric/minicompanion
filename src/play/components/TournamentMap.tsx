import { useEffect, useRef } from 'react';
import type * as Leaflet from 'leaflet';
import { useT } from '../../core/i18n';

export interface MapPoint {
  id: string;
  slug: string;
  name: string;
  lat: number;
  lng: number;
  when: string;
}

/**
 * Tournaments on an OpenStreetMap map (Leaflet, loaded on first use). Pins are riso squares; the view
 * fits the results, or the search circle when there is one. Position is never stored.
 */
export function TournamentMap({ points, center, radiusKm }: { points: MapPoint[]; center: { lat: number; lng: number } | null; radiusKm: number | null }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<{ L: typeof Leaflet; map: Leaflet.Map; layer: Leaflet.LayerGroup } | null>(null);

  // Create the map once
  useEffect(() => {
    let cancelled = false;
    Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([mod]) => {
      if (cancelled || !box.current) return;
      const L = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet);
      const m = L.map(box.current, { scrollWheelZoom: false, zoomControl: true }).setView([35.68, 139.76], 10);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(m);
      map.current = { L, map: m, layer: L.layerGroup().addTo(m) };
      draw();
    });
    return () => {
      cancelled = true;
      map.current?.map.remove();
      map.current = null;
    };
  }, []);

  const draw = () => {
    const cur = map.current;
    if (!cur) return;
    const { L, map: m, layer } = cur;
    layer.clearLayers();
    const icon = L.divIcon({ className: 'map-pin', iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -10] });
    for (const p of points) {
      const link = document.createElement('a');
      link.href = `#/play/t/${p.slug}`;
      link.textContent = p.name;
      const pop = document.createElement('div');
      pop.className = 'map-pop';
      pop.append(link, Object.assign(document.createElement('small'), { textContent: p.when }));
      L.marker([p.lat, p.lng], { icon, title: p.name }).bindPopup(pop).addTo(layer);
    }
    if (center) {
      L.circleMarker([center.lat, center.lng], { radius: 6, color: '#1d2a5b', weight: 3, fillColor: '#ffd23f', fillOpacity: 1 }).addTo(layer);
      if (radiusKm) {
        const ring = L.circle([center.lat, center.lng], { radius: radiusKm * 1000, color: '#1d2a5b', weight: 2, dashArray: '6 6', fill: false }).addTo(layer);
        return void m.fitBounds(ring.getBounds(), { padding: [12, 12] });
      }
    }
    const all: [number, number][] = points.map((p) => [p.lat, p.lng]);
    if (center) all.push([center.lat, center.lng]);
    if (all.length > 1) m.fitBounds(L.latLngBounds(all), { padding: [24, 24], maxZoom: 14 });
    else if (all.length === 1) m.setView(all[0], 13);
  };
  useEffect(draw, [points, center, radiusKm]);

  return <div ref={box} className="tour-map-live" role="region" aria-label={t('play.mapLabel')} />;
}
