import { useEffect, useMemo, useRef, useState } from 'react';
import { k, localeOf, useLang, useT } from '../../core/i18n';
import { navigate } from '../../core/router';
import { Icon, IconButton, Modal } from '../../core/ui/ui';
import { download, shrinkPhoto } from '../../core/lib/image';
import { ROLES, STAGES, armyStats, photoBlob, useHobby, type Army, type Role, type Stage, type Unit } from '../hobby/store';
import { deckImage, deckLink, deckOf, type Deck } from '../hobby/deck';
import { DeckView } from '../components/DeckCards';
import { TimelapseDialog } from '../components/TimelapseDialog';

/**
 * "My pile": every army as a big halftone gauge (painted miniatures / all miniatures), then the
 * army page with its unit list (tick what is painted), unit photos and the army deck.
 */
const INKS = ['#1d2a5b', '#ff4f7b', '#3b8f6b', '#c8693a', '#5b2a6e', '#2b2b2b', '#3d6b8f', '#a47552'];

export function Pile() {
  const t = useT();
  const armies = useHobby((s) => s.armies);
  const addArmy = useHobby((s) => s.addArmy);
  const [name, setName] = useState('');
  const totals = armies.reduce((acc, a) => {
    const s = armyStats(a);
    return { figures: acc.figures + s.figures, painted: acc.painted + s.painted };
  }, { figures: 0, painted: 0 });

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const id = addArmy(name.trim().slice(0, 60), INKS[armies.length % INKS.length]);
    setName('');
    navigate(`paint/pile/${id}`);
  };

  return (
    <div className="narrow pile">
      <div className="page-head">
        <div>
          <h1>{t('pile.title')}</h1>
          <p className="lead">{t('pile.lead')}</p>
        </div>
        {totals.figures > 0 && (
          <div className="pile-total">
            <span className="big">{totals.figures - totals.painted}</span>
            <span>{t('pile.left')}</span>
          </div>
        )}
      </div>

      <form className="card pile-new" onSubmit={create}>
        <label className="field">
          <span>{t('pile.newArmy')}</span>
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('pile.armyPlaceholder')} maxLength={60} />
        </label>
        <button className="btn primary" disabled={!name.trim()}>
          <Icon name="plus" size={16} /> {t('pile.create')}
        </button>
      </form>

      {armies.length === 0 ? (
        <p className="hint">{t('pile.empty')}</p>
      ) : (
        <div className="gauges">
          {armies.map((a) => <ArmyGauge key={a.id} army={a} />)}
        </div>
      )}
    </div>
  );
}

function ArmyGauge({ army }: { army: Army }) {
  const t = useT();
  const s = armyStats(army);
  const pct = Math.round(s.progress * 100);
  return (
    <a className="gauge-card" href={`/paint/pile/${army.id}`} style={{ ['--army' as string]: army.colour }}>
      <div className="gauge-head">
        <strong>{army.name}</strong>
        <span className="gauge-pct">{pct} %</span>
      </div>
      <div className="gauge-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={army.name}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="gauge-meta">
        <span>{t('pile.paintedOf', { painted: s.painted, figures: s.figures })}</span>
        <span className="muted">{STAGES.filter((st) => s.byStage[st]).map((st) => `${t(k(`stage.${st}`))} ${s.byStage[st]}`).join(' · ')}</span>
      </div>
    </a>
  );
}

export function ArmyPage({ id }: { id: string }) {
  const t = useT();
  const army = useHobby((s) => s.armies.find((a) => a.id === id));
  const { updateArmy, removeArmy, addUnit } = useHobby.getState();
  const [tab, setTab] = useState<'list' | 'deck'>(() => (location.search.includes('tab=deck') ? 'deck' : 'list'));
  const [editing, setEditing] = useState<string | null>(null);
  const [quick, setQuick] = useState({ name: '', count: 1 });
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!army) {
    return (
      <div className="narrow">
        <p className="hint">{t('pile.notFound')}</p>
        <a href="/paint/pile">← {t('pile.title')}</a>
      </div>
    );
  }
  const s = armyStats(army);
  const pct = Math.round(s.progress * 100);
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quick.name.trim()) return;
    addUnit(army.id, { name: quick.name.trim().slice(0, 60), count: quick.count });
    setQuick({ name: '', count: 1 });
  };
  const unit = army.units.find((u) => u.id === editing);

  return (
    <div className="narrow pile" style={{ ['--army' as string]: army.colour }}>
      <a href="/paint/pile" className="small">← {t('pile.title')}</a>
      <div className="page-head army-head">
        <div className="army-title">
          <input className="army-name" value={army.name} aria-label={t('pile.armyName')} maxLength={60}
            onChange={(e) => updateArmy(army.id, { name: e.target.value })} />
          <div className="ink-row" role="radiogroup" aria-label={t('pile.colour')}>
            {INKS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={army.colour === c} className={`ink ${army.colour === c ? 'on' : ''}`}
                style={{ background: c }} aria-label={c} onClick={() => updateArmy(army.id, { colour: c })} />
            ))}
          </div>
        </div>
        <span className="gauge-pct big">{pct} %</span>
      </div>
      <div className="gauge-bar tall"><span style={{ width: `${pct}%` }} /></div>
      <p className="hint">{t('pile.paintedOf', { painted: s.painted, figures: s.figures })}{s.points ? ` · ${s.points} ${t('pile.pts')}` : ''}</p>

      <div className="segmented view-switch" role="tablist">
        <button role="tab" aria-selected={tab === 'list'} className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>{t('pile.tabList')}</button>
        <button role="tab" aria-selected={tab === 'deck'} className={tab === 'deck' ? 'on' : ''} onClick={() => setTab('deck')}>{t('pile.tabDeck')}</button>
      </div>

      {tab === 'list' ? (
        <>
          <form className="unit-quick" onSubmit={add}>
            <input className="text-input" value={quick.name} onChange={(e) => setQuick({ ...quick, name: e.target.value })} placeholder={t('pile.unitPlaceholder')} aria-label={t('pile.unitName')} maxLength={60} />
            <input className="num-input" type="number" min={1} max={999} value={quick.count} onChange={(e) => setQuick({ ...quick, count: Math.max(1, +e.target.value || 1) })} aria-label={t('pile.count')} />
            <button className="btn primary" disabled={!quick.name.trim()}><Icon name="plus" size={16} /> {t('pile.addUnit')}</button>
          </form>
          {army.units.length === 0 ? <p className="hint">{t('pile.noUnits')}</p> : (
            <ul className="unit-list">
              {army.units.map((u) => <UnitRow key={u.id} army={army} unit={u} onEdit={() => setEditing(u.id)} />)}
            </ul>
          )}
          <div className="field-row wrap danger-zone">
            {confirmDelete ? (
              <>
                <span>{t('pile.deleteConfirm')}</span>
                <button className="btn small danger-ghost" onClick={() => { removeArmy(army.id); navigate('paint/pile'); }}>{t('common.delete')}</button>
                <button className="btn small ghost" onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</button>
              </>
            ) : (
              <button className="btn small danger-ghost" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={14} /> {t('pile.deleteArmy')}</button>
            )}
          </div>
        </>
      ) : (
        <ArmyDeck army={army} />
      )}

      {unit && <UnitDialog army={army} unit={unit} onClose={() => setEditing(null)} />}
    </div>
  );
}

function UnitRow({ army, unit, onEdit }: { army: Army; unit: Unit; onEdit: () => void }) {
  const t = useT();
  const { updateUnit, moveUnit } = useHobby.getState();
  const done = unit.painted >= unit.count;
  return (
    <li className={`unit-row ${done ? 'done' : ''}`}>
      <label className="unit-check" title={t('pile.allPainted')}>
        <input type="checkbox" checked={done} onChange={(e) => updateUnit(army.id, unit.id, { painted: e.target.checked ? unit.count : 0 })} />
        <span className="box" aria-hidden />
        <span className="sr-only">{t('pile.allPainted')}</span>
      </label>
      <button className="unit-main" onClick={onEdit}>
        <strong>{unit.name}</strong>
        <small className="muted">{t(k(`role.${unit.role}`))}{unit.points ? ` · ${unit.points} ${t('pile.pts')}` : ''}{unit.photos.length ? ` · ${t('pile.photos', { n: unit.photos.length })}` : ''}</small>
      </button>
      {unit.count > 1 && (
        <span className="unit-count" aria-label={t('pile.paintedOf', { painted: unit.painted, figures: unit.count })}>
          <button className="icon-btn" onClick={() => updateUnit(army.id, unit.id, { painted: unit.painted - 1 })} aria-label={t('pile.lessPainted')} disabled={unit.painted <= 0}>−</button>
          <span className="tab">{unit.painted}/{unit.count}</span>
          <button className="icon-btn" onClick={() => updateUnit(army.id, unit.id, { painted: unit.painted + 1 })} aria-label={t('pile.morePainted')} disabled={done}>+</button>
        </span>
      )}
      <select className="select stage-select" value={unit.stage} onChange={(e) => updateUnit(army.id, unit.id, { stage: e.target.value as Stage })} aria-label={t('pile.stage')}>
        {STAGES.map((st) => <option key={st} value={st}>{t(k(`stage.${st}`))}</option>)}
      </select>
      <span className="unit-move">
        <IconButton icon="up" label={t('colours.layerUp')} size={14} onClick={() => moveUnit(army.id, unit.id, -1)} />
        <IconButton icon="down" label={t('colours.layerDown')} size={14} onClick={() => moveUnit(army.id, unit.id, 1)} />
      </span>
    </li>
  );
}

function UnitDialog({ army, unit, onClose }: { army: Army; unit: Unit; onClose: () => void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { updateUnit, removeUnit, addPhoto, removePhoto, startSession } = useHobby.getState();
  const running = useHobby((s) => s.running);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [story, setStory] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Unit>) => updateUnit(army.id, unit.id, patch);

  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    Promise.all(unit.photos.map(async (p) => {
      const b = await photoBlob(p.id);
      if (!b) return null;
      const u = URL.createObjectURL(b);
      made.push(u);
      return [p.id, u] as const;
    })).then((pairs) => alive && setUrls(new Map(pairs.filter((x): x is readonly [string, string] => !!x))));
    return () => {
      alive = false;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [unit.photos]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of [...files].slice(0, 12)) await addPhoto(army.id, unit.id, await shrinkPhoto(f));
    } finally {
      setBusy(false);
    }
  };
  const fmt = (at: number) => new Date(at).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short' });

  return (
    <Modal title={unit.name} onClose={onClose} wide>
      <div className="unit-dialog">
        <div className="field-grid">
          <label className="field"><span>{t('pile.unitName')}</span>
            <input className="text-input" value={unit.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} /></label>
          <label className="field"><span>{t('pile.role')}</span>
            <select className="select" value={unit.role} onChange={(e) => set({ role: e.target.value as Role })}>
              {ROLES.map((r) => <option key={r} value={r}>{t(k(`role.${r}`))}</option>)}
            </select></label>
          <label className="field"><span>{t('pile.count')}</span>
            <input className="num-input" type="number" min={1} max={999} value={unit.count} onChange={(e) => set({ count: +e.target.value || 1 })} /></label>
          <label className="field"><span>{t('pile.paintedCount')}</span>
            <input className="num-input" type="number" min={0} max={unit.count} value={unit.painted} onChange={(e) => set({ painted: +e.target.value || 0 })} /></label>
          <label className="field"><span>{t('pile.stage')}</span>
            <select className="select" value={unit.stage} onChange={(e) => set({ stage: e.target.value as Stage })}>
              {STAGES.map((st) => <option key={st} value={st}>{t(k(`stage.${st}`))}</option>)}
            </select></label>
          <label className="field"><span>{t('pile.points')}</span>
            <input className="num-input" type="number" min={0} max={99999} value={unit.points ?? ''} onChange={(e) => set({ points: e.target.value ? Math.max(0, +e.target.value) : undefined })} /></label>
        </div>
        <div className="field">
          <span>{t('pile.stars')}</span>
          <div className="stars" role="radiogroup" aria-label={t('pile.stars')}>
            {[0, 1, 2, 3].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={(unit.stars ?? 0) === n} className={(unit.stars ?? 0) === n ? 'on' : ''} onClick={() => set({ stars: n })}>
                {n ? '★'.repeat(n) : '—'}
              </button>
            ))}
          </div>
        </div>
        <label className="field"><span>{t('pile.note')}</span>
          <input className="text-input" value={unit.note ?? ''} maxLength={140} placeholder={t('pile.notePlaceholder')} onChange={(e) => set({ note: e.target.value || undefined })} /></label>

        <h3>{t('pile.stepPhotos')}</h3>
        <p className="hint">{t('pile.stepPhotosHint')}</p>
        <div className="photo-strip">
          {unit.photos.map((p, i) => (
            <figure key={p.id}>
              {urls.get(p.id) ? <img src={urls.get(p.id)} alt={t('pile.photoN', { n: i + 1 })} /> : <span className="spinner small" />}
              <figcaption>{fmt(p.at)}
                <IconButton icon="trash" label={t('common.delete')} size={13} onClick={() => removePhoto(army.id, unit.id, p.id)} />
              </figcaption>
            </figure>
          ))}
          <button className="photo-add" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? <span className="spinner small" /> : <Icon name="plus" size={20} />}
            <span>{t('pile.addPhoto')}</span>
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }} />
        </div>

        <div className="field-row wrap">
          <button className="btn primary" disabled={unit.photos.length < 2} onClick={() => setStory(true)}>
            <Icon name="image" size={16} /> {t('pile.makeStory')}
          </button>
          <button className="btn" disabled={!!running} onClick={() => { startSession(unit.id); navigate('paint/sessions'); }}>
            <Icon name="brush" size={16} /> {t('sessions.startFor')}
          </button>
          <span className="spacer" />
          <button className="btn small danger-ghost" onClick={() => { removeUnit(army.id, unit.id); onClose(); }}>
            <Icon name="trash" size={14} /> {t('pile.deleteUnit')}
          </button>
        </div>
      </div>
      {story && <TimelapseDialog army={army} unit={unit} onClose={() => setStory(false)} />}
    </Modal>
  );
}

function ArmyDeck({ army }: { army: Army }) {
  const t = useT();
  const deck = useMemo(() => deckOf(army), [army]);
  const [covers, setCovers] = useState<Map<number, string>>(new Map());
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // The latest step photo of each unit is its card picture.
  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    Promise.all(army.units.map(async (u, i) => {
      const last = u.photos[u.photos.length - 1];
      const b = last && (await photoBlob(last.id));
      if (!b) return null;
      const url = URL.createObjectURL(b);
      made.push(url);
      return [i, url] as const;
    })).then((pairs) => alive && setCovers(new Map(pairs.filter((x): x is readonly [number, string] => !!x))));
    return () => {
      alive = false;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [army.units]);

  const shareLink = async () => {
    const link = await deckLink(deck);
    try {
      if (navigator.share) await navigator.share({ title: army.name, url: link });
      else {
        await navigator.clipboard.writeText(link);
        setMsg(t('pile.linkCopied'));
      }
    } catch {
      /* closed by the user */
    }
  };
  const shareImage = async () => {
    setBusy(true);
    try {
      const photos = new Map<number, ImageBitmap>();
      for (const [i, url] of covers) photos.set(i, await createImageBitmap(await (await fetch(url)).blob()));
      const blob = await deckImage(deck, { role: (r) => t(k(`role.${r}`)), figures: (n) => t('pile.figures', { n }), pts: t('pile.pts') }, photos);
      const file = new File([blob], `${army.name}.png`, { type: 'image/png' });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: army.name }).catch(() => undefined);
      else download(blob, file.name);
    } finally {
      setBusy(false);
    }
  };

  if (!army.units.length) return <p className="hint">{t('pile.deckEmpty')}</p>;
  return (
    <div className="army-deck">
      <p className="hint">{t('pile.deckHint')}</p>
      <div className="field-row wrap">
        <button className="btn primary" onClick={shareLink}><Icon name="link" size={16} /> {t('pile.shareDeck')}</button>
        <button className="btn" onClick={shareImage} disabled={busy}>{busy ? <span className="spinner small" /> : <Icon name="download" size={16} />} {t('pile.deckImage')}</button>
        {msg && <span className="hint" role="status">{msg}</span>}
      </div>
      <DeckView deck={deck as Deck} covers={covers} />
    </div>
  );
}
