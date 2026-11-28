import { useState } from 'react';
import { k, useT } from '../../core/i18n';
import { Icon, IconButton, Modal } from '../../core/ui/ui';
import { cleanInfo, sectionRow, LABEL_MAX, type InfoLine } from '../../paint/hobby/cards';
import { ROLES, useHobby, type Role } from '../../paint/hobby/store';
import { parseListText, type ImportedList, type ImportedUnit } from '../lib/listImport';

/** Card rows of an imported unit: its cost, then a Wargear section with its extra lines and one text row per weapon or wargear. */
export function importInfo(u: ImportedUnit, costLabel: string, wargear: string): InfoLine[] {
  const rows: InfoLine[] = [];
  if (u.cost != null) rows.push({ l: costLabel, t: 'n', v: u.cost });
  // Wargear and extra lines go in their own section, ready for the player's other sections
  if (u.notes.length + u.gear.length) rows.push(sectionRow(wargear.slice(0, LABEL_MAX)));
  for (const [l, v] of u.notes) rows.push({ l: l.slice(0, LABEL_MAX), t: 't', v: l.length > LABEL_MAX ? `${l} ${v}`.trim() : v });
  for (const g of u.gear) {
    const label = `${g.n}x ${g.name}`;
    rows.push({ l: label.slice(0, LABEL_MAX), t: 't', v: label.length > LABEL_MAX ? label : '' });
  }
  return cleanInfo(rows);
}

/**
 * Paste a list exported by a list-building app (official app export or one unit per line), check the
 * preview, then create or complete the army and create the list (owner decisions 2026-11-28).
 * The text never leaves the device; only names and numbers are kept.
 */
export function ListImport({ onClose, onDone }: { onClose: () => void; onDone: (armyId: string, deckId: string | null) => void }) {
  const t = useT();
  const armies = useHobby((s) => s.armies);
  const [text, setText] = useState('');
  const [list, setList] = useState<ImportedList | null>(null);
  const [units, setUnits] = useState<ImportedUnit[]>([]);
  const [target, setTarget] = useState('');
  const [armyName, setArmyName] = useState('');
  const [listName, setListName] = useState('');
  const [makeList, setMakeList] = useState(true);
  const [costLabel, setCostLabel] = useState(t('cards.row.points'));
  const [limit, setLimit] = useState<number | ''>('');

  const read = () => {
    const r = parseListText(text);
    setList(r);
    setUnits(r.units);
    setArmyName(r.faction ?? r.name ?? '');
    setListName(r.name ?? r.faction ?? t('mini.importedList'));
    setLimit(r.limit ?? '');
    const same = armies.find((a) => r.faction && a.name.trim().toLowerCase() === r.faction.trim().toLowerCase());
    setTarget(same?.id ?? '');
  };
  const edit = (i: number, patch: Partial<ImportedUnit>) => setUnits(units.map((u, j) => (j === i ? { ...u, ...patch } : u)));
  const total = units.reduce((s, u) => s + (u.cost ?? 0), 0);
  const label = (target && armies.find((a) => a.id === target)?.costLabel) || costLabel.trim() || t('cards.row.points');

  const create = () => {
    const { armyId, deckId } = useHobby.getState().importList({
      armyId: target || null,
      armyName: armyName.trim() || t('mini.importedArmy'),
      costLabel: costLabel.trim().slice(0, 20) || t('cards.row.points'),
      units: units.map((u) => ({ name: u.name.trim().slice(0, 60) || '—', role: u.role, count: u.count, group: u.group, leader: u.leader, info: (l: string) => importInfo(u, l, t('cards.sec.wargear')) })),
      listName: makeList ? listName.trim() || t('mini.importedList') : null,
      limit: limit === '' ? null : limit,
    });
    onDone(armyId, deckId);
  };

  return (
    <Modal title={t('mini.importTitle')} onClose={onClose} wide>
      {!list ? (
        <div className="list-import">
          <p className="hint">{t('mini.importLead')}</p>
          <label className="field"><span>{t('mini.pasteLabel')}</span>
            <textarea className="text-input mono" rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('mini.pastePlaceholder')} autoFocus />
          </label>
          <p className="hint small">{t('mini.importPrivacy')}</p>
          <div className="nav-row">
            <button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
            <button type="button" className="btn primary" disabled={text.trim().length < 5} onClick={read}>{t('mini.read')}</button>
          </div>
        </div>
      ) : (
        <div className="list-import">
          <p className="hint">{t(list.format === 'app' ? 'mini.formatApp' : 'mini.formatFree', { n: units.length })}</p>
          {units.length === 0 ? <p className="error">{t('mini.noUnits')}</p> : (
            <>
              <div className="field-grid">
                <label className="field"><span>{t('mini.army')}</span>
                  <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="">{t('mini.newArmy')}</option>
                    {armies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select></label>
                {!target && (
                  <>
                    <label className="field"><span>{t('pile.armyName')}</span>
                      <input className="text-input" value={armyName} maxLength={60} onChange={(e) => setArmyName(e.target.value)} /></label>
                    <label className="field"><span>{t('mini.costLabel')}</span>
                      <input className="text-input" value={costLabel} maxLength={20} onChange={(e) => setCostLabel(e.target.value)} /></label>
                  </>
                )}
              </div>
              <label className="check-row"><input type="checkbox" checked={makeList} onChange={(e) => setMakeList(e.target.checked)} /> {t('mini.makeList')}</label>
              {makeList && (
                <div className="field-grid">
                  <label className="field"><span>{t('mini.listName')}</span>
                    <input className="text-input" value={listName} maxLength={60} onChange={(e) => setListName(e.target.value)} /></label>
                  <label className="field"><span>{t('mini.limit', { label })}</span>
                    <input className="num-input" type="number" min={1} max={100000} value={limit} onChange={(e) => setLimit(e.target.value === '' ? '' : Math.max(1, +e.target.value))} /></label>
                </div>
              )}
              <ul className="import-units">
                {units.map((u, i) => (
                  <li key={i} className={u.group != null ? 'grouped' : ''}>
                    <input className="text-input" value={u.name} maxLength={60} aria-label={t('pile.unitName')} onChange={(e) => edit(i, { name: e.target.value })} />
                    <select className="select" value={u.role} aria-label={t('pile.role')} onChange={(e) => edit(i, { role: e.target.value as Role })}>
                      {ROLES.map((r) => <option key={r} value={r}>{t(k(`role.${r}`))}</option>)}
                    </select>
                    <input className="num-input" type="number" min={1} max={999} value={u.count} aria-label={t('pile.count')} onChange={(e) => edit(i, { count: Math.max(1, +e.target.value || 1) })} />
                    <input className="num-input" type="number" min={0} value={u.cost ?? ''} aria-label={label} onChange={(e) => edit(i, { cost: e.target.value === '' ? null : Math.max(0, +e.target.value) })} />
                    <IconButton icon="trash" label={t('common.delete')} size={14} onClick={() => setUnits(units.filter((_, j) => j !== i))} />
                    <small className="import-meta">
                      {u.leader && <><Icon name="link" size={12} /> {t('mini.leads')} · </>}
                      {t('mini.gearN', { n: u.gear.length + u.notes.length })}
                    </small>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="nav-row import-foot">
            {units.length > 0 && (
              <p className={`mini-total ${limit !== '' && total > limit ? 'over' : ''}`}>
                <b>{total}</b>{limit !== '' && <> / {limit}</>} {label}
                {list.total != null && list.total !== total && <span className="hint"> · {t('mini.listSays', { n: list.total })}</span>}
              </p>
            )}
            <span className="spacer" />
            <button type="button" className="btn ghost" onClick={() => setList(null)}>{t('common.back')}</button>
            <button type="button" className="btn primary" disabled={!units.length} onClick={create}><Icon name="check" size={16} /> {t('mini.create')}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
