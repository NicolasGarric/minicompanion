import { useEffect, useMemo, useRef, useState } from 'react';
import { k, useT } from '../../core/i18n';
import { download } from '../../core/lib/image';
import { Icon } from '../../core/ui/ui';
import { DENSITY_COUNT, SIZES, THEMES, generate, newSeed, type Density, type Mode, type Theme } from '../lib/tableGen';
import { drawTable } from '../visual/tableMap';

/**
 * Table & mission generator: pick a mode (narrative with a scenario theme, casual, competitive
 * with a terrain density), a table size, and roll. The seed is kept in the URL so a table can be
 * shared or rebuilt identically.
 */
const params = () => new URLSearchParams(location.search);

export function TableGen() {
  const t = useT();
  const p = params();
  const [mode, setMode] = useState<Mode>((['narrative', 'casual', 'competitive'].includes(p.get('mode') ?? '') ? p.get('mode') : 'casual') as Mode);
  const [size, setSize] = useState(Math.min(SIZES.length - 1, Math.max(0, Number(p.get('size') ?? 1) || 0)));
  const [density, setDensity] = useState<Density>((p.get('density') as Density) in DENSITY_COUNT ? (p.get('density') as Density) : 'standard');
  const [theme, setTheme] = useState<Theme>(THEMES.includes(p.get('theme') as Theme) ? (p.get('theme') as Theme) : 'city');
  const [seed, setSeed] = useState(() => Number(p.get('seed')) || newSeed());
  const table = useMemo(() => generate({ mode, size, density, theme, seed }), [mode, size, density, theme, seed]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // Keep the settings in the URL (shareable, survives a reload)
  useEffect(() => {
    const q = new URLSearchParams({ mode, size: String(size), seed: String(seed) });
    if (mode === 'competitive') q.set('density', density);
    if (mode === 'narrative') q.set('theme', theme);
    history.replaceState(null, '', `${location.pathname}?${q}`);
  }, [mode, size, density, theme, seed]);

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
      drawTable(ctx, table, w);
    };
    draw();
    const ro = new ResizeObserver(draw);
    if (box.current) ro.observe(box.current);
    void document.fonts?.ready.then(draw);
    return () => ro.disconnect();
  }, [table]);

  const saveImage = () => {
    const c = document.createElement('canvas');
    c.width = 1800;
    c.height = (1800 * table.height) / table.width;
    drawTable(c.getContext('2d')!, table, 1800);
    c.toBlob((b) => b && download(b, `table-${seed}.png`), 'image/png');
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: t('table.title'), url: location.href });
      else {
        await navigator.clipboard.writeText(location.href);
        setCopied(true);
      }
    } catch {
      /* closed */
    }
  };
  const missionKey = `table.mission.${table.mission}`;

  return (
    <div className="narrow table-gen">
      <div className="page-head">
        <div>
          <h1>{t('table.title')}</h1>
          <p className="lead">{t('table.lead')}</p>
        </div>
      </div>

      <section className="card table-controls">
        <div className="segmented" role="radiogroup" aria-label={t('table.mode')}>
          {(['narrative', 'casual', 'competitive'] as Mode[]).map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => { setMode(m); setSeed(newSeed()); }}>
              {t(k(`table.mode.${m}`))}
            </button>
          ))}
        </div>
        <p className="hint">{t(k(`table.modeHint.${mode}`))}</p>
        <div className="field-grid">
          <label className="field"><span>{t('table.size')}</span>
            <select className="select" value={size} onChange={(e) => setSize(+e.target.value)}>
              {SIZES.map(([w, h], i) => <option key={i} value={i}>{w}″ × {h}″</option>)}
            </select></label>
          {mode === 'narrative' && (
            <label className="field"><span>{t('table.theme')}</span>
              <select className="select" value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
                {THEMES.map((th) => <option key={th} value={th}>{t(k(`table.theme.${th}`))}</option>)}
              </select></label>
          )}
          {mode === 'competitive' && (
            <label className="field"><span>{t('table.density')}</span>
              <select className="select" value={density} onChange={(e) => setDensity(e.target.value as Density)}>
                {(Object.keys(DENSITY_COUNT) as Density[]).map((d) => <option key={d} value={d}>{t(k(`table.density.${d}`), { n: DENSITY_COUNT[d] })}</option>)}
              </select></label>
          )}
        </div>
        <div className="field-row wrap">
          <button className="btn primary" onClick={() => setSeed(newSeed())}><Icon name="sparkle" size={16} /> {t('table.roll')}</button>
          <button className="btn" onClick={saveImage}><Icon name="download" size={16} /> {t('table.image')}</button>
          <button className="btn" onClick={share}><Icon name="link" size={16} /> {t('table.share')}</button>
          {copied && <span className="hint" role="status">{t('pile.linkCopied')}</span>}
          <span className="tag">#{seed}</span>
        </div>
      </section>

      <div ref={box} className="table-canvas">
        <canvas ref={canvas} role="img" aria-label={t('table.aria', { w: table.width, h: table.height, n: table.pieces.length })} />
      </div>

      <section className="mission-card">
        <div className="mission-band"><span>{t(k(`table.mode.${table.mode}`))}</span></div>
        <div className="mission-body">
          <h2>{t(k(`${missionKey}.name`))}</h2>
          <p><span className="tag on">{t('table.deploymentLabel')}</span> {t(k(`table.deploy.${table.deployment}`))}</p>
          <p><span className="tag on">{t('table.objectiveLabel')}</span> {t(k(`${missionKey}.goal`), { n: table.objectives.length, rounds: table.rounds })}</p>
          {table.extra !== 'none' && (
            <p><span className="tag pk">{t(k(table.mode === 'narrative' ? 'table.twistLabel' : 'table.eventLabel'))}</span> {t(k(`table.extra.${table.extra}`))}</p>
          )}
          <p className="hint">{t('table.footer', { rounds: table.rounds, pieces: table.pieces.length })}</p>
        </div>
      </section>
    </div>
  );
}
