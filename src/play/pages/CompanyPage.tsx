import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { k, langName, localeOf, useLang, useT } from '../../core/i18n';
import { backendConfigured } from '../../core/auth/supabase';
import { BackendNotice } from '../../core/auth/BackendNotice';
import { requireSignIn, useSession } from '../../core/auth/session';
import { navigate } from '../../core/router';
import { Icon, Modal } from '../../core/ui/ui';
import { NotFound } from '../../core/pages/NotFound';
import { downloadIcs } from '../lib/ics';
import { formatWhen } from '../components/GameCard';
import {
  answerEvent, announcements, calendar, cancelInvite, companyChat, companyLink, companyPage, deleteEvent, deleteMessage, dissolveCompany,
  invite, isOfficer, joinCompany, myCompanies, answerInvite, leaveCompany, linkUrl, onCompanyMessage, pinMessage, postMessage, removeMember,
  reportCompanyContent, resetLink, saveEvent, setMainCompany, setRole, updateCompany, cleanCrest, SETTINGS_KEYS,
  type Company, type CompanyEvent, type CompanyInput, type CompanyMember, type CompanyMessage, type CompanyRole, type EventAnswer, type EventInput,
} from '../lib/companies';
import { Crest } from '../components/Crest';
import { CompanyForm } from '../components/CompanyForm';
import { companyError, companyErrorKey } from './Companies';

type Tab = 'home' | 'chat' | 'calendar' | 'members' | 'settings';

/** One Company: card, then tabs for members (chat, calendar) and officers (settings). */
export function CompanyPage({ slug }: { slug: string }) {
  const t = useT();
  const me = useSession((s) => s.session?.user.id);
  const [c, setC] = useState<Company | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('home');
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  const load = () => companyPage(slug).then(setC, (e) => (setError(companyError(e)), setC(null)));
  useEffect(() => {
    if (backendConfigured) void load();
  }, [slug, me]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!backendConfigured) return <BackendNotice />;
  if (c === undefined) return <div className="narrow"><span className="spinner" /></div>;
  if (c === null) return error && error !== 'generic' ? <div className="narrow"><p className="error">{t(companyErrorKey(error))}</p></div> : <NotFound />;

  const member = !!c.my_role;
  const officer = isOfficer(c.my_role);
  const tabs: Tab[] = member ? ['home', 'chat', 'calendar', 'members', ...(officer ? (['settings'] as Tab[]) : [])] : ['home', 'members'];
  const current = tabs.includes(tab) ? tab : 'home';

  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    setError(null);
    try {
      await fn();
      if (after) after();
      else await load();
    } catch (e) {
      setError(companyError(e));
    }
  };
  const join = () => (me ? act(() => (c.invited ? answerInvite(c.id, true) : joinCompany(c.id))) : requireSignIn());

  return (
    <div className="narrow company-page">
      <header className="card company-head">
        <Crest crest={c.crest} size={84} title={c.name} />
        <div>
          <h1>{c.name}</h1>
          {c.motto && <p className="lead">« {c.motto} »</p>}
          <p className="muted">
            {[c.is_online ? t('co.onlineTag') : null, c.city, t('co.membersN', { n: c.members_count }), t(c.is_public ? 'co.public' : 'co.private')].filter(Boolean).join(' · ')}
          </p>
          {c.languages.length > 0 && <p className="chips">{c.languages.map((l) => <span key={l} className="tag">{langName(l)}</span>)}</p>}
          {c.games && <p>{c.games}</p>}
          {c.is_hidden && <p className="notice">{t('co.hiddenNotice')}</p>}
        </div>
        <div className="company-actions">
          {!member && (c.join_open || c.invited) && (
            <button className="btn primary" disabled={c.members_count >= c.member_limit} onClick={join}>{t(c.invited ? 'co.acceptInvite' : 'co.join')}</button>
          )}
          {!member && c.invited && <button className="btn small ghost" onClick={() => act(() => answerInvite(c.id, false))}>{t('co.decline')}</button>}
          {!member && !c.join_open && !c.invited && <small className="hint">{t('co.closedHint')}</small>}
          {me && !member && <button className="link-button small" onClick={() => setReporting(true)}>{t('co.report')}</button>}
        </div>
      </header>
      {error && <p className="error">{t(companyErrorKey(error))}</p>}

      <div className="segmented view-switch" role="tablist">
        {tabs.map((x) => (
          <button key={x} role="tab" aria-selected={current === x} className={current === x ? 'on' : ''} onClick={() => setTab(x)}>{t(k(`co.tab.${x}`))}</button>
        ))}
      </div>

      {current === 'home' && <HomeTab c={c} onTab={setTab} />}
      {current === 'chat' && me && <ChatTab c={c} me={me} />}
      {current === 'calendar' && <CalendarTab c={c} />}
      {current === 'members' && <MembersTab c={c} me={me} act={act} />}
      {current === 'settings' && officer && <SettingsTab c={c} act={act} />}

      {member && (
        <div className="company-foot">
          {c.my_role !== 'leader' || c.members_count > 1
            ? <button className="btn small ghost" onClick={() => confirm(t(c.my_role === 'leader' ? 'co.leaveLeaderConfirm' : 'co.leaveConfirm')) && act(() => leaveCompany(c.id), () => navigate('play/companies'))}>{t('co.leave')}</button>
            : null}
        </div>
      )}

      {reporting && (
        <ReportDialog onClose={() => setReporting(false)} onSend={(reason) => act(async () => { await reportCompanyContent('company', c.id, reason); setReporting(false); }, () => undefined)} />
      )}
    </div>
  );
}

// --- Home: description, announcements, next event -------------------------------------------------
function HomeTab({ c, onTab }: { c: Company; onTab: (t: Tab) => void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [pinned, setPinned] = useState<CompanyMessage[]>([]);
  useEffect(() => {
    if (c.my_role) announcements(c.id).then(setPinned, () => undefined);
  }, [c.id, c.my_role]);
  return (
    <>
      {c.description && <section className="card"><p className="pre-line">{c.description}</p></section>}
      {c.my_role && (
        <section className="card accent">
          <h2>{t('co.announcements')}</h2>
          {pinned.length === 0 ? <p className="hint">{t('co.noAnnouncement')}</p> : (
            <ul className="company-announcements">
              {pinned.map((m) => (
                <li key={m.id}>
                  <p className="pre-line">{m.body}</p>
                  <small className="muted">{m.sender?.display_name} · {formatWhen(m.created_at, lang)}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {c.my_role && (
        <section className="card">
          <h2>{t('co.nextEvent')}</h2>
          {c.next_event
            ? <p><button className="link-button" onClick={() => onTab('calendar')}>{c.next_event.title}</button> · {formatWhen(c.next_event.starts_at, lang)}</p>
            : <p className="hint">{t('co.noEvent')}</p>}
        </section>
      )}
      {!c.can_see && <p className="hint">{t('co.privateHint')}</p>}
    </>
  );
}

// --- Chat ---------------------------------------------------------------------------------------
function ChatTab({ c, me }: { c: Company; me: string }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const officer = isOfficer(c.my_role);
  const [messages, setMessages] = useState<CompanyMessage[]>([]);
  const [text, setText] = useState('');
  const [announce, setAnnounce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState<Set<string>>(new Set());
  const end = useRef<HTMLLIElement>(null);

  const load = () => companyChat(c.id).then(setMessages, (e) => setError(companyError(e)));
  useEffect(() => {
    void load();
    // Realtime push; a slow poll covers a dropped connection.
    const off = onCompanyMessage(c.id, load);
    const id = setInterval(load, 60000);
    return () => {
      off();
      clearInterval(id);
    };
  }, [c.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(companyError(e));
    }
  };
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    void run(async () => {
      await postMessage(c.id, text, announce);
      setText('');
      setAnnounce(false);
    });
  };

  return (
    <section className="card chat">
      <ul className="chat-list tall">
        {messages.length === 0 && <li className="hint">{t('co.chatEmpty')}</li>}
        {messages.map((m) => (
          <li key={m.id} className={`${m.sender_id === me ? 'mine' : ''} ${m.is_announcement ? 'announce' : ''} ${m.is_hidden ? 'hidden-msg' : ''}`}>
            <small className="muted">
              {m.is_announcement && <><Icon name="bell" size={12} /> </>}
              {m.sender?.display_name} · {new Intl.DateTimeFormat(localeOf(lang), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(m.created_at))}
              {m.is_hidden && ` · ${t('co.hiddenMsg')}`}
            </small>
            <span className="pre-line">{m.body}</span>
            <span className="chat-tools">
              {officer && <button className="link-button small" onClick={() => run(() => pinMessage(m.id, !m.is_announcement))}>{t(m.is_announcement ? 'co.unpin' : 'co.pin')}</button>}
              {(m.sender_id === me || officer) && <button className="link-button small" onClick={() => confirm(t('co.deleteMsgConfirm')) && run(() => deleteMessage(m.id))}>{t('common.delete')}</button>}
              {m.sender_id !== me && !reported.has(m.id) && (
                <button className="link-button small" onClick={() => run(async () => { await reportCompanyContent('company_message', m.id, ''); setReported((s) => new Set(s).add(m.id)); })}>{t('co.report')}</button>
              )}
            </span>
          </li>
        ))}
        <li ref={end} aria-hidden />
      </ul>
      <form className="chat-form" onSubmit={send}>
        <input className="text-input" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder={t(announce ? 'co.announcePlaceholder' : 'chat.placeholder')} aria-label={t('chat.placeholder')} />
        <button className="btn primary" disabled={!text.trim()}>{t('chat.send')}</button>
      </form>
      {officer && (
        <label className="check-line"><input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} /> {t('co.asAnnouncement')}</label>
      )}
      {error && <p className="error">{t(error === 'rate_limited' ? 'chat.rateLimited' : companyErrorKey(error))}</p>}
    </section>
  );
}

// --- Calendar -----------------------------------------------------------------------------------
function CalendarTab({ c }: { c: Company }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const officer = isOfficer(c.my_role);
  const [events, setEvents] = useState<CompanyEvent[] | null>(null);
  const [past, setPast] = useState(false);
  const [editing, setEditing] = useState<CompanyEvent | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => calendar(c.id, past).then(setEvents, (e) => (setError(companyError(e)), setEvents([])));
  useEffect(() => {
    void load();
  }, [c.id, past]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(companyError(e));
    }
  };
  const ics = (list: CompanyEvent[]) =>
    downloadIcs(list.map((e) => ({ id: e.id, title: `${e.title} · ${c.name}`, start: e.starts_at, end: e.ends_at, location: e.place || undefined, description: e.details || undefined, url: `${location.origin}/play/c/${c.slug}` })), `${c.slug}.ics`);

  return (
    <section className="company-calendar">
      <div className="field-row wrap">
        <div className="segmented" role="radiogroup">
          {[false, true].map((p) => (
            <button key={String(p)} role="radio" aria-checked={past === p} className={past === p ? 'on' : ''} onClick={() => setPast(p)}>{t(p ? 'co.past' : 'co.upcoming')}</button>
          ))}
        </div>
        {officer && !past && <button className="btn small primary" onClick={() => setEditing('new')}><Icon name="plus" size={14} /> {t('co.newEvent')}</button>}
        {!past && !!events?.length && <button className="btn small" onClick={() => ics(events)}><Icon name="calendar" size={14} /> {t('co.icsAll')}</button>}
      </div>
      {error && <p className="error">{t(companyErrorKey(error))}</p>}
      {events === null ? <span className="spinner" /> : events.length === 0 ? <p className="hint">{t(past ? 'co.noPast' : 'co.noEvent')}</p> : (
        <ul className="company-events">
          {events.map((e) => (
            <li key={e.id} className="card">
              <div className="card-head">
                <div>
                  <strong>{e.title}</strong>
                  <small className="muted">{formatWhen(e.starts_at, lang)}{e.place ? ` · ${e.place}` : ''}</small>
                </div>
                <span className="tag">{t('co.goingN', { n: e.yes })}{e.maybe ? ` · ${t('co.maybeN', { n: e.maybe })}` : ''}</span>
              </div>
              {e.details && <p className="pre-line">{e.details}</p>}
              {e.going.length > 0 && <p className="hint">{e.going.join(', ')}</p>}
              {!past && (
                <div className="field-row wrap">
                  <div className="segmented" role="radiogroup" aria-label={t('co.coming')}>
                    {(['yes', 'maybe', 'no'] as EventAnswer[]).map((a) => (
                      <button key={a} role="radio" aria-checked={e.my_answer === a} className={e.my_answer === a ? 'on' : ''}
                        onClick={() => run(() => answerEvent(e.id, e.my_answer === a ? null : a))}>{t(k(`co.answer.${a}`))}</button>
                    ))}
                  </div>
                  <button className="btn small ghost" onClick={() => ics([e])}><Icon name="calendar" size={14} /> .ics</button>
                  {officer && <button className="btn small ghost" onClick={() => setEditing(e)}>{t('co.edit')}</button>}
                  {officer && <button className="btn small danger-ghost" onClick={() => confirm(t('co.deleteEventConfirm')) && run(() => deleteEvent(e.id))}>{t('common.delete')}</button>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <EventDialog initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
          onSave={(p) => run(async () => { await saveEvent(c.id, editing === 'new' ? null : editing.id, p); setEditing(null); })} />
      )}
    </section>
  );
}

/** Value for <input type="datetime-local"> in the device's time zone. */
const localInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function EventDialog({ initial, onClose, onSave }: { initial: CompanyEvent | null; onClose: () => void; onSave: (p: EventInput) => void }) {
  const t = useT();
  const start0 = initial?.starts_at ?? new Date(Math.ceil(Date.now() / 36e5) * 36e5 + 864e5).toISOString();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [start, setStart] = useState(localInput(start0));
  const [hours, setHours] = useState(initial ? Math.max(1, Math.round((Date.parse(initial.ends_at) - Date.parse(initial.starts_at)) / 36e5)) : 3);
  const [place, setPlace] = useState(initial?.place ?? '');
  const [details, setDetails] = useState(initial?.details ?? '');
  const ok = title.trim().length >= 2 && !!start;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <Modal title={t(initial ? 'co.editEvent' : 'co.newEvent')} onClose={onClose}>
      <form className="field-col" onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        const s = new Date(start);
        onSave({ title: title.trim(), starts_at: s.toISOString(), ends_at: new Date(s.getTime() + hours * 36e5).toISOString(), place: place.trim(), details: details.trim() });
      }}>
        <label className="field"><span>{t('co.eventTitle')}</span>
          <input className="text-input" required minLength={2} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('co.eventTitlePlaceholder')} /></label>
        <label className="field"><span>{t('co.eventStart')}</span>
          <input className="text-input" type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <p className="hint">{t('co.timeZone', { tz })}</p>
        <label className="field"><span>{t('co.eventHours')}</span>
          <input className="text-input" type="number" min={1} max={168} value={hours} onChange={(e) => setHours(Math.min(Math.max(Number(e.target.value) || 1, 1), 168))} /></label>
        <label className="field"><span>{t('co.eventPlace')}</span>
          <input className="text-input" maxLength={200} value={place} onChange={(e) => setPlace(e.target.value)} placeholder={t('co.eventPlacePlaceholder')} /></label>
        <label className="field"><span>{t('co.eventDetails')}</span>
          <textarea className="text-input" rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} /></label>
        <button className="btn primary" disabled={!ok}>{t('common.save')}</button>
      </form>
    </Modal>
  );
}

// --- Members ------------------------------------------------------------------------------------
function MembersTab({ c, me, act }: { c: Company; me: string | undefined; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const t = useT();
  if (!c.members) return <p className="hint">{t('co.privateHint')}</p>;
  const mine = c.my_role;
  // What I may do to this member (same rules as set_company_role / remove_company_member)
  const roleChoices = (m: CompanyMember): CompanyRole[] => {
    if (m.user_id === me) return [];
    if (mine === 'leader') return ['leader', 'officer', 'member', 'recruit'];
    if (mine === 'officer' && (m.role === 'member' || m.role === 'recruit')) return ['member', 'recruit'];
    return [];
  };
  const canRemove = (m: CompanyMember) => m.user_id !== me && (mine === 'leader' || (mine === 'officer' && (m.role === 'member' || m.role === 'recruit')));
  return (
    <section className="card">
      <ul className="company-members">
        {c.members.map((m) => {
          const choices = roleChoices(m);
          return (
            <li key={m.user_id}>
              <a href={`/u/${m.handle}`}>{m.display_name}</a>
              {choices.length ? (
                <select className="text-input small" value={m.role} aria-label={t('co.roleOf', { name: m.display_name })}
                  onChange={(e) => {
                    const r = e.target.value as CompanyRole;
                    if (r === 'leader' && !confirm(t('co.handOverConfirm', { name: m.display_name }))) return;
                    void act(() => setRole(c.id, m.user_id, r));
                  }}>
                  {choices.map((r) => <option key={r} value={r}>{t(k(`co.role.${r}`))}</option>)}
                </select>
              ) : <span className={`tag role-${m.role}`}>{t(k(`co.role.${m.role}`))}</span>}
              {canRemove(m) && <button className="link-button small" onClick={() => confirm(t('co.removeConfirm', { name: m.display_name })) && act(() => removeMember(c.id, m.user_id))}>{t('co.remove')}</button>}
            </li>
          );
        })}
      </ul>
      {mine && <MainToggle c={c} act={act} />}
      {!!c.invites?.length && (
        <>
          <h3 className="section-title">{t('co.pendingInvites')}</h3>
          <ul className="company-members">
            {c.invites.map((i) => (
              <li key={i.user_id}>
                <span>{i.display_name} <small className="muted">@{i.handle}</small></span>
                <button className="link-button small" onClick={() => act(() => cancelInvite(c.id, i.user_id))}>{t('co.cancelInvite')}</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function MainToggle({ c, act }: { c: Company; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const t = useT();
  const me = useSession((s) => s.session?.user.id);
  const [isMain, setIsMain] = useState<boolean | null>(null);
  useEffect(() => {
    myCompanies().then((list) => setIsMain(!!list.find((x) => x.id === c.id)?.is_main), () => undefined);
  }, [c.id, me]);
  if (isMain === null) return null;
  return isMain
    ? <p className="hint"><Icon name="star" size={14} /> {t('co.isMain')}</p>
    : <button className="btn small" onClick={() => act(async () => { await setMainCompany(c.id); setIsMain(true); })}><Icon name="star" size={14} /> {t('co.makeMain')}</button>;
}

// --- Settings (officers; the leader also sees the settings) -----------------------------------------
function SettingsTab({ c, act }: { c: Company; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const t = useT();
  const leader = c.my_role === 'leader';
  const [saved, setSaved] = useState(false);
  const initial: CompanyInput = {
    name: c.name, motto: c.motto, description: c.description, city: c.city ?? '', country: c.country ?? '', is_online: c.is_online,
    languages: c.languages, games: c.games, crest: cleanCrest(c.crest), is_public: c.is_public, join_open: c.join_open,
    join_invite: c.join_invite, join_link: c.join_link, member_limit: c.member_limit, competitive: c.competitive,
  };
  return (
    <>
      {c.join_invite && <InviteCard c={c} act={act} />}
      {c.join_link && <LinkCard c={c} />}
      <section className="card">
        <h2>{t('co.editCard')}</h2>
        <CompanyForm initial={initial} leader={leader} ceiling={c.limit_ceiling} submitLabel={t('common.save')} onSubmit={(p) => {
          const body: Partial<CompanyInput> = { ...p };
          if (!leader) for (const key of SETTINGS_KEYS) delete body[key];
          setSaved(false);
          void act(async () => { await updateCompany(c.id, body); setSaved(true); });
        }} />
        {saved && <p className="hint">{t('co.saved')}</p>}
        {!leader && <p className="hint">{t('co.leaderOnly')}</p>}
        {leader && <p className="hint">{t('co.ceilingHint', { n: c.limit_ceiling })}</p>}
      </section>
      {leader && (
        <section className="card">
          <h2>{t('co.dissolve')}</h2>
          <p className="hint">{t('co.dissolveHint')}</p>
          <button className="btn danger-ghost" onClick={() => confirm(t('co.dissolveConfirm', { name: c.name })) && act(() => dissolveCompany(c.id)).then(() => navigate('play/companies'))}>{t('co.dissolve')}</button>
        </section>
      )}
    </>
  );
}

function InviteCard({ c, act }: { c: Company; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const t = useT();
  const [handle, setHandle] = useState('');
  return (
    <section className="card">
      <h2>{t('co.invite')}</h2>
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); if (handle.trim()) void act(async () => { await invite(c.id, handle); setHandle(''); }); }}>
        <input className="text-input" value={handle} maxLength={30} onChange={(e) => setHandle(e.target.value)} placeholder={t('co.invitePlaceholder')} aria-label={t('co.invitePlaceholder')} />
        <button className="btn primary" disabled={!handle.trim()}>{t('co.sendInvite')}</button>
      </form>
    </section>
  );
}

function LinkCard({ c }: { c: Company }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [link, setLink] = useState<{ token: string; expires_at: string | null } | null | undefined>(undefined);
  const [qr, setQr] = useState<string | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    companyLink(c.id).then(setLink, () => setLink(null));
  }, [c.id]);
  useEffect(() => {
    if (link) QRCode.toDataURL(linkUrl(link.token), { margin: 1, width: 320 }).then(setQr, () => setQr(null));
    else setQr(null);
  }, [link]);
  const make = async () => {
    setError(null);
    try {
      await resetLink(c.id, days);
      setLink(await companyLink(c.id));
    } catch (e) {
      setError(companyError(e));
    }
  };
  if (link === undefined) return null;
  const expired = !!link?.expires_at && Date.parse(link.expires_at) < Date.now();
  return (
    <section className="card company-link">
      <h2>{t('co.link')}</h2>
      <p className="hint">{t('co.linkHint')}</p>
      {link && !expired && (
        <>
          <div className="field-row wrap">
            <input className="text-input" readOnly value={linkUrl(link.token)} onFocus={(e) => e.target.select()} aria-label={t('co.link')} />
            <button className="btn small" onClick={() => navigator.clipboard?.writeText(linkUrl(link.token)).then(() => setCopied(true))}>
              <Icon name="copy" size={14} /> {t(copied ? 'co.copied' : 'co.copy')}
            </button>
          </div>
          <small className="muted">{link.expires_at ? t('co.linkUntil', { date: formatWhen(link.expires_at, lang) }) : t('co.linkNoEnd')}</small>
          {qr && <img className="company-qr" src={qr} alt={t('co.qrAlt', { name: c.name })} width={160} height={160} />}
          {qr && <a className="btn small" href={qr} download={`${c.slug}-qr.png`}><Icon name="download" size={14} /> {t('co.qrDownload')}</a>}
        </>
      )}
      {expired && <p className="hint">{t('co.linkExpired')}</p>}
      <div className="field-row wrap">
        <select className="text-input small" value={days ?? ''} onChange={(e) => setDays(e.target.value ? Number(e.target.value) : null)} aria-label={t('co.linkDuration')}>
          <option value="">{t('co.linkNoEnd')}</option>
          {[1, 7, 30].map((d) => <option key={d} value={d}>{t('co.linkDays', { n: d })}</option>)}
        </select>
        <button className="btn small" onClick={make}>{t(link ? 'co.linkReset' : 'co.linkMake')}</button>
      </div>
      {link && <p className="hint">{t('co.linkResetHint')}</p>}
      {error && <p className="error">{t(companyErrorKey(error))}</p>}
    </section>
  );
}

function ReportDialog({ onClose, onSend }: { onClose: () => void; onSend: (reason: string) => void }) {
  const t = useT();
  const [reason, setReason] = useState('');
  return (
    <Modal title={t('co.report')} onClose={onClose}>
      <form className="field-col" onSubmit={(e) => { e.preventDefault(); onSend(reason.trim()); }}>
        <label className="field"><span>{t('co.reportReason')}</span>
          <textarea className="text-input" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <button className="btn primary">{t('co.reportSend')}</button>
      </form>
    </Modal>
  );
}
