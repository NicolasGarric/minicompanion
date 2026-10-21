import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { BUILTIN_SCHEMES, ROLES, roleLabel, schemeDescription, schemeGroup, schemeName } from '../data/presets';
import type { Scheme } from '../types';
import { useLang, useT } from '../i18n';
import { Icon, IconButton } from './ui';

export function SchemeCard({ scheme, onApply, onDelete, applyLabel }: { scheme: Scheme; onApply: () => void; onDelete?: () => void; applyLabel?: string }) {
  const t = useT();
  const chips = ROLES.filter((r) => scheme.recipes[r.id]?.base).slice(0, 7);
  return (
    <div className="scheme-card">
      <div className="scheme-chips">
        {chips.map((r) => <span key={r.id} style={{ background: scheme.recipes[r.id]!.base!.hex }} title={roleLabel(r.id)} />)}
      </div>
      <div className="scheme-text">
        <strong>{schemeName(scheme)}</strong>
        <small>{schemeDescription(scheme) || schemeGroup(scheme)}</small>
      </div>
      <div className="scheme-actions">
        {onDelete && <IconButton icon="trash" label={t('common.delete')} size={14} onClick={onDelete} />}
        <button className="btn small" onClick={onApply}>{applyLabel ?? t('schemes.apply')}</button>
      </div>
    </div>
  );
}

export function SchemesPanel() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const library = useStore((s) => s.library);
  const { applyScheme, saveScheme, deleteScheme } = useStore.getState();
  const [name, setName] = useState('');
  const [faction, setFaction] = useState('');
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = query.toLowerCase();
    const m = new Map<string, Scheme[]>();
    for (const s of BUILTIN_SCHEMES) {
      const g = schemeGroup(s);
      if (q && !`${schemeName(s)} ${g} ${schemeDescription(s)}`.toLowerCase().includes(q)) continue;
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(s);
    }
    return [...m.entries()];
  }, [query, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="schemes">
      <div className="card">
        <strong>{t('schemes.saveTitle')}</strong>
        <p className="hint">{t('schemes.saveHint')}</p>
        <div className="field-col">
          <input className="text-input" placeholder={t('schemes.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
          <input className="text-input" placeholder={t('schemes.groupPlaceholder')} value={faction} onChange={(e) => setFaction(e.target.value)} />
          <button
            className="btn primary"
            disabled={!name.trim()}
            onClick={() => {
              saveScheme(name.trim(), faction.trim());
              setName('');
              setFaction('');
            }}
          >
            <Icon name="save" size={14} /> {t('common.save')}
          </button>
        </div>
      </div>

      {library.schemes.length > 0 && (
        <section>
          <h4>{t('schemes.mine')}</h4>
          {library.schemes.map((s) => <SchemeCard key={s.id} scheme={s} onApply={() => applyScheme(s)} onDelete={() => deleteScheme(s.id)} />)}
        </section>
      )}

      <div className="search">
        <Icon name="zoomIn" size={14} />
        <input placeholder={t('schemes.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <p className="hint">{t('schemes.byRole')}</p>
      {groups.map(([group, list]) => (
        <section key={group}>
          <h4>{group}</h4>
          {list.map((s) => <SchemeCard key={s.id} scheme={s} onApply={() => applyScheme(s)} />)}
        </section>
      ))}
    </div>
  );
}
