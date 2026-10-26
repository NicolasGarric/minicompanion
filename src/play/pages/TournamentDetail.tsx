import { Predictions } from '../components/Predictions';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { k, langName, useLang, useT } from '../../core/i18n';
import { setPageMeta, useJsonLd } from '../../core/seo';
import { tournamentJsonLd } from '../lib/seo';
import { supabase, backendConfigured } from '../../core/auth/supabase';
import { BackendNotice } from '../../core/auth/BackendNotice';
import { requireSignIn, useSession } from '../../core/auth/session';
import { Icon } from '../../core/ui/ui';
import { osmEmbedUrl, osmLink } from '../../core/stores/stores';
import { formatWhen } from '../components/GameCard';
import { playError } from '../lib/games';
import { downloadIcs } from '../lib/ics';
import { parseArmyList } from '../lib/listParser';
import type { Pairing } from '../lib/pairing';
import { ContestSection } from '../components/ContestSection';
import { draftsToSlots, fitDrafts, RoundScheduleEditor, RoundScheduleList, RoundWhere, slotVenue, slotsToDrafts, toLocalInput, type SlotDraft } from '../components/RoundSchedule';
import {
  confirmMatch,
  createRound,
  finishRound,
  finishTournament,
  getTournament,
  listOf,
  matches as loadMatches,
  nextPairings,
  onTournamentChange,
  publishTournament,
  register,
  registrations as loadRegs,
  reportMatch,
  reviewList,
  rounds as loadRounds,
  roundSchedule,
  setRegistration,
  setRoundSchedule,
  storesWithPlace,
  standingsOf,
  startTournament,
  submitList,
  tables as loadTables,
  withdraw,
  type Match,
  type MatchResult,
  type Registration,
  type Round,
  type RoundSlot,
  type Tournament,
} from '../lib/tournaments';

type Tab = 'info' | 'players' | 'pairings' | 'standings' | 'contest';

interface Data {
  t: Tournament;
  regs: Registration[];
  rounds: Round[];
  matches: Match[];
  tables: Map<string, number>;
  place: { lat: number; lng: number; registered: number } | null;
  /** Date and venue per round; empty for a one-day event. */
  schedule: RoundSlot[];
}

/** One tournament: info, players, pairings with score reports, live standings, organiser tools. */
export function TournamentDetail({ slug }: { slug: string }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const session = useSession((s) => s.session);
  const me = session?.user.id ?? null;
  const [data, setData] = useState<Data | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const tour = await getTournament(slug);
      if (!tour) return setData(null);
      const [regs, rounds, matches, tables, schedule] = await Promise.all([
        loadRegs(tour.id), loadRounds(tour.id), loadMatches(tour.id), loadTables(tour.id), roundSchedule(tour.id),
      ]);
      // Coordinates come from the search function (PostGIS point → lat / lng).
      let place: Data['place'] = null;
      if (supabase) {
        const s = await supabase.rpc('search_tournaments', { p_from: new Date(Date.parse(tour.starts_at) - 1000).toISOString() });
        const row = ((s.data ?? []) as { id: string; lat: number; lng: number; registered: number }[]).find((r) => r.id === tour.id);
        if (row) place = { lat: row.lat, lng: row.lng, registered: row.registered };
      }
      setData({ t: tour, regs, rounds, matches, tables, place, schedule });
    } catch (e) {
      setError(playError(e) ?? 'generic');
      setData(null);
    }
  }, [slug, me]);

  useEffect(() => {
    if (backendConfigured) load();
  }, [load]);
  // Live pairings and results
  const tid = data?.t.id;
  useEffect(() => (tid ? onTournamentChange(tid, () => load()) : undefined), [tid, load]);
  const seoTour = data?.t;
  useEffect(() => {
    if (seoTour)
      setPageMeta({ title: seoTour.name, description: [formatWhen(seoTour.starts_at, lang), seoTour.venue_name, seoTour.description].filter(Boolean).join(' · ') });
  }, [seoTour, lang]);
  useJsonLd('tournament', seoTour && data ? tournamentJsonLd(seoTour, data.schedule, location.origin) : null);

  if (!backendConfigured) return <BackendNotice />;
  if (data === undefined) return <div className="narrow"><span className="spinner" /></div>;
  if (data === null)
    return (
      <div className="narrow">
        <p className="hint">{error === 'not_installed' ? t('games.error.not_installed') : t('tour.notFound')}</p>
        <a href="/play">← {t('nav.play.tournaments')}</a>
      </div>
    );

  const { t: tour, regs, rounds, matches } = data;
  const organiser = me === tour.organiser_id;
  const mine = regs.find((r) => r.user_id === me);
  const running = tour.status === 'in_progress' || tour.status === 'finished';
  const contest = tour.type === 'painting_contest';
  const current = tab ?? (contest ? 'contest' : running ? 'pairings' : 'info');
  const tabs: Tab[] = contest ? ['contest', 'info', 'players'] : ['info', 'players', 'pairings', 'standings', 'contest'];
  const registered = regs.filter((r) => r.status === 'registered');

  return (
    <div className="narrow game-detail tournament">
      <a href="/play" className="small">← {t('nav.play.tournaments')}</a>
      <div className="page-head">
        <div>
          <h1>{tour.name}</h1>
          <p className="lead">
            {(tour.type === 'painting_contest'
              ? [tour.game_system, t(k(`tour.type.${tour.type}`))]
              : [tour.game_system, t(k(`tour.type.${tour.type}`)), tour.format ? t('games.points', { points: tour.format.points_limit }) : null, t('tour.rounds', { n: tour.rounds_planned })]
            )
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <span className="game-tags">
          <span className={`tag status-${tour.status}`}>{t(k(`tour.status.${tour.status}`))}</span>
          {tour.type !== 'painting_contest' && <span className="tag">{t('games.seats', { taken: registered.length, max: tour.max_players })}</span>}
        </span>
      </div>

      {organiser && !contest && <OrganiserPanel data={data} onChange={load} />}

      <div className="segmented view-switch" role="tablist">
        {tabs.map((x) => (
          <button key={x} role="tab" aria-selected={current === x} className={current === x ? 'on' : ''} onClick={() => setTab(x)}>
            {t(k(`tour.tab.${x}`))}
          </button>
        ))}
      </div>

      {current === 'info' && <InfoTab data={data} me={me} mine={mine} onChange={load} lang={lang} />}
      {current === 'players' && <PlayersTab data={data} organiser={organiser} onChange={load} />}
      {current === 'pairings' && <PairingsTab data={data} me={me} organiser={organiser} onChange={load} lang={lang} />}
      {current === 'standings' && <StandingsTab regs={regs} matches={matches} me={me} rounds={rounds} />}
      {current === 'contest' && <ContestSection tour={tour} organiser={organiser} />}
    </div>
  );
}

const nameOf = (regs: Registration[], id: string | null) => (id ? regs.find((r) => r.user_id === id)?.profile?.display_name ?? '?' : '');

// --- Info: details, map, registration, army list -------------------------------------------------
function InfoTab({ data, me, mine, onChange, lang }: { data: Data; me: string | null; mine?: Registration; onChange: () => void; lang: string }) {
  const t = useT();
  const { t: tour, place, schedule } = data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isIn = mine && (mine.status === 'registered' || mine.status === 'waitlist');
  const closed = Date.now() > Date.parse(tour.registration_deadline) || tour.status !== 'published';
  const full = data.regs.filter((r) => r.status === 'registered').length >= tour.max_players;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(playError(e) ?? 'generic');
    }
    await onChange();
    setBusy(false);
  };

  return (
    <>
      <section className="card game-facts">
        <p>
          <Icon name="calendar" size={16} /> {formatWhen(tour.starts_at, lang)} →{' '}
          {schedule.length > 1
            ? formatWhen(schedule[schedule.length - 1].starts_at, lang)
            : new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(new Date(tour.ends_at))}
        </p>
        <p>
          <Icon name="map" size={16} /> {tour.store_id ? <a href={`/play/store/${tour.store_id}`}>{tour.venue_name}</a> : tour.venue_name} · {tour.address}
        </p>
        <p><Icon name="globe" size={16} /> {tour.language === 'both' ? t('games.lang.both') : langName(tour.language)}</p>
        <p className="muted">{t('tour.deadline', { date: formatWhen(tour.registration_deadline, lang) })}</p>
        {tour.description && <p className="game-note">{tour.description}</p>}
        {tour.twitch_channel && (
          <p>
            <Icon name="link" size={16} />{' '}
            <a href={`https://www.twitch.tv/${tour.twitch_channel}`} target="_blank" rel="noreferrer">{t('tour.stream', { channel: tour.twitch_channel })}</a>
          </p>
        )}
        <p>
          <button
            className="btn small"
            onClick={() =>
              schedule.length
                ? downloadIcs(
                    schedule.map((s) => {
                      const v = slotVenue(s, tour);
                      return {
                        id: `${tour.id}-r${s.number}`,
                        title: `${tour.name} · ${t('tour.roundN', { n: s.number })}`,
                        start: s.starts_at,
                        end: new Date(Date.parse(s.starts_at) + (tour.format?.round_minutes ?? 120) * 6e4).toISOString(),
                        location: [v.name, v.address].filter(Boolean).join(', '),
                        url: location.href,
                      };
                    }),
                    tour.name,
                  )
                : downloadIcs({ id: tour.id, title: tour.name, start: tour.starts_at, end: tour.ends_at, location: `${tour.venue_name}, ${tour.address}`, url: location.href })
            }
          >
            <Icon name="calendar" size={14} /> {schedule.length ? t('tour.addRoundsToCalendar') : t('games.addToCalendar')}
          </button>
        </p>
      </section>

      {schedule.length > 0 && (
        <section className="card">
          <h2>{t('tour.schedule')}</h2>
          <RoundScheduleList slots={schedule} tour={tour} lang={lang} currentRound={data.rounds.find((r) => r.status === 'active')?.number} />
        </section>
      )}

      {tour.twitch_channel && (
        <section className="card twitch">
          <iframe
            title={t('tour.stream', { channel: tour.twitch_channel })}
            src={`https://player.twitch.tv/?channel=${tour.twitch_channel}&parent=${location.hostname}&muted=true&autoplay=false`}
            allowFullScreen
            loading="lazy"
          />
        </section>
      )}

      {place && (
        <section className="card tour-map">
          <iframe title={t('tour.map')} src={osmEmbedUrl(place)} loading="lazy" />
          <a className="small" href={osmLink(place)} target="_blank" rel="noreferrer">{t('tour.openMap')} ↗</a>
        </section>
      )}

      <section className="card game-actions">
        {!me ? (
          <button className="btn primary" onClick={() => requireSignIn()}>{t('tour.signinToRegister')}</button>
        ) : isIn ? (
          <>
            <p>{t(mine!.status === 'waitlist' ? 'tour.onWaitlist' : 'tour.registered')}</p>
            {tour.status === 'published' && <button className="btn ghost" disabled={busy} onClick={() => act(() => withdraw(tour.id))}>{t('tour.withdraw')}</button>}
          </>
        ) : closed ? (
          <p className="muted">{t('tour.closed')}</p>
        ) : (
          <button className="btn primary" disabled={busy} onClick={() => act(() => register(tour.id))}>{full ? t('tour.joinWaitlist') : t('tour.register')}</button>
        )}
        {error && <p className="error" role="alert">{t(k(`games.error.${error}`))}</p>}
      </section>

      {isIn && <ListSection tour={tour} reg={mine!} onChange={onChange} />}
    </>
  );
}

function ListSection({ tour, reg, onChange }: { tour: Tournament; reg: Registration; onChange: () => void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const list = listOf(reg);
  const [text, setText] = useState(list?.raw_text ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const parsed = useMemo(() => parseArmyList(text), [text]);
  const locked = Date.now() > Date.parse(tour.list_deadline);
  const over = !!(tour.format && parsed.points && parsed.points > tour.format.points_limit);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await submitList(tour.id, text, parsed.faction, parsed.points);
      setSaved(true);
      onChange();
    } catch (err) {
      setError(playError(err) ?? 'generic');
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('tour.list')}</h2>
        {list && <span className={`tag list-${list.status}`}>{t(k(`tour.listStatus.${list.status}`))}</span>}
      </div>
      {list?.organiser_comment && <p className="notice">{list.organiser_comment}</p>}
      {locked ? (
        <pre className="list-text">{list?.raw_text ?? t('tour.noList')}</pre>
      ) : (
        <form className="field-col" onSubmit={submit}>
          <textarea className="text-input mono" rows={8} maxLength={20000} value={text} onChange={(e) => (setText(e.target.value), setSaved(false))} placeholder={t('tour.listPlaceholder')} />
          <p className={over ? 'error' : 'hint'}>
            {[parsed.faction, parsed.points ? t('games.points', { points: parsed.points }) : null].filter(Boolean).join(' · ') || t('tour.listUnparsed')}
            {over && ` — ${t('tour.listOver', { limit: tour.format!.points_limit })}`}
          </p>
          <p className="hint">{t('tour.listDeadline', { date: formatWhen(tour.list_deadline, lang) })}</p>
          {error && <p className="error" role="alert">{t(k(`games.error.${error}`))}</p>}
          <div className="nav-row">
            {saved && <span className="success">{t('tour.listSaved')}</span>}
            <button className="btn primary" disabled={!text.trim()}>{t('tour.listSubmit')}</button>
          </div>
        </form>
      )}
    </section>
  );
}

// --- Players --------------------------------------------------------------------------------------
function PlayersTab({ data, organiser, onChange }: { data: Data; organiser: boolean; onChange: () => void }) {
  const t = useT();
  const { t: tour, regs } = data;
  const [open, setOpen] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      playError(e);
    }
    onChange();
  };
  if (!regs.length) return <p className="hint">{t('tour.noPlayers')}</p>;
  return (
    <ul className="player-rows">
      {regs.map((r) => {
        const list = listOf(r);
        return (
          <li key={r.id} className={r.status}>
            <div className="player-row">
              <span className="grow">
                <a href={`/u/${r.profile?.handle ?? ''}`}><strong>{r.profile?.display_name ?? '?'}</strong></a>
                <small className="muted">
                  {[
                    r.status !== 'registered' ? t(k(`tour.regStatus.${r.status}`)) : null,
                    list ? [list.parsed_faction, list.parsed_points ? t('games.points', { points: list.parsed_points }) : null].filter(Boolean).join(' · ') : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </span>
              {list && <span className={`tag list-${list.status}`}>{t(k(`tour.listStatus.${list.status}`))}</span>}
              {r.checked_in_at && <span className="tag ok">{t('tour.checkedIn')}</span>}
              {list && (
                <button className="btn small ghost" onClick={() => setOpen(open === r.id ? null : r.id)}>{t('tour.seeList')}</button>
              )}
              {organiser && r.status !== 'waitlist' && (
                <>
                  <button className="btn small" onClick={() => act(() => setRegistration(tour.id, r.user_id, !r.checked_in_at, r.status === 'dropped'))}>
                    {t(r.checked_in_at ? 'tour.undoCheckIn' : 'tour.checkIn')}
                  </button>
                  <button className="btn small danger-ghost" onClick={() => act(() => setRegistration(tour.id, r.user_id, !!r.checked_in_at, r.status !== 'dropped'))}>
                    {t(r.status === 'dropped' ? 'tour.undrop' : 'tour.drop')}
                  </button>
                </>
              )}
            </div>
            {open === r.id && list && (
              <div className="list-review">
                <pre className="list-text">{list.raw_text}</pre>
                {organiser && (
                  <div className="field-row wrap">
                    <input className="text-input grow" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('tour.reviewComment')} />
                    <button className="btn small primary" onClick={() => act(() => reviewList(list.id, 'approved', comment || null))}>{t('tour.approve')}</button>
                    <button className="btn small danger-ghost" onClick={() => act(() => reviewList(list.id, 'rejected', comment || null))}>{t('tour.reject')}</button>
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// --- Pairings and score reports ---------------------------------------------------------------------
function PairingsTab({ data, me, organiser, onChange, lang }: { data: Data; me: string | null; organiser: boolean; onChange: () => void; lang: string }) {
  const t = useT();
  const { rounds, matches, regs, tables, schedule } = data;
  const active = rounds.find((r) => r.status === 'active') ?? rounds[rounds.length - 1];
  const [shown, setShown] = useState<string | null>(null);
  const round = rounds.find((r) => r.id === shown) ?? active;
  if (!round) return <p className="hint">{t('tour.noRound')}</p>;
  const list = matches
    .filter((m) => m.round_id === round.id)
    .sort((a, b) => (tables.get(a.table_id ?? '') ?? 999) - (tables.get(b.table_id ?? '') ?? 999));
  const myMatch = list.find((m) => m.player_a_id === me || m.player_b_id === me);

  return (
    <>
      <div className="chips">
        {rounds.map((r) => (
          <button key={r.id} className={`chip ${r.id === round.id ? 'on' : ''}`} onClick={() => setShown(r.id)}>
            {t('tour.roundN', { n: r.number })}
            {r.status === 'active' ? ' •' : ''}
          </button>
        ))}
      </div>
      {schedule.find((s) => s.number === round.number) && (
        <RoundWhere slot={schedule.find((s) => s.number === round.number)!} tour={data.t} lang={lang} />
      )}
      {myMatch && round.status === 'active' && (
        <p className="notice">
          {myMatch.player_b_id
            ? t('tour.yourTable', { table: tables.get(myMatch.table_id ?? '') ?? '?', name: nameOf(regs, myMatch.player_a_id === me ? myMatch.player_b_id : myMatch.player_a_id) })
            : t('tour.yourBye')}
        </p>
      )}
      <ul className="match-list">
        {list.map((m) => (
          <MatchRow key={m.id} m={m} regs={regs} table={tables.get(m.table_id ?? '')} me={me} organiser={organiser} roundActive={round.status === 'active'} onChange={onChange} />
        ))}
      </ul>
      <Predictions tournamentId={data.t.id} matches={list} tableOf={(m) => tables.get(m.table_id ?? '')} nameOf={(id) => nameOf(regs, id)} me={me} />
    </>
  );
}

export function MatchRow({ m, regs, table, me, organiser, roundActive, onChange }: {
  m: Match;
  regs: Registration[];
  table?: number;
  me: string | null;
  organiser: boolean;
  roundActive: boolean;
  onChange: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ ap: m.a_primary ?? 0, as: m.a_secondary ?? 0, bp: m.b_primary ?? 0, bs: m.b_secondary ?? 0 });
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inMatch = me === m.player_a_id || me === m.player_b_id;
  const done = m.status === 'confirmed' || m.status === 'resolved';
  const canReport = !!m.player_b_id && ((inMatch && roundActive && !done) || organiser);
  const toConfirm = m.status === 'reported' && inMatch && m.reported_by !== me;

  const total = (p: number | null, s: number | null) => (p === null && s === null ? '–' : (p ?? 0) + (s ?? 0));
  const result = (a: number, b: number): MatchResult => (a > b ? 'a_win' : a < b ? 'b_win' : 'draw');
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      setEditing(false);
    } catch (e) {
      setError(playError(e) ?? 'generic');
    }
    onChange();
  };

  return (
    <li className={`match ${inMatch ? 'mine' : ''} ${m.status}`}>
      <div className="match-line">
        <span className="match-table">{m.player_b_id ? t('tour.tableN', { n: table ?? '?' }) : t('tour.bye')}</span>
        <span className={`match-player ${m.result === 'a_win' ? 'win' : ''}`}>{nameOf(regs, m.player_a_id)}</span>
        <span className="match-score">{!m.player_b_id ? '' : m.status === 'scheduled' ? 'vs' : `${total(m.a_primary, m.a_secondary)} – ${total(m.b_primary, m.b_secondary)}`}</span>
        <span className={`match-player right ${m.result === 'b_win' ? 'win' : ''}`}>{m.player_b_id ? nameOf(regs, m.player_b_id) : ''}</span>
        <span className={`tag match-${m.status}`}>{t(k(`tour.match.${m.status}`))}</span>
      </div>
      {m.status === 'disputed' && m.dispute_note && <p className="hint">“{m.dispute_note}”</p>}
      {toConfirm && (
        <div className="field-row wrap">
          <button className="btn small primary" onClick={() => run(() => confirmMatch(m.id, true))}>{t('report.confirm')}</button>
          <input className="text-input grow" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('tour.disputeNote')} />
          <button className="btn small danger-ghost" onClick={() => run(() => confirmMatch(m.id, false, note))}>{t('report.dispute')}</button>
        </div>
      )}
      {canReport && !editing && !toConfirm && (
        <button className="btn small" onClick={() => setEditing(true)}>{t(m.status === 'scheduled' ? 'tour.reportScore' : 'tour.correctScore')}</button>
      )}
      {editing && (
        <form
          className="score-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => reportMatch(m.id, { ...f, result: result(f.ap + f.as, f.bp + f.bs) }));
          }}
        >
          {(['a', 'b'] as const).map((side) => (
            <fieldset key={side}>
              <legend>{nameOf(regs, side === 'a' ? m.player_a_id : m.player_b_id)}</legend>
              <label className="field">
                <span>{t('tour.primary')}</span>
                <input className="text-input num" type="number" min={0} max={999} value={side === 'a' ? f.ap : f.bp} onChange={(e) => setF({ ...f, [side === 'a' ? 'ap' : 'bp']: Number(e.target.value) })} />
              </label>
              <label className="field">
                <span>{t('tour.secondary')}</span>
                <input className="text-input num" type="number" min={0} max={999} value={side === 'a' ? f.as : f.bs} onChange={(e) => setF({ ...f, [side === 'a' ? 'as' : 'bs']: Number(e.target.value) })} />
              </label>
            </fieldset>
          ))}
          <p className="hint">{t(k(`tour.result.${result(f.ap + f.as, f.bp + f.bs)}`), { a: nameOf(regs, m.player_a_id), b: nameOf(regs, m.player_b_id) })}</p>
          <div className="nav-row">
            <button type="button" className="btn ghost small" onClick={() => setEditing(false)}>{t('common.back')}</button>
            <button className="btn primary small">{t(organiser && !inMatch ? 'tour.saveFinal' : 'tour.sendScore')}</button>
          </div>
        </form>
      )}
      {error && <p className="error" role="alert">{t(k(`games.error.${error}`))}</p>}
    </li>
  );
}

// --- Standings ---------------------------------------------------------------------------------------
function StandingsTab({ regs, matches, me, rounds }: { regs: Registration[]; matches: Match[]; me: string | null; rounds: Round[] }) {
  const t = useT();
  const table = useMemo(() => standingsOf(regs, matches), [regs, matches]);
  if (!rounds.length) return <p className="hint">{t('tour.noRound')}</p>;
  const dropped = new Set(regs.filter((r) => r.status === 'dropped').map((r) => r.user_id));
  return (
    <section className="card">
      <div className="table-wrap">
        <table className="standings">
          <thead>
            <tr>
              <th>#</th>
              <th>{t('league.player')}</th>
              <th title={t('tour.mpHint')}>{t('tour.mp')}</th>
              <th>{t('league.w')}</th>
              <th>{t('league.d')}</th>
              <th>{t('league.l')}</th>
              <th title={t('tour.sosHint')}>{t('tour.sos')}</th>
              <th title={t('tour.vpHint')}>{t('tour.vp')}</th>
            </tr>
          </thead>
          <tbody>
            {table.map((s) => (
              <tr key={s.playerId} className={`${s.playerId === me ? 'me' : ''} ${dropped.has(s.playerId) ? 'dropped' : ''}`}>
                <td>{s.rank}</td>
                <td>{nameOf(regs, s.playerId)}{dropped.has(s.playerId) ? ` (${t('tour.regStatus.dropped')})` : ''}</td>
                <td><strong>{s.matchPoints}</strong></td>
                <td>{s.wins}</td>
                <td>{s.draws}</td>
                <td>{s.losses}</td>
                <td>{s.strengthOfSchedule}</td>
                <td>{s.vpDiff > 0 ? `+${s.vpDiff}` : s.vpDiff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">{t('tour.tiebreakers')}</p>
    </section>
  );
}

// --- Organiser tools ---------------------------------------------------------------------------------
function OrganiserPanel({ data, onChange }: { data: Data; onChange: () => void }) {
  const t = useT();
  const { t: tour, regs, rounds, matches } = data;
  const [preview, setPreview] = useState<{ pairings: Pairing[]; rematches: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = rounds.find((r) => r.status === 'active');
  const pending = active ? matches.filter((m) => m.round_id === active.id && m.status !== 'confirmed' && m.status !== 'resolved').length : 0;
  const nextNumber = rounds.length + 1;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setPreview(null);
    } catch (e) {
      setError(playError(e) ?? 'generic');
    }
    await onChange();
    setBusy(false);
  };

  return (
    <section className="card accent organiser">
      <div className="card-head">
        <h2>{t('tour.organiser')}</h2>
        {tour.status !== 'draft' && (
          <a className="btn small" href={`/play/t/${tour.slug}/tables`}><Icon name="grid" size={14} /> {t('tour.qrCodes')}</a>
        )}
      </div>
      {tour.status === 'draft' && (
        <div className="field-row wrap">
          <p className="hint grow">{t('tour.draftHint')}</p>
          <button className="btn primary" disabled={busy} onClick={() => run(() => publishTournament(tour.id))}>{t('tour.publish')}</button>
        </div>
      )}
      {tour.status === 'published' && (
        <div className="field-row wrap">
          <p className="hint grow">{t('tour.startHint', { count: regs.filter((r) => r.status === 'registered').length })}</p>
          <button className="btn primary" disabled={busy} onClick={() => run(() => startTournament(tour.id))}>{t('tour.start')}</button>
        </div>
      )}
      {tour.status === 'in_progress' && active && (
        <div className="field-row wrap">
          <p className="hint grow">{pending ? t('tour.pendingMatches', { n: active.number, count: pending }) : t('tour.roundReady', { n: active.number })}</p>
          <button className="btn primary" disabled={busy || pending > 0} onClick={() => run(() => finishRound(tour.id))}>{t('tour.closeRound', { n: active.number })}</button>
        </div>
      )}
      {tour.status === 'in_progress' && !active && nextNumber <= tour.rounds_planned && !preview && (
        <div className="field-row wrap">
          <p className="hint grow">{t('tour.pairHint', { n: nextNumber })}</p>
          <button className="btn primary" disabled={busy} onClick={() => setPreview(nextPairings(regs, matches))}>{t('tour.pairRound', { n: nextNumber })}</button>
        </div>
      )}
      {preview && (
        <div className="pairing-preview">
          <h3>{t('tour.previewTitle', { n: nextNumber })}</h3>
          {preview.rematches && <p className="notice">{t('tour.rematches')}</p>}
          <ol>
            {preview.pairings.map(([a, b]) => (
              <li key={a}>{nameOf(regs, a)} — {b ? nameOf(regs, b) : t('tour.bye')}</li>
            ))}
          </ol>
          <div className="nav-row">
            <button className="btn ghost" onClick={() => setPreview(nextPairings(regs, matches))}>{t('tour.reshuffle')}</button>
            <button className="btn primary" disabled={busy} onClick={() => run(() => createRound(tour.id, preview.pairings))}>{t('tour.publishPairings')}</button>
          </div>
        </div>
      )}
      {tour.status === 'in_progress' && !active && (
        <div className="field-row wrap">
          <p className="hint grow">{nextNumber > tour.rounds_planned ? t('tour.allPlayed') : t('tour.finishEarly')}</p>
          <button className={`btn ${nextNumber > tour.rounds_planned ? 'primary' : 'ghost'}`} disabled={busy} onClick={() => run(() => finishTournament(tour.id))}>{t('tour.finish')}</button>
        </div>
      )}
      {tour.status !== 'finished' && tour.status !== 'cancelled' && <ScheduleEditor data={data} onChange={onChange} />}
      {error && <p className="error" role="alert">{t(k(`games.error.${error}`))}</p>}
    </section>
  );
}

/** Organiser: turn the event into a multi-week one, or move rounds (players are notified). */
function ScheduleEditor({ data, onChange }: { data: Data; onChange: () => void }) {
  const t = useT();
  const { t: tour, schedule } = data;
  const [open, setOpen] = useState(false);
  const [multiDay, setMultiDay] = useState(schedule.length > 0);
  const [drafts, setDrafts] = useState<SlotDraft[]>(() => slotsToDrafts(schedule));
  const [stores, setStores] = useState<{ id: string; name: string; city: string }[]>([]);
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | string>('idle');
  useEffect(() => {
    if (open) storesWithPlace().then(setStores, () => setStores([]));
  }, [open]);

  const first = schedule[0] ? toLocalInput(new Date(schedule[0].starts_at)) : toLocalInput(new Date(tour.starts_at));
  const shown = multiDay ? fitDrafts(first, tour.rounds_planned, drafts) : [];
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('busy');
    try {
      await setRoundSchedule(tour.id, draftsToSlots(shown));
      setState('saved');
      setOpen(false);
      await onChange();
    } catch (err) {
      setState(playError(err) ?? 'generic');
    }
  };

  if (!open)
    return (
      <div className="field-row wrap">
        <p className="hint grow">{state === 'saved' && tour.status !== 'draft' ? t('tour.scheduleSaved') : schedule.length ? t('tour.scheduleHint') : t('tour.multiDayHint')}</p>
        <button className="btn small ghost" onClick={() => (setDrafts(slotsToDrafts(schedule)), setMultiDay(schedule.length > 0), setOpen(true))}>
          <Icon name="calendar" size={14} /> {t('tour.editSchedule')}
        </button>
      </div>
    );
  return (
    <form className="schedule-form" onSubmit={save}>
      <h3>{t('tour.schedule')}</h3>
      <label className="check">
        <input type="checkbox" checked={multiDay} onChange={(e) => setMultiDay(e.target.checked)} />
        <span>{t('tour.multiDay')}</span>
      </label>
      {multiDay && <RoundScheduleEditor drafts={shown} onChange={setDrafts} stores={stores} />}
      {tour.status !== 'draft' && <p className="hint">{t('tour.scheduleHint')}</p>}
      {state !== 'idle' && state !== 'busy' && state !== 'saved' && <p className="error" role="alert">{t(k(`games.error.${state}`))}</p>}
      <div className="nav-row">
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>{t('common.back')}</button>
        <button className="btn primary" disabled={state === 'busy'}>{t('common.save')}</button>
      </div>
    </form>
  );
}
