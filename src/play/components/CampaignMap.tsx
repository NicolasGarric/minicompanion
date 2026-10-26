import { useEffect, useMemo, useRef, useState } from 'react';
import { k, localeOf, useLang, useT } from '../../core/i18n';
import { Icon } from '../../core/ui/ui';
import { playError } from '../lib/games';
import { PLAYER_INKS, claim, conquestsLeft, createCampaign, getCampaign, setOwner, territoryNames, type Campaign, type CampaignEvent, type MapKind } from '../lib/campaign';
import { drawCampaign, hitCampaign, type MapState } from '../visual/campaignMap';

/**
 * League campaign: an interactive map (planet or star system). Each confirmed league win gives a
 * conquest to spend on a territory, free or held by a rival; the organiser can fix the map.
 */
export function CampaignSection({ leagueId, organiser, me, players }: {
  leagueId: string;
  organiser: boolean;
  me?: string;
  players: { id: string; name: string }[];
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [data, setData] = useState<{ campaign: Campaign; owners: Map<number, string | null>; events: CampaignEvent[] } | null | undefined>(undefined);
  const [left, setLeft] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ kind: MapKind; n: number }>({ kind: 'planet', n: 16 });
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      setData(await getCampaign(leagueId));
      if (me) setLeft(await conquestsLeft(leagueId, me));
    } catch (e) {
      const code = playError(e);
      if (code === 'not_installed') setData(null);
      else setError(code ?? 'generic');
    }
  };
  useEffect(() => {
    void load();
  }, [leagueId, me]); // eslint-disable-line react-hooks/exhaustive-deps

  const inkOf = useMemo(() => new Map(players.map((p, i) => [p.id, PLAYER_INKS[i % PLAYER_INKS.length]])), [players]);
  const nameOf = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);
  const state: MapState | null = data ? {
    kind: data.campaign.map_kind,
    seed: data.campaign.seed,
    count: data.campaign.territories,
    inks: Array.from({ length: data.campaign.territories }, (_, i) => {
      const o = data.owners.get(i);
      return o ? inkOf.get(o) ?? '#8a8fb0' : null;
    }),
    selected,
  } : null;
  const names = useMemo(() => (data ? territoryNames(data.campaign.seed, data.campaign.territories) : []), [data]);

  useEffect(() => {
    if (!state || !canvas.current || !box.current) return;
    const draw = () => {
      const w = box.current!.clientWidth, dpr = Math.min(2, devicePixelRatio || 1);
      canvas.current!.width = Math.round(w * dpr);
      canvas.current!.height = Math.round(w * dpr);
      canvas.current!.style.height = `${w}px`;
      drawCampaign(canvas.current!.getContext('2d')!, state, Math.round(w * dpr));
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [JSON.stringify(state)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (data === undefined) return null;
  if (data === null) {
    if (!organiser) return null;
    return (
      <section className="card campaign">
        <h2>{t('campaign.title')}</h2>
        <p className="hint">{t('campaign.setupHint')}</p>
        <div className="field-grid">
          <label className="field"><span>{t('campaign.kind')}</span>
            <select className="select" value={setup.kind} onChange={(e) => setSetup({ ...setup, kind: e.target.value as MapKind })}>
              <option value="planet">{t('campaign.kind.planet')}</option>
              <option value="system">{t('campaign.kind.system')}</option>
            </select></label>
          <label className="field"><span>{t('campaign.territories')}</span>
            <input className="num-input" type="number" min={6} max={40} value={setup.n} onChange={(e) => setSetup({ ...setup, n: Math.max(6, Math.min(40, +e.target.value || 6)) })} /></label>
        </div>
        <button className="btn primary" onClick={async () => {
          try {
            await createCampaign(leagueId, setup.kind, setup.n);
            await load();
          } catch (e) {
            setError(playError(e) ?? 'generic');
          }
        }}><Icon name="map" size={16} /> {t('campaign.create')}</button>
        {error && <p className="error">{t(k(`games.error.${error}`))}</p>}
      </section>
    );
  }

  const owner = selected !== null ? data.owners.get(selected) ?? null : null;
  const counts = players.map((p) => ({ ...p, n: [...data.owners.values()].filter((o) => o === p.id).length })).filter((p) => p.n).sort((a, b) => b.n - a.n);
  const isMember = !!me && players.some((p) => p.id === me);
  const act = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(playError(e) ?? 'generic');
    }
  };
  const onTap = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!state) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setSelected(hitCampaign(state, rect.width, e.clientX - rect.left, e.clientY - rect.top));
  };

  return (
    <section className="card campaign">
      <h2>{t('campaign.title')}</h2>
      <p className="hint">{t(k(`campaign.kind.${data.campaign.map_kind}`))} · {t('campaign.rule')}</p>
      {isMember && <p><span className="tag pk">{t('campaign.left', { n: left })}</span></p>}
      <div className="campaign-layout">
        <div ref={box} className="campaign-canvas">
          <canvas ref={canvas} onClick={onTap} role="img" aria-label={t('campaign.aria', { n: data.campaign.territories })} />
        </div>
        <div className="campaign-side">
          {selected !== null ? (
            <div className="box-panel">
              <strong>{selected + 1}. {names[selected]}</strong>
              <p className="hint">{owner ? t('campaign.heldBy', { name: nameOf.get(owner) ?? '?' }) : t('campaign.free')}</p>
              {isMember && owner !== me && (
                <button className="btn primary small" disabled={left < 1} onClick={() => act(() => claim(leagueId, selected))}>
                  {t('campaign.claim')}
                </button>
              )}
              {organiser && (
                <label className="field"><span>{t('campaign.setOwner')}</span>
                  <select className="select" value={owner ?? ''} onChange={(e) => act(() => setOwner(leagueId, selected, e.target.value || null))}>
                    <option value="">{t('campaign.free')}</option>
                    {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select></label>
              )}
            </div>
          ) : <p className="hint">{t('campaign.tapHint')}</p>}
          {counts.length > 0 && (
            <ul className="campaign-legend">
              {counts.map((p) => (
                <li key={p.id}><span className="legend-ink" style={{ background: inkOf.get(p.id) }} />{p.name}<b>{p.n}</b></li>
              ))}
            </ul>
          )}
          {data.events.length > 0 && (
            <>
              <h3>{t('campaign.log')}</h3>
              <ul className="campaign-log">
                {data.events.slice(0, 8).map((e) => (
                  <li key={e.id}>
                    <small className="muted">{new Date(e.created_at).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short' })}</small>{' '}
                    {t(e.taken_from ? 'campaign.event.taken' : 'campaign.event.claimed', { name: nameOf.get(e.player_id) ?? '?', place: names[e.idx] ?? '?', from: nameOf.get(e.taken_from ?? '') ?? '?' })}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
      {error && <p className="error">{t(k(`games.error.${error}`))}</p>}
    </section>
  );
}
