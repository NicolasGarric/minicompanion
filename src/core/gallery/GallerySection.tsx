import { useEffect, useState } from 'react';
import { listGallery, removeFromGallery, type GalleryItem } from './gallery';
import { useT } from '../i18n';
import { Icon, IconButton, Swatch, Toggle } from '../ui/ui';
import { setGalleryItemPublic } from '../../play/lib/social';

/** "My gallery" on the profile page: the renders saved from PAINT, newest first. */
export function GallerySection() {
  const t = useT();
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [error, setError] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    listGallery().then(setItems, () => setError(true));
  }, []);

  const remove = async (item: GalleryItem) => {
    try {
      await removeFromGallery(item);
      setItems((list) => list?.filter((i) => i.id !== item.id) ?? null);
    } catch {
      setError(true);
    }
    setConfirming(null);
  };

  return (
    <section className="card gallery">
      <h2>{t('gallery.title')}</h2>
      {error && <p className="error">{t('error.generic')}</p>}
      {!items && !error && <span className="spinner" />}
      {items?.length === 0 && (
        <p className="hint">
          {t('gallery.empty')} <a href="/paint">{t('gallery.emptyCta')}</a>
        </p>
      )}
      {!!items?.length && (
        <ul className="gallery-grid">
          {items.map((item) => (
            <li key={item.id} className="gallery-item">
              <a href={item.url} target="_blank" rel="noreferrer" className="gallery-img">
                {item.url ? <img src={item.thumb ?? item.url} alt={item.title} loading="lazy" /> : <Icon name="palette" size={24} />}
              </a>
              <div className="gallery-meta">
                <strong>{item.title}</strong>
                <small className="muted">{new Date(item.created_at).toLocaleDateString()}</small>
                <span className="gallery-paints" title={item.paints.map((p) => `${p.name} · ${p.brand}`).join('\n')}>
                  {item.paints.slice(0, 8).map((p) => (
                    <Swatch key={p.name + p.brand} hex={p.hex} size={14} />
                  ))}
                </span>
              </div>
              {item.is_public !== undefined && (
                <Toggle
                  checked={item.is_public}
                  label={t('gallery.public')}
                  onChange={async (v) => {
                    await setGalleryItemPublic(item.id, v).catch(() => setError(true));
                    setItems((list) => list?.map((i) => (i.id === item.id ? { ...i, is_public: v } : i)) ?? null);
                  }}
                />
              )}
              {confirming === item.id ? (
                <div className="field-row">
                  <button className="btn small danger-ghost" onClick={() => remove(item)}>{t('gallery.delete')}</button>
                  <button className="btn small ghost" onClick={() => setConfirming(null)}>{t('common.back')}</button>
                </div>
              ) : (
                <IconButton icon="trash" label={t('gallery.delete')} size={15} onClick={() => setConfirming(item.id)} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
