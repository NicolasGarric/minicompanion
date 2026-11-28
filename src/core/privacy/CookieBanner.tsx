import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { useConsent, type Consent } from '../consent';
import { Icon, Modal, Toggle } from '../ui/ui';

/**
 * Cookie banner (bottom bar) and the detailed choice panel. Refusing is as easy as accepting: same
 * buttons, same size, on the first screen. Nothing optional runs before a choice.
 */
export function CookieBanner() {
  const t = useT();
  const { choice, panel, set, openPanel } = useConsent();
  return (
    <>
      {!choice && !panel && (
        <section className="cookie-bar" role="region" aria-label={t('cookie.title')}>
          <div className="cookie-bar-inner">
            <div className="cookie-bar-text">
              <h2>{t('cookie.title')}</h2>
              <p>{t('cookie.text')} <a href="/cookies">{t('cookie.more')}</a></p>
            </div>
            <div className="cookie-actions">
              <button className="btn" onClick={() => set({ stats: false, external: false })}>{t('cookie.refuse')}</button>
              <button className="btn ghost" onClick={openPanel}>{t('cookie.customise')}</button>
              <button className="btn" onClick={() => set({ stats: true, external: true })}>{t('cookie.accept')}</button>
            </div>
          </div>
        </section>
      )}
      {panel && <CookiePanel />}
    </>
  );
}

function CookiePanel() {
  const t = useT();
  const { choice, set, closePanel } = useConsent();
  const [c, setC] = useState<Consent>(choice ?? { stats: false, external: false });
  useEffect(() => setC(choice ?? { stats: false, external: false }), [choice]);
  return (
    <Modal title={t('cookie.panelTitle')} onClose={closePanel}>
      <div className="cookie-panel">
        <p className="hint">{t('cookie.panelLead')}</p>
        <section>
          <Toggle checked disabled onChange={() => undefined} label={t('cookie.necessary')} />
          <p className="hint">{t('cookie.necessaryText')}</p>
        </section>
        <section>
          <Toggle checked={c.stats} onChange={(stats) => setC({ ...c, stats })} label={t('cookie.stats')} />
          <p className="hint">{t('cookie.statsText')}</p>
        </section>
        <section>
          <Toggle checked={c.external} onChange={(external) => setC({ ...c, external })} label={t('cookie.external')} />
          <p className="hint">{t('cookie.externalText')}</p>
        </section>
        <p className="hint"><a href="/cookies" onClick={closePanel}>{t('cookie.more')}</a></p>
        <div className="cookie-actions">
          <button className="btn" onClick={() => set({ stats: false, external: false })}>{t('cookie.refuseAll')}</button>
          <button className="btn" onClick={() => set(c)}>{t('cookie.save')}</button>
          <button className="btn" onClick={() => set({ stats: true, external: true })}>{t('cookie.acceptAll')}</button>
        </div>
      </div>
    </Modal>
  );
}

/** Footer link that reopens the choice at any time. */
export function CookieLink() {
  const t = useT();
  const openPanel = useConsent((s) => s.openPanel);
  return (
    <button type="button" className="link-button bug-button" onClick={openPanel}>
      <Icon name="eye" size={14} /> {t('cookie.footer')}
    </button>
  );
}
