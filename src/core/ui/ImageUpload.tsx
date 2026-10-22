import { useRef, useState } from 'react';
import { useT } from '../i18n';
import { ACCEPTED_TYPES, checkImageFile, DECODE_SIDE, fileToImageData } from '../lib/image';
import { track } from '../analytics';
import { Icon } from './ui';

/**
 * Reference image picker. The rights confirmation must be ticked before a file can be chosen.
 * The image is cropped, resized (max 2048 px) and re-encoded as JPEG on the device; nothing is uploaded.
 */
export function ImageUpload({
  onImage,
  label,
  compact,
}: {
  onImage: (img: ImageData, name: string) => Promise<void> | void;
  label?: string;
  compact?: boolean;
}) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [rights, setRights] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!rights) {
      setError(t('upload.needRights'));
      return;
    }
    const check = checkImageFile(file);
    if (check !== 'ok') {
      setError(t(check === 'type' ? 'upload.badType' : 'upload.tooBig'));
      return;
    }
    setBusy(true);
    try {
      // Full detail: the editor crops around the miniature before fitting the working size.
      const img = await fileToImageData(file, DECODE_SIDE);
      track('image_uploaded');
      await onImage(img, file.name.replace(/\.[^.]+$/, '') || t('upload.defaultName'));
    } catch {
      setError(t('upload.failed'));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div
      className={`upload ${compact ? 'compact' : ''} ${drag ? 'drag' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        handle(e.dataTransfer.files[0]);
      }}
    >
      <label className="rights">
        <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />
        <span>{t('upload.rights')}</span>
      </label>
      <button type="button" className="btn primary" disabled={!rights || busy} onClick={() => input.current?.click()}>
        <Icon name="upload" size={16} /> {busy ? t('upload.processing') : label ?? t('upload.choose')}
      </button>
      {!compact && <p className="hint">{t('upload.hint')}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <input ref={input} type="file" accept={ACCEPTED_TYPES.join(',')} hidden onChange={(e) => handle(e.target.files?.[0])} />
    </div>
  );
}
