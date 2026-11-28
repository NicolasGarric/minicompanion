import { useState } from 'react';
import { k, useT } from '../../core/i18n';
import { Icon, Modal } from '../../core/ui/ui';
import { cardPhotoOf, unitCost, useHobby, ARMY_INKS, type Army, type LocalDeck, type Unit } from '../../paint/hobby/store';
import { UnitCard, useInfoOf, usePhotoUrls, type CardView } from '../../paint/components/UnitCard';
import { AddUnitForm, useCostLabel, useCostLabels } from '../../paint/components/AddUnitForm';
import { ListImport } from '../components/ListImport';
import { ROLE_INK } from '../../paint/hobby/deck';

/**
 * Play › My miniatures (owner decisions 2026-11-28): the armies of My pile seen for playing. Each
 * army names its cost (Points, Power…), lists its units with miniatures and cost, and opens each
 * unit's card; the played lists (decks) show their total against their limit. A pasted text list
 * creates the army and the list in one go. Painting progress stays in Paint › My pile.
 */
export function MyMiniatures() {
  const t = useT();
  const armies = useHobby((s) => s.armies);
  const decks = useHobby((s) => s.decks);
  const [importing, setImporting] = useState(false);
  const [open, setOpen] = useState<string | null>(armies[0]?.id ?? null);
  const [newArmy, setNewArmy] = useState('');
  const [card, setCard] = useState<{ army: Army; unit: Unit } | null>(null);

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newArmy.trim()) return;
    const id = useHobby.getState().addArmy(newArmy.trim().slice(0, 60), ARMY_INKS[armies.length % ARMY_INKS.length]);
    setNewArmy('');
    setOpen(id);
  };

  return (
    <div className="narrow mini">
      <div className="page-head">
        <div>
          <h1>{t('mini.title')}</h1>
          <p className="lead">{t('mini.lead')}</p>
        </div>
      </div>
      <div className="field-row wrap">
        <button className="btn primary" onClick={() => setImporting(true)}><Icon name="upload" size={16} /> {t('mini.import')}</button>
        <form className="field-row" onSubmit={create}>
          <input className="text-input" value={newArmy} maxLength={60} placeholder={t('mini.newArmyPlaceholder')} aria-label={t('pile.armyName')} onChange={(e) => setNewArmy(e.target.value)} />
          <button className="btn" disabled={!newArmy.trim()}><Icon name="plus" size={16} /> {t('mini.newArmy')}</button>
        </form>
      </div>

      <h2>{t('mini.armies')}</h2>
      {armies.length === 0 && <p className="hint">{t('mini.noArmies')}</p>}
      {armies.map((a) => (
        <ArmyBlock key={a.id} army={a} open={open === a.id} onToggle={() => setOpen(open === a.id ? null : a.id)} onCard={(unit) => setCard({ army: a, unit })} />
      ))}

      <h2>{t('mini.lists')}</h2>
      {decks.length === 0 ? <p className="hint">{t('mini.noLists')}</p> : (
        <ul className="mini-lists">
          {decks.map((d) => <ListRow key={d.id} deck={d} armies={armies} />)}
        </ul>
      )}
      <p className="hint small">{t('mini.paintHint')} <a href="/paint/pile">{t('pile.title')}</a></p>

      {importing && (
        <ListImport onClose={() => setImporting(false)} onDone={(armyId) => { setImporting(false); setOpen(armyId); }} />
      )}
      {card && <CardModal army={card.army} unit={card.unit} onClose={() => setCard(null)} />}
    </div>
  );
}

function ArmyBlock({ army, open, onToggle, onCard }: { army: Army; open: boolean; onToggle: () => void; onCard: (u: Unit) => void }) {
  const t = useT();
  const label = useCostLabel()(army);
  const labels = useCostLabels()(army);
  const [adding, setAdding] = useState(false);
  const costs = army.units.map((u) => unitCost(u, labels));
  const total = costs.reduce<number>((s, c) => s + (c ?? 0), 0);
  const figures = army.units.reduce((s, u) => s + u.count, 0);
  const names = new Map(army.units.map((u) => [u.id, u.name]));
  return (
    <section className="card mini-army" style={{ ['--army' as string]: army.colour }}>
      <button type="button" className="mini-army-head" aria-expanded={open} onClick={onToggle}>
        <span className="mini-army-name">{army.name}</span>
        <span className="mini-army-sum">{t('mini.summary', { units: army.units.length, figures })} · <b>{total}</b> {label}</span>
      </button>
      {open && (
        <>
          <label className="field mini-cost-label"><span>{t('mini.costLabel')}</span>
            <input className="text-input" value={army.costLabel ?? ''} placeholder={t('cards.row.points')} maxLength={20}
              onChange={(e) => useHobby.getState().updateArmy(army.id, { costLabel: e.target.value || undefined })} /></label>
          {army.units.length === 0 ? <p className="hint">{t('pile.noUnits')}</p> : (
            <table className="mini-units">
              <thead><tr><th>{t('pile.unitName')}</th><th>{t('pile.role')}</th><th>{t('mini.figuresShort')}</th><th>{label}</th></tr></thead>
              <tbody>
                {army.units.map((u, i) => (
                  <tr key={u.id}>
                    <td>
                      <button type="button" className="mini-unit-name" onClick={() => onCard(u)}>{u.name}</button>
                      {u.linkedTo && names.has(u.linkedTo) && <small className="hint"><Icon name="link" size={11} /> {names.get(u.linkedTo)}</small>}
                    </td>
                    <td><span className={`role-pill role-${u.role}`} style={{ ['--role' as string]: ROLE_INK[u.role] }}>{t(k(`role.${u.role}`))}</span></td>
                    <td className="num">{u.count}</td>
                    <td className="num">{costs[i] ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {adding ? <AddUnitForm army={army} /> : (
            <button className="btn small" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> {t('pile.addUnit')}</button>
          )}
          <p className="small"><a href={`/paint/pile/${army.id}`}>{t('mini.openPile')}</a></p>
        </>
      )}
    </section>
  );
}

function ListRow({ deck, armies }: { deck: LocalDeck; armies: Army[] }) {
  const t = useT();
  const labelsOf = useCostLabels();
  const labelOf = useCostLabel();
  const where = new Map(armies.flatMap((a) => a.units.map((u) => [u.id, { u, a }] as const)));
  const cards = deck.groups.flat().map((id) => where.get(id)).filter((x) => !!x);
  const total = cards.reduce((s, x) => s + (unitCost(x!.u, labelsOf(x!.a)) ?? 0), 0);
  const label = cards[0] ? labelOf(cards[0].a) : t('cards.row.points');
  const over = deck.limit != null && total > deck.limit;
  return (
    <li className="card mini-list">
      <div className="mini-list-head">
        <a href={`/paint/decks/${deck.id}`} className="mini-list-name">{deck.name}</a>
        <span className={`mini-total ${over ? 'over' : ''}`}><b>{total}</b>{deck.limit != null && <> / {deck.limit}</>} {label}</span>
      </div>
      <p className="hint small">{t('cards.cardsN', { n: cards.length })}</p>
      <div className="field-row wrap">
        <label className="field-row"><span className="small">{t('mini.limit', { label })}</span>
          <input className="num-input" type="number" min={1} max={100000} value={deck.limit ?? ''}
            onChange={(e) => useHobby.getState().updateDeck(deck.id, { limit: e.target.value === '' ? undefined : Math.max(1, +e.target.value) })} /></label>
        <a className="btn small" href={`/paint/decks/${deck.id}`}><Icon name="layers" size={14} /> {t('mini.openList')}</a>
      </div>
    </li>
  );
}

/** A unit's card, read-only, with a link to edit it in My pile. */
function CardModal({ army, unit, onClose }: { army: Army; unit: Unit; onClose: () => void }) {
  const t = useT();
  const infoOf = useInfoOf();
  const armies = useHobby((s) => s.armies);
  const ph = cardPhotoOf(unit);
  const urls = usePhotoUrls(ph ? [ph] : []);
  const target = armies.flatMap((a) => a.units).find((u) => u.id === unit.linkedTo);
  const view: CardView = {
    id: unit.id, name: unit.name, role: unit.role, colour: army.colour, photo: ph ? urls.get(ph.id) : undefined,
    rows: infoOf(unit).filter((x) => x.l.trim()), links: target ? [[target.id, target.name]] : [],
  };
  return (
    <Modal title={unit.name} onClose={onClose}>
      <UnitCard card={view} />
      <p className="small"><a href={`/paint/pile/${army.id}`}>{t('mini.editCard')}</a></p>
    </Modal>
  );
}
