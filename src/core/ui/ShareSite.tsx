import { useState } from 'react';
import { localizedPath, useLang, useT } from '../i18n';
import { APP_NAME } from '../brand';
import { ShareSheet } from './ShareSheet';
import { Icon } from './ui';

/** Footer "Share the site": link to the home page in the current language, with the usual share sheet and QR code. */
export function ShareSite() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="link-button bug-button" onClick={() => setOpen(true)}>
        <Icon name="share" size={14} /> {t('share.site.button')}
      </button>
      {open && <ShareSheet title={APP_NAME} text={t('share.site.text')} url={`${location.origin}${localizedPath('/', lang)}`} onClose={() => setOpen(false)} />}
    </>
  );
}
