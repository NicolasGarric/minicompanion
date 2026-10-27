import { useEffect, useMemo, useState } from 'react';
import { k, localeOf, useLang, useT } from '../../core/i18n';
import { Icon } from '../../core/ui/ui';
import { download } from '../../core/lib/image';
import { categories, entriesOf, type Category, type Entry } from '../lib/contest';
import { listOf, type Match, type Registration, type Round, type Tournament } from '../lib/tournaments';
import { dayOf, registrationCurve, summarise, toCsv, type CurvePoint } from '../lib/organiserStats';

/**
 * Organiser dashboard (tournament page, organiser only): sign-ups over time, check-ins, list
 * status, the active round and contest entries, from the data the page already has. Players to
 * chase are listed by name; the player list downloads as CSV for the venue.
 */
export function OrganiserDashboard({ tour, regs, rounds, matches }: { tour: Tournament; regs: Registration[]; rounds: Round[]; matches: Match[] }) {
  const t = useT();
  const contest = tour.type === 'painting_contest';
  const s = useMemo(() => summarise(regs.map((r) => ({ ...r, list: listOf(r) })), rounds, matches), [regs, rounds, matches]);
  const curve = useMemo(() => registrationCurve(regs, Math.min(Date.now(), Date.parse(tour.starts_at))), [regs, tour.starts_at]);
  const name = (id: string) => regs.find((r) => r.user_id === id)?.profile?.display_name ?? '?';
  const active = rounds.find((r) => r.status === 'active');

  const exportCsv = () => {
    const rows = [
      [t('dash.csv.name'), t('dash.csv.handle'), t('dash.csv.status'), t('tour.checkedIn'), t('dash.csv.faction'), t('dash.csv.points'), t('tour.list'), t('dash.csv.registeredAt')],
      ...regs.map((r) => {
        const l = listOf(r);
        return [
          r.profile?.display_name ?? '',
          r.profile?.handle ?? '',
          t(k(`tour.regStatus.${r.status}`)),
          r.checked_in_at ? '✓' : '',
          l?.parsed_faction ?? '',
          l?.parsed_points ?? null,
          l ? t(k(`tour.listStatus.${l.status}`)) : '',
          r.created_at.slice(0, 16).replace('T', ' '),
        ];
      }),
    ];
    // The BOM lets spreadsheet apps read names in any script as UTF-8.
    download(new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' }), `${tour.slug}-players.csv`);
  };

  return (
    <div className="organiser-dash">
      <section className="kpi-group">
        <div className="card-head">
          <h2>{t('dash.registrations')}</h2>
          {regs.length > 0 && <button className="btn small ghost" onClick={exportCsv}><Icon name="download" size={14} /> {t('dash.exportCsv')}</button>}
        </div>
        <div className="kpis">
          <Kpi value={contest ? s.registered : `${s.registered} / ${tour.max_players}`} label={t('dash.registered')} />
          {!contest && <Kpi value={s.waitlist} label={t('tour.regStatus.waitlist')} />}
          {!contest && <Kpi value={`${s.checkedIn} / ${s.registered}`} label={t('tour.checkedIn')} />}
          {s.dropped > 0 && <Kpi value={s.dropped} label={t('tour.regStatus.dropped')} />}
        </div>
      </section>

      <section className="card">
        <h2>{t('dash.chartTitle')}</h2>
        <SignupChart curve={curve} max={contest ? 0 : tour.max_players} deadline={tour.registration_deadline} />
      </section>

      {!contest && (
        <section className="kpi-group">
          <h2>{t('tour.list')}</h2>
          <div className="kpis">
            <Kpi value={s.lists.approved} label={t('tour.listStatus.approved')} />
            <Kpi value={s.lists.submitted} label={t('dash.toReview')} alert={s.lists.submitted > 0} />
            <Kpi value={s.lists.rejected} label={t('tour.listStatus.rejected')} />
            <Kpi value={s.lists.missing} label={t('dash.missing')} />
          </div>
          {s.noList.length > 0 && <p className="hint">{t('dash.noApprovedList', { names: s.noList.map(name).join(', ') })}</p>}
          {s.notCheckedIn.length > 0 && tour.status !== 'finished' && <p className="hint">{t('dash.notCheckedIn', { names: s.notCheckedIn.map(name).join(', ') })}</p>}
        </section>
      )}

      {!contest && rounds.length > 0 && (
        <section className="kpi-group">
          <h2>{t('dash.rounds')}</h2>
          <div className="kpis">
            <Kpi value={`${s.roundsDone} / ${tour.rounds_planned}`} label={t('dash.roundsDone')} />
            {active && <Kpi value={s.pending.toPlay} label={t('tour.match.scheduled')} />}
            {active && <Kpi value={s.pending.toConfirm} label={t('tour.match.reported')} />}
            {active && <Kpi value={s.pending.disputed} label={t('tour.match.disputed')} alert={s.pending.disputed > 0} />}
          </div>
        </section>
      )}

      <ContestNumbers tournamentId={tour.id} />
    </div>
  );
}

function Kpi({ value, label, alert }: { value: string | number; label: string; alert?: boolean }) {
  return (
    <div className={`kpi ${alert ? 'alert' : ''}`}>
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
    </div>
  );
}

/** Cumulative sign-ups as a step line, with the seat limit and the registration deadline. */
function SignupChart({ curve, max, deadline }: { curve: CurvePoint[]; max: number; deadline: string }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  if (!curve.length) return <p className="hint">{t('dash.noSignups')}</p>;
  const fmt = new Intl.DateTimeFormat(localeOf(lang), { day: 'numeric', month: 'short' });
  const label = (day: string) => fmt.format(new Date(`${day}T12:00:00`));
  const W = 800, H = 200, L = 36, R = 10, B = 26, T = 12, n = curve.length;
  const top = Math.max(5, max, curve[n - 1].total);
  const x = (i: number) => L + (n === 1 ? (W - L - R) / 2 : (i / (n - 1)) * (W - L - R));
  const y = (v: number) => H - B - (v / top) * (H - B - T);
  const path = curve.map((p, i) => `${i ? `H${x(i)}` : `M${x(0)}`}V${y(p.total)}`).join('');
  const deadlineIndex = curve.findIndex((p) => p.day === dayOf(Date.parse(deadline)));
  const every = Math.ceil(n / 8);
  return (
    <svg className="admin-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('dash.chartTitle')}>
      {[0, 0.5, 1].map((p) => (
        <g key={p}>
          <line x1={L} x2={W - R} y1={y(top * p)} y2={y(top * p)} className="chart-grid" />
          <text x={L - 6} y={y(top * p) + 4} textAnchor="end" className="chart-axis">{Math.round(top * p)}</text>
        </g>
      ))}
      {max > 0 && (
        <g>
          <line x1={L} x2={W - R} y1={y(max)} y2={y(max)} className="chart-limit" />
          <text x={W - R} y={y(max) - 5} textAnchor="end" className="chart-axis">{t('dash.seats', { n: max })}</text>
        </g>
      )}
      {deadlineIndex >= 0 && (
        <g>
          <line x1={x(deadlineIndex)} x2={x(deadlineIndex)} y1={T} y2={H - B} className="chart-limit" />
          <text x={x(deadlineIndex) - 4} y={T + 10} textAnchor="end" className="chart-axis">{t('dash.deadline')}</text>
        </g>
      )}
      <path d={path} className="line-signups" />
      {curve.map((p, i) =>
        p.added ? (
          <circle key={p.day} cx={x(i)} cy={y(p.total)} r={4} className="dot-active">
            <title>{t('dash.dayTip', { date: label(p.day), added: p.added, total: p.total })}</title>
          </circle>
        ) : null,
      )}
      {curve.map((p, i) => (i % every === 0 || i === n - 1) && (
        <text key={`l${p.day}`} x={x(i)} y={H - 8} textAnchor="middle" className="chart-axis">{label(p.day)}</text>
      ))}
    </svg>
  );
}

/** Entries (and votes once voting is open to the organiser) per contest category. */
function ContestNumbers({ tournamentId }: { tournamentId: string }) {
  const t = useT();
  const [rows, setRows] = useState<{ cat: Category; entries: Entry[] }[] | null>(null);
  useEffect(() => {
    categories(tournamentId)
      .then((cats) => Promise.all(cats.map(async (cat) => ({ cat, entries: await entriesOf(cat.id) }))))
      .then(setRows, () => setRows([]));
  }, [tournamentId]);
  if (!rows?.length) return null;
  return (
    <section className="kpi-group">
      <h2>{t('tour.tab.contest')}</h2>
      <div className="kpis">
        {rows.map(({ cat, entries }) => {
          const shown = entries.filter((e) => !e.is_hidden);
          const votes = shown.some((e) => e.votes !== null) ? shown.reduce((a, e) => a + (e.votes ?? 0), 0) : null;
          return (
            <Kpi
              key={cat.id}
              value={shown.length}
              label={[t(k(`contest.kind.${cat.kind}`)), t('dash.entries'), votes !== null ? t('dash.votes', { n: votes }) : null].filter(Boolean).join(' · ')}
            />
          );
        })}
      </div>
    </section>
  );
}
