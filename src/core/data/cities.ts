/**
 * Cities offered for the profile "home city" and the tournament city search.
 * Coordinates are city centres; they only seed distance searches.
 */
export interface City {
  id: string;
  lat: number;
  lng: number;
}

export const CITIES: City[] = [
  { id: 'Tokyo', lat: 35.6812, lng: 139.7671 },
  { id: 'Yokohama', lat: 35.4437, lng: 139.638 },
  { id: 'Saitama', lat: 35.8617, lng: 139.6455 },
  { id: 'Chiba', lat: 35.6073, lng: 140.1063 },
  { id: 'Osaka', lat: 34.6937, lng: 135.5023 },
  { id: 'Kyoto', lat: 35.0116, lng: 135.7681 },
  { id: 'Kobe', lat: 34.6901, lng: 135.1955 },
  { id: 'Nagoya', lat: 35.1815, lng: 136.9066 },
  { id: 'Fukuoka', lat: 33.5904, lng: 130.4017 },
  { id: 'Hiroshima', lat: 34.3853, lng: 132.4553 },
  { id: 'Sendai', lat: 38.2682, lng: 140.8694 },
  { id: 'Sapporo', lat: 43.0618, lng: 141.3545 },
];

export const cityById = (id: string | null | undefined) => CITIES.find((c) => c.id === id);
