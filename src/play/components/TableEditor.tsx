import { useEffect, useMemo, useRef, useState } from 'react';
import { k, useT } from '../../core/i18n';
import { Icon } from '../../core/ui/ui';
import { DEPLOYMENTS, MAX_PIECES, SIZES, SIZE_ORDER, generate, newSeed, zonesFor, type Deployment, type Table } from '../lib/tableGen';
import { MAX_OBJECTIVES, MAX_TABLE, MIN_TABLE } from '../lib/tableCodec';
import {
  COVERS, KINDS, KIND_DEFAULTS, MAX_SIZE, MIN_SIZE, SHAPES, TRAITS, analyse, footprint, gapBetween, inPolygon, makePiece, mirrorPiece, rotateHandle,
  type Cover, type Piece, type Shape, type TerrainKind, type Trait,
} from '../lib/terrain';
import { COVER_SIGN, TRAIT_SIGN, drawTable } from '../visual/tableMap';

/**
 * Build your own table: add terrain of any kind and shape, drag pieces and objectives where you
 * want, turn them with the round handle (or the slider), set cover and traits, and see at once
 * how the layout compares with common table-building habits.
 */
type Grab = { what: 'piece' | 'rotate' | 'objective'; index: number; dx: number; dy: number; moved: boolean };

const HISTORY = 60;

export function TableEditor({ table, onChange, marks }: { table: Table; onChange: (t: Table) => void; marks: boolean }) {
  const t = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [objective, setObjective] = useState<number | null>(null);
  const [snap, setSnap] = useState(true);
  const [newKind, setNewKind] = useState<TerrainKind>('ruin');
  const [fill, setFill] = useState(10);
  const past = useRef<Table[]>([]);
  const future = useRef<Table[]>([]);
  const grab = useRef<Grab | null>(null);
  const [, redraw] = useState(0);
  const analysis = useMemo(() => analyse(table), [table]);
  const piece = selected != null ? table.pieces[selected] : undefined;

  /** Every change goes through here (undo history, then the page keeps it). */
  const commit = (next: Table, record = true) => {
    if (record) {
      past.current = [...past.current.slice(-HISTORY + 1), table];
      future.current = [];
    }
    onChange(next);
  };
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(table);
    setSelected(null);
    setObjective(null);
    onChange(prev);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(table);
    onChange(next);
  };

  const snapTo = (n: number) => (snap ? Math.round(n * 2) / 2 : Math.round(n * 10) / 10);
  const setPiece = (i: number, patch: Partial<Piece>, record = true) =>
    commit({ ...table, pieces: table.pieces.map((p, j) => (j === i ? { ...p, ...patch } : p)) }, record);

  // Drawing
  useEffect(() => {
    const draw = () => {
      if (!canvas.current || !box.current) return;
      const w = box.current.clientWidth, dpr = Math.min(2, devicePixelRatio || 1);
      const h = (w * table.height) / table.width;
      canvas.current.width = w * dpr;
      canvas.current.height = h * dpr;
      canvas.current.style.height = `${h}px`;
      const ctx = canvas.current.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawTable(ctx, table, w, { marks, selected, selectedObjective: objective });
    };
    draw();
    const ro = new ResizeObserver(draw);
    if (box.current) ro.observe(box.current);
    void document.fonts?.ready.then(draw);
    return () => ro.disconnect();
  }, [table, marks, selected, objective]);

  // Keyboard: delete, undo / redo, arrows to nudge the selected piece
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected != null) {
        e.preventDefault();
        removePiece(selected);
      } else if (selected != null && piece && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 2 : 0.5;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        setPiece(selected, { x: clampX(piece.x + dx), y: clampY(piece.y + dy) });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const clampX = (x: number) => Math.max(0, Math.min(table.width, x));
  const clampY = (y: number) => Math.max(0, Math.min(table.height, y));
  const scale = () => (box.current?.clientWidth ?? 1) / table.width;
  const toInches = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    const s = r.width / table.width;
    return [(e.clientX - r.left) / s, (e.clientY - r.top) / s] as const;
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [x, y] = toInches(e);
    const reach = Math.max(1.2, 16 / scale());
    if (piece && selected != null) {
      const [hx, hy] = rotateHandle(piece);
      if (Math.hypot(x - hx, y - hy) < reach) {
        grab.current = { what: 'rotate', index: selected, dx: 0, dy: 0, moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }
    const o = table.objectives.findIndex((ob) => Math.hypot(ob.x - x, ob.y - y) < reach);
    if (o >= 0) {
      setObjective(o);
      setSelected(null);
      grab.current = { what: 'objective', index: o, dx: table.objectives[o].x - x, dy: table.objectives[o].y - y, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    // Topmost piece first (drawn last)
    for (let i = table.pieces.length - 1; i >= 0; i--) {
      if (inPolygon(x, y, footprint(table.pieces[i]))) {
        setSelected(i);
        setObjective(null);
        grab.current = { what: 'piece', index: i, dx: table.pieces[i].x - x, dy: table.pieces[i].y - y, moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }
    setSelected(null);
    setObjective(null);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = grab.current;
    if (!g) return;
    const [x, y] = toInches(e);
    const first = !g.moved;
    g.moved = true;
    if (g.what === 'objective') {
      const objectives = table.objectives.map((o, i) => (i === g.index ? { x: clampX(snapTo(x + g.dx)), y: clampY(snapTo(y + g.dy)) } : o));
      commit({ ...table, objectives }, first);
    } else if (g.what === 'piece') {
      setPiece(g.index, { x: clampX(snapTo(x + g.dx)), y: clampY(snapTo(y + g.dy)) }, first);
    } else {
      const p = table.pieces[g.index];
      const deg = (Math.atan2(x - p.x, -(y - p.y)) * 180) / Math.PI;
      const step = snap ? 15 : 1;
      setPiece(g.index, { rot: ((Math.round(deg / step) * step) % 360 + 360) % 360 }, first);
    }
  };
  const onUp = () => {
    grab.current = null;
    redraw((n) => n + 1);
  };

  // Actions
  /** First spot, spiralling out from the centre, clear of objectives and 1" away from other pieces. */
  const freeSpot = (p: Piece): Piece => {
    const others = table.pieces.map(footprint);
    for (let r = 0; r < Math.max(table.width, table.height); r += 2) {
      for (let a = 0; a < 360; a += r ? Math.max(10, 360 / (r * 2)) : 360) {
        const x = table.width / 2 + Math.cos((a * Math.PI) / 180) * r, y = table.height / 2 + Math.sin((a * Math.PI) / 180) * r;
        const q = { ...p, x: snapTo(x), y: snapTo(y) };
        const f = footprint(q);
        if (f.some(([fx, fy]) => fx < 0 || fy < 0 || fx > table.width || fy > table.height)) continue;
        if (table.objectives.some((o) => inPolygon(o.x, o.y, f) || f.some(([fx, fy]) => Math.hypot(fx - o.x, fy - o.y) < 1.5))) continue;
        if (others.some((o) => gapBetween(o, f) < 1)) continue;
        return q;
      }
    }
    return p;
  };
  const addPiece = () => {
    if (table.pieces.length >= MAX_PIECES) return;
    const p = freeSpot(makePiece(newKind, table.width / 2, table.height / 2, newSeed()));
    commit({ ...table, pieces: [...table.pieces, p] });
    setSelected(table.pieces.length);
    setObjective(null);
  };
  const duplicate = (i: number, mirrored: boolean) => {
    if (table.pieces.length >= MAX_PIECES) return;
    const p = table.pieces[i];
    const copy = mirrored ? mirrorPiece(p, table.width, table.height, p.seed) : { ...p, traits: [...p.traits], x: clampX(p.x + 2), y: clampY(p.y + 2), seed: newSeed() };
    commit({ ...table, pieces: [...table.pieces, copy] });
    setSelected(table.pieces.length);
  };
  const removePiece = (i: number) => {
    commit({ ...table, pieces: table.pieces.filter((_, j) => j !== i) });
    setSelected(null);
  };
  const addObjective = () => {
    if (table.objectives.length >= MAX_OBJECTIVES) return;
    commit({ ...table, objectives: [...table.objectives, { x: table.width / 2, y: table.height / 2 }] });
    setObjective(table.objectives.length);
    setSelected(null);
  };
  const removeObjective = (i: number) => {
    commit({ ...table, objectives: table.objectives.filter((_, j) => j !== i) });
    setObjective(null);
  };
  const resize = (w: number, h: number) => {
    const W = Math.round(Math.max(MIN_TABLE, Math.min(MAX_TABLE, w || MIN_TABLE)));
    const H = Math.round(Math.max(MIN_TABLE, Math.min(MAX_TABLE, h || MIN_TABLE)));
    // Pieces and objectives keep their place relative to the table
    const fx = W / table.width, fy = H / table.height;
    commit({
      ...table,
      width: W,
      height: H,
      zones: zonesFor(table.deployment, W, H),
      pieces: table.pieces.map((p) => ({ ...p, x: snapTo(p.x * fx), y: snapTo(p.y * fy) })),
      objectives: table.objectives.map((o) => ({ x: snapTo(o.x * fx), y: snapTo(o.y * fy) })),
    });
  };
  const setDeployment = (d: Deployment) => commit({ ...table, deployment: d, zones: zonesFor(d, table.width, table.height) });
  const randomFill = () => {
    const g = generate({ mode: 'casual', size: 0, density: 'standard', theme: 'city', seed: newSeed(), count: fill, dims: [table.width, table.height] });
    commit({ ...table, pieces: g.pieces });
    setSelected(null);
  };
  const clear = () => {
    commit({ ...table, pieces: [], objectives: [], mission: '', extra: 'none', mode: 'custom' });
    setSelected(null);
    setObjective(null);
  };
  const toggleTrait = (tr: Trait) =>
    piece && selected != null && setPiece(selected, { traits: piece.traits.includes(tr) ? piece.traits.filter((x) => x !== tr) : [...piece.traits, tr] });
  const changeKind = (kind: TerrainKind) => {
    if (!piece || selected == null) return;
    const d = KIND_DEFAULTS[kind];
    setPiece(selected, { kind, shape: d.shape, cover: d.cover, traits: [...d.traits] });
  };
  const sizeIndex = SIZES.findIndex(([w, h]) => w === table.width && h === table.height);
  const percent = (n: number) => `${Math.round(n * 100)} %`;

  return (
    <div className="table-editor">
      <div ref={box} className="table-canvas editing">
        <canvas
          ref={canvas}
          role="img"
          aria-label={t('table.aria', { w: table.width, h: table.height, n: table.pieces.length })}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      </div>

      {piece && selected != null && (
        <section className="card piece-panel">
          <h2>{t(k(`terrain.kind.${piece.kind}`))}</h2>
          <div className="field-grid">
            <label className="field"><span>{t('tableEd.kind')}</span>
              <select className="select" value={piece.kind} onChange={(e) => changeKind(e.target.value as TerrainKind)}>
                {KINDS.map((x) => <option key={x} value={x}>{t(k(`terrain.kind.${x}`))}</option>)}
              </select></label>
            <label className="field"><span>{t('tableEd.shape')}</span>
              <select className="select" value={piece.shape} onChange={(e) => setPiece(selected, { shape: e.target.value as Shape })}>
                {SHAPES.map((x) => <option key={x} value={x}>{t(k(`terrain.shape.${x}`))}</option>)}
              </select></label>
            <label className="field"><span>{t('tableEd.pieceWidth')}</span>
              <input className="text-input" type="number" step={0.5} min={MIN_SIZE} max={MAX_SIZE} value={piece.w}
                onChange={(e) => setPiece(selected, { w: Math.max(MIN_SIZE, Math.min(MAX_SIZE, +e.target.value || MIN_SIZE)) })} /></label>
            <label className="field"><span>{t('tableEd.pieceDepth')}</span>
              <input className="text-input" type="number" step={0.5} min={MIN_SIZE} max={MAX_SIZE} value={piece.h}
                onChange={(e) => setPiece(selected, { h: Math.max(MIN_SIZE, Math.min(MAX_SIZE, +e.target.value || MIN_SIZE)) })} /></label>
          </div>
          <label className="field"><span>{t('tableEd.rotation', { deg: Math.round(piece.rot) })}</span>
            <span className="field-row">
              <button className="btn small" onClick={() => setPiece(selected, { rot: (piece.rot + 345) % 360 })} aria-label="-15°">−15°</button>
              <input type="range" min={0} max={359} value={Math.round(piece.rot)} onChange={(e) => setPiece(selected, { rot: +e.target.value }, false)} />
              <button className="btn small" onClick={() => setPiece(selected, { rot: (piece.rot + 15) % 360 })} aria-label="+15°">+15°</button>
            </span></label>
          <label className="field"><span>{t('tableEd.cover')}</span>
            <select className="select" value={piece.cover} onChange={(e) => setPiece(selected, { cover: e.target.value as Cover })}>
              {COVERS.map((c) => <option key={c} value={c}>{COVER_SIGN[c] ? `${COVER_SIGN[c]} ` : ''}{t(k(`terrain.cover.${c}`))}</option>)}
            </select></label>
          <fieldset className="trait-list">
            <legend>{t('tableEd.traits')}</legend>
            {TRAITS.map((tr) => (
              <label key={tr} className="check"><input type="checkbox" checked={piece.traits.includes(tr)} onChange={() => toggleTrait(tr)} /> {TRAIT_SIGN[tr]} {t(k(`terrain.trait.${tr}`))}</label>
            ))}
          </fieldset>
          <div className="field-row wrap">
            <button className="btn small" onClick={() => duplicate(selected, false)}><Icon name="copy" size={14} /> {t('tableEd.duplicate')}</button>
            <button className="btn small" onClick={() => duplicate(selected, true)}><Icon name="split" size={14} /> {t('tableEd.mirror')}</button>
            <button className="btn small danger-ghost" onClick={() => removePiece(selected)}><Icon name="trash" size={14} /> {t('common.delete')}</button>
          </div>
        </section>
      )}
      {objective != null && table.objectives[objective] && (
        <section className="card piece-panel">
          <h2>{t('tableEd.objectiveN', { n: objective + 1 })}</h2>
          <button className="btn small danger-ghost" onClick={() => removeObjective(objective)}><Icon name="trash" size={14} /> {t('common.delete')}</button>
        </section>
      )}

      <section className="card table-controls">
        <div className="field-row wrap">
          <select className="select" value={newKind} onChange={(e) => setNewKind(e.target.value as TerrainKind)} aria-label={t('tableEd.kind')}>
            {KINDS.map((x) => <option key={x} value={x}>{t(k(`terrain.kind.${x}`))}</option>)}
          </select>
          <button className="btn primary" onClick={addPiece} disabled={table.pieces.length >= MAX_PIECES}><Icon name="plus" size={15} /> {t('tableEd.addPiece')}</button>
          <button className="btn" onClick={addObjective} disabled={table.objectives.length >= MAX_OBJECTIVES}><Icon name="target" size={15} /> {t('tableEd.addObjective')}</button>
        </div>
        <div className="field-row wrap">
          <label className="field inline"><span>{t('tableEd.fillCount')}</span>
            <input className="text-input narrow-num" type="number" min={0} max={MAX_PIECES} value={fill} onChange={(e) => setFill(Math.max(0, Math.min(MAX_PIECES, +e.target.value || 0)))} /></label>
          <button className="btn" onClick={randomFill}><Icon name="sparkle" size={15} /> {t('tableEd.fill')}</button>
          <button className="btn ghost" onClick={clear} disabled={!table.pieces.length && !table.objectives.length}><Icon name="trash" size={15} /> {t('tableEd.clear')}</button>
        </div>
        <div className="field-row wrap">
          <button className="btn small" onClick={undo} disabled={!past.current.length}><Icon name="undo" size={14} /> {t('tableEd.undo')}</button>
          <button className="btn small" onClick={redo} disabled={!future.current.length}><Icon name="redo" size={14} /> {t('tableEd.redo')}</button>
          <label className="check"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> {t('tableEd.snap')}</label>
          <span className="tag">{t('tableEd.count', { n: table.pieces.length, max: MAX_PIECES })}</span>
        </div>
        <p className="hint">{t('tableEd.help')}</p>
      </section>

      <section className="card table-controls">
        <label className="field"><span>{t('tableEd.name')}</span>
          <input className="text-input" maxLength={60} value={table.name ?? ''} placeholder={t('tableEd.namePlaceholder')}
            onChange={(e) => commit({ ...table, name: e.target.value }, false)} /></label>
        <div className="field-grid">
          <label className="field"><span>{t('table.size')}</span>
            <select className="select" value={sizeIndex} onChange={(e) => {
              const i = +e.target.value;
              if (i >= 0) resize(SIZES[i][0], SIZES[i][1]);
              else resize(table.width, table.height);
            }}>
              {SIZE_ORDER.map((i) => <option key={i} value={i}>{SIZES[i][0]}″ × {SIZES[i][1]}″</option>)}
              <option value={-1}>{t('tableEd.customSize')}</option>
            </select></label>
          <label className="field"><span>{t('tableEd.width')}</span>
            <input className="text-input" type="number" min={MIN_TABLE} max={MAX_TABLE} value={table.width} onChange={(e) => resize(+e.target.value, table.height)} /></label>
          <label className="field"><span>{t('tableEd.height')}</span>
            <input className="text-input" type="number" min={MIN_TABLE} max={MAX_TABLE} value={table.height} onChange={(e) => resize(table.width, +e.target.value)} /></label>
          <label className="field"><span>{t('table.deploymentLabel')}</span>
            <select className="select" value={table.deployment} onChange={(e) => setDeployment(e.target.value as Deployment)}>
              {DEPLOYMENTS.map((d) => <option key={d} value={d}>{t(k(`table.deploy.${d}`))}</option>)}
            </select></label>
        </div>
      </section>

      <section className="card table-check">
        <h2>{t('tableEd.checkTitle')}</h2>
        <div className="check-stats">
          <span><strong>{percent(analysis.coverage)}</strong> {t('tableEd.coverage')}</span>
          {COVERS.filter((c) => c !== 'none').map((c) => <span key={c}>{COVER_SIGN[c]} <strong>{analysis.byCover[c]}</strong> {t(k(`terrain.cover.${c}`))}</span>)}
          {analysis.blockedLanes !== null && <span><strong>{percent(analysis.blockedLanes)}</strong> {t('tableEd.lanes')}</span>}
        </div>
        <ul className="check-tips">
          {analysis.tips.map((tip) => (
            <li key={tip} className={tip === 'balanced' ? 'good' : ''}>{t(k(`tableEd.tip.${tip}`), { n: tip === 'narrow' ? analysis.narrow : tip === 'offTable' ? analysis.offTable : analysis.objectiveBlocked })}</li>
          ))}
        </ul>
        <p className="hint">{t('tableEd.checkHint')}</p>
      </section>
    </div>
  );
}

/** Legend of the signs drawn on the map (cover first, then traits). */
export function TerrainLegend() {
  const t = useT();
  return (
    <ul className="terrain-legend">
      {COVERS.filter((c) => c !== 'none').map((c) => <li key={c}><span className="sign">{COVER_SIGN[c]}</span> {t(k(`terrain.cover.${c}`))}</li>)}
      {TRAITS.map((tr) => <li key={tr}><span className="sign">{TRAIT_SIGN[tr]}</span> {t(k(`terrain.trait.${tr}`))}</li>)}
    </ul>
  );
}
