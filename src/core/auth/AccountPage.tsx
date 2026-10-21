import { useEffect, useState } from 'react';
import { k, useT, type Lang } from '../i18n';
import { CITIES, cityById } from '../data/cities';
import { requireSignIn, useSession } from './session';
import { backendConfigured } from './supabase';
import { BackendNotice } from './BackendNotice';
import { Avatar } from '../ui/Avatar';

export function AccountPage() {
  const t = useT();
  const { ready, session, profile, updateProfile, signOut } = useSession();
  const [form, setForm] = useState({ display_name: '', handle: '', home_city: '', preferred_lang: 'en' as Lang, factions: '' });
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | string>('idle');

  useEffect(() => {
    if (ready && !session) requireSignIn();
  }, [ready, session]);

  useEffect(() => {
    if (!profile) return;
    setForm({
      display_name: profile.display_name,
      handle: profile.handle,
      home_city: profile.home_city ?? '',
      preferred_lang: profile.preferred_lang,
      factions: profile.factions.join(', '),
    });
  }, [profile]);

  if (!backendConfigured) return <BackendNotice />;
  if (!profile) return <div className="narrow"><span className="spinner" /></div>;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('saving');
    const city = cityById(form.home_city);
    const r = await updateProfile({
      display_name: form.display_name.trim(),
      handle: form.handle.trim().toLowerCase(),
      home_city: form.home_city || null,
      home_location: city ? { lat: city.lat, lng: city.lng } : null,
      preferred_lang: form.preferred_lang,
      // Factions are free text typed by the player: no official list is shipped with the app.
      factions: form.factions.split(',').map((f) => f.trim()).filter(Boolean).slice(0, 10),
    });
    setStatus(r.error ? r.error : 'saved');
  };

  return (
    <div className="narrow account">
      <div className="account-head">
        <Avatar name={profile.display_name} size={64} />
        <div>
          <h1>{profile.display_name}</h1>
          <p className="muted">@{profile.handle} · {session?.user.email}</p>
        </div>
      </div>

      <form className="card field-col" onSubmit={save}>
        <h2>{t('profile.title')}</h2>
        <label className="field">
          <span>{t('profile.displayName')}</span>
          <input className="text-input" required maxLength={40} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
        </label>
        <label className="field">
          <span>{t('profile.handle')}</span>
          <input className="text-input" required pattern="[a-z0-9_]{3,24}" value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} />
          <small className="hint">{t('profile.handleHint')}</small>
        </label>
        <label className="field">
          <span>{t('profile.city')}</span>
          <select className="select" value={form.home_city} onChange={(e) => setForm({ ...form, home_city: e.target.value })}>
            <option value="">{t('profile.cityNone')}</option>
            {CITIES.map((c) => <option key={c.id} value={c.id}>{t(k(`city.${c.id}`))}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t('profile.lang')}</span>
          <select className="select" value={form.preferred_lang} onChange={(e) => setForm({ ...form, preferred_lang: e.target.value as Lang })}>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </label>
        <label className="field">
          <span>{t('profile.factions')}</span>
          <input className="text-input" value={form.factions} onChange={(e) => setForm({ ...form, factions: e.target.value })} placeholder={t('profile.factionsPlaceholder')} />
          <small className="hint">{t('profile.factionsHint')}</small>
        </label>
        {status !== 'idle' && status !== 'saving' && (
          <p className={status === 'saved' ? 'success' : 'error'} role="status">
            {status === 'saved' ? t('profile.saved') : status === 'handleTaken' ? t('profile.handleTaken') : t('error.generic')}
          </p>
        )}
        <div className="nav-row">
          <button type="button" className="btn ghost" onClick={() => signOut()}>{t('auth.signout')}</button>
          <button className="btn primary" disabled={status === 'saving'}>{t('common.save')}</button>
        </div>
      </form>
    </div>
  );
}
