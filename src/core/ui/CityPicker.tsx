import { useState } from 'react';
import { CITIES, cityById } from '../data/cities';
import { k, useLang, useT } from '../i18n';
import { searchCities, type FoundCity } from '../stores/stores';

/** Name to show for a stored city: translated when it is one of the known ids, as written otherwise. */
export function useCityLabel() {
  const t = useT();
  return (name: string) => (cityById(name) ? t(k(`city.${name}`)) : name);
}

/**
 * Any city in the world: type, press Search (or Enter), choose in the list. Nothing is sent while typing.
 * Not a <form>: it sits inside the page's own form.
 */
export function CityPicker({ id, value, onPick, onClear }: {
  id: string;
  /** Stored city name, '' = none */
  value: string;
  onPick: (c: FoundCity) => void;
  onClear?: () => void;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const label = useCityLabel();
  const [open, setOpen] = useState(false);
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
  const pick = (c: FoundCity) => {
    onPick(c);
    setOpen(false);
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
              <button type="button" onClick={() => pick(c)}>
                <strong>{label(c.name)}</strong> <span className="muted">{[c.region !== c.name && c.region, c.country !== c.name && c.country].filter(Boolean).join(', ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <small className="hint">{t('city.hint')}</small>
    </div>
  );
}
