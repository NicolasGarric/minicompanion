import { useEffect, useState } from 'react';
import { k, useT } from '../i18n';
import { Icon, Modal } from '../ui/ui';
import { useSession } from '../auth/session';
import { backendConfigured } from '../auth/supabase';
import { checkImageFile } from '../lib/image';
import { bugContext, prepareScreenshot, submitBugReport } from './bugs';

const MAX_SHOTS = 3;

/** Footer button + dialog: describe a bug, add up to 3 screenshots (drop, paste or pick), send. */
export function BugReportButton() {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!backendConfigured) return null;
  return (
    <>
      <button type="button" className="link-button bug-button" onClick={() => setOpen(true)}>
        <Icon name="bug" size={14} /> {t('bug.button')}
      </button>
      {open && <BugReportDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function BugReportDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const signedIn = useSession((s) => !!s.session);
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [withContext, setWithContext] = useState(true);
  const [shots, setShots] = useState<{ blob: Blob; url: string }[]>([]);
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error' | 'rate_limited'>('idle');
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => () => shots.forEach((s) => URL.revokeObjectURL(s.url)), [shots]);

  const add = async (files: File[]) => {
    if (!signedIn) return;
    const images = files.filter((f) => checkImageFile(f) === 'ok');
    const room = MAX_SHOTS - shots.length;
    if (images.length > room) setNote(t('bug.tooMany'));
    const ready = await Promise.all(images.slice(0, Math.max(0, room)).map(prepareScreenshot));
    setShots((s) => [...s, ...ready.map((blob) => ({ blob, url: URL.createObjectURL(blob) }))].slice(0, MAX_SHOTS));
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('busy');
    try {
      await submitBugReport({ message: message.trim(), contact: contact.trim(), shots: shots.map((s) => s.blob), withContext });
      setState('sent');
    } catch (err) {
      setState(String((err as { message?: string })?.message).includes('rate_limited') ? 'rate_limited' : 'error');
    }
  };

  if (state === 'sent')
    return (
      <Modal title={t('bug.title')} onClose={onClose}>
        <p>{t('bug.thanks')}</p>
        <div className="nav-row"><button className="btn primary" onClick={onClose}>{t('common.close')}</button></div>
      </Modal>
    );

  return (
    <Modal title={t('bug.title')} onClose={onClose}>
      <form
        className="bug-form"
        onSubmit={send}
        onPaste={(e) => {
          const files = [...e.clipboardData.files];
          if (files.length) (e.preventDefault(), add(files));
        }}
      >
        <label className="field">
          <span>{t('bug.message')}</span>
          <textarea
            className="text-input"
            rows={5}
            required
            minLength={5}
            maxLength={4000}
            autoFocus
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('bug.messagePlaceholder')}
          />
        </label>

        <div className="field">
          <span>{t('bug.shots')}</span>
          {signedIn ? (
            <div
              className="bug-drop"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                add([...e.dataTransfer.files]);
              }}
            >
              {shots.map((s, i) => (
                <figure key={s.url} className="bug-shot">
                  <img src={s.url} alt="" />
                  <button type="button" className="icon-btn" aria-label={t('bug.removeShot')} onClick={() => setShots((x) => x.filter((_, j) => j !== i))}>
                    <Icon name="x" size={14} />
                  </button>
                </figure>
              ))}
              {shots.length < MAX_SHOTS && (
                <label className="bug-add">
                  <Icon name="image" size={20} />
                  <span>{t('bug.addShot')}</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => (add([...(e.target.files ?? [])]), (e.target.value = ''))} />
                </label>
              )}
              <small className="hint">{note ?? t('bug.shotsHint')}</small>
            </div>
          ) : (
            <p className="hint">
              {t('bug.signinForShots')} <a href="/signin" onClick={onClose}>{t('auth.signin.cta')}</a>
            </p>
          )}
        </div>

        {!signedIn && (
          <label className="field">
            <span>{t('bug.contact')}</span>
            <input className="text-input" type="email" maxLength={200} value={contact} onChange={(e) => setContact(e.target.value)} />
          </label>
        )}

        <label className="check">
          <input type="checkbox" checked={withContext} onChange={(e) => setWithContext(e.target.checked)} />
          <span>{t('bug.context')}</span>
        </label>
        {withContext && (
          <details className="bug-context">
            <summary>{t('bug.contextShow')}</summary>
            <pre>{JSON.stringify(bugContext(), null, 2)}</pre>
          </details>
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
