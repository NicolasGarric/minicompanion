import { useConsent } from '../consent';
import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { navigate } from '../router';
import { backendConfigured } from './supabase';
import { useSession } from './session';
import { BackendNotice } from './BackendNotice';
import { DELETED_KEY } from './accountDeletion';

type Mode = 'signin' | 'signup' | 'reset';

/** Google sign-in is switched off for now (owner, 2026-10-28); set to true to show the button again. */
const GOOGLE_SIGN_IN = false;

export function SignInPage() {
  const t = useT();
  const { session, signIn, signUp, signInWithGoogle, requestPasswordReset } = useSession();
  // Read once; kept for this visit of the page (React may mount twice in development).
  const [deleted] = useState(() => sessionStorage.getItem(DELETED_KEY) === '1');
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // Optional, unticked: creating an account never depends on it.
  const [statsOk, setStatsOk] = useState(false);

  useEffect(() => sessionStorage.removeItem(DELETED_KEY), []);
  useEffect(() => {
    if (session) navigate('account', { replace: true });
  }, [session]);

  if (!backendConfigured) return <BackendNotice />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (mode === 'reset') {
      const r = await requestPasswordReset(email.trim());
      if (r.error) setError(t('error.generic'));
      else setSent(true);
    } else if (mode === 'signin') {
      const r = await signIn(email.trim(), password);
      if (r.error) setError(t('auth.error.signin'));
    } else {
      if (statsOk) useConsent.getState().set({ stats: true, external: !!useConsent.getState().choice?.external });
      const r = await signUp(email.trim(), password, displayName.trim());
      if (r.error) setError(r.error);
      else if (r.needsConfirmation) setSent(true);
    }
    setBusy(false);
  };

  if (sent) {
    return (
      <div className="narrow auth-page">
        <h1>{t('auth.checkEmail.title')}</h1>
        <p>{t(mode === 'reset' ? 'auth.reset.sent' : 'auth.checkEmail.text', { email })}</p>
      </div>
    );
  }

  if (mode === 'reset') {
    return (
      <div className="narrow auth-page">
        <h1>{t('auth.reset.title')}</h1>
        <p className="lead">{t('auth.reset.lead')}</p>
        <form className="field-col" onSubmit={submit}>
          <label className="field">
            <span>{t('auth.email')}</span>
            <input className="text-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary" disabled={busy}>{t('auth.reset.cta')}</button>
        </form>
        <p className="hint"><button type="button" className="link" onClick={() => { setMode('signin'); setError(null); }}>{t('auth.reset.back')}</button></p>
      </div>
    );
  }

  return (
    <div className="narrow auth-page">
      {deleted && <p className="success" role="status">{t('account.del.done')}</p>}
      <h1>{t(mode === 'signin' ? 'auth.signin.title' : 'auth.signup.title')}</h1>
      <p className="lead">{t('auth.lead')}</p>

      {GOOGLE_SIGN_IN && (
        <>
          <button type="button" className="btn wide" onClick={() => signInWithGoogle()} disabled={busy}>
            <GoogleMark /> {t('auth.google')}
          </button>
          <p className="divider"><span>{t('auth.or')}</span></p>
        </>
      )}

      <form className="field-col" onSubmit={submit}>
        {mode === 'signup' && (
          <label className="field">
            <span>{t('profile.displayName')}</span>
            <input className="text-input" required maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="nickname" />
          </label>
        )}
        <label className="field">
          <span>{t('auth.email')}</span>
          <input className="text-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="field">
          <span>{t('auth.password')}</span>
          <input
            className="text-input"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </label>
        {mode === 'signup' && !useConsent.getState().choice?.stats && (
          <label className="check-line">
            <input type="checkbox" checked={statsOk} onChange={(e) => setStatsOk(e.target.checked)} />
            <span>{t('cookie.signupStats')} <a href="/cookies" target="_blank" rel="noreferrer">{t('cookie.more')}</a></span>
          </label>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {t(mode === 'signin' ? 'auth.signin.cta' : 'auth.signup.cta')}
        </button>
      </form>

      {mode === 'signin' && (
        <p className="hint"><button type="button" className="link" onClick={() => { setMode('reset'); setError(null); }}>{t('auth.forgot')}</button></p>
      )}
      <p className="hint">
        {t(mode === 'signin' ? 'auth.noAccount' : 'auth.haveAccount')}{' '}
        <button type="button" className="link" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {t(mode === 'signin' ? 'auth.signup.cta' : 'auth.signin.cta')}
        </button>
      </p>
      <p className="hint">{t('auth.paintNoAccount')}</p>
    </div>
  );
}

/** Generic "G" mark drawn in plain shapes (no third-party logo asset). */
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M12 12h8" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  );
}
