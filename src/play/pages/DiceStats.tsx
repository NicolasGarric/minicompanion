import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { localeOf, useLang, useT, type MessageKey } from '../../core/i18n';
import {
  DAMAGES, DEFAULT_CONFIG, MAX_DICE, NO_SAVE, atLeastK, diceStats, rollDice, successChance, atLeast,
  type DiceConfig, type Damage, type Reroll, type Roll,
} from '../lib/dice';
import { startDiceTable, type DiceTableLabels } from '../visual/diceTable';

/**
 * PLAY, "Stats" tab: odds of a three-phase D6 attack (hit, wound, opponent's save) plus damage per
 * unsaved die, and one roll animated on a halftone tabletop. Works offline, nothing is stored.
 */
const THRESHOLDS = [2, 3, 4, 5, 6];
const REROLLS: Reroll[] = ['none', 'ones', 'fails'];
const newSeed = () => Math.floor(Math.random() * 2147483646) + 1;

export function DiceStats() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [cfg, setCfg] = useState<DiceConfig>(DEFAULT_CONFIG);
  const [roll, setRoll] = useState<Roll>(() => rollDice(DEFAULT_CONFIG, newSeed()));
  const canvas = useRef<HTMLCanvasElement>(null);
  const table = useRef<ReturnType<typeof startDiceTable> | null>(null);
  const stats = useMemo(() => diceStats(cfg), [cfg]);

  const fmt = useMemo(() => {
    const loc = localeOf(lang);
    const pct = new Intl.NumberFormat(loc, { style: 'percent', maximumFractionDigits: 1 });
    const one = new Intl.NumberFormat(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return { pct: (x: number) => pct.format(x), one: (x: number) => one.format(x) };
  }, [lang]);

  const target = (n: number) => (n > 6 ? t('dice.noSave') : `${n}+`);
  const dmgLabel = (d: Damage) => (typeof d === 'number' ? `×${d}` : d);
  const labels: DiceTableLabels = {
    zones: [
      `${t('dice.hit')} ${target(cfg.hit.target)}`,
      `${t('dice.wound')} ${target(cfg.wound.target)}`,
      `${t('dice.save')} ${target(cfg.save)}`,
      `${t('dice.damage')} ${dmgLabel(cfg.damage)}`,
    ].map((s) => s.toLocaleUpperCase(localeOf(lang))) as DiceTableLabels['zones'],
    failed: t('dice.failed'),
    passed: (a, b) => t('dice.passed', { passed: a, rolled: b }),
    total: t('dice.totalLabel'),
  };
  const labelsRef = useRef(labels);
  labelsRef.current = labels;

  useEffect(() => {
    if (!canvas.current) return;
    const tbl = startDiceTable(canvas.current, labelsRef.current);
    table.current = tbl;
    return () => tbl.stop();
  }, []);

  // A new roll replays the animation; settings changes roll again after a short pause.
  useEffect(() => table.current?.play(roll, labelsRef.current), [roll]);
  const firstCfg = useRef(true);
  useEffect(() => {
    if (firstCfg.current) return void (firstCfg.current = false);
    const id = setTimeout(() => setRoll(rollDice(cfg, newSeed())), 250);
    return () => clearTimeout(id);
  }, [cfg]);
  useEffect(() => table.current?.relabel(labelsRef.current), [lang]);

  const set = (p: Partial<DiceConfig>) => setCfg((c) => ({ ...c, ...p }));
  const setDice = (n: number) => set({ dice: Math.max(1, Math.min(MAX_DICE, n)) });
  const counts = roll.lists.map((l) => l.length);

  // Distribution chart: totals up to where the odds become negligible.
  const dist = stats.damage;
  let last = dist.length - 1;
  while (last > 0 && dist[last] <= 0.002) last--;
  const maxK = Math.max(4, Math.min(last + 1, dist.length - 1));
  const peak = Math.max(...dist.slice(0, maxK + 1));
  const yTop = Math.ceil(peak * 10) / 10 || 0.1;
  const mean = Math.round(stats.expectedDamage);
  const goal = Math.max(2, mean);
  const W = 800, H = 220, L = 40, B = 28, T = 12, bw = (W - L - 8) / (maxK + 1);
  const tickEvery = Math.ceil((maxK + 1) / 16);

  return (
    <div className="narrow dice-stats">
      <div className="page-head">
        <div>
          <h1>{t('dice.title')}</h1>
          <p className="lead">{t('dice.lead')}</p>
        </div>
      </div>

      <section className="card dice-controls" aria-labelledby="dice-setup">
        <h2 id="dice-setup">{t('dice.setup')}</h2>
        <div className="dice-grid">
          <div className="dice-count">
            <label htmlFor="dice-n">{t('dice.count')}</label>
            <output htmlFor="dice-n">{cfg.dice}</output>
            <div className="field-row">
              <button type="button" className="btn small" onClick={() => setDice(cfg.dice - 1)} aria-label={t('dice.fewer')}>−</button>
              <input id="dice-n" type="range" min={1} max={MAX_DICE} value={cfg.dice} onChange={(e) => setDice(+e.target.value)} />
              <button type="button" className="btn small" onClick={() => setDice(cfg.dice + 1)} aria-label={t('dice.more')}>+</button>
            </div>
          </div>
          <div className="dice-phases">
            <PhaseRow name={t('dice.hit')} hint={t('dice.hitHint')}>
              <Choice values={THRESHOLDS} value={cfg.hit.target} label={target} onChange={(v) => set({ hit: { ...cfg.hit, target: v } })} />
              <RerollSelect id="rr-hit" value={cfg.hit.reroll} onChange={(r) => set({ hit: { ...cfg.hit, reroll: r } })} />
            </PhaseRow>
            <PhaseRow name={t('dice.wound')} hint={t('dice.woundHint')}>
              <Choice values={THRESHOLDS} value={cfg.wound.target} label={target} onChange={(v) => set({ wound: { ...cfg.wound, target: v } })} />
              <RerollSelect id="rr-wound" value={cfg.wound.reroll} onChange={(r) => set({ wound: { ...cfg.wound, reroll: r } })} />
            </PhaseRow>
            <PhaseRow name={t('dice.save')} hint={t('dice.saveHint')}>
              <Choice values={[...THRESHOLDS, NO_SAVE]} value={cfg.save} label={target} onChange={(v) => set({ save: v })} />
            </PhaseRow>
            <PhaseRow name={t('dice.damage')} hint={t('dice.damageHint')}>
              <Choice values={DAMAGES} value={cfg.damage} label={(d) => String(d)} onChange={(v) => set({ damage: v })} />
            </PhaseRow>
          </div>
        </div>
      </section>

      <section className="dice-stage" aria-labelledby="dice-roll">
        <div className="page-head">
          <h2 id="dice-roll" className="section-title">{t('dice.rollTitle')}</h2>
          <button type="button" className="btn primary" onClick={() => setRoll(rollDice(cfg, newSeed()))}>{t('dice.roll')}</button>
        </div>
        <canvas ref={canvas} aria-hidden />
        <p className="dice-outcome" aria-live="polite">
          {t('dice.outcome', { dice: counts[0], hits: counts[1], wounds: counts[2], unsaved: counts[3], damage: roll.totalDamage })}
        </p>
      </section>

      <section className="card" aria-labelledby="dice-odds">
        <h2 id="dice-odds">{t('dice.oddsTitle')}</h2>
        <p className="hint">{t('dice.exactNote')}</p>
        <div className="dice-odds">
          <div>
            <h3>{t('dice.tableTitle')}</h3>
            <div className="table-scroll">
              <table className="standings dice-table">
                <thead>
                  <tr>
                    <th>{t('dice.threshold')}</th>
                    {REROLLS.map((r) => <th key={r}>{t(`dice.reroll.${r}` as MessageKey)}</th>)}
                    <th>{t('dice.failedSave')}</th>
                  </tr>
                </thead>
                <tbody>
                  {THRESHOLDS.map((n) => (
                    <tr key={n}>
                      <td className="dice-thr">{n}+</td>
                      {REROLLS.map((r) => {
                        const on = (cfg.hit.target === n && cfg.hit.reroll === r) || (cfg.wound.target === n && cfg.wound.reroll === r);
                        return <td key={r} className={on ? 'on' : ''}>{fmt.pct(successChance(n, r))}</td>;
                      })}
                      <td className={cfg.save === n ? 'on' : ''}>{fmt.pct(1 - atLeast(n))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">{t('dice.tableNote')}</p>
          </div>

          <div className="dice-chain">
            <h3>{t('dice.chainTitle', { n: cfg.dice })}</h3>
            {stats.phases.map((p, i) => (
              <div className="dice-line" key={p.key}>
                <span>{t(`dice.${p.key}` as MessageKey)} {target(p.target)}{p.reroll !== 'none' ? ` · ${t(`dice.reroll.${p.reroll}` as MessageKey)}` : ''}</span>
                <span>{fmt.pct(p.pass)} → <b>{fmt.one(stats.expected[i + 1])}</b></span>
              </div>
            ))}
            <div className="dice-line">
              <span>{t('dice.damage')} {dmgLabel(cfg.damage)}</span>
              <span>{t('dice.damageHint')}</span>
            </div>
            <div className="dice-line">
              <span>{t('dice.perDie')}</span>
              <b>{fmt.pct(stats.perDie)}</b>
            </div>
            <div className="dice-line total">
              <span>{t('dice.avgDamage')}</span>
              <b>{fmt.one(stats.expectedDamage)}</b>
            </div>
            <div className="dice-line">
              <span>{t('dice.atLeastOne')}</span>
              <b>{fmt.pct(atLeastK(dist, 1))}</b>
            </div>
            <div className="dice-line">
              <span>{t('dice.atLeast', { n: goal })}</span>
              <b>{fmt.pct(atLeastK(dist, goal))}</b>
            </div>
            <div className="dice-line">
              <span>{t('dice.none')}</span>
              <b>{fmt.pct(dist[0])}</b>
            </div>
          </div>
        </div>

        <h3>{t('dice.distTitle')}</h3>
        <svg className="dice-dist" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('dice.distTitle')}>
          {[0, 0.5, 1].map((f) => {
            const y = H - B - f * (H - B - T);
            return (
              <g key={f}>
                <line x1={L} x2={W - 8} y1={y} y2={y} className="dist-grid" />
                <text x={L - 6} y={y + 4} textAnchor="end" className="axis">{fmt.pct(f * yTop)}</text>
              </g>
            );
          })}
          {dist.slice(0, maxK + 1).map((p, k) => {
            const hh = (p / yTop) * (H - B - T), x = L + k * bw;
            return (
              <g key={k}>
                <rect x={x + 2} y={H - B - hh} width={Math.max(1, bw - 4)} height={hh} className={k === mean ? 'dist-bar mean' : 'dist-bar'}>
                  <title>{t('dice.barTip', { n: k, p: fmt.pct(p) })}</title>
                </rect>
                {k % tickEvery === 0 && <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="tick">{k}</text>}
              </g>
            );
          })}
        </svg>
        <p className="hint">{t('dice.distNote')}</p>
      </section>
    </div>
  );
}

function PhaseRow({ name, hint, children }: { name: string; hint: string; children: ReactNode }) {
  return (
    <div className="dice-phase">
      <div className="dice-phase-name">
        <strong>{name}</strong>
        <small>{hint}</small>
      </div>
      {children}
    </div>
  );
}

function Choice<V extends string | number>({ values, value, label, onChange }: { values: V[]; value: V; label: (v: V) => string; onChange: (v: V) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {values.map((v) => (
        <button key={v} type="button" role="radio" aria-checked={v === value} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {label(v)}
        </button>
      ))}
    </div>
  );
}

function RerollSelect({ id, value, onChange }: { id: string; value: Reroll; onChange: (r: Reroll) => void }) {
  const t = useT();
  return (
    <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value as Reroll)} aria-label={t('dice.rerollLabel')}>
      {REROLLS.map((r) => <option key={r} value={r}>{t(`dice.reroll.${r}` as MessageKey)}</option>)}
    </select>
  );
}
