import { useEffect, useState } from 'react';
import { k, localeOf, useLang, useT } from '../../core/i18n';
import { backendConfigured } from '../../core/auth/supabase';
import { BackendNotice } from '../../core/auth/BackendNotice';
import { requireSignIn, useSession } from '../../core/auth/session';
import { shrinkPhoto } from '../../core/lib/image';
import { Icon, Modal } from '../../core/ui/ui';
import { playError } from '../lib/games';
import { adminHideSwap, closeSwap, createSwap, deleteSwap, listSwaps, reportSwap, swapPhotoUrl, type NewSwap, type SwapKind, type SwapPost } from '../lib/swap';

/**
 * Swap board: "I offer" / "I look for" posts for spare parts and miniatures, by city. Contact by
 * message and meet in a store; nothing is paid in the app. Three reports hide a post.
 */
export function Swap() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { session, profile } = useSession();
  const me = session?.user.id;
  const [kind, setKind] = useState<SwapKind | 'mine'>('offer');
  const [city, setCity] = useState(profile?.home_city ?? '');
  const [posts, setPosts] = useState<SwapPost[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState<Set<string>>(new Set());

  const load = async () => {
    try {
      setPosts(await listSwaps(kind === 'mine' ? { kind: 'offer', mine: me } : { kind, city }));
    } catch (e) {
      setError(playError(e) ?? 'generic');
      setPosts([]);
    }
  };
  useEffect(() => {
    if (!backendConfigured) return;
    const id = setTimeout(() => void load(), 250);
    return () => clearTimeout(id);
  }, [kind, city, me]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!backendConfigured) return <BackendNotice />;

  const act = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(playError(e) ?? 'generic');
    }
  };

  return (
    <div className="narrow swap">
      <div className="page-head">
        <div>
          <h1>{t('swap.title')}</h1>
          <p className="lead">{t('swap.lead')}</p>
        </div>
        <button className="btn primary" onClick={() => (me ? setCreating(true) : requireSignIn())}><Icon name="plus" size={16} /> {t('swap.new')}</button>
      </div>
      <div className="segmented view-switch" role="tablist">
        {(['offer', 'want', 'mine'] as const).map((x) => (
          <button key={x} role="tab" aria-selected={kind === x} className={kind === x ? 'on' : ''} onClick={() => (x === 'mine' && !me ? requireSignIn() : setKind(x))}>
            {t(k(`swap.tab.${x}`))}
          </button>
        ))}
      </div>
      {kind !== 'mine' && (
        <input className="text-input" value={city} onChange={(e) => setCity(e.target.value)} placeholder={t('swap.cityFilter')} aria-label={t('swap.cityFilter')} />
      )}
      <p className="hint">{t('swap.safety')}</p>
      {error && <p className="error">{t(k(`games.error.${error}`))}</p>}

      {posts === null ? <span className="spinner" /> : posts.length === 0 ? <p className="hint">{t('swap.none')}</p> : (
        <ul className="swap-list">
          {posts.map((p) => (
            <li key={p.id} className={`swap-item ${p.is_hidden ? 'hidden' : ''} ${p.status === 'closed' ? 'closed' : ''}`}>
              {p.photo_path ? <img src={swapPhotoUrl(p.photo_path)} alt="" loading="lazy" /> : <span className="swap-ph" aria-hidden><Icon name="image" size={22} /></span>}
              <div className="swap-body">
                <div className="swap-title">
                  <span className={`tag ${p.kind === 'want' ? 'pk' : ''}`}>{t(k(`swap.kind.${p.kind}`))}</span>
                  <strong>{p.title}</strong>
                </div>
                {p.details && <p className="small">{p.details}</p>}
                <p className="hint">
                  {[p.condition, p.city, p.meet_place && t('swap.meetAt', { place: p.meet_place })].filter(Boolean).join(' · ')}
                  {' · '}{new Date(p.created_at).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short' })}
                  {p.author && <> · <a href={`/u/${p.author.handle}`}>@{p.author.handle}</a></>}
                </p>
                {p.is_hidden && <p className="error small">{t('swap.hidden')}</p>}
                <div className="field-row wrap">
                  {p.user_id === me ? (
                    <>
                      {p.status === 'open' && <button className="btn small" onClick={() => act(() => closeSwap(p.id))}>{t('swap.close')}</button>}
                      <button className="btn small danger-ghost" onClick={() => act(() => deleteSwap(p.id))}>{t('common.delete')}</button>
                    </>
                  ) : (
                    <>
                      <a className="btn small primary" href={me ? `/messages/${p.user_id}` : '/signin'}><Icon name="chat" size={14} /> {t('swap.contact')}</a>
                      {me && (reported.has(p.id) ? <span className="hint">{t('swap.reported')}</span> : (
                        <button className="btn small ghost" onClick={() => act(async () => { await reportSwap(p.id, 'swap post'); setReported(new Set([...reported, p.id])); })}>{t('swap.report')}</button>
                      ))}
                    </>
                  )}
                  {profile?.is_admin && (
                    <button className="btn small ghost" onClick={() => act(() => adminHideSwap(p.id, !p.is_hidden))}>{t(p.is_hidden ? 'swap.restore' : 'swap.hide')}</button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {creating && me && <NewSwapDialog defaultCity={profile?.home_city ?? ''} onClose={() => setCreating(false)} onSave={(p, photo) => act(async () => { await createSwap(me, p, photo); setCreating(false); })} />}
    </div>
  );
}

function NewSwapDialog({ defaultCity, onClose, onSave }: { defaultCity: string; onClose: () => void; onSave: (p: NewSwap, photo: Blob | null) => void }) {
  const t = useT();
  const [p, setP] = useState<NewSwap>({ kind: 'offer', title: '', details: '', condition: '', city: defaultCity, meet_place: '' });
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const ok = p.title.trim().length >= 3 && p.city.trim().length >= 2;
  return (
    <Modal title={t('swap.new')} onClose={onClose}>
      <form className="field-col" onSubmit={async (e) => { e.preventDefault(); if (!ok) return; setBusy(true); onSave({ ...p, details: p.details?.trim() || null, condition: p.condition?.trim() || null, meet_place: p.meet_place?.trim() || null }, photo); }}>
        <div className="segmented" role="radiogroup">
          {(['offer', 'want'] as const).map((x) => (
            <button key={x} type="button" role="radio" aria-checked={p.kind === x} className={p.kind === x ? 'on' : ''} onClick={() => setP({ ...p, kind: x })}>{t(k(`swap.kind.${x}`))}</button>
          ))}
        </div>
        <label className="field"><span>{t('swap.what')}</span><input className="text-input" value={p.title} maxLength={80} onChange={(e) => setP({ ...p, title: e.target.value })} placeholder={t('swap.whatPlaceholder')} /></label>
        <label className="field"><span>{t('swap.details')}</span><textarea className="text-input" rows={3} maxLength={600} value={p.details ?? ''} onChange={(e) => setP({ ...p, details: e.target.value })} /></label>
        <div className="field-grid">
          <label className="field"><span>{t('swap.condition')}</span><input className="text-input" value={p.condition ?? ''} maxLength={40} onChange={(e) => setP({ ...p, condition: e.target.value })} placeholder={t('swap.conditionPlaceholder')} /></label>
          <label className="field"><span>{t('swap.city')}</span><input className="text-input" value={p.city} maxLength={80} onChange={(e) => setP({ ...p, city: e.target.value })} /></label>
        </div>
        <label className="field"><span>{t('swap.meet')}</span><input className="text-input" value={p.meet_place ?? ''} maxLength={80} onChange={(e) => setP({ ...p, meet_place: e.target.value })} placeholder={t('swap.meetPlaceholder')} /></label>
        <label className="field"><span>{t('swap.photo')}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={async (e) => { const f = e.target.files?.[0]; setPhoto(f ? await shrinkPhoto(f, 1200) : null); }} /></label>
        <p className="hint">{t('swap.rules')}</p>
        <button className="btn primary" disabled={!ok || busy}>{t('swap.publish')}</button>
      </form>
    </Modal>
  );
}
