import { useState } from 'react';
import { k, useT } from '../i18n';
import { Icon, Modal } from '../ui/ui';
import { useSession } from '../auth/session';
import { backendConfigured } from '../auth/supabase';
import { submitSuggestion } from './suggestions';
import { RIGHTS_WHO as WHO, rightsMessage, type RightsWho as Who } from './rightsMessage';

/**
 * Rights request (notice and takedown, owner decision 2026-11-28): no public e-mail address, the
 * request goes to the suggestions inbox of /admin (see rightsMessage.ts). Open to visitors without
 * an account; they leave an e-mail so the team can answer.
 */
export function RightsRequestButton() {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!backendConfigured) return null;
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <Icon name="bell" size={16} /> {t('rights.button')}
      </button>
      {open && <RightsDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function RightsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const signedIn = useSession((s) => !!s.session);
  const [who, setWho] = useState<Who>('holder');
  const [where, setWhere] = useState('');
  const [details, setDetails] = useState('');
  const [contact, setContact] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error' | 'rate_limited'>('idle');
  const ready = where.trim().length >= 3 && details.trim().length >= 5 && (signedIn || contact.includes('@'));

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('busy');
    try {
      await submitSuggestion({ topic: 'other', message: rightsMessage(who, where, details), contact: signedIn ? '' : contact.trim() });
      setState('sent');
    } catch (err) {
      setState(String((err as { message?: string })?.message).includes('rate_limited') ? 'rate_limited' : 'error');
    }
  };

  if (state === 'sent')
    return (
      <Modal title={t('rights.title')} onClose={onClose}>
        <p>{t('rights.thanks')}</p>
        <div className="nav-row"><button className="btn primary" onClick={onClose}>{t('common.close')}</button></div>
      </Modal>
    );

  return (
    <Modal title={t('rights.title')} onClose={onClose}>
      <form className="bug-form" onSubmit={send}>
        <p className="hint">{t('terms.contactHint')}</p>
        <div className="field">
          <span>{t('rights.who')}</span>
          <div className="chips" role="radiogroup" aria-label={t('rights.who')}>
            {WHO.map((x) => (
              <button key={x} type="button" role="radio" aria-checked={who === x} className={`chip ${who === x ? 'on' : ''}`} onClick={() => setWho(x)}>
                {t(k(`rights.who.${x}`))}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>{t('rights.where')}</span>
          <input className="text-input" required maxLength={300} value={where} onChange={(e) => setWhere(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>{t('rights.details')}</span>
          <textarea className="text-input" rows={5} required minLength={5} maxLength={1500} value={details} onChange={(e) => setDetails(e.target.value)} />
        </label>
        {!signedIn && (
          <label className="field">
            <span>{t('rights.contact')}</span>
            <input className="text-input" type="email" required maxLength={200} value={contact} onChange={(e) => setContact(e.target.value)} />
          </label>
        )}
        {(state === 'error' || state === 'rate_limited') && (
          <p className="error" role="alert">{t(k(state === 'rate_limited' ? 'games.error.rate_limited' : 'bug.error'))}</p>
        )}
        <div className="nav-row">
          <button type="button" className="btn ghost" onClick={onClose}>{t('common.back')}</button>
          <button className="btn primary" disabled={state === 'busy' || !ready}>{t('bug.send')}</button>
        </div>
      </form>
    </Modal>
  );
}
