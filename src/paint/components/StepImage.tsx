import { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../../core/i18n';
import { ImageUpload } from '../../core/ui/ImageUpload';
import { Icon } from '../../core/ui/ui';

/** Step 1: the reference image (always kept, replaceable) and tips for a good photo. */
export function StepImage() {
  const t = useT();
  const imageUrl = useStore((s) => s.imageUrl);
  const { replaceImage, set } = useStore.getState();
  const [replacing, setReplacing] = useState(false);

  return (
    <div className="step-image">
      {imageUrl && <img className="reference-img" src={imageUrl} alt={t('ref.alt')} />}
      <div className="field-row">
        <button className="btn small" onClick={() => setReplacing(!replacing)}>
          <Icon name="upload" size={14} /> {t('ref.replace')}
        </button>
      </div>
      {replacing && (
        <ImageUpload
          compact
          label={t('ref.replaceChoose')}
          onImage={async (img) => {
            await replaceImage(img);
            setReplacing(false);
          }}
        />
      )}
      <div className="card tips">
        <strong>{t('image.tipsTitle')}</strong>
        <ul>
          <li>{t('image.tip1')}</li>
          <li>{t('image.tip2')}</li>
          <li>{t('image.tip3')}</li>
        </ul>
      </div>
      <button className="btn primary wide" onClick={() => set({ step: 2 })}>
        {t('steps.toColours')} →
      </button>
    </div>
  );
}
