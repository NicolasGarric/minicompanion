import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { renderThumb } from '../lib/image';
import { Empty, Modal } from './ui';
import { useT } from '../i18n';

const CURRENT = '__current__';

export function CompareView() {
  const t = useT();
  const variants = useStore((s) => s.variants);
  const zones = useStore((s) => s.zones);
  const { set, loadVariant } = useStore.getState();
  const options = useMemo(() => [{ id: CURRENT, name: t('compare.current'), zones }, ...variants], [variants, zones]);
  const [picked, setPicked] = useState<string[]>(() => options.slice(0, 4).map((o) => o.id));
  const [renders, setRenders] = useState<Record<string, string>>({});

  useEffect(() => {
    // Render one variant per tick to keep the UI responsive
    let cancelled = false;
    const todo = options.filter((o) => picked.includes(o.id) && !renders[o.id]);
    const step = () => {
      const o = todo.shift();
      if (!o || cancelled) return;
      const url = renderThumb(o.zones, 900);
      setRenders((r) => ({ ...r, [o.id]: url }));
      setTimeout(step, 0);
    };
    setTimeout(step, 30);
    return () => {
      cancelled = true;
    };
  }, [picked, options]); // eslint-disable-line react-hooks/exhaustive-deps -- renders is a cache

  const close = () => set({ compareOpen: false });
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 4 ? [...p.slice(1), id] : [...p, id]));
  const shown = options.filter((o) => picked.includes(o.id));

  return (
    <Modal title={t('variants.compare')} onClose={close} wide>
      <div className="compare-picker">
        {options.map((o) => (
          <button key={o.id} className={`chip ${picked.includes(o.id) ? 'on' : ''}`} onClick={() => toggle(o.id)}>
            {o.name}
          </button>
        ))}
        <span className="hint">{t('compare.max')}</span>
      </div>
      {variants.length === 0 && <Empty icon="compare" title={t('variants.emptyTitle')}>{t('compare.empty')}</Empty>}
      <div className="compare-grid" style={{ gridTemplateColumns: `repeat(${Math.max(1, shown.length)}, 1fr)` }}>
        {shown.map((o) => (
          <figure key={o.id}>
            {renders[o.id] ? <img src={renders[o.id]} alt={o.name} /> : <div className="render-placeholder">{t('compare.rendering')}</div>}
            <figcaption>
              <strong>{o.name}</strong>
              {o.id !== CURRENT && (
                <button className="btn small" onClick={() => { loadVariant(o.id); close(); }}>{t('variants.load')}</button>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </Modal>
  );
}
