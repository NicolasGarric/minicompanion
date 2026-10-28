import { useEffect, useRef, useState } from 'react';
import { k, useLang, useT } from '../../../core/i18n';
import { Icon } from '../../../core/ui/ui';
import {
  CAMP_COLORS, CAMP_IDS, EFFECTS, EMBLEM_SHAPES, EMBLEM_SIGNS, LIMITS, VICTORY_RULES, progress, routeKey, winner,
  type BattleRow, type Board, type Camp, type CampId, type Effect, type EmblemShape, type EmblemSign, type LogRow, type Member, type VictoryRule,
} from '../../lib/narrative';
import { drawEmblem } from '../../visual/networkMap';

/** Side panels of a narrative campaign: camps, actions, battles, victory, players, and the journal. */

export function Emblem({ camp, size = 22 }: { camp: Pick<Camp, 'color' | 'shape' | 'sign'>; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!, ctx = c.getContext('2d')!;
    c.width = c.height = size * 4;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, size * 2, size * 2);
    drawEmblem(ctx, camp, size, size, size * 0.85);
  }, [camp.color, camp.shape, camp.sign, size]);
  return <canvas ref={ref} className="nc-emblem" style={{ width: size * 2, height: size * 2 }} aria-hidden />;
}

// ---------------------------------------------------------------------------------------------
export function CampsPanel({ board, onEdit, turn }: { board: Board; onEdit: ((b: Board) => void) | null; turn: number }) {
  const t = useT();
  const [hero, setHero] = useState<Record<string, string>>({});
  const setCamp = (id: CampId, patch: Partial<Camp>) => onEdit?.({ ...board, camps: board.camps.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const addCamp = () => {
    const id = CAMP_IDS.find((x) => !board.camps.some((c) => c.id === x));
    if (!id) return;
    onEdit?.({ ...board, camps: [...board.camps, { id, name: t('nc.campN', { id }), color: CAMP_COLORS.find((c) => !board.camps.some((x) => x.color === c)) ?? '#4fd1a5', shape: 'circle', sign: 'star', motto: '', res: 0, heroes: [] }] });
  };
  const removeCamp = (id: CampId) => onEdit?.({
    ...board,
    camps: board.camps.filter((c) => c.id !== id),
    places: board.places.map((p) => (p.owner === id ? { ...p, owner: null, capital: false } : p)),
    routes: board.routes.map((r) => (r.owner === id ? { ...r, owner: board.camps.find((c) => c.id !== id)!.id } : r)),
  });
  return (
    <div className="nc-pane">
      {board.camps.map((c) => {
        const [done, need] = progress(board, c.id, turn);
        return (
          <div key={c.id} className="nc-camp" style={{ borderLeftColor: c.color }}>
            <div className="field-row wrap">
              <Emblem camp={c} />
              {onEdit ? (
                <label className="field grow"><span>{t('nc.campName')}</span><input className="text-input" maxLength={LIMITS.name} value={c.name} onChange={(e) => setCamp(c.id, { name: e.target.value || c.id })} /></label>
              ) : (
                <div className="grow"><strong>{c.name}</strong>{c.motto && <p className="hint">« {c.motto} »</p>}</div>
              )}
              {onEdit && <label className="field"><span>{t('nc.color')}</span><input type="color" className="nc-color" value={c.color} onChange={(e) => setCamp(c.id, { color: e.target.value })} /></label>}
            </div>
            {onEdit && (
              <div className="field-row wrap">
                <label className="field"><span>{t('nc.shape')}</span>
                  <select className="select" value={c.shape} onChange={(e) => setCamp(c.id, { shape: e.target.value as EmblemShape })}>
                    {EMBLEM_SHAPES.map((x) => <option key={x} value={x}>{t(k(`nc.shape.${x}`))}</option>)}
                  </select></label>
                <label className="field"><span>{t('nc.sign')}</span>
                  <select className="select" value={c.sign} onChange={(e) => setCamp(c.id, { sign: e.target.value as EmblemSign })}>
                    {EMBLEM_SIGNS.map((x) => <option key={x} value={x}>{t(k(`nc.sign.${x}`))}</option>)}
                  </select></label>
                <label className="field grow"><span>{t('nc.motto')}</span><input className="text-input" maxLength={LIMITS.motto} value={c.motto} onChange={(e) => setCamp(c.id, { motto: e.target.value })} /></label>
              </div>
            )}
            <div className="field-row wrap">
              <span>{t('nc.resources')}</span>
              {onEdit && <button className="btn small" onClick={() => setCamp(c.id, { res: Math.max(0, c.res - 1) })} aria-label="−1">−</button>}
              <strong>{c.res}</strong>
              {onEdit && <button className="btn small" onClick={() => setCamp(c.id, { res: c.res + 1 })} aria-label="+1">+</button>}
              <span className="hint">· {t('nc.placesHeld', { n: board.places.filter((p) => p.owner === c.id).length })} · {t(k(`nc.progress.${board.victory.rule}`), { done, need })}</span>
            </div>
            <ul className="nc-heroes">
              {c.heroes.map((h, i) => (
                <li key={i} className={h.fallen ? 'fallen' : ''}>
                  <span>{h.name} · XP {h.xp}{h.fallen ? ` · ${t('nc.fallen')}` : ''}</span>
                  {onEdit && <button className="btn small ghost" onClick={() => setCamp(c.id, { heroes: c.heroes.filter((_, j) => j !== i) })} aria-label={t('common.delete')}><Icon name="x" size={12} /></button>}
                </li>
              ))}
              {!c.heroes.length && <li className="hint">{t('nc.noHeroes')}</li>}
            </ul>
            {onEdit && c.heroes.length < LIMITS.heroes && (
              <div className="field-row">
                <input className="text-input grow" maxLength={30} value={hero[c.id] ?? ''} placeholder={t('nc.newHero')} aria-label={t('nc.newHero')} onChange={(e) => setHero({ ...hero, [c.id]: e.target.value })} />
                <button className="btn small" disabled={!hero[c.id]?.trim()} onClick={() => { setCamp(c.id, { heroes: [...c.heroes, { name: hero[c.id].trim(), xp: 0, fallen: false }] }); setHero({ ...hero, [c.id]: '' }); }}>{t('nc.add')}</button>
              </div>
            )}
            {onEdit && board.camps.length > 2 && <button className="btn small danger-ghost" onClick={() => removeCamp(c.id)}>{t('nc.removeCamp')}</button>}
          </div>
        );
      })}
      {onEdit && board.camps.length < 4 && <button className="btn" onClick={addCamp}><Icon name="plus" size={15} /> {t('nc.addCamp', { n: board.camps.length })}</button>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
export function ActionsPanel({ board, myCamp, isMaster, onRecord, onEdit, busy }: {
  board: Board; myCamp: CampId | null; isMaster: boolean; busy: boolean;
  onRecord: (camp: CampId, effect: Effect, target: string | null, amount: number | null, label: string | null, text: string | null) => void;
  onEdit: ((b: Board) => void) | null;
}) {
  const t = useT();
  const camps = isMaster ? board.camps : board.camps.filter((c) => c.id === myCamp);
  const [camp, setCamp] = useState<CampId | ''>(camps[0]?.id ?? '');
  const [kind, setKind] = useState<string>('take');
  const [target, setTarget] = useState('');
  const [amount, setAmount] = useState(1);
  const [text, setText] = useState('');
  const [newAction, setNewAction] = useState({ name: '', effect: 'res' as Effect, amount: 1 });
  useEffect(() => {
    if (!camps.some((c) => c.id === camp)) setCamp(camps[0]?.id ?? '');
  }, [camps, camp]);
  if (!camps.length) return <p className="hint">{t('nc.actionsSpectator')}</p>;
  const custom = kind.startsWith('x') ? board.custom[+kind.slice(1)] : null;
  const effect: Effect = custom ? custom.effect : (kind as Effect);
  const me = board.camps.find((c) => c.id === camp);
  const targets: [string, string][] =
    effect === 'take' ? board.places.filter((p) => p.owner !== camp).map((p) => [String(p.id), p.name])
    : effect === 'fort' ? board.places.filter((p) => p.owner === camp).map((p) => [String(p.id), p.name])
    : effect === 'cut' ? board.routes.filter((r) => !r.cut).map((r) => [routeKey(r), `${board.places.find((p) => p.id === r.a)?.name} – ${board.places.find((p) => p.id === r.b)?.name}`])
    : effect === 'xp' || effect === 'fall' ? (me?.heroes ?? []).map((h, i) => [h, i] as const).filter(([h]) => !h.fallen).map(([h, i]) => [String(i), h.name])
    : [];
  const needsTarget = ['take', 'fort', 'cut', 'xp', 'fall'].includes(effect);
  const tgt = targets.some(([v]) => v === target) ? target : targets[0]?.[0] ?? '';
  const send = () => {
    if (!camp || (needsTarget && !tgt)) return;
    onRecord(camp, effect, needsTarget ? tgt : null, effect === 'res' ? (custom ? custom.amount : amount) : null, custom?.name ?? null, effect === 'event' ? text : null);
    setText('');
  };
  return (
    <div className="nc-pane">
      <div className="card">
        <h3>{t('nc.recordTitle')}</h3>
        <div className="field-grid">
          <label className="field"><span>{t('nc.camp')}</span>
            <select className="select" value={camp} onChange={(e) => setCamp(e.target.value as CampId)}>
              {camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></label>
          <label className="field"><span>{t('nc.action')}</span>
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
              {EFFECTS.map((x) => <option key={x} value={x}>{t(k(`nc.effect.${x}`))}</option>)}
              {board.custom.map((a, i) => <option key={i} value={`x${i}`}>★ {a.name}</option>)}
            </select></label>
          {needsTarget && (
            <label className="field"><span>{t(k(`nc.target.${effect}`))}</span>
              <select className="select" value={tgt} onChange={(e) => setTarget(e.target.value)}>
                {targets.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
          )}
          {effect === 'res' && !custom && (
            <label className="field"><span>{t('nc.amount')}</span><input className="text-input" type="number" min={-10} max={10} value={amount} onChange={(e) => setAmount(Math.max(-10, Math.min(10, Math.round(+e.target.value) || 1)))} /></label>
          )}
        </div>
        {effect === 'event' && <label className="field"><span>{t('nc.eventText')}</span><input className="text-input" maxLength={200} value={text} placeholder={t('nc.eventPlaceholder')} onChange={(e) => setText(e.target.value)} /></label>}
        {custom && <p className="hint">{t('nc.customDoes', { effect: t(k(`nc.effect.${custom.effect}`)), n: custom.amount })}</p>}
        {needsTarget && !targets.length && <p className="hint">{t('nc.noTarget')}</p>}
        <button className="btn primary" disabled={busy || (needsTarget && !tgt) || (effect === 'event' && !text.trim())} onClick={send}><Icon name="check" size={15} /> {t('nc.record')}</button>
      </div>
      {onEdit && (
        <div className="card">
          <h3>{t('nc.customTitle')}</h3>
          <div className="field-grid">
            <label className="field"><span>{t('nc.name')}</span><input className="text-input" maxLength={30} value={newAction.name} placeholder={t('nc.customPlaceholder')} onChange={(e) => setNewAction({ ...newAction, name: e.target.value })} /></label>
            <label className="field"><span>{t('nc.effect')}</span>
              <select className="select" value={newAction.effect} onChange={(e) => setNewAction({ ...newAction, effect: e.target.value as Effect })}>
                {EFFECTS.map((x) => <option key={x} value={x}>{t(k(`nc.effect.${x}`))}</option>)}
              </select></label>
            {newAction.effect === 'res' && <label className="field"><span>{t('nc.amount')}</span><input className="text-input" type="number" min={-10} max={10} value={newAction.amount} onChange={(e) => setNewAction({ ...newAction, amount: Math.max(-10, Math.min(10, Math.round(+e.target.value) || 1)) })} /></label>}
          </div>
          <button className="btn" disabled={!newAction.name.trim() || board.custom.length >= LIMITS.custom}
            onClick={() => { onEdit({ ...board, custom: [...board.custom, { ...newAction, name: newAction.name.trim() }] }); setNewAction({ name: '', effect: 'res', amount: 1 }); }}>
            <Icon name="plus" size={15} /> {t('nc.customCreate')}</button>
          {board.custom.length > 0 && (
            <ul className="nc-custom">
              {board.custom.map((a, i) => (
                <li key={i}>★ {a.name} <span className="hint">({t(k(`nc.effect.${a.effect}`))}{a.effect === 'res' ? ` ${a.amount > 0 ? '+' : ''}${a.amount}` : ''})</span>
                  <button className="btn small ghost" onClick={() => onEdit({ ...board, custom: board.custom.filter((_, j) => j !== i) })} aria-label={t('common.delete')}><Icon name="x" size={12} /></button></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
export function BattlesPanel({ board, battles, myCamp, isMaster, draftPlace, onPlan, onResult, onCancel, busy }: {
  board: Board; battles: BattleRow[]; myCamp: CampId | null; isMaster: boolean; draftPlace: number | null; busy: boolean;
  onPlan: (place: number, title: string, date: string, a: CampId, b: CampId, note: string) => void;
  onResult: (battle: string, winner: CampId) => void;
  onCancel: (battle: string) => void;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const week = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const [f, setF] = useState({ place: draftPlace ?? board.places[0]?.id ?? 0, title: '', date: week, a: (myCamp ?? board.camps[0].id) as CampId, b: board.camps.find((c) => c.id !== (myCamp ?? board.camps[0].id))!.id, note: '' });
  useEffect(() => {
    if (draftPlace !== null) setF((x) => ({ ...x, place: draftPlace }));
  }, [draftPlace]);
  const camp = (id: CampId) => board.camps.find((c) => c.id === id);
  const canAct = (b: BattleRow) => isMaster || (myCamp !== null && b.camps.includes(myCamp));
  const fmt = (d: string) => new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${d}T12:00:00`));
  const planned = battles.filter((b) => b.status === 'planned'), played = battles.filter((b) => b.status === 'played').slice(-5).reverse();
  const canPlan = isMaster || myCamp !== null;
  return (
    <div className="nc-pane">
      {canPlan && board.places.length > 0 && (
        <div className="card">
          <h3>{t('nc.planTitle')}</h3>
          <div className="field-grid">
            <label className="field"><span>{t('nc.placeLabel')}</span>
              <select className="select" value={f.place} onChange={(e) => setF({ ...f, place: +e.target.value })}>
                {board.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></label>
            <label className="field"><span>{t('nc.date')}</span><input className="text-input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
            <label className="field"><span>{t('nc.camp')}</span>
              <select className="select" value={f.a} onChange={(e) => setF({ ...f, a: e.target.value as CampId })}>{board.camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="field"><span>{t('nc.against')}</span>
              <select className="select" value={f.b} onChange={(e) => setF({ ...f, b: e.target.value as CampId })}>{board.camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          </div>
          <label className="field"><span>{t('nc.battleTitle')}</span><input className="text-input" maxLength={60} value={f.title} placeholder={t('nc.battlePlaceholder')} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="field"><span>{t('nc.battleNote')}</span><textarea className="text-input" rows={2} maxLength={600} value={f.note} placeholder={t('nc.battleNotePlaceholder')} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
          {f.a === f.b && <p className="error">{t('nc.sameCamp')}</p>}
          <button className="btn primary" disabled={busy || f.a === f.b || !f.date} onClick={() => { onPlan(f.place, f.title, f.date, f.a, f.b, f.note); setF({ ...f, title: '', note: '' }); }}>
            <Icon name="calendar" size={15} /> {t('nc.planCta')}</button>
        </div>
      )}
      {!planned.length && <p className="hint">{t('nc.noBattles')}</p>}
      {[...planned, ...played].map((b) => {
        const p = board.places.find((x) => x.id === b.place_id), A = camp(b.camps[0]), B = camp(b.camps[1]);
        return (
          <article key={b.id} className={`nc-battle ${b.status}`}>
            <span className="when">{b.status === 'played' ? `${t('nc.played')} · ` : ''}{fmt(b.starts_on)}</span>
            <h3>{b.title || t('nc.battle')} · {p?.name ?? '?'}</h3>
            <div className="nc-vs">{A && <Emblem camp={A} size={13} />}{A?.name ?? '?'}<span>{t('nc.against')}</span>{B && <Emblem camp={B} size={13} />}{B?.name ?? '?'}</div>
            {b.note && <p className="nc-notes">{b.note}</p>}
            {p?.notes && <p className="hint">{t('nc.contextOf', { place: p.name })} {p.notes.split('\n')[0]}</p>}
            {b.status === 'played' && b.winner && <p><strong>{t('nc.wonBy', { camp: camp(b.winner)?.name ?? b.winner })}</strong></p>}
            <div className="field-row wrap">
              {p?.map && <a className="btn small" href={`/play/table-generator?tab=build&map=${p.map}`}><Icon name="map" size={14} /> {t('nc.openMap')}</a>}
              {b.status === 'planned' && canAct(b) && b.camps.map((c) => (
                <button key={c} className="btn small" disabled={busy} onClick={() => onResult(b.id, c)}>{t('nc.victoryOf', { camp: camp(c)?.name ?? c })}</button>
              ))}
              {b.status === 'planned' && canAct(b) && <button className="btn small ghost" disabled={busy} onClick={() => onCancel(b.id)}>{t('common.cancel')}</button>}
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
export function VictoryPanel({ board, onEdit, turn }: { board: Board; onEdit: ((b: Board) => void) | null; turn: number }) {
  const t = useT();
  const w = winner(board, turn);
  return (
    <div className="nc-pane">
      <div className="card">
        <h3>{t('nc.victoryTitle')}</h3>
        {onEdit ? (
          <div className="field-grid">
            <label className="field"><span>{t('nc.rule')}</span>
              <select className="select" value={board.victory.rule} onChange={(e) => onEdit({ ...board, victory: { ...board.victory, rule: e.target.value as VictoryRule } })}>
                {VICTORY_RULES.map((x) => <option key={x} value={x}>{t(k(`nc.rule.${x}`))}</option>)}
              </select></label>
            {board.victory.rule !== 'capital' && (
              <label className="field"><span>N</span><input className="text-input" type="number" min={1} max={99} value={board.victory.n}
                onChange={(e) => onEdit({ ...board, victory: { ...board.victory, n: Math.max(1, Math.min(99, Math.round(+e.target.value) || 1)) } })} /></label>
            )}
          </div>
        ) : (
          <p>{t(k(`nc.rule.${board.victory.rule}`))}{board.victory.rule !== 'capital' ? ` (N = ${board.victory.n})` : ''}</p>
        )}
      </div>
      {board.camps.map((c) => {
        const [done, need] = progress(board, c.id, turn);
        return (
          <div key={c.id} className="nc-progress">
            <span>{c.name} · {t(k(`nc.progress.${board.victory.rule}`), { done, need })}</span>
            <div className="nc-bar"><i style={{ width: `${Math.min(100, (done / Math.max(1, need)) * 100)}%`, background: c.color }} /></div>
          </div>
        );
      })}
      {w && <p className="nc-winner">{t('nc.winner', { camp: w.name })}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
/** One journal line in the reader's language. */
export function useLogText() {
  const t = useT();
  return (l: LogRow, board: Board) => {
    const camp = board.camps.find((c) => c.id === l.camp)?.name ?? l.camp ?? '';
    const d = l.detail as Record<string, string | number | boolean | null>;
    let s: string;
    if (l.effect === 'event') s = d.start ? t('nc.log.start') : camp ? t('nc.log.eventBy', { camp, text: String(d.text ?? '') }) : String(d.text ?? '');
    else if (l.effect === 'take' || l.effect === 'battle') {
      const from = board.camps.find((c) => c.id === d.from)?.name ?? '';
      const base = d.result === 'taken' ? (from ? t('nc.log.takeFrom', { camp, place: String(d.place), from }) : t('nc.log.take', { camp, place: String(d.place) }))
        : d.result === 'resisted' ? t('nc.log.resisted', { camp, place: String(d.place) }) : t('nc.log.held', { camp, place: String(d.place) });
      s = l.effect === 'battle' ? `${t('nc.log.battle', { camp, title: l.label || t('nc.battle') })} ${base}` : base;
    } else if (l.effect === 'fort') s = t('nc.log.fort', { camp, place: String(d.place) });
    else if (l.effect === 'cut') s = d.secret ? t('nc.log.cutSecret', { camp }) : t('nc.log.cut', { camp, a: String(d.a), b: String(d.b) });
    else if (l.effect === 'res') s = t(Number(d.amount) >= 0 ? 'nc.log.resGain' : 'nc.log.resLose', { camp, n: Math.abs(Number(d.amount)) });
    else if (l.effect === 'xp') s = t('nc.log.xp', { hero: String(d.hero), camp, xp: Number(d.xp) });
    else s = t('nc.log.fall', { hero: String(d.hero), camp });
    return l.label && l.effect !== 'battle' ? `★ ${l.label} — ${s}` : s;
  };
}

export function Journal({ log, board, myCamp, isMaster, onContest, onResolve, busy }: {
  log: LogRow[]; board: Board; myCamp: CampId | null; isMaster: boolean; busy: boolean;
  onContest: (id: string) => void; onResolve: (id: string, undo: boolean) => void;
}) {
  const t = useT();
  const text = useLogText();
  const recent = (l: LogRow) => Date.now() - Date.parse(l.created_at) < 48 * 3600e3;
  return (
    <ul className="nc-log">
      {log.map((l) => {
        const color = board.camps.find((c) => c.id === l.camp)?.color;
        return (
          <li key={l.id} className={l.resolution === 'undone' ? 'undone' : ''} style={color ? { borderLeftColor: color } : undefined}>
            <span className="turn">{t('nc.turn', { n: l.turn })}</span>
            <span className="txt">
              {text(l, board)}
              {l.author && <small className="hint"> · {l.author.display_name}</small>}
              {l.contested_by && !l.resolution && <span className="tag pk">{t('nc.contested')}</span>}
              {l.resolution && <span className="tag">{t(k(`nc.resolution.${l.resolution}`))}</span>}
            </span>
            <span className="acts">
              {!l.contested_by && !l.resolution && l.camp && myCamp && myCamp !== l.camp && recent(l) && l.turn > 0 && (
                <button className="btn small ghost" disabled={busy} onClick={() => onContest(l.id)}>{t('nc.contest')}</button>
              )}
              {isMaster && l.contested_by && !l.resolution && (
                <>
                  <button className="btn small" disabled={busy} onClick={() => onResolve(l.id, false)}>{t('nc.keep')}</button>
                  <button className="btn small danger-ghost" disabled={busy} onClick={() => onResolve(l.id, true)}>{t('nc.undo')}</button>
                </>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------
export function MembersPanel({ board, members, isMaster, me, masterId, onSet, onLeave, onInvite, busy }: {
  board: Board; members: Member[]; isMaster: boolean; me: string | null; masterId: string; busy: boolean;
  onSet: (user: string, camp: CampId | null, remove?: boolean) => void; onLeave: () => void; onInvite: () => void;
}) {
  const t = useT();
  return (
    <div className="nc-pane">
      <button className="btn primary" onClick={onInvite}><Icon name="share" size={15} /> {t('nc.invite')}</button>
      <ul className="nc-members">
        {members.map((m) => {
          const c = board.camps.find((x) => x.id === m.camp);
          return (
            <li key={m.user_id}>
              {c ? <Emblem camp={c} size={12} /> : <span className="nc-emblem-empty" />}
              <a href={m.profile ? `/u/${m.profile.handle}` : undefined}>{m.profile?.display_name ?? '?'}</a>
              {m.user_id === masterId && <span className="tag">{t('nc.master')}</span>}
              {isMaster ? (
                <>
                  <select className="select" value={m.camp ?? ''} aria-label={t('nc.camp')} disabled={busy} onChange={(e) => onSet(m.user_id, (e.target.value || null) as CampId | null)}>
                    <option value="">{t('nc.spectator')}</option>
                    {board.camps.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  {m.user_id !== masterId && <button className="btn small ghost" disabled={busy} onClick={() => onSet(m.user_id, null, true)}>{t('nc.remove')}</button>}
                </>
              ) : (
                <span className="hint">{c?.name ?? t('nc.spectator')}</span>
              )}
            </li>
          );
        })}
      </ul>
      {!isMaster && me && members.some((m) => m.user_id === me) && <button className="btn small ghost" disabled={busy} onClick={onLeave}>{t('nc.leave')}</button>}
    </div>
  );
}
