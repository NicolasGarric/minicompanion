import { useEffect, useRef, useState } from 'react';
import { k, useLang, useT } from '../../../core/i18n';
import { Icon } from '../../../core/ui/ui';
import { decodeTable } from '../../lib/tableCodec';
import type { Table } from '../../lib/tableGen';
import {
  BACKGROUNDS, LIMITS, PLACE_TYPES, PLACE_VALUE, ROUTE_TYPES, ZONE_TYPES, nextPlaceId, rollPlaceMap, routeKey,
  type Background, type Board, type CampId, type Place, type PlaceType, type RouteType, type ZoneType,
} from '../../lib/narrative';
import { BOARD_H, BOARD_W, drawNetwork, hitPlace, hitRoute, hitZone, type Flash, type NetworkOptions } from '../../visual/networkMap';
import { drawTable } from '../../visual/tableMap';
import { SCENARIOS, TEMPLATES, loreText, scenarioById, tr } from '../../data/campaignTemplates';
import { ScenarioCard } from './ScenarioCard';

/**
 * The campaign board. Everyone can select a place to read its notes, scenario and table map; the
 * campaign master also draws: places, routes, zones, background, and edits what is selected.
 */
type Tool = 'select' | 'place' | 'route' | 'zone' | 'erase';
type Sel = NetworkOptions['selected'];

const NEW_NAMES = ['Corin', 'Astrel', 'Ulme', 'Phaos', 'Rhyn', 'Tessaly', 'Oren', 'Brume', 'Kalyx', 'Saphène', 'Dorr', 'Évine', 'Mareth', 'Isk', 'Volo'];

export function NetworkBoard({
  board, onEdit, title, subtitle, isolatedLabel, winnerLabel, battlePlaces, flashes, myCamp, onPlanBattle, canPlan,
}: {
  board: Board;
  /** Campaign master only: every change of the board goes through here */
  onEdit: ((b: Board) => void) | null;
  title: string;
  subtitle: string;
  isolatedLabel: string;
  winnerLabel: string | null;
  battlePlaces: Set<number>;
  flashes: Flash[];
  myCamp: CampId | null;
  onPlanBattle: (placeId: number) => void;
  canPlan: boolean;
}) {
  const t = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [placeType, setPlaceType] = useState<PlaceType>('planet');
  const [routeType, setRouteType] = useState<RouteType>('normal');
  const [zoneType, setZoneType] = useState<ZoneType>('nebula');
  const [sel, setSel] = useState<Sel>(null);
  const pending = useRef<number | null>(null);
  const pointer = useRef<[number, number]>([0, 0]);
  const drag = useRef<{ kind: 'place' | 'zone' | 'zoneSize'; id: number; dx: number; dy: number } | null>(null);
  const live = useRef(board);
  live.current = board;
  const names = useRef(0);
  const editing = !!onEdit;

  // Drawing loop (only while visible; still frame when motion is reduced)
  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, visible = true;
    const fit = () => {
      const dpr = Math.min(2, devicePixelRatio || 1), w = c.clientWidth || BOARD_W;
      c.width = Math.round(w * dpr);
      c.height = Math.round(((w * BOARD_H) / BOARD_W) * dpr);
      ctx.setTransform(c.width / BOARD_W, 0, 0, c.height / BOARD_H, 0, 0);
    };
    const draw = (time: number) => {
      drawNetwork(ctx, live.current, {
        t: time, still, selected: selRef.current, flashes, battles: battlePlaces, title, subtitle, isolatedLabel, winner: winnerLabel,
        pending: pending.current !== null ? { from: pending.current, to: pointer.current } : null,
      });
    };
    const loop = (time: number) => {
      draw(time);
      if (visible && !still) raf = requestAnimationFrame(loop);
    };
    fit();
    const ro = new ResizeObserver(() => { fit(); draw(performance.now()); });
    ro.observe(c);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(loop);
    });
    io.observe(c);
    raf = requestAnimationFrame(loop);
    redrawRef.current = () => draw(performance.now());
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [flashes, battlePlaces, title, subtitle, isolatedLabel, winnerLabel]);
  const selRef = useRef<Sel>(null);
  selRef.current = sel;
  const redrawRef = useRef<() => void>(() => undefined);
  useEffect(() => redrawRef.current(), [board, sel]);

  const at = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) * BOARD_W) / r.width, ((e.clientY - r.top) * BOARD_H) / r.height] as [number, number];
  };
  const edit = (b: Board) => onEdit?.(b);

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [x, y] = at(e);
    const b = live.current;
    const p = hitPlace(b, x, y);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (!editing || tool === 'select') {
      if (p) {
        setSel({ kind: 'place', id: p.id });
        if (editing) drag.current = { kind: 'place', id: p.id, dx: p.x - x, dy: p.y - y };
        return;
      }
      const ri = hitRoute(b, x, y);
      if (ri >= 0) return setSel({ kind: 'route', i: ri });
      const zi = editing ? hitZone(b, x, y) : -1;
      if (zi >= 0) {
        setSel({ kind: 'zone', i: zi });
        drag.current = { kind: 'zone', id: zi, dx: b.zones[zi].x - x, dy: b.zones[zi].y - y };
        return;
      }
      return setSel(null);
    }
    if (tool === 'place') {
      if (p) return setSel({ kind: 'place', id: p.id });
      if (b.places.length >= LIMITS.places) return;
      const np: Place = {
        id: nextPlaceId(b), name: NEW_NAMES[names.current++ % NEW_NAMES.length], type: placeType, x, y, owner: null, capital: false, fort: 0,
        value: PLACE_VALUE[placeType], scenario: '', notes: '', map: null,
      };
      edit({ ...b, places: [...b.places, np] });
      setSel({ kind: 'place', id: np.id });
      drag.current = { kind: 'place', id: np.id, dx: 0, dy: 0 };
    } else if (tool === 'route') {
      if (!p) pending.current = null;
      else if (pending.current === null) pending.current = p.id;
      else if (pending.current !== p.id) {
        const a = pending.current;
        if (!b.routes.some((r) => routeKey(r) === routeKey({ a, b: p.id })) && b.routes.length < LIMITS.routes) {
          edit({ ...b, routes: [...b.routes, { a, b: p.id, type: routeType, owner: routeType === 'secret' ? (myCamp ?? b.camps[0].id) : null, cut: false }] });
          setSel({ kind: 'route', i: b.routes.length });
        }
        pending.current = null;
      }
      redrawRef.current();
    } else if (tool === 'zone') {
      if (b.zones.length >= LIMITS.zones) return;
      edit({ ...b, zones: [...b.zones, { x, y, r: 30, type: zoneType }] });
      setSel({ kind: 'zone', i: b.zones.length });
      drag.current = { kind: 'zoneSize', id: b.zones.length, dx: 0, dy: 0 };
    } else if (tool === 'erase') {
      if (p) edit({ ...b, places: b.places.filter((q) => q !== p), routes: b.routes.filter((r) => r.a !== p.id && r.b !== p.id) });
      else {
        const ri = hitRoute(b, x, y);
        if (ri >= 0) edit({ ...b, routes: b.routes.filter((_, i) => i !== ri) });
        else {
          const zi = hitZone(b, x, y);
          if (zi >= 0) edit({ ...b, zones: b.zones.filter((_, i) => i !== zi) });
        }
      }
      setSel(null);
    }
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [x, y] = at(e);
    pointer.current = [x, y];
    const d = drag.current, b = live.current;
    if (!d) {
      if (pending.current !== null) redrawRef.current();
      return;
    }
    if (d.kind === 'place') {
      edit({ ...b, places: b.places.map((p) => (p.id === d.id ? { ...p, x: clamp(Math.round(x + d.dx), 20, BOARD_W - 20), y: clamp(Math.round(y + d.dy), 30, BOARD_H - 20) } : p)) });
    } else if (d.kind === 'zone') {
      edit({ ...b, zones: b.zones.map((z, i) => (i === d.id ? { ...z, x: Math.round(x + d.dx), y: Math.round(y + d.dy) } : z)) });
    } else {
      edit({ ...b, zones: b.zones.map((z, i) => (i === d.id ? { ...z, r: clamp(Math.round(Math.hypot(x - z.x, y - z.y)), 30, 260) } : z)) });
    }
  };
  const onUp = () => {
    drag.current = null;
  };

  const tools: Tool[] = ['select', 'place', 'route', 'zone', 'erase'];
  return (
    <div className="nc-board">
      {editing && (
        <div className="nc-toolbar" role="toolbar" aria-label={t('nc.tools')}>
          <div className="segmented">
            {tools.map((x) => (
              <button key={x} className={tool === x ? 'on' : ''} aria-pressed={tool === x} onClick={() => { setTool(x); pending.current = null; }}>
                {t(k(`nc.tool.${x}`))}
              </button>
            ))}
          </div>
          <label className={`field mini ${tool === 'place' ? '' : 'dim'}`}><span>{t('nc.placeType')}</span>
            <select className="select" value={placeType} onChange={(e) => setPlaceType(e.target.value as PlaceType)}>
              {PLACE_TYPES.map((x) => <option key={x} value={x}>{t(k(`nc.place.${x}`))}</option>)}
            </select></label>
          <label className={`field mini ${tool === 'route' ? '' : 'dim'}`}><span>{t('nc.routeType')}</span>
            <select className="select" value={routeType} onChange={(e) => setRouteType(e.target.value as RouteType)}>
              {ROUTE_TYPES.map((x) => <option key={x} value={x}>{t(k(`nc.route.${x}`))}</option>)}
            </select></label>
          <label className={`field mini ${tool === 'zone' ? '' : 'dim'}`}><span>{t('nc.zoneType')}</span>
            <select className="select" value={zoneType} onChange={(e) => setZoneType(e.target.value as ZoneType)}>
              {ZONE_TYPES.map((x) => <option key={x} value={x}>{t(k(`nc.zone.${x}`))}</option>)}
            </select></label>
          <label className="field mini"><span>{t('nc.background')}</span>
            <select className="select" value={board.bg} onChange={(e) => edit({ ...board, bg: e.target.value as Background })}>
              {BACKGROUNDS.map((x) => <option key={x} value={x}>{t(k(`nc.bg.${x}`))}</option>)}
            </select></label>
        </div>
      )}
      <div className="nc-canvas">
        <canvas ref={canvas} role="img" aria-label={t('nc.boardAria', { places: board.places.length, routes: board.routes.length })}
          className={editing ? 'editing' : ''} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      </div>
      <p className="hint">{editing ? t(k(`nc.toolHint.${tool}`)) : t('nc.readHint')}</p>
      {sel && <Selection board={board} sel={sel} onEdit={onEdit} onClose={() => setSel(null)} onPlanBattle={onPlanBattle} canPlan={canPlan} />}
    </div>
  );
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function Selection({ board, sel, onEdit, onClose, onPlanBattle, canPlan }: {
  board: Board; sel: NonNullable<Sel>; onEdit: ((b: Board) => void) | null; onClose: () => void; onPlanBattle: (id: number) => void; canPlan: boolean;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const ro = !onEdit;
  if (sel.kind === 'place') {
    const p = board.places.find((x) => x.id === sel.id);
    if (!p) return null;
    const set = (patch: Partial<Place>) => onEdit?.({ ...board, places: board.places.map((x) => (x.id === p.id ? { ...x, ...patch } : x)) });
    const owner = board.camps.find((c) => c.id === p.owner);
    const sc = scenarioById(p.sc);
    const lore = loreText(p.lore, lang);
    return (
      <section className="card nc-sel">
        <div className="nc-sel-head">
          <h3>{p.name}</h3>
          <span className="tag">{t(k(`nc.place.${p.type}`))}</span>
          {owner && <span className="tag" style={{ borderColor: owner.color }}>{owner.name}{p.capital ? ` · ${t('nc.capital')}` : ''}</span>}
          <button className="btn small ghost" onClick={onClose} aria-label={t('common.close')}><Icon name="x" size={14} /></button>
        </div>
        {!ro && (
          <div className="field-grid">
            <label className="field"><span>{t('nc.name')}</span><input className="text-input" maxLength={LIMITS.name} value={p.name} onChange={(e) => set({ name: e.target.value || '?' })} /></label>
            <label className="field"><span>{t('nc.placeType')}</span>
              <select className="select" value={p.type} onChange={(e) => set({ type: e.target.value as PlaceType })}>
                {PLACE_TYPES.map((x) => <option key={x} value={x}>{t(k(`nc.place.${x}`))}</option>)}
              </select></label>
            <label className="field"><span>{t('nc.value')}</span><input className="text-input" type="number" min={0} max={5} value={p.value} onChange={(e) => set({ value: clamp(+e.target.value || 0, 0, 5) })} /></label>
            <label className="field"><span>{t('nc.owner')}</span>
              <select className="select" value={p.owner ?? ''} onChange={(e) => set({ owner: (e.target.value || null) as CampId | null, capital: e.target.value ? p.capital : false })}>
                <option value="">{t('nc.free')}</option>
                {board.camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
          </div>
        )}
        {!ro && (
          <div className="field-row wrap">
            <label className="check"><input type="checkbox" checked={p.capital} disabled={!p.owner}
              onChange={(e) => onEdit?.({ ...board, places: board.places.map((x) => (x.id === p.id ? { ...x, capital: e.target.checked } : e.target.checked && x.owner === p.owner ? { ...x, capital: false } : x)) })} /> {t('nc.capitalOf')}</label>
            <span>{t('nc.fort', { n: p.fort })}</span>
            <button className="btn small" onClick={() => set({ fort: Math.max(0, p.fort - 1) })}>−</button>
            <button className="btn small" onClick={() => set({ fort: Math.min(3, p.fort + 1) })}>+</button>
          </div>
        )}
        {lore && <p className="nc-notes nc-lore">{lore}</p>}
        {ro ? (
          <>
            {!sc && p.scenario && <p><span className="tag on">{t('nc.scenario')}</span> {p.scenario}</p>}
            {p.notes ? <p className="nc-notes">{p.notes}</p> : !lore && <p className="hint">{t('nc.noNotes')}</p>}
          </>
        ) : (
          <>
            <label className="field"><span>{t('nc.sc.catalog')}</span>
              <select className="select" value={p.sc ?? ''} onChange={(e) => set({ sc: e.target.value || null })}>
                <option value="">{t('nc.sc.none')}</option>
                {TEMPLATES.map((c) => (
                  <optgroup key={c.key} label={tr(c.title, lang)}>
                    {SCENARIOS.filter((x) => x.campaign === c).map((x) => <option key={x.id} value={x.id}>{x.n}. {tr(x.scenario.title, lang)}</option>)}
                  </optgroup>
                ))}
                <optgroup label={t('nc.sc.free')}>
                  {SCENARIOS.filter((x) => !x.campaign).map((x) => <option key={x.id} value={x.id}>{tr(x.scenario.title, lang)}</option>)}
                </optgroup>
              </select></label>
            {!sc && <label className="field"><span>{t('nc.sc.own')}</span><input className="text-input" maxLength={LIMITS.scenario} value={p.scenario} placeholder={t('nc.scenarioNone')} onChange={(e) => set({ scenario: e.target.value })} /></label>}
            <label className="field"><span>{t('nc.notes')}</span><textarea className="text-input" rows={3} maxLength={LIMITS.notes} value={p.notes} placeholder={t('nc.notesPlaceholder')} onChange={(e) => set({ notes: e.target.value })} /></label>
          </>
        )}
        {sc && <ScenarioCard refd={sc} campA={board.camps[0]?.name ?? 'A'} campB={board.camps[1]?.name ?? 'B'} />}
        <PlaceMap place={p} onSet={ro ? null : (map) => set({ map })} />
        <div className="field-row wrap">
          {canPlan && <button className="btn small primary" onClick={() => onPlanBattle(p.id)}><Icon name="calendar" size={14} /> {t('nc.planHere')}</button>}
          {!ro && <button className="btn small danger-ghost" onClick={() => { onEdit?.({ ...board, places: board.places.filter((x) => x.id !== p.id), routes: board.routes.filter((r) => r.a !== p.id && r.b !== p.id) }); onClose(); }}><Icon name="trash" size={14} /> {t('common.delete')}</button>}
        </div>
      </section>
    );
  }
  if (sel.kind === 'route') {
    const r = board.routes[sel.i];
    if (!r) return null;
    const name = (id: number) => board.places.find((x) => x.id === id)?.name ?? '?';
    const set = (patch: Partial<typeof r>) => onEdit?.({ ...board, routes: board.routes.map((x, i) => (i === sel.i ? { ...x, ...patch } : x)) });
    return (
      <section className="card nc-sel">
        <div className="nc-sel-head">
          <h3>{name(r.a)} – {name(r.b)}</h3>
          <span className="tag">{t(k(`nc.route.${r.type}`))}</span>
          {r.cut && <span className="tag pk">{t('nc.cut')}</span>}
          <button className="btn small ghost" onClick={onClose} aria-label={t('common.close')}><Icon name="x" size={14} /></button>
        </div>
        <p className="hint">{t(k(`nc.routeHint.${r.type}`))}</p>
        {!ro && (
          <div className="field-row wrap">
            <select className="select" value={r.type} aria-label={t('nc.routeType')} onChange={(e) => set({ type: e.target.value as RouteType, owner: e.target.value === 'secret' ? (r.owner ?? board.camps[0].id) : null })}>
              {ROUTE_TYPES.map((x) => <option key={x} value={x}>{t(k(`nc.route.${x}`))}</option>)}
            </select>
            {r.type === 'secret' && (
              <select className="select" value={r.owner ?? ''} aria-label={t('nc.knownBy')} onChange={(e) => set({ owner: e.target.value as CampId })}>
                {board.camps.map((c) => <option key={c.id} value={c.id}>{t('nc.knownByCamp', { camp: c.name })}</option>)}
              </select>
            )}
            <label className="check"><input type="checkbox" checked={r.cut} onChange={(e) => set({ cut: e.target.checked })} /> {t('nc.cut')}</label>
            <button className="btn small danger-ghost" onClick={() => { onEdit?.({ ...board, routes: board.routes.filter((_, i) => i !== sel.i) }); onClose(); }}><Icon name="trash" size={14} /> {t('common.delete')}</button>
          </div>
        )}
      </section>
    );
  }
  const z = board.zones[sel.i];
  if (!z || ro) return null;
  const setZ = (patch: Partial<typeof z>) => onEdit?.({ ...board, zones: board.zones.map((x, i) => (i === sel.i ? { ...x, ...patch } : x)) });
  return (
    <section className="card nc-sel">
      <div className="nc-sel-head"><h3>{t(k(`nc.zone.${z.type}`))}</h3>
        <button className="btn small ghost" onClick={onClose} aria-label={t('common.close')}><Icon name="x" size={14} /></button></div>
      <div className="field-row wrap">
        <select className="select" value={z.type} aria-label={t('nc.zoneType')} onChange={(e) => setZ({ type: e.target.value as ZoneType })}>
          {ZONE_TYPES.map((x) => <option key={x} value={x}>{t(k(`nc.zone.${x}`))}</option>)}
        </select>
        <input type="range" min={30} max={260} value={z.r} aria-label={t('nc.zoneSize')} onChange={(e) => setZ({ r: +e.target.value })} />
        <button className="btn small danger-ghost" onClick={() => { onEdit?.({ ...board, zones: board.zones.filter((_, i) => i !== sel.i) }); onClose(); }}><Icon name="trash" size={14} /> {t('common.delete')}</button>
      </div>
    </section>
  );
}

/** The table map of a place: thumbnail, open in the table editor, roll one, paste a link, detach. */
function PlaceMap({ place, onSet }: { place: Place; onSet: ((map: string | null) => void) | null }) {
  const t = useT();
  const [table, setTable] = useState<Table | null>(null);
  const [link, setLink] = useState('');
  const [bad, setBad] = useState(false);
  const thumb = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!place.map) return setTable(null);
    decodeTable(place.map).then(setTable, () => setTable(null));
  }, [place.map]);
  useEffect(() => {
    if (!table || !thumb.current) return;
    const c = thumb.current, w = 132;
    c.width = w * 2;
    c.height = Math.round(((w * table.height) / table.width) * 2);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    drawTable(ctx, table, w);
  }, [table]);
  const attach = async () => {
    const m = link.match(/map=([jz][A-Za-z0-9_-]+)/) ?? link.trim().match(/^([jz][A-Za-z0-9_-]+)$/);
    try {
      if (!m || m[1].length > 6000) throw new Error('bad');
      await decodeTable(m[1]);
      onSet?.(m[1]);
      setLink('');
      setBad(false);
    } catch {
      setBad(true);
    }
  };
  const editor = place.map ? `/play/table-generator?tab=build&map=${place.map}` : null;
  return (
    <div className="nc-map">
      <span className="field-label">{t('nc.tableMap')}</span>
      <div className="nc-map-row">
        {table && editor && (
          <a href={editor} className="nc-thumb" aria-label={t('nc.openMap')}><canvas ref={thumb} /></a>
        )}
        <div className="nc-map-actions">
          {table ? <p className="hint">{t('games.map.facts', { w: table.width, h: table.height, n: table.pieces.length, o: table.objectives.length })}</p>
            : <p className="hint">{onSet ? t('nc.noMapMaster') : t('nc.noMap')}</p>}
          <div className="field-row wrap">
            {editor && <a className="btn small" href={editor}><Icon name="map" size={14} /> {t('nc.openMap')}</a>}
            {onSet && <button className="btn small" onClick={async () => { const sc = scenarioById(place.sc)?.scenario; onSet(await rollPlaceMap(place, sc ? { theme: sc.theme, deploy: sc.deploy } : {})); }}><Icon name="sparkle" size={14} /> {t(place.map ? 'nc.rollAnother' : 'nc.rollMap')}</button>}
            {onSet && place.map && <button className="btn small ghost" onClick={() => onSet(null)}>{t('nc.detach')}</button>}
          </div>
          {onSet && (
            <div className="field-row wrap">
              <input className="text-input" value={link} onChange={(e) => setLink(e.target.value)} placeholder={t('nc.pasteLink')} aria-label={t('nc.pasteLink')} />
              <button className="btn small" disabled={!link.trim()} onClick={attach}>{t('nc.attach')}</button>
            </div>
          )}
          {bad && <p className="error" role="alert">{t('nc.badLink')}</p>}
        </div>
      </div>
    </div>
  );
}
