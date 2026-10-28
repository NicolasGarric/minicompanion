import { useEffect, useMemo, useRef, useState } from 'react';
import { k, useLang, useT } from '../../core/i18n';
import { download } from '../../core/lib/image';
import { navigate } from '../../core/router';
import { useSession } from '../../core/auth/session';
import { backendConfigured } from '../../core/auth/supabase';
import { Icon } from '../../core/ui/ui';
import { ShareSheet } from '../../core/ui/ShareSheet';
import { DENSITY_COUNT, MAX_PIECES, SIZES, SIZE_ORDER, THEMES, generate, newSeed, zonesFor, type Density, type Mode, type Table, type Theme } from '../lib/tableGen';
import { decodeTable, encodeTable, MAX_CODE } from '../lib/tableCodec';
import { myGames, playError, setGameMap, type Game } from '../lib/games';
import { formatWhen } from '../components/GameCard';
import { TableEditor, TerrainLegend } from '../components/TableEditor';
import { drawTable } from '../visual/tableMap';

/**
 * Tables: roll a table and a mission (narrative, casual, competitive; the seed is kept in the URL),
 * or build your own in the editor (the whole layout is kept in the URL as a short code). Either
 * one can be saved as an image, shared as a link, or attached to one of your games.
 */
const params = () => new URLSearchParams(location.search);
const DRAFT_KEY = 'mc.tableDraft';
const COUNTS = [0, 4, 6, 8, 10, 12, 14, 16, 20, 24];

const blankTable = (): Table => ({
  seed: 0, mode: 'custom', width: 44, height: 60, deployment: 'long', zones: zonesFor('long', 44, 60),
  pieces: [], objectives: [], mission: '', extra: 'none', rounds: 5,
});

function readDraft(): string | null {
  try {
    return localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}

export function TableGen() {
  const t = useT();
  const p = params();
  const [tab, setTab] = useState<'generate' | 'build'>(p.get('tab') === 'build' || p.get('map') ? 'build' : 'generate');
  const [mode, setMode] = useState<Mode>((['narrative', 'casual', 'competitive'].includes(p.get('mode') ?? '') ? p.get('mode') : 'casual') as Mode);
  const [size, setSize] = useState(Math.min(SIZES.length - 1, Math.max(0, Number(p.get('size') ?? 1) || 0)));
  const [density, setDensity] = useState<Density>((p.get('density') as Density) in DENSITY_COUNT ? (p.get('density') as Density) : 'standard');
  const [theme, setTheme] = useState<Theme>(THEMES.includes(p.get('theme') as Theme) ? (p.get('theme') as Theme) : 'city');
  const [count, setCount] = useState<number | null>(p.get('count') !== null && COUNTS.includes(Number(p.get('count'))) ? Number(p.get('count')) : null);
  const [seed, setSeed] = useState(() => Number(p.get('seed')) || newSeed());
  const [custom, setCustom] = useState<Table | null>(null);
  const [badLink, setBadLink] = useState(false);
  const [marks, setMarks] = useState(true);
  const [sharing, setSharing] = useState<string | null>(null);
  const gameId = p.get('game');
  const generated = useMemo(() => generate({ mode, size, density, theme, seed, count: count ?? undefined }), [mode, size, density, theme, seed, count]);
  const table = tab === 'build' ? custom : generated;

  // Custom table: from the link, else the draft on this device, else an empty table
  useEffect(() => {
    const code = params().get('map') ?? (tab === 'build' ? readDraft() : null);
    if (!code) {
      if (tab === 'build') setCustom((c) => c ?? blankTable());
      return;
    }
    decodeTable(code).then(setCustom, () => {
      setBadLink(!!params().get('map'));
      setCustom(blankTable());
    });
    // Only on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the settings in the URL (shareable, survives a reload); the custom table also as a draft
  useEffect(() => {
    if (tab === 'generate') {
      const q = new URLSearchParams({ mode, size: String(size), seed: String(seed) });
      if (mode === 'competitive') q.set('density', density);
      if (mode === 'narrative') q.set('theme', theme);
      if (count !== null) q.set('count', String(count));
      if (gameId) q.set('game', gameId);
      history.replaceState(null, '', `${location.pathname}?${q}`);
      return;
    }
    if (!custom) return;
    const timer = setTimeout(() => {
      void encodeTable(custom).then((code) => {
        const q = new URLSearchParams({ tab: 'build', map: code });
        if (gameId) q.set('game', gameId);
        history.replaceState(null, '', `${location.pathname}?${q}`);
        try {
          localStorage.setItem(DRAFT_KEY, code);
        } catch {
          /* private mode */
        }
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [tab, mode, size, density, theme, seed, count, custom, gameId]);

  const edit = () => {
    setCustom({ ...generated, mode: generated.mode, pieces: generated.pieces.map((x) => ({ ...x, traits: [...x.traits] })) });
    setTab('build');
  };
  const saveImage = () => {
    if (!table) return;
    const c = document.createElement('canvas');
    c.width = 1800;
    c.height = (1800 * table.height) / table.width;
    drawTable(c.getContext('2d')!, table, 1800, { marks });
    c.toBlob((b) => b && download(b, `table-${table.name ? table.name.replace(/[^\w-]+/g, '-').slice(0, 40) : seed}.png`), 'image/png');
  };
  const share = async () => {
    if (!table) return;
    if (tab === 'generate') return setSharing(location.href);
    setSharing(`${location.origin}${location.pathname}?tab=build&map=${await encodeTable(table)}`);
  };

  return (
    <div className="narrow table-gen">
      <div className="page-head">
        <div>
          <h1>{t('table.title')}</h1>
          <p className="lead">{t('table.lead')}</p>
        </div>
      </div>

      <div className="segmented tabs-wide" role="tablist">
        <button role="tab" aria-selected={tab === 'generate'} className={tab === 'generate' ? 'on' : ''} onClick={() => setTab('generate')}>
          <Icon name="sparkle" size={15} /> {t('tableEd.tab.generate')}
        </button>
        <button role="tab" aria-selected={tab === 'build'} className={tab === 'build' ? 'on' : ''} onClick={() => { setCustom((c) => c ?? blankTable()); setTab('build'); }}>
          <Icon name="hand" size={15} /> {t('tableEd.tab.build')}
        </button>
      </div>
      {badLink && <p className="error" role="alert">{t('tableEd.badLink')}</p>}

      {tab === 'generate' ? (
        <>
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
                  {SIZE_ORDER.map((i) => <option key={i} value={i}>{SIZES[i][0]}″ × {SIZES[i][1]}″</option>)}
                </select></label>
              {mode === 'narrative' && (
                <label className="field"><span>{t('table.theme')}</span>
                  <select className="select" value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
                    {THEMES.map((th) => <option key={th} value={th}>{t(k(`table.theme.${th}`))}</option>)}
                  </select></label>
              )}
              {mode === 'competitive' && count === null && (
                <label className="field"><span>{t('table.density')}</span>
                  <select className="select" value={density} onChange={(e) => setDensity(e.target.value as Density)}>
                    {(Object.keys(DENSITY_COUNT) as Density[]).map((d) => <option key={d} value={d}>{t(k(`table.density.${d}`), { n: DENSITY_COUNT[d] })}</option>)}
                  </select></label>
              )}
              <label className="field"><span>{t('tableEd.pieceCount')}</span>
                <select className="select" value={count ?? 'auto'} onChange={(e) => setCount(e.target.value === 'auto' ? null : +e.target.value)}>
                  <option value="auto">{t('tableEd.countAuto')}</option>
                  {COUNTS.filter((n) => n <= MAX_PIECES).map((n) => <option key={n} value={n}>{n}</option>)}
                </select></label>
            </div>
            <div className="field-row wrap">
              <button className="btn primary" onClick={() => setSeed(newSeed())}><Icon name="sparkle" size={16} /> {t('table.roll')}</button>
              <button className="btn" onClick={edit}><Icon name="hand" size={16} /> {t('tableEd.editThis')}</button>
              <span className="tag">#{seed}</span>
            </div>
          </section>
          <TableView table={generated} marks={marks} />
        </>
      ) : custom ? (
        <TableEditor table={custom} onChange={setCustom} marks={marks} />
      ) : (
        <span className="spinner" />
      )}

      {table && (
        <>
          <div className="field-row wrap table-actions">
            <label className="check"><input type="checkbox" checked={marks} onChange={(e) => setMarks(e.target.checked)} /> {t('tableEd.showMarks')}</label>
            <button className="btn" onClick={saveImage}><Icon name="download" size={16} /> {t('table.image')}</button>
            <button className="btn" onClick={share}><Icon name="share" size={16} /> {t('table.share')}</button>
          </div>
          {marks && <TerrainLegend />}
          <LinkToGame table={table} preset={gameId} />
          {table.mission && table.objectives.length > 0 && <MissionCard table={table} />}
        </>
      )}

      {sharing && table && (
        <ShareSheet
          title={table.name || t('table.title')}
          text={table.name
            ? t('tableEd.shareText', { name: table.name, w: table.width, h: table.height, n: table.pieces.length })
            : t('tableEd.shareTextNoName', { w: table.width, h: table.height, n: table.pieces.length })}
          url={sharing}
          onClose={() => setSharing(null)}
        />
      )}
    </div>
  );
}

function TableView({ table, marks }: { table: Table; marks: boolean }) {
  const t = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
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
      drawTable(ctx, table, w, { marks });
    };
    draw();
    const ro = new ResizeObserver(draw);
    if (box.current) ro.observe(box.current);
    void document.fonts?.ready.then(draw);
    return () => ro.disconnect();
  }, [table, marks]);
  return (
    <div ref={box} className="table-canvas">
      <canvas ref={canvas} role="img" aria-label={t('table.aria', { w: table.width, h: table.height, n: table.pieces.length })} />
    </div>
  );
}

function MissionCard({ table }: { table: Table }) {
  const t = useT();
  const missionKey = `table.mission.${table.mission}`;
  return (
    <section className="mission-card">
      <div className="mission-band"><span>{t(k(`table.mode.${table.mode === 'custom' ? 'casual' : table.mode}`))}</span></div>
      <div className="mission-body">
        <h2>{t(k(`${missionKey}.name`))}</h2>
        {table.deployment !== 'none' && <p><span className="tag on">{t('table.deploymentLabel')}</span> {t(k(`table.deploy.${table.deployment}`))}</p>}
        <p><span className="tag on">{t('table.objectiveLabel')}</span> {t(k(`${missionKey}.goal`), { n: table.objectives.length, rounds: table.rounds })}</p>
        {table.extra !== 'none' && (
          <p><span className="tag pk">{t(k(table.mode === 'narrative' ? 'table.twistLabel' : 'table.eventLabel'))}</span> {t(k(`table.extra.${table.extra}`))}</p>
        )}
        <p className="hint">{t('table.footer', { rounds: table.rounds, pieces: table.pieces.length })}</p>
      </div>
    </section>
  );
}

/** Attach the table shown to one of my upcoming games (the code is stored on the game). */
function LinkToGame({ table, preset }: { table: Table; preset: string | null }) {
  const t = useT();
  const session = useSession((s) => s.session);
  const lang = useLang((s) => s.lang);
  const [games, setGames] = useState<Game[] | null>(null);
  const [chosen, setChosen] = useState(preset ?? '');
  const [state, setState] = useState<'idle' | 'busy' | 'error' | 'tooBig'>('idle');

  useEffect(() => {
    if (!backendConfigured || !session) return;
    myGames(session.user.id).then(
      ({ hosted }) => {
        const upcoming = hosted.filter((g) => g.status !== 'cancelled' && new Date(g.starts_at) > new Date());
        setGames(upcoming);
        setChosen((c) => c || (upcoming.length === 1 ? upcoming[0].id : ''));
      },
      (e) => {
        playError(e);
        setGames([]);
      },
    );
  }, [session]);

  if (!backendConfigured) return null;
  const link = async () => {
    if (!chosen) return;
    setState('busy');
    try {
      const code = await encodeTable(table);
      if (code.length > MAX_CODE) return setState('tooBig');
      await setGameMap(chosen, code);
      navigate(`play/game/${chosen}`);
    } catch {
      setState('error');
    }
  };

  return (
    <section className="card link-game">
      <h2><Icon name="link" size={18} /> {t('tableEd.linkTitle')}</h2>
      {!session ? (
        <p className="hint">{t('tableEd.linkSignIn')}</p>
      ) : games === null ? (
        <span className="spinner" />
      ) : !games.length ? (
        <p className="hint">{t('tableEd.linkNoGame')} <a href="/play/new">{t('tableEd.linkCreate')}</a></p>
      ) : (
        <div className="field-row wrap">
          <select className="select" value={chosen} onChange={(e) => setChosen(e.target.value)} aria-label={t('tableEd.linkTitle')}>
            <option value="">{t('tableEd.linkPick')}</option>
            {games.map((g) => <option key={g.id} value={g.id}>{g.game_system} · {formatWhen(g.starts_at, lang)}{g.table_map ? ' ★' : ''}</option>)}
          </select>
          <button className="btn primary" disabled={!chosen || state === 'busy'} onClick={link}><Icon name="map" size={15} /> {t('tableEd.linkCta')}</button>
        </div>
      )}
      {games?.some((g) => g.table_map) && <p className="hint">{t('tableEd.linkReplace')}</p>}
      {state === 'error' && <p className="error" role="alert">{t('tableEd.linkError')}</p>}
      {state === 'tooBig' && <p className="error" role="alert">{t('tableEd.linkTooBig')}</p>}
    </section>
  );
}
