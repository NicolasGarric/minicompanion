import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { engine, type Rect } from '../engine/engine';
import { BrushStroke, feather, magicWand, polygonMask, type CombineMode } from '../engine/maskTools';
import { copyRect } from '../engine/maskPatch';
import { Icon, IconButton } from '../../core/ui/ui';
import { translate as tr, useT } from '../../core/i18n';

interface View {
  z: number;
  x: number;
  y: number;
}

const MIN_Z = 0.05;
const MAX_Z = 16;

export function CanvasView() {
  const t = useT();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const zones = useStore((s) => s.zones);
  const primer = useStore((s) => s.primer);
  const maskVersion = useStore((s) => s.maskVersion);
  const tool = useStore((s) => s.tool);
  const brush = useStore((s) => s.brush);
  const showMask = useStore((s) => s.showMask);
  const split = useStore((s) => s.split);
  const activeZoneId = useStore((s) => s.activeZoneId);
  const projectId = useStore((s) => s.projectId);

  const wrapRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View>({ z: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [lasso, setLasso] = useState<{ x: number; y: number }[] | null>(null);
  const [panning, setPanning] = useState(false);
  /** Shows the untouched photo while true (long press on the image, or the hold button). */
  const [peek, setPeek] = useState(false);
  const pressRef = useRef<{ x: number; y: number; img: { x: number; y: number }; timer: number; peeked: boolean } | null>(null);

  const strokeRef = useRef<{ stroke: BrushStroke; zoneId: string; pending: Rect | null; raf: number } | null>(null);
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);
  const splitDragRef = useRef(false);

  // --- Vue ------------------------------------------------------------------------------
  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el || !width) return;
    const pad = 16;
    const z = Math.min((el.clientWidth - pad * 2) / width, (el.clientHeight - pad * 2) / height);
    setView({ z, x: (el.clientWidth - width * z) / 2, y: (el.clientHeight - height * z) / 2 });
  }, [width, height]);

  useLayoutEffect(() => {
    fit();
  }, [fit]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let last = `${el.clientWidth}x${el.clientHeight}`;
    const ro = new ResizeObserver(() => {
      const size = `${el.clientWidth}x${el.clientHeight}`;
      if (size === last) return;
      last = size;
      fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  useEffect(() => {
    const onFit = () => fit();
    window.addEventListener('chroma:fit', onFit);
    return () => window.removeEventListener('chroma:fit', onFit);
  }, [fit]);

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const v = viewRef.current;
    const px = cx ?? el.clientWidth / 2;
    const py = cy ?? el.clientHeight / 2;
    const z = Math.min(MAX_Z, Math.max(MIN_Z, v.z * factor));
    const k = z / v.z;
    setView({ z, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey || !e.shiftKey) {
        zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaY, y: v.y }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpaceDown(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // --- Rendu ----------------------------------------------------------------------------
  const drawOverlay = useCallback(() => {
    const c = overlayRef.current;
    if (!c || !engine.loaded) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    const s = useStore.getState();
    if (!s.showMask || !s.activeZoneId) return;
    const m = engine.masks.get(s.activeZoneId);
    if (!m) return;
    const img = ctx.createImageData(c.width, c.height);
    const d = img.data;
    for (let i = 0; i < m.length; i++) {
      const a = m[i];
      if (!a) continue;
      const p = i * 4;
      d[p] = 255;
      d[p + 1] = 40;
      d[p + 2] = 110;
      d[p + 3] = a * 0.55;
    }
    ctx.putImageData(img, 0, 0);
  }, []);

  useEffect(() => {
    if (!engine.loaded || !resultRef.current) return;
    const id = requestAnimationFrame(() => {
      engine.render(zones, undefined, undefined, primer);
      resultRef.current!.getContext('2d')!.putImageData(engine.out!, 0, 0);
    });
    return () => cancelAnimationFrame(id);
  }, [zones, primer, maskVersion, width, height]);

  useEffect(() => {
    if (!engine.loaded || !sourceRef.current) return;
    sourceRef.current.getContext('2d')!.putImageData(engine.sourceImageData(), 0, 0);
  }, [width, height, projectId]);

  useEffect(() => {
    drawOverlay();
  }, [drawOverlay, showMask, activeZoneId, maskVersion, width]);

  // --- Interaction ----------------------------------------------------------------------
  const toImage = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (e.clientX - r.left - v.x) / v.z, y: (e.clientY - r.top - v.y) / v.z };
  };

  const flushStroke = () => {
    const st = strokeRef.current;
    if (!st) return;
    st.raf = 0;
    const rect = st.pending;
    st.pending = null;
    if (!rect) return;
    const { zones: zs, primer: pr } = useStore.getState();
    engine.render(zs, rect, undefined, pr);
    const w = rect.x1 - rect.x0;
    const h = rect.y1 - rect.y0;
    resultRef.current!.getContext('2d')!.putImageData(engine.out!, 0, 0, rect.x0, rect.y0, w, h);
    if (useStore.getState().showMask) drawOverlay();
  };

  const effectiveTool = spaceDown || panning ? 'hand' : tool;

  const onPointerDown = (e: React.PointerEvent) => {
    if (!engine.loaded) return;
    const el = wrapRef.current!;
    el.setPointerCapture(e.pointerId);
    const s = useStore.getState();
    const p = toImage(e);

    if (e.button === 1 || effectiveTool === 'hand') {
      setPanning(true);
      panRef.current = { sx: e.clientX, sy: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y };
      return;
    }
    if (e.button !== 0) return;

    const pickTool = effectiveTool === 'picker' || (e.altKey && (effectiveTool === 'brush' || effectiveTool === 'eraser'));
    if (pickTool) {
      // Tap = select the colour under the finger (on release); long press = see the original photo.
      const press = { x: e.clientX, y: e.clientY, img: p, peeked: false, timer: 0 };
      press.timer = window.setTimeout(() => {
        press.peeked = true;
        setPeek(true);
      }, 350);
      pressRef.current = press;
      return;
    }

    if (effectiveTool === 'part') {
      s.tapPart(p.x, p.y);
      return;
    }

    const zone = s.zones.find((z) => z.id === s.activeZoneId);
    if (!zone) {
      s.toast(tr('toast.selectZoneFirst'), 'error');
      return;
    }
    if (!zone.visible) {
      s.toast(tr('toast.zoneHidden'), 'error');
      return;
    }

    if (effectiveTool === 'brush' || effectiveTool === 'eraser') {
      const mask = engine.ensureMask(zone.id);
      const stroke = new BrushStroke(mask, {
        ...s.brush,
        erase: effectiveTool === 'eraser',
      });
      strokeRef.current = { stroke, zoneId: zone.id, pending: null, raf: 0 };
      const r = stroke.to(p.x, p.y);
      queueStroke(r);
      return;
    }

    if (effectiveTool === 'wand') {
      const mode: CombineMode = e.shiftKey ? 'add' : e.altKey ? 'subtract' : s.wand.mode;
      let sel = magicWand(p.x, p.y, s.wand.tolerance, s.wand.contiguous);
      sel = feather(sel, s.wand.feather);
      s.applySelection(sel, mode);
      return;
    }

    if (effectiveTool === 'lasso') {
      setLasso([p]);
    }
  };

  const queueStroke = (r: Rect | null) => {
    const st = strokeRef.current;
    if (!st || !r) return;
    engine.growBBox(st.zoneId, r);
    st.pending = st.pending
      ? { x0: Math.min(st.pending.x0, r.x0), y0: Math.min(st.pending.y0, r.y0), x1: Math.max(st.pending.x1, r.x1), y1: Math.max(st.pending.y1, r.y1) }
      : r;
    if (!st.raf) st.raf = requestAnimationFrame(flushStroke);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    setCursor({ x: e.clientX - r.left, y: e.clientY - r.top });
    const press = pressRef.current;
    if (press && !press.peeked && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) {
      clearTimeout(press.timer); // moving is not a tap nor a long press
      pressRef.current = null;
    }

    if (splitDragRef.current) {
      const v = viewRef.current;
      const sx = (e.clientX - r.left - v.x) / (width * v.z);
      useStore.getState().set({ split: Math.min(1, Math.max(0, sx)) });
      return;
    }
    if (panRef.current) {
      const pr = panRef.current;
      setView((v) => ({ ...v, x: pr.vx + e.clientX - pr.sx, y: pr.vy + e.clientY - pr.sy }));
      return;
    }
    if (strokeRef.current) {
      const events = (e.nativeEvent.getCoalescedEvents?.() ?? []) as PointerEvent[];
      const list = events.length ? events : [e.nativeEvent];
      for (const ev of list) {
        const p = toImage(ev);
        queueStroke(strokeRef.current.stroke.to(p.x, p.y));
      }
      return;
    }
    if (lasso) {
      const p = toImage(e);
      const last = lasso[lasso.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) * viewRef.current.z > 3) setLasso([...lasso, p]);
    }
  };

  const endInteraction = (e: React.PointerEvent) => {
    splitDragRef.current = false;
    const press = pressRef.current;
    if (press) {
      clearTimeout(press.timer);
      pressRef.current = null;
      if (press.peeked) setPeek(false);
      else if (e.type === 'pointerup') {
        const s = useStore.getState();
        // Selects the colour zone under the pointer; the panel opens its editor.
        if (s.selectZoneAt(press.img.x, press.img.y) && s.step !== 2) s.set({ step: 2 });
      }
    }
    if (panRef.current) {
      panRef.current = null;
      setPanning(false);
    }
    const st = strokeRef.current;
    if (st) {
      if (st.raf) cancelAnimationFrame(st.raf);
      flushStroke();
      strokeRef.current = null;
      const s = useStore.getState();
      const dirty = st.stroke.dirty;
      if (dirty) s.commitMaskEdit(st.zoneId, copyRect(st.stroke.snapshot, engine.width, dirty), dirty);
    }
    if (lasso) {
      if (lasso.length > 2) {
        const s = useStore.getState();
        const mode: CombineMode = e.shiftKey ? 'add' : e.altKey ? 'subtract' : s.lassoMode;
        s.applySelection(polygonMask(lasso), mode);
      }
      setLasso(null);
    }
  };

  const cursorClass = {
    hand: panning ? 'grabbing' : 'grab',
    brush: 'none',
    eraser: 'none',
    wand: 'crosshair',
    lasso: 'crosshair',
    picker: 'crosshair',
    part: 'cell',
  }[effectiveTool];

  const showBrushCursor = cursor && (effectiveTool === 'brush' || effectiveTool === 'eraser');

  return (
    <div className="canvas-area">
      <div
        ref={wrapRef}
        className="canvas-wrap"
        style={{ cursor: cursorClass }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
        onPointerLeave={() => setCursor(null)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="stage" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, width, height }}>
          <canvas ref={resultRef} width={width} height={height} className={view.z > 2.5 ? 'pixelated' : ''} />
          <canvas
            ref={sourceRef}
            width={width}
            height={height}
            className={view.z > 2.5 ? 'pixelated' : ''}
            style={{ clipPath: peek ? 'none' : split !== null ? `inset(0 ${(1 - split) * 100}% 0 0)` : 'inset(0 100% 0 0)' }}
          />
          <canvas ref={overlayRef} width={width} height={height} />
          {lasso && (
            <svg className="lasso" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
              <polyline points={lasso.map((p) => `${p.x},${p.y}`).join(' ')} style={{ strokeWidth: 1.5 / view.z }} />
            </svg>
          )}
        </div>
        {split !== null && (
          <div
            className="split-handle"
            style={{ left: view.x + split * width * view.z }}
            onPointerDown={(e) => {
              e.stopPropagation();
              wrapRef.current!.setPointerCapture(e.pointerId);
              splitDragRef.current = true;
            }}
          >
            <span className="split-label left">{t('canvas.before')}</span>
            <span className="split-knob"><Icon name="split" size={14} /></span>
            <span className="split-label right">{t('canvas.after')}</span>
          </div>
        )}
        {showBrushCursor && (
          <div
            className="brush-cursor"
            style={{
              left: cursor.x,
              top: cursor.y,
              width: brush.size * view.z,
              height: brush.size * view.z,
              borderStyle: tool === 'eraser' ? 'dashed' : 'solid',
            }}
          />
        )}
      </div>
      {peek && <div className="peek-label">{t('canvas.original')}</div>}
      <div className="zoom-bar">
        <button
          className="hold-original"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setPeek(true);
          }}
          onPointerUp={() => setPeek(false)}
          onPointerCancel={() => setPeek(false)}
          onContextMenu={(e) => e.preventDefault()}
          title={t('canvas.holdOriginal')}
        >
          <Icon name="eye" size={16} />
          <span>{t('canvas.holdOriginal')}</span>
        </button>
        <IconButton icon="zoomOut" label={t('canvas.zoomOut')} onClick={() => zoomAt(1 / 1.25)} size={16} />
        <button className="zoom-value" onClick={() => setView((v) => ({ ...v, z: 1 }))} title={t('canvas.actualSize')}>
          {Math.round(view.z * 100)}%
        </button>
        <IconButton icon="zoomIn" label={t('canvas.zoomIn')} onClick={() => zoomAt(1.25)} size={16} />
        <IconButton icon="fit" label={t('canvas.fit')} shortcut="F" onClick={fit} size={16} />
      </div>
    </div>
  );
}
