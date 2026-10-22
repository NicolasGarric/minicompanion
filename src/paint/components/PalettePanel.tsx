import { useMemo, useState } from 'react';
import { allPaints, uid, useStore } from '../store';
import { BRANDS, PAINT_TYPES, paintSearchUrl } from '../data/paints';
import type { Brand, Paint, PaintType, SlotId } from '../types';
import { isDark, nearestPaints } from '../../core/lib/color';
import { similarity } from '../lib/beginner';
import { k, useT } from '../../core/i18n';
import { Icon, IconButton, Swatch, Toggle } from '../../core/ui/ui';
import { usePrefs } from '../../core/prefs';

const SLOTS: SlotId[] = ['base', 'wash', 'highlight', 'drybrush'];

export const brandLabel = (b: Brand, t: ReturnType<typeof useT>) => (b === 'Custom' ? t('brand.Custom') : b);

export function SlotTarget() {
  const t = useT();
  const zone = useStore((s) => s.zones.find((z) => z.id === s.activeZoneId));
  const slot = useStore((s) => s.activeSlot);
  const set = useStore((s) => s.set);
  if (!zone) return <div className="target-bar muted">{t('palette.noZone')}</div>;
  return (
    <div className="target-bar">
      <span className="muted">{t('palette.applyTo')}</span>
      <strong>{zone.name}</strong>
      <span className="muted">›</span>
      <select className="select slim" value={slot} onChange={(e) => set({ activeSlot: e.target.value as SlotId })}>
        {SLOTS.map((s) => <option key={s} value={s}>{t(k(`slot.${s}`))}</option>)}
      </select>
    </div>
  );
}

/** Neutral search link: general web search, or the retailer chosen by the user on the About page. */
export function PaintSearchLink({ paint }: { paint: Paint }) {
  const t = useT();
  const template = usePrefs((s) => s.retailerTemplate);
  if (paint.brand === 'Custom') return null;
  return (
    <a className="link small" href={paintSearchUrl(paint, template)} target="_blank" rel="noopener noreferrer nofollow">
      {t('palette.search')} ↗
    </a>
  );
}

/** Paint catalogue. `onPicked` lets a modal close once a paint is chosen. */
export function PalettePanel({ slot, onPicked }: { slot?: SlotId; onPicked?: () => void } = {}) {
  const t = useT();
  const library = useStore((s) => s.library);
  const updateLibrary = useStore((s) => s.updateLibrary);
  const assignPaint = useStore((s) => s.assignPaint);
  const [query, setQuery] = useState('');
  const [brands, setBrands] = useState<Brand[]>(['Citadel']);
  const [type, setType] = useState<PaintType | 'all'>('all');
  const [favOnly, setFavOnly] = useState(false);
  const [selected, setSelected] = useState<Paint | null>(null);
  const [newName, setNewName] = useState('');
  const [newHex, setNewHex] = useState('#7a3b8f');

  const paints = useMemo(() => allPaints(library), [library]);
  const favorites = useMemo(() => new Set(library.favorites), [library.favorites]);
  const owned = useMemo(() => new Set(library.owned), [library.owned]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return paints.filter(
      (p) =>
        (brands.length === 0 || brands.includes(p.brand)) &&
        (type === 'all' || p.type === type) &&
        (!favOnly || favorites.has(p.id)) &&
        (!library.ownedOnly || owned.has(p.id) || p.brand === 'Custom') &&
        (!q || p.name.toLowerCase().includes(q) || p.range.toLowerCase().includes(q)),
    );
  }, [paints, brands, type, favOnly, favorites, owned, library.ownedOnly, query]);

  const groups = useMemo(() => {
    const m = new Map<string, Paint[]>();
    for (const p of filtered) {
      const key = `${brandLabel(p.brand, t)} · ${p.range}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(p);
    }
    return [...m.entries()];
  }, [filtered, t]);

  const toggleBrand = (b: Brand) => setBrands((bs) => (bs.includes(b) ? bs.filter((x) => x !== b) : [...bs, b]));
  const toggleIn = (key: 'favorites' | 'owned', id: string) =>
    updateLibrary((l) => ({ ...l, [key]: l[key].includes(id) ? l[key].filter((x) => x !== id) : [...l[key], id] }));

  const pick = (p: Paint) => {
    setSelected(p);
    assignPaint(p, slot);
    onPicked?.();
  };

  const addCustom = () => {
    const name = newName.trim() || t('palette.customDefault', { n: library.customPaints.length + 1 });
    const p: Paint = { id: `custom-${uid()}`, brand: 'Custom', range: t('palette.myColors'), name, hex: newHex, type: 'base' };
    updateLibrary((l) => ({ ...l, customPaints: [...l.customPaints, p] }));
    setNewName('');
    if (!brands.includes('Custom')) setBrands([...brands, 'Custom']);
  };

  const equivalents = useMemo(
    () =>
      selected
        ? BRANDS.filter((b) => b !== selected.brand && b !== 'Custom').map((b) => ({
            brand: b,
            m: nearestPaints(selected.hex, paints, 1, (p) => p.brand === b && p.type !== 'shade')[0],
          }))
        : [],
    [selected, paints],
  );

  return (
    <div className="palette">
      <SlotTarget />
      <div className="palette-filters">
        <div className="search">
          <Icon name="zoomIn" size={14} />
          <input placeholder={t('palette.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="chips">
          {BRANDS.map((b) => (
            <button key={b} className={`chip ${brands.includes(b) ? 'on' : ''}`} onClick={() => toggleBrand(b)}>{brandLabel(b, t)}</button>
          ))}
        </div>
        <div className="chips">
          <button className={`chip small ${type === 'all' ? 'on' : ''}`} onClick={() => setType('all')}>{t('palette.all')}</button>
          {PAINT_TYPES.map((pt) => (
            <button key={pt} className={`chip small ${type === pt ? 'on' : ''}`} onClick={() => setType(pt)}>{t(k(`ptype.${pt}`))}</button>
          ))}
        </div>
        <div className="filter-toggles">
          <Toggle checked={favOnly} onChange={setFavOnly} label={t('palette.favorites')} />
          <Toggle checked={library.ownedOnly} onChange={(ownedOnly) => updateLibrary((l) => ({ ...l, ownedOnly }))} label={t('palette.ownedOnly')} />
        </div>
      </div>

      {selected && (
        <div className="card selected-paint">
          <div className="card-head">
            <Swatch hex={selected.hex} size={28} />
            <div>
              <strong>{selected.name}</strong>
              <small className="muted">{brandLabel(selected.brand, t)} · {selected.range} · {t(k(`ptype.${selected.type}`))}</small>
            </div>
            <IconButton icon="star" label={t('palette.favorite')} size={15} active={favorites.has(selected.id)} onClick={() => toggleIn('favorites', selected.id)} />
            <IconButton icon="check" label={t('palette.own')} size={15} active={owned.has(selected.id)} onClick={() => toggleIn('owned', selected.id)} />
          </div>
          <PaintSearchLink paint={selected} />
          {equivalents.some((e) => e.m) && (
            <div className="equivalents">
              <small className="muted">{t('palette.equivalents')}</small>
              {equivalents.map(({ brand, m }) =>
                m ? (
                  <button key={brand} className="match" onClick={() => pick(m.paint)}>
                    <Swatch hex={m.paint.hex} size={18} />
                    <span>{m.paint.name}<small>{brand} · {m.paint.range}</small></span>
                    <span className="similarity">{similarity(m.dE)}%</span>
                  </button>
                ) : null,
              )}
            </div>
          )}
        </div>
      )}

      <div className="paint-groups">
        {groups.length === 0 && <p className="hint">{t('palette.noResult')}</p>}
        {groups.map(([name, list]) => (
          <section key={name}>
            <h4>{name} <span className="muted">{list.length}</span></h4>
            <div className="paint-grid">
              {list.map((p) => (
                <button
                  key={p.id}
                  className={`paint ${selected?.id === p.id ? 'sel' : ''}`}
                  style={{ background: p.hex, color: isDark(p.hex) ? '#fff' : '#111' }}
                  onClick={() => pick(p)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    toggleIn('favorites', p.id);
                  }}
                  title={`${p.name} — ${brandLabel(p.brand, t)} ${p.range}\n${t('palette.tileHint')}`}
                >
                  {favorites.has(p.id) && <span className="badge fav">★</span>}
                  {owned.has(p.id) && <span className="badge own">✓</span>}
                  <span className="paint-name">{p.name}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="card custom-paint">
        <strong>{t('palette.addCustom')}</strong>
        <div className="field-row">
          <input type="color" value={newHex} onChange={(e) => setNewHex(e.target.value)} className="color-native" aria-label={t('common.customColor')} />
          <input className="text-input grow" placeholder={t('palette.customName')} value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCustom()} />
          <button className="btn small primary" onClick={addCustom} aria-label={t('palette.addCustom')}><Icon name="plus" size={14} /></button>
        </div>
        {library.customPaints.length > 0 && (
          <div className="custom-list">
            {library.customPaints.map((p) => (
              <span key={p.id} className="custom-item">
                <button className="link" onClick={() => pick(p)}><Swatch hex={p.hex} size={16} /> {p.name}</button>
                <IconButton icon="trash" label={t('common.delete')} size={13} onClick={() => updateLibrary((l) => ({ ...l, customPaints: l.customPaints.filter((x) => x.id !== p.id) }))} />
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
