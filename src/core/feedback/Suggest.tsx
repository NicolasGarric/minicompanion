import { useState } from 'react';
import { k, useT } from '../i18n';
import { Icon, Modal } from '../ui/ui';
import { useSession } from '../auth/session';
import { backendConfigured } from '../auth/supabase';
import { submitSuggestion, TOPICS, type Topic } from './suggestions';

/** Footer button + dialog: what to improve, sent to the admins' inbox as a message. */
export function SuggestButton() {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!backendConfigured) return null;
  return (
    <>
      <button type="button" className="link-button bug-button" onClick={() => setOpen(true)}>
        <Icon name="sparkle" size={14} /> {t('sugg.button')}
      </button>
      {open && <SuggestDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function SuggestDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const signedIn = useSession((s) => !!s.session);
  const [topic, setTopic] = useState<Topic>('feature');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error' | 'rate_limited'>('idle');

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('busy');
    try {
      await submitSuggestion({ topic, message: message.trim(), contact: signedIn ? '' : contact.trim() });
      setState('sent');
    } catch (err) {
      setState(String((err as { message?: string })?.message).includes('rate_limited') ? 'rate_limited' : 'error');
    }
  };

  if (state === 'sent')
    return (
      <Modal title={t('sugg.title')} onClose={onClose}>
        <p>{t(signedIn ? 'sugg.thanks' : 'sugg.thanksVisitor')}</p>
        <div className="nav-row"><button className="btn primary" onClick={onClose}>{t('common.close')}</button></div>
      </Modal>
    );

  return (
    <Modal title={t('sugg.title')} onClose={onClose}>
      <form className="bug-form" onSubmit={send}>
        <p className="hint">{t('sugg.lead')}</p>
        <div className="field">
          <span>{t('sugg.topic')}</span>
          <div className="chips" role="radiogroup" aria-label={t('sugg.topic')}>
            {TOPICS.map((x) => (
              <button key={x} type="button" role="radio" aria-checked={topic === x} className={`chip ${topic === x ? 'on' : ''}`} onClick={() => setTopic(x)}>
                {t(k(`sugg.topic.${x}`))}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>{t('sugg.message')}</span>
          <textarea
            className="text-input"
            rows={5}
            required
            minLength={5}
            maxLength={2000}
            autoFocus
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('sugg.placeholder')}
          />
        </label>
        {!signedIn && (
          <label className="field">
            <span>{t('bug.contact')}</span>
            <input className="text-input" type="email" maxLength={200} value={contact} onChange={(e) => setContact(e.target.value)} />
          </label>
        )}
        {(state === 'error' || state === 'rate_limited') && (
          <p className="error" role="alert">{t(k(state === 'rate_limited' ? 'games.error.rate_limited' : 'bug.error'))}</p>
        )}
        <div className="nav-row">
          <button type="button" className="btn ghost" onClick={onClose}>{t('common.back')}</button>
          <button className="btn primary" disabled={state === 'busy' || message.trim().length < 5}>{t('bug.send')}</button>
        </div>
      </form>
    </Modal>
  );
}
