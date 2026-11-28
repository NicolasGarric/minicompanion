import { useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { useConsent } from '../consent';

/**
 * Content from another service that sets its own cookies (Twitch player): shown when "External content"
 * is accepted, otherwise a placeholder that loads it once on a click, or allows it from now on.
 */
export function ExternalEmbed({ service, link, children }: { service: string; link: string; children: ReactNode }) {
  const t = useT();
  const { choice, set } = useConsent();
  const [once, setOnce] = useState(false);
  if (choice?.external || once) return <>{children}</>;
  return (
    <div className="external-embed">
      <p><strong>{t('cookie.embedTitle', { service })}</strong></p>
      <p className="hint">{t('cookie.embedText', { service })}</p>
      <div className="cookie-actions">
        <button className="btn" onClick={() => setOnce(true)}>{t('cookie.embedOnce')}</button>
        <button className="btn ghost" onClick={() => set({ stats: !!choice?.stats, external: true })}>{t('cookie.embedAlways')}</button>
      </div>
      <a className="small" href={link} target="_blank" rel="noreferrer">{t('cookie.embedOpen', { service })} ↗</a>
    </div>
  );
}
