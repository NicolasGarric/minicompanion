import { k, useT } from '../../core/i18n';
import { isRefRow } from '../../core/lib/refLinks';
import { cleanInfo, type InfoLine } from '../hobby/cards';
import { ROLES, cardPhotoOf, useHobby, type Army, type Role, type Unit } from '../hobby/store';
import { CardRefsEditor, InfoEditor, UnitCard, useInfoOf, type CardView } from './UnitCard';
import { useCostLabel, useCostLabels } from './AddUnitForm';

const sameLabel = (x: InfoLine, labels: string[]) => x.t === 'n' && labels.some((l) => l.trim().toLowerCase() === x.l.trim().toLowerCase());

/**
 * A unit's card editor, shared by My pile (painting side) and the deck builder, where players manage
 * the technical side of their units (owner request 2026-11-28). With `basics`: name, role, miniatures
 * and cost first. Then the card photo, the link to another unit, the info rows, reference links and
 * the live preview.
 */
export function UnitCardEditor({ army, unit, urls, basics = false }: { army: Army; unit: Unit; urls: Map<string, string>; basics?: boolean }) {
  const t = useT();
  const armies = useHobby((s) => s.armies);
  const { updateUnit } = useHobby.getState();
  const infoOf = useInfoOf();
  const costLabel = useCostLabel()(army);
  const costLabels = useCostLabels()(army);
  const lines = infoOf(unit);
  const set = (patch: Partial<Unit>) => updateUnit(army.id, unit.id, patch);
  const all = armies.flatMap((a) => a.units);
  const linkedHere = all.some((u) => u.linkedTo === unit.id);
  const targets = all.filter((u) => u.id !== unit.id && !u.linkedTo);
  const labels = [...new Set(all.flatMap((u) => u.info ?? []).filter((x) => !isRefRow(x)).map((x) => x.l.trim()).filter(Boolean))].slice(0, 60);
  const ph = cardPhotoOf(unit);
  const target = all.find((u) => u.id === unit.linkedTo);
  const costRow = lines.find((x) => sameLabel(x, costLabels));
  const setCost = (v: string) => {
    const rest = lines.filter((x) => x !== costRow);
    set({ info: cleanInfo(v === '' ? rest : [{ l: costRow?.l ?? costLabel, t: 'n', v: Math.max(0, +v) }, ...rest]) });
  };
  const card: CardView = {
    id: unit.id, name: unit.name, role: unit.role, colour: army.colour, photo: ph ? urls.get(ph.id) : undefined,
    rows: lines.filter((x) => x.l.trim()), links: target ? [[target.id, target.name]] : [],
  };
  return (
    <section className="card-section">
      <h3>{t('cards.title')}</h3>
      <p className="hint">{t('cards.hint')}</p>
      <div className="card-section-grid">
        <div className="card-section-form">
          {basics && (
            <div className="field-grid card-basics">
              <label className="field"><span>{t('pile.unitName')}</span>
                <input className="text-input" value={unit.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} /></label>
              <label className="field"><span>{t('pile.role')}</span>
                <select className="select" value={unit.role} onChange={(e) => set({ role: e.target.value as Role })}>
                  {ROLES.map((r) => <option key={r} value={r}>{t(k(`role.${r}`))}</option>)}
                </select></label>
              <label className="field"><span>{t('pile.count')}</span>
                <input className="num-input" type="number" min={1} max={999} value={unit.count} onChange={(e) => set({ count: +e.target.value || 1 })} /></label>
              <label className="field"><span>{costLabel}</span>
                <input className="num-input" type="number" min={0} max={999999} value={costRow ? Number(costRow.v) : ''} onChange={(e) => setCost(e.target.value)} /></label>
            </div>
          )}
          {unit.photos.length > 0 && (
            <div className="field">
              <span>{t('cards.photo')}</span>
              <div className="card-photos" role="radiogroup" aria-label={t('cards.photo')}>
                {unit.photos.map((p, i) => (
                  <button key={p.id} type="button" role="radio" aria-checked={ph?.id === p.id} className={ph?.id === p.id ? 'on' : ''}
                    onClick={() => set({ cardPhoto: p.id })} aria-label={t('pile.photoN', { n: i + 1 })}>
                    {urls.get(p.id) ? <img src={urls.get(p.id)} alt="" /> : <span className="spinner small" />}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="field">
            <span>{t('cards.linkTo')}</span>
            <select className="select" value={unit.linkedTo ?? ''} disabled={linkedHere}
              onChange={(e) => set({ linkedTo: e.target.value || undefined })}>
              <option value="">{t('cards.noLink')}</option>
              {targets.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            {linkedHere && <small className="hint">{t('cards.othersLinked')}</small>}
          </label>
          <div className="field">
            <span>{t('cards.info')}</span>
            <InfoEditor lines={lines} suggestions={labels} onChange={(info) => set({ info })} />
          </div>
          <div className="field">
            <span>{t('refs.title')}</span>
            <CardRefsEditor lines={lines} onChange={(info) => set({ info })} />
          </div>
        </div>
        <UnitCard card={card} />
      </div>
    </section>
  );
}
