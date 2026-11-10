import { useState } from 'react';
import { useT } from '../i18n';
import { ShareSheet } from './ShareSheet';
import { Icon } from './ui';

/** "Share" button opening the share sheet (phone menu, copy, messaging apps, QR code). */
export function ShareButton({ title, text, url, className = 'btn small' }: { title: string; text: string; url: string; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}><Icon name="share" size={14} /> {t('share.button')}</button>
      {open && <ShareSheet title={title} text={text} url={url} onClose={() => setOpen(false)} />}
    </>
  );
}
