import { useId, useMemo, useState } from 'react';
import { k, useT } from '../../core/i18n';
import { Icon } from '../../core/ui/ui';
import { cleanInfo, type InfoLine } from '../hobby/cards';
import { ROLES, STAGES, useHobby, type Army, type Role, type Stage, type Unit } from '../hobby/store';
import { InfoEditor } from './UnitCard';

/** Name of the cost of an army: its own (Points, Power, Crowns…) or the "Points" label. */
export function useCostLabel() {
  const t = useT();
  return (a?: Pick<Army, 'costLabel'>) => a?.costLabel?.trim() || t('cards.row.points');
}
/** Labels that count as the cost of a unit in this army. */
export function useCostLabels() {
  const t = useT();
  return (a?: Pick<Army, 'costLabel'>) => [a?.costLabel?.trim() || '', t('cards.row.points'), t('pile.pts'), 'points', 'pts'].filter(Boolean);
}

const isLabel = (x: InfoLine, labels: string[]) => x.t === 'n' && labels.some((l) => l.trim().toLowerCase() === x.l.trim().toLowerCase());

/**
 * Adding a unit in one go (owner request 2026-11-28): name, role, miniatures, painted, stage, cost
 * and the card rows below. Typing the name suggests the player's units of the same name, in any army
 * or list, and copies their card in one tap.
 */
export function AddUnitForm({ army, onAdded }: { army: Army; onAdded?: (id: string) => void }) {
  const t = useT();
  const listId = useId();
  const armies = useHobby((s) => s.armies);
  const costLabel = useCostLabel()(army);
  const costLabels = useCostLabels()(army);
  const empty = { name: '', role: 'troop' as Role, count: 1, painted: 0, stage: 'box' as Stage, cost: '' as number | '', info: [] as InfoLine[] };
  const [f, setF] = useState(empty);
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  const all = useMemo(() => armies.flatMap((a) => a.units.map((u) => ({ u, a }))), [armies]);
  const names = useMemo(() => [...new Set(all.map(({ u }) => u.name.trim()).filter(Boolean))].slice(0, 300), [all]);
  const q = f.name.trim().toLowerCase();
  const same = q.length >= 2 ? all.filter(({ u }) => u.name.trim().toLowerCase() === q).slice(0, 3) : [];

  const copy = (u: Unit, from: Army) => {
    const labels = [...costLabels, from.costLabel ?? ''].filter(Boolean);
    const rows = u.info ?? [];
    const cost = rows.find((x) => isLabel(x, labels));
    set({ name: u.name, role: u.role, count: u.count, cost: cost ? Number(cost.v) : u.points ?? '', info: rows.filter((x) => x !== cost) });
    setOpen(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = f.name.trim().slice(0, 60);
    if (!name) return;
    const rows = f.info.filter((x) => !isLabel(x, costLabels));
    const info = cleanInfo(f.cost === '' ? rows : [{ l: costLabel, t: 'n', v: Number(f.cost) }, ...rows]);
    const id = useHobby.getState().addUnit(army.id, {
      name, role: f.role, count: f.count, painted: Math.min(f.painted, f.count), stage: f.stage, ...(info.length ? { info } : null),
    });
    setF(empty);
    setOpen(false);
    onAdded?.(id);
  };

  return (
    <form className="card add-unit" onSubmit={submit}>
      <div className="add-unit-grid">
        <label className="field add-unit-name"><span>{t('pile.unitName')}</span>
          <input className="text-input" list={listId} value={f.name} maxLength={60} placeholder={t('pile.unitPlaceholder')} onChange={(e) => set({ name: e.target.value })} />
          <datalist id={listId}>{names.map((n) => <option key={n} value={n} />)}</datalist>
        </label>
        <label className="field"><span>{t('pile.role')}</span>
          <select className="select" value={f.role} onChange={(e) => set({ role: e.target.value as Role })}>
            {ROLES.map((r) => <option key={r} value={r}>{t(k(`role.${r}`))}</option>)}
          </select></label>
        <label className="field"><span>{t('pile.count')}</span>
          <input className="num-input" type="number" min={1} max={999} value={f.count} onChange={(e) => set({ count: Math.max(1, Math.min(999, +e.target.value || 1)) })} /></label>
        <label className="field"><span>{t('pile.paintedCount')}</span>
          <input className="num-input" type="number" min={0} max={f.count} value={f.painted} onChange={(e) => set({ painted: Math.max(0, +e.target.value || 0) })} /></label>
        <label className="field"><span>{t('pile.stage')}</span>
          <select className="select" value={f.stage} onChange={(e) => set({ stage: e.target.value as Stage })}>
            {STAGES.map((st) => <option key={st} value={st}>{t(k(`stage.${st}`))}</option>)}
          </select></label>
        <label className="field"><span>{costLabel}</span>
          <input className="num-input" type="number" min={0} max={999999} value={f.cost} onChange={(e) => set({ cost: e.target.value === '' ? '' : Math.max(0, +e.target.value) })} /></label>
      </div>
      {same.length > 0 && (
        <div className="add-unit-same" aria-live="polite">
          {same.map(({ u, a }) => (
            <button key={u.id} type="button" className="chip small" onClick={() => copy(u, a)}>
              <Icon name="copy" size={13} /> {t('mini.copyCard', { army: a.name })}
            </button>
          ))}
        </div>
      )}
      <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t(open ? 'mini.hideCard' : 'mini.showCard')}{f.info.length ? ` (${f.info.length})` : ''}
      </button>
      {open && <InfoEditor lines={f.info} onChange={(info) => set({ info })} />}
      <div className="nav-row">
        <button className="btn primary" disabled={!f.name.trim()}><Icon name="plus" size={16} /> {t('pile.addUnit')}</button>
      </div>
    </form>
  );
}
