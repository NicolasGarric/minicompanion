import { useEffect, useState } from 'react';
import { k, LANGS, useT } from '../../core/i18n';
import { backendConfigured } from '../../core/auth/supabase';
import { BackendNotice } from '../../core/auth/BackendNotice';
import { requireSignIn, useSession } from '../../core/auth/session';
import { navigate } from '../../core/router';
import { Icon, Modal } from '../../core/ui/ui';
import { playError } from '../lib/games';
import {
  answerInvite, COMPANY_ERRORS, createCompany, joinByLink, linkPreview, myCompanies, myInvites, searchCompanies,
  type CompanyCard, type CompanyInvite, type MyCompany,
} from '../lib/companies';
import { Crest } from '../components/Crest';
import { CompanyForm, emptyCompany } from '../components/CompanyForm';

/** Message key of an error code: Company codes first, then the shared PLAY ones. */
export function companyErrorKey(code: string | null) {
  if (!code) return k('error.generic');
  return k((COMPANY_ERRORS as readonly string[]).includes(code) ? `co.error.${code}` : `games.error.${code}`);
}
export function companyError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? '';
  return COMPANY_ERRORS.find((c) => m.includes(c)) ?? playError(e) ?? 'generic';
}

/** Companies: my Companies and invitations, search, creation. */
export function Companies() {
  const t = useT();
  const me = useSession((s) => s.session?.user.id);
  const [mine, setMine] = useState<MyCompany[]>([]);
  const [invites, setInvites] = useState<CompanyInvite[]>([]);
  const [found, setFound] = useState<CompanyCard[] | null>(null);
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('');
  const [lang, setLang] = useState('');
  const [where, setWhere] = useState<'all' | 'local' | 'online'>('all');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = () =>
    searchCompanies({ query, city, lang, online: where === 'all' ? null : where === 'online' }).then(setFound, (e) => (setError(companyError(e)), setFound([])));
  const loadMine = () => {
    if (!me) return;
    myCompanies().then(setMine, (e) => setError(companyError(e)));
    myInvites().then(setInvites, () => undefined);
  };
  useEffect(() => {
    if (!backendConfigured) return;
    loadMine();
    void search();
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!backendConfigured) return <BackendNotice />;

  const answer = async (inv: CompanyInvite, accept: boolean) => {
    setError(null);
    try {
      await answerInvite(inv.company_id, accept);
      if (accept) navigate(`play/c/${inv.slug}`);
      else loadMine();
    } catch (e) {
      setError(companyError(e));
    }
  };

  return (
    <div className="narrow companies">
      <div className="page-head">
        <div>
          <h1>{t('co.title')}</h1>
          <p className="lead">{t('co.lead')}</p>
        </div>
        <button className="btn primary" onClick={() => (me ? setCreating(true) : requireSignIn())}>
          <Icon name="plus" size={16} /> {t('co.create')}
        </button>
      </div>
      {error && <p className="error">{t(companyErrorKey(error))}</p>}

      {invites.map((inv) => (
        <div key={inv.company_id} className="notice company-invite">
          <Crest crest={inv.crest} size={32} />
          <p><strong>{inv.name}</strong> · {t('co.invitedBy', { name: inv.invited_by ?? '?' })}</p>
          <div className="field-row">
            <button className="btn small primary" onClick={() => answer(inv, true)}>{t('co.accept')}</button>
            <button className="btn small ghost" onClick={() => answer(inv, false)}>{t('co.decline')}</button>
          </div>
        </div>
      ))}

      {mine.length > 0 && (
        <>
          <h2 className="section-title">{t('co.mine')}</h2>
          <div className="company-grid">
            {mine.map((c) => <CompanyTile key={c.id} c={c} badge={c.is_main ? t('co.main') : t(k(`co.role.${c.role}`))} />)}
          </div>
        </>
      )}

      <h2 className="section-title">{t('co.find')}</h2>
      <form className="company-search" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <input className="text-input" value={query} maxLength={60} onChange={(e) => setQuery(e.target.value)} placeholder={t('co.searchPlaceholder')} aria-label={t('co.searchPlaceholder')} />
        <input className="text-input" value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} placeholder={t('co.city')} aria-label={t('co.city')} />
        <select className="text-input" value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t('co.languages')}>
          <option value="">{t('co.anyLanguage')}</option>
          {LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
        <div className="segmented" role="radiogroup">
          {(['all', 'local', 'online'] as const).map((w) => (
            <button type="button" key={w} role="radio" aria-checked={where === w} className={where === w ? 'on' : ''} onClick={() => setWhere(w)}>{t(k(`co.where.${w}`))}</button>
          ))}
        </div>
        <button className="btn">{t('co.search')}</button>
      </form>
      {found === null ? <span className="spinner" /> : found.length === 0 ? <p className="hint">{t('co.none')}</p> : (
        <div className="company-grid">
          {found.map((c) => <CompanyTile key={c.id} c={c} badge={c.join_open ? t('co.openTag') : undefined} />)}
        </div>
      )}

      {creating && (
        <Modal title={t('co.create')} onClose={() => setCreating(false)} wide>
          <CompanyForm initial={emptyCompany()} leader busy={busy} submitLabel={t('co.createSubmit')} onSubmit={async (p) => {
            setBusy(true);
            setError(null);
            try {
              const slug = await createCompany(p);
              navigate(`play/c/${slug}`);
            } catch (e) {
              setError(companyError(e));
              setCreating(false);
            } finally {
              setBusy(false);
            }
          }} />
        </Modal>
      )}
    </div>
  );
}

export function CompanyTile({ c, badge }: { c: CompanyCard; badge?: string }) {
  const t = useT();
  return (
    <a className="card company-tile" href={`/play/c/${c.slug}`}>
      <Crest crest={c.crest} size={44} />
      <div>
        <strong>{c.name}</strong>
        {c.motto && <small className="muted">« {c.motto} »</small>}
        <small className="muted">
          {[c.is_online ? t('co.onlineTag') : null, c.city, t('co.membersN', { n: c.members })].filter(Boolean).join(' · ')}
        </small>
      </div>
      {badge && <span className="tag">{badge}</span>}
    </a>
  );
}

/** Invitation link / QR code: shows the Company, joins on a tap (sign-in first). */
export function CompanyJoin({ token }: { token: string }) {
  const t = useT();
  const { ready, session } = useSession();
  const [c, setC] = useState<(CompanyCard & { members: number }) | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (backendConfigured) linkPreview(token).then(setC, (e) => (setError(companyError(e)), setC(null)));
  }, [token]);
  if (!backendConfigured) return <BackendNotice />;
  if (c === undefined || !ready) return <div className="narrow"><span className="spinner" /></div>;
  if (!c) return <div className="narrow"><h1>{t('co.title')}</h1><p className="error">{t(companyErrorKey(error ?? 'bad_link'))}</p></div>;
  const join = async () => {
    if (!session) return requireSignIn();
    try {
      navigate(`play/c/${await joinByLink(token)}`, { replace: true });
    } catch (e) {
      setError(companyError(e));
    }
  };
  return (
    <div className="narrow">
      <section className="card company-join">
        <Crest crest={c.crest} size={96} title={c.name} />
        <h1>{c.name}</h1>
        {c.motto && <p className="lead">« {c.motto} »</p>}
        <p className="muted">{[c.is_online ? t('co.onlineTag') : null, c.city, t('co.membersN', { n: c.members })].filter(Boolean).join(' · ')}</p>
        <button className="btn primary" onClick={join}>{t(session ? 'co.joinThis' : 'co.signInToJoin')}</button>
        {error && <p className="error">{t(companyErrorKey(error))}</p>}
      </section>
    </div>
  );
}
