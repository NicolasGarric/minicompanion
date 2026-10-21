import { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../../core/i18n';
import { Empty, Icon, IconButton } from '../../core/ui/ui';

export function VariantsPanel() {
  const t = useT();
  const variants = useStore((s) => s.variants);
  const { saveVariant, loadVariant, deleteVariant, renameVariant, set } = useStore.getState();
  const [name, setName] = useState('');
  const fallback = t('variants.default', { n: variants.length + 1 });

  const save = () => {
    saveVariant(name.trim() || fallback);
    setName('');
  };

  return (
    <div className="variants">
      <div className="card">
        <strong>{t('variants.saveTitle')}</strong>
        <p className="hint">{t('variants.saveHint')}</p>
        <div className="field-row">
          <input className="text-input grow" placeholder={fallback} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          <button className="btn primary small" onClick={save}><Icon name="save" size={14} /> {t('common.save')}</button>
        </div>
      </div>
      {variants.length >= 1 && (
        <button className="btn wide" onClick={() => set({ compareOpen: true })}>
          <Icon name="compare" size={15} /> {t('variants.compare')}
        </button>
      )}
      {variants.length === 0 ? (
        <Empty icon="compare" title={t('variants.emptyTitle')}>{t('variants.emptyText')}</Empty>
      ) : (
        <div className="variant-grid">
          {variants.map((v) => (
            <div key={v.id} className="variant-card">
              <button className="variant-thumb" onClick={() => loadVariant(v.id)} title={t('variants.load')}>
                {v.thumb ? <img src={v.thumb} alt={v.name} /> : null}
              </button>
              <input className="variant-name" value={v.name} onChange={(e) => renameVariant(v.id, e.target.value)} aria-label={t('variants.name')} />
              <div className="variant-actions">
                <button className="btn small" onClick={() => loadVariant(v.id)}>{t('variants.load')}</button>
                <IconButton icon="trash" label={t('common.delete')} size={14} onClick={() => deleteVariant(v.id)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
