import { useState } from 'react';
import { useStore } from '../store';
import { paintsUsed } from '../lib/recipe';
import { renderOffscreen } from '../lib/render';
import { engine } from '../engine/engine';
import { fitImageData, imageDataToBlob } from '../../core/lib/image';
import { addToGallery } from '../../core/gallery/gallery';
import { requireSignIn, useSession } from '../../core/auth/session';
import { backendConfigured } from '../../core/auth/supabase';
import { useT } from '../../core/i18n';
import { Icon } from '../../core/ui/ui';

/** Longest side of a gallery image: sharp on screen, light on storage. */
const GALLERY_SIDE = 1600;

/** Step 3: saves the current render to the player's gallery (profile). */
export function SaveToGallery() {
  const t = useT();
  const session = useSession((s) => s.session);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  if (!backendConfigured) return null;

  const save = async () => {
    if (!session) return requireSignIn();
    const s = useStore.getState();
    setState('saving');
    try {
      const image = fitImageData(renderOffscreen(s.zones, s.primer), GALLERY_SIDE);
      // The model alone keeps its transparency (PNG); a full photo is lighter as JPEG.
      const blob = await imageDataToBlob(image, engine.cutout ? 'image/png' : 'image/jpeg');
      const paints = paintsUsed(s.zones, s.library, s.primer).map((p) => ({ name: p.name, brand: p.brand, hex: p.hex }));
      await addToGallery(blob, s.projectName, paints);
      setState('saved');
      s.toast(t('gallery.saved'), 'success');
    } catch (e) {
      setState('idle');
      const message = (e as { message?: string }).message ?? '';
      s.toast(t(message.includes('gallery_full') ? 'gallery.full' : 'gallery.error'), 'error');
    }
  };

  return (
    <div className="save-gallery">
      <button className="btn wide" onClick={save} disabled={state === 'saving'}>
        {state === 'saving' ? <span className="spinner small" /> : <Icon name="upload" size={16} />}{' '}
        {t(session ? 'gallery.save' : 'gallery.saveSignin')}
      </button>
      {state === 'saved' && (
        <a className="small" href="/account">
          {t('gallery.open')} →
        </a>
      )}
    </div>
  );
}
