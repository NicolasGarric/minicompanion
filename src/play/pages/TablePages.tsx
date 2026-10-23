import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { k, useLang, useT } from '../../core/i18n';
import { backendConfigured } from '../../core/auth/supabase';
import { BackendNotice } from '../../core/auth/BackendNotice';
import { requireSignIn, useSession } from '../../core/auth/session';
import { Icon } from '../../core/ui/ui';
import { playError } from '../lib/games';
import { confirmMatch, getTournament, reportMatch, roundSchedule, tableMatch, tableTokens, type MatchResult, type RoundSlot, type TableMatch, type Tournament } from '../lib/tournaments';
import { RoundWhere } from '../components/RoundSchedule';

const tableUrl = (token: string) => `${location.origin}/play/table/${token}`;

/** Organiser: one QR code per table, to print and put on the tables. */
export function TableQrSheet({ slug }: { slug: string }) {
  const t = useT();
  const [tour, setTour] = useState<Tournament | null>(null);
  const [codes, setCodes] = useState<{ number: number; url: string; img: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!backendConfigured) return;
    (async () => {
      try {
        const tr = await getTournament(slug);
        setTour(tr);
        if (!tr) return;
        const rows = await tableTokens(tr.id);
        setCodes(
          await Promise.all(
            rows.map(async (r) => ({ number: r.number, url: tableUrl(r.qr_token), img: await QRCode.toDataURL(tableUrl(r.qr_token), { margin: 1, width: 360 }) })),
          ),
        );
      } catch (e) {
        setError(playError(e) ?? 'generic');
      }
    })();
  }, [slug]);

  if (!backendConfigured) return <BackendNotice />;
  return (
    <div className="narrow qr-sheet">
      <div className="page-head no-print">
        <div>
          <a className="small" href={`/play/t/${slug}`}>← {tour?.name ?? ''}</a>
          <h1>{t('tour.qrCodes')}</h1>
          <p className="lead">{t('tour.qrLead')}</p>
        </div>
        <button className="btn primary" onClick={() => window.print()}><Icon name="download" size={16} /> {t('tour.print')}</button>
      </div>
      {error && <p className="error">{t(k(`games.error.${error}`))}</p>}
      {codes?.length === 0 && <p className="hint">{t('tour.noTables')}</p>}
      {codes && (
        <ul className="qr-grid">
          {codes.map((c) => (
            <li key={c.number}>
              <strong>{tour?.name}</strong>
              <span className="qr-table">{t('tour.tableN', { n: c.number })}</span>
              <img src={c.img} alt={t('tour.tableN', { n: c.number })} />
              <small>{t('tour.qrScan')}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Page opened by scanning a table: the match played there, report and confirm the score. */
export function TablePage({ token }: { token: string }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const session = useSession((s) => s.session);
  const me = session?.user.id ?? null;
  const [m, setM] = useState<TableMatch | null | undefined>(undefined);
  // Multi-week events: date and venue of the round being played here.
  const [where, setWhere] = useState<{ tour: Tournament; slots: RoundSlot[] } | null>(null);
  const [f, setF] = useState({ ap: 0, as: 0, bp: 0, bs: 0 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    tableMatch(token).then((r) => {
      setM(r);
      if (r) setF({ ap: r.a_primary ?? 0, as: r.a_secondary ?? 0, bp: r.b_primary ?? 0, bs: r.b_secondary ?? 0 });
    }, (e) => {
      setError(playError(e) ?? 'generic');
      setM(null);
    });
  useEffect(() => {
    if (backendConfigured) load();
  }, [token]);
  const slug = m?.tournament_slug;
  useEffect(() => {
    if (!slug) return;
    getTournament(slug)
      .then(async (tour) => (tour ? setWhere({ tour, slots: await roundSchedule(tour.id) }) : undefined))
      .catch(() => undefined);
  }, [slug]);

  if (!backendConfigured) return <BackendNotice />;
  if (m === undefined) return <div className="narrow"><span className="spinner" /></div>;
  if (!m) return <div className="narrow"><p className="hint">{t('tour.tableUnknown')}</p></div>;

  const inMatch = !!me && (me === m.player_a || me === m.player_b);
  const result = (a: number, b: number): MatchResult => (a > b ? 'a_win' : a < b ? 'b_win' : 'draw');
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(playError(e) ?? 'generic');
    }
    await load();
    setBusy(false);
  };

  return (
    <div className="narrow table-page">
      <a className="small" href={`/play/t/${m.tournament_slug}`}>← {m.tournament_name}</a>
      <h1>{t('tour.tableN', { n: m.table_number })}</h1>
      {!m.match_id ? (
        <p className="hint">{t('tour.tableIdle')}</p>
      ) : (
        <section className="card">
          <p className="muted">{t('tour.roundN', { n: m.round_number ?? '?' })} · {t(k(`tour.match.${m.status}`))}</p>
          {where && where.slots.find((s) => s.number === m.round_number) && (
            <RoundWhere slot={where.slots.find((s) => s.number === m.round_number)!} tour={where.tour} lang={lang} />
          )}
          <div className="table-versus">
            <strong>{m.player_a_name}</strong>
            <span>vs</span>
            <strong>{m.player_b_name}</strong>
          </div>
          {!session ? (
            <button className="btn primary" onClick={() => requireSignIn()}>{t('tour.signinToReport')}</button>
          ) : !inMatch ? (
            <p className="hint">{t('tour.notYourTable')}</p>
          ) : m.status === 'reported' && m.reported_by !== me ? (
            <>
              <p>{t('tour.confirmScore', { a: (m.a_primary ?? 0) + (m.a_secondary ?? 0), b: (m.b_primary ?? 0) + (m.b_secondary ?? 0) })}</p>
              <div className="field-row wrap">
                <button className="btn primary" disabled={busy} onClick={() => run(() => confirmMatch(m.match_id!, true))}>{t('report.confirm')}</button>
                <button className="btn danger-ghost" disabled={busy} onClick={() => run(() => confirmMatch(m.match_id!, false))}>{t('report.dispute')}</button>
              </div>
            </>
          ) : m.status === 'confirmed' || m.status === 'resolved' ? (
            <p className="success">{t('tour.scoreDone')}</p>
          ) : (
            <form
              className="score-form"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => reportMatch(m.match_id!, { ...f, result: result(f.ap + f.as, f.bp + f.bs) }));
              }}
            >
              {(['a', 'b'] as const).map((side) => (
                <fieldset key={side}>
                  <legend>{side === 'a' ? m.player_a_name : m.player_b_name}</legend>
                  <label className="field">
                    <span>{t('tour.primary')}</span>
                    <input className="text-input num" type="number" inputMode="numeric" min={0} max={999} value={side === 'a' ? f.ap : f.bp} onChange={(e) => setF({ ...f, [side === 'a' ? 'ap' : 'bp']: Number(e.target.value) })} />
                  </label>
                  <label className="field">
                    <span>{t('tour.secondary')}</span>
                    <input className="text-input num" type="number" inputMode="numeric" min={0} max={999} value={side === 'a' ? f.as : f.bs} onChange={(e) => setF({ ...f, [side === 'a' ? 'as' : 'bs']: Number(e.target.value) })} />
                  </label>
                </fieldset>
              ))}
              <button className="btn primary wide" disabled={busy}>{t(m.status === 'reported' ? 'tour.correctScore' : 'tour.sendScore')}</button>
            </form>
          )}
          {error && <p className="error" role="alert">{t(k(`games.error.${error}`))}</p>}
        </section>
      )}
    </div>
  );
}
