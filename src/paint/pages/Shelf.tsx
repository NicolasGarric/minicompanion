import { useEffect, useMemo, useState } from 'react';
import { allPaints, uid, useStore } from '../store';
import { BRANDS, PAINT_TYPES } from '../data/paints';
import type { Brand, Paint, PaintType } from '../types';
import { k, useT } from '../../core/i18n';
import { Icon, IconButton, Swatch } from '../../core/ui/ui';

/**
 * My paint shelf: tick the pots I own, by brand, and add my own paints (any brand, name and
 * reference colour). Shares the PAINT library: owned pots are ticked in the shopping list and
 * suggested as stand-ins; my paints appear under "My colours" in the editor's catalogue.
 */
export function Shelf() {
  const t = useT();
  const library = useStore((s) => s.library);
  const { updateLibrary, loadLibrary } = useStore.getState();
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState<Brand>('Citadel');
  const [type, setType] = useState<PaintType | 'all'>('all');
  const [onlyMine, setOnlyMine] = useState(false);
  const [draft, setDraft] = useState({ name: '', range: '', hex: '#7a3b8f', type: 'base' as PaintType });

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const owned = useMemo(() => new Set(library.owned), [library.owned]);
  const paints = useMemo(() => allPaints(library), [library]);
  const q = query.trim().toLowerCase();
  const shown = paints.filter((p) => p.brand === brand && (type === 'all' || p.type === type)
    && (!q || p.name.toLowerCase().includes(q) || p.range.toLowerCase().includes(q))
    && (!onlyMine || owned.has(p.id) || p.brand === 'Custom'));
  const groups = PAINT_TYPES.map((ty) => [ty, shown.filter((p) => p.type === ty)] as const).filter(([, l]) => l.length);
  const ownedCount = paints.filter((p) => owned.has(p.id)).length + library.customPaints.length;

  const toggle = (id: string) => updateLibrary((l) => ({ ...l, owned: l.owned.includes(id) ? l.owned.filter((x) => x !== id) : [...l.owned, id] }));
  const addMine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    const p: Paint = { id: `custom-${uid()}`, brand: 'Custom', range: draft.range.trim() || t('palette.myColors'), name: draft.name.trim().slice(0, 60), hex: draft.hex, type: draft.type };
    updateLibrary((l) => ({ ...l, customPaints: [...l.customPaints, p], owned: [...l.owned, p.id] }));
    setDraft({ ...draft, name: '' });
  };
  const editMine = (id: string, patch: Partial<Paint>) =>
    updateLibrary((l) => ({ ...l, customPaints: l.customPaints.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const removeMine = (id: string) =>
    updateLibrary((l) => ({ ...l, customPaints: l.customPaints.filter((p) => p.id !== id), owned: l.owned.filter((x) => x !== id) }));

  return (
    <div className="narrow shelf">
      <div className="page-head">
        <div>
          <h1>{t('shelf.title')}</h1>
          <p className="lead">{t('shelf.lead')}</p>
        </div>
        <div className="pile-total"><span className="big">{ownedCount}</span><span>{t('shelf.pots')}</span></div>
      </div>

      <section className="card" aria-labelledby="mine-title">
        <h2 id="mine-title">{t('shelf.mine')}</h2>
        <p className="hint">{t('shelf.mineHint')}</p>
        <form className="shelf-add" onSubmit={addMine}>
          <label className="color-pick" title={t('shelf.refColour')}>
            <input type="color" value={draft.hex} onChange={(e) => setDraft({ ...draft, hex: e.target.value })} aria-label={t('shelf.refColour')} />
          </label>
          <input className="text-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t('shelf.namePlaceholder')} aria-label={t('shelf.name')} maxLength={60} />
          <input className="text-input" value={draft.range} onChange={(e) => setDraft({ ...draft, range: e.target.value })} placeholder={t('shelf.brandPlaceholder')} aria-label={t('shelf.brand')} maxLength={40} />
          <select className="select" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as PaintType })} aria-label={t('shelf.type')}>
            {PAINT_TYPES.map((ty) => <option key={ty} value={ty}>{t(k(`ptype.${ty}`))}</option>)}
          </select>
          <button className="btn primary" disabled={!draft.name.trim()}><Icon name="plus" size={16} /> {t('shelf.add')}</button>
        </form>
        {library.customPaints.length > 0 && (
          <ul className="shelf-list">
            {library.customPaints.map((p) => (
              <li key={p.id}>
                <label className="color-pick small" title={t('shelf.refColour')}>
                  <input type="color" value={p.hex} onChange={(e) => editMine(p.id, { hex: e.target.value })} aria-label={t('shelf.refColour')} />
                </label>
                <input className="text-input inline" value={p.name} maxLength={60} onChange={(e) => editMine(p.id, { name: e.target.value })} aria-label={t('shelf.name')} />
                <small className="muted">{p.range} · {t(k(`ptype.${p.type}`))}</small>
                <IconButton icon="trash" label={t('common.delete')} size={14} onClick={() => removeMine(p.id)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="brands-title">
        <h2 id="brands-title" className="section-title">{t('shelf.byBrand')}</h2>
        <input className="text-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('palette.search')} aria-label={t('palette.search')} />
        <div className="chips shelf-filters">
          {BRANDS.filter((b) => b !== 'Custom').map((b) => (
            <button key={b} className={`chip ${brand === b ? 'on' : ''}`} aria-pressed={brand === b} onClick={() => setBrand(b)}>{b}</button>
          ))}
        </div>
        <div className="chips shelf-filters">
          <button className={`chip ${type === 'all' ? 'on' : ''}`} onClick={() => setType('all')}>{t('palette.all')}</button>
          {PAINT_TYPES.map((ty) => (
            <button key={ty} className={`chip ${type === ty ? 'on' : ''}`} aria-pressed={type === ty} onClick={() => setType(ty)}>{t(k(`ptype.${ty}`))}</button>
          ))}
          <button className={`chip ${onlyMine ? 'on' : ''}`} aria-pressed={onlyMine} onClick={() => setOnlyMine(!onlyMine)}>{t('shelf.onlyMine')}</button>
        </div>
        {groups.length === 0 ? <p className="hint">{t('palette.noResult')}</p> : groups.map(([ty, list]) => (
          <div key={ty} className="shelf-group">
            <h3>{brand} · {t(k(`ptype.${ty}`))} <span className="muted">{list.filter((p) => owned.has(p.id)).length}/{list.length}</span></h3>
            <ul className="shelf-list">
              {list.map((p) => (
                <li key={p.id} className={owned.has(p.id) ? 'have' : ''}>
                  <label className="check">
                    <input type="checkbox" checked={owned.has(p.id)} onChange={() => toggle(p.id)} />
                    <Swatch hex={p.hex} size={20} />
                    <span>{p.name} <small className="muted">{p.range}</small></span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
