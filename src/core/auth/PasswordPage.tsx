import { useState } from 'react';
import { useT } from '../i18n';
import { BackendNotice } from './BackendNotice';
import { backendConfigured } from './supabase';
import { useSession } from './session';

/** New password: after a reset link (no current password asked) or from the account page. */
export function PasswordPage() {
  const t = useT();
  const { ready, session, recovering, changePassword } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'mismatch' | 'wrong' | 'failed'>('idle');

  if (!backendConfigured) return <BackendNotice />;
  if (!ready) return <div className="narrow"><span className="spinner" /></div>;
  if (!session) {
    return (
      <div className="narrow auth-page">
        <h1>{t('auth.pw.title')}</h1>
        <p>{t('auth.pw.expired')}</p>
        <p><a className="btn primary" href="/signin">{t('auth.reset.back')}</a></p>
      </div>
    );
  }
  if (status === 'done') {
    return (
      <div className="narrow auth-page">
        <h1>{t('auth.pw.title')}</h1>
        <p className="success" role="status">{t('auth.pw.done')}</p>
        <p><a className="btn" href="/account">{t('nav.account')}</a></p>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== repeat) return setStatus('mismatch');
    setStatus('busy');
    const r = await changePassword(current, next);
    setStatus(r.error ?? 'done');
  };
  const password = (label: string, value: string, set: (v: string) => void, autoComplete: string) => (
    <label className="field">
      <span>{label}</span>
      <input className="text-input" type="password" required minLength={autoComplete === 'new-password' ? 8 : 1} value={value} onChange={(e) => set(e.target.value)} autoComplete={autoComplete} />
    </label>
  );

  return (
    <div className="narrow auth-page">
      <h1>{t('auth.pw.title')}</h1>
      <form className="field-col" onSubmit={submit}>
        {!recovering && password(t('auth.pw.current'), current, setCurrent, 'current-password')}
        {password(t('auth.pw.new'), next, setNext, 'new-password')}
        {password(t('auth.pw.repeat'), repeat, setRepeat, 'new-password')}
        {(status === 'mismatch' || status === 'wrong' || status === 'failed') && (
          <p className="error" role="alert">{t(status === 'mismatch' ? 'auth.pw.mismatch' : status === 'wrong' ? 'auth.pw.wrong' : 'error.generic')}</p>
        )}
        <button className="btn primary" disabled={status === 'busy'}>{t('auth.pw.save')}</button>
      </form>
    </div>
  );
}
