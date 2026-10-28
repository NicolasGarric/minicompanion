import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useT } from '../i18n';
import { Icon, Modal } from './ui';

/**
 * Share a link the simple way: the phone's own share menu, copy, the usual messaging apps (plain
 * web links, no SDK, nothing loaded from them) and a QR code to show across the table.
 */
export function ShareSheet({ title, text, url, onClose }: { title: string; text: string; url: string; onClose: () => void }) {
  const t = useT();
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState<'link' | 'message' | null>(null);
  const message = `${text}\n${url}`;

  useEffect(() => {
    void QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#1d2a5b', light: '#fffaf0' } }).then(setQr, () => setQr(''));
  }, [url]);

  const copy = async (what: 'link' | 'message') => {
    try {
      await navigator.clipboard.writeText(what === 'link' ? url : message);
      setCopied(what);
    } catch {
      setCopied(null);
    }
  };
  const native = async () => {
    try {
      await navigator.share({ title, text, url });
    } catch {
      /* closed */
    }
  };
  const e = encodeURIComponent;
  const apps = [
    { name: 'LINE', href: `https://social-plugins.line.me/lineit/share?url=${e(url)}&text=${e(text)}` },
    { name: 'WhatsApp', href: `https://wa.me/?text=${e(message)}` },
    { name: 'X', href: `https://x.com/intent/post?text=${e(text)}&url=${e(url)}` },
    { name: t('share.sheet.email'), href: `mailto:?subject=${e(title)}&body=${e(message)}` },
  ];

  return (
    <Modal title={title} onClose={onClose}>
      <div className="share-sheet">
        <p className="share-text">{text}</p>
        <div className="field-row wrap">
          {typeof navigator.share === 'function' && (
            <button className="btn primary" onClick={native}><Icon name="share" size={15} /> {t('share.sheet.native')}</button>
          )}
          <button className="btn" onClick={() => copy('link')}><Icon name="link" size={15} /> {t('share.sheet.copyLink')}</button>
          <button className="btn" onClick={() => copy('message')}><Icon name="copy" size={15} /> {t('share.sheet.copyMessage')}</button>
        </div>
        {copied && <p className="hint" role="status">{t(copied === 'link' ? 'share.sheet.linkCopied' : 'share.sheet.messageCopied')}</p>}
        <div className="share-apps">
          {apps.map((a) => (
            <a key={a.name} className="btn small" href={a.href} target="_blank" rel="noopener noreferrer">{a.name} ↗</a>
          ))}
        </div>
        <input className="text-input" readOnly value={url} onFocus={(ev) => ev.currentTarget.select()} aria-label={t('share.sheet.copyLink')} />
        {qr && (
          <figure className="share-qr">
            <img src={qr} alt={t('share.sheet.qrAlt')} />
            <figcaption className="hint">{t('share.sheet.qrHint')}</figcaption>
          </figure>
        )}
      </div>
    </Modal>
  );
}
