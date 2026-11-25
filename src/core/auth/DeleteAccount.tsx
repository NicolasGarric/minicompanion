import { useState } from 'react';
import { useT, type MessageKey } from '../i18n';
import { navigate } from '../router';
import { deleteAccount, type DeleteError } from './accountDeletion';
import { useSession } from './session';

const MESSAGE: Record<DeleteError, MessageKey> = {
  wrong: 'auth.pw.wrong',
  admin: 'account.del.admin',
  tournament: 'account.del.tournament',
  files: 'account.del.files',
  unavailable: 'account.del.unavailable',
  failed: 'error.generic',
};

export function DeleteAccount() {
  const t = useT();
  const { session, profile } = useSession();
  const [open, setOpen] = useState(false);
  const [sure, setSure] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DeleteError | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await deleteAccount(session?.user.email ?? '', password, !!profile?.is_admin);
    if (r.error) {
      setError(r.error);
      setBusy(false);
      return;
    }
    navigate('signin', { replace: true });
  };

  return (
    <section className="card field-col danger-zone">
      <h2>{t('account.security')}</h2>
      <div className="hobby-links">
        <a className="btn" href="/password">{t('account.changePw')}</a>
        {!open && <button type="button" className="btn danger-ghost" onClick={() => setOpen(true)}>{t('account.del.title')}</button>}
      </div>
      {open && (
        <form className="field-col" onSubmit={submit}>
          <h3>{t('account.del.title')}</h3>
          <p>{t('account.del.lead')}</p>
          <p>{t('account.del.stays')}</p>
          <p>{t('account.del.device')}</p>
          <label className="field">
            <span>{t('auth.pw.current')}</span>
            <input className="text-input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          <label className="check">
            <input type="checkbox" required checked={sure} onChange={(e) => setSure(e.target.checked)} /> <span>{t('account.del.check')}</span>
          </label>
          {error && <p className="error" role="alert">{t(MESSAGE[error])}</p>}
          <div className="nav-row">
            <button type="button" className="btn ghost" disabled={busy} onClick={() => setOpen(false)}>{t('common.cancel')}</button>
            <button className="btn danger-ghost" disabled={busy || !sure || !password}>{t('account.del.cta')}</button>
          </div>
        </form>
      )}
    </section>
  );
}
