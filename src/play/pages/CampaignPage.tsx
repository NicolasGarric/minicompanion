import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { k, useT } from '../../core/i18n';
import { backendConfigured } from '../../core/auth/supabase';
import { BackendNotice } from '../../core/auth/BackendNotice';
import { requireSignIn, useSession } from '../../core/auth/session';
import { navigate } from '../../core/router';
import { Icon } from '../../core/ui/ui';
import { ShareSheet } from '../../core/ui/ShareSheet';
import {
  boardAt, campaignError, campaignVersion, cancelBattle, contestAction, deleteCampaign, inviteCode, joinCampaign, leaveCampaign, loadCampaign,
  onCampaignChange, planBattle, recordAction, recordBattle, resolveContest, saveBoard, setMember, winner,
  type BattleRow, type Board, type CampId, type CampaignRow, type Effect, type LogRow, type Member,
} from '../lib/narrative';
import { NetworkBoard } from '../components/campaign/NetworkBoard';
import { ActionsPanel, BattlesPanel, CampsPanel, Emblem, Journal, MembersPanel, VictoryPanel } from '../components/campaign/CampaignPanels';
import type { Flash } from '../visual/networkMap';

/**
 * One narrative campaign: the board (drawn by the campaign master, read by everyone), the camps,
 * actions recorded by the players, battles to come, the journal with contests, and a replay.
 * The master's changes are saved automatically; other changes arrive live.
 */
type Data = { row: CampaignRow; board: Board; members: Member[]; log: LogRow[]; battles: BattleRow[] };
type Tab = 'camps' | 'actions' | 'battles' | 'victory' | 'players' | 'settings';

export function CampaignPage({ id }: { id: string }) {
  const t = useT();
  const session = useSession((s) => s.session);
  const me = session?.user.id ?? null;
  const [data, setData] = useState<Data | null | undefined>(undefined);
  const [board, setBoard] = useState<Board | null>(null);
  const [tab, setTab] = useState<Tab>('camps');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [draftPlace, setDraftPlace] = useState<number | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [replay, setReplay] = useState<number | null>(null);
  const version = useRef(0);
  const dirty = useRef(false);
  const saveTimer = useRef(0);
  const pendingBoard = useRef<Board | null>(null);
  const joinCode = new URLSearchParams(location.search).get('join');

  const load = useCallback(async () => {
    try {
      const d = await loadCampaign(id);
      setData(d);
      if (d) {
        version.current = d.row.version;
        if (!dirty.current) setBoard(d.board);
      }
    } catch (e) {
      setError(campaignError(e));
      setData((x) => (x === undefined ? null : x));
    }
  }, [id]);

  useEffect(() => {
    if (!backendConfigured) return;
    void load();
    let timer = 0;
    const off = onCampaignChange(id, () => {
      clearTimeout(timer);
      timer = window.setTimeout(load, 300);
    });
    // The master's map edits leave no journal line: check the version now and then
    const poll = window.setInterval(async () => {
      if (document.hidden || dirty.current) return;
      const v = await campaignVersion(id).catch(() => null);
      if (v !== null && v !== version.current) void load();
    }, 30000);
    return () => {
      off();
      clearInterval(poll);
      clearTimeout(timer);
    };
  }, [id, load, me]);

  const row = data?.row, members = data?.members ?? [];
  const isMaster = !!row && row.master_id === me;
  const myCamp = (members.find((m) => m.user_id === me)?.camp ?? null) as CampId | null;
  const isMember = members.some((m) => m.user_id === me);

  /** Master edits: shown at once, saved 0.8 s after the last change. */
  const onEdit = useCallback((b: Board) => {
    setBoard(b);
    dirty.current = true;
    pendingBoard.current = b;
    setSaveState('dirty');
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const next = pendingBoard.current;
      if (!next) return;
      setSaveState('saving');
      try {
        version.current = await saveBoard(id, next, version.current);
        if (pendingBoard.current === next) {
          dirty.current = false;
          setSaveState('saved');
        }
      } catch (e) {
        const err = campaignError(e);
        setError(err);
        dirty.current = false;
        setSaveState('saved');
        if (err === 'version_conflict') void load();
      }
    }, 800);
  }, [id, load]);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const snapshots = useMemo(() => {
    const byTurn = new Map<number, LogRow>();
    [...(data?.log ?? [])].reverse().forEach((l) => byTurn.set(l.turn, l));
    return [...byTurn.values()].sort((a, b) => a.turn - b.turn);
  }, [data?.log]);
  const battlePlaces = useMemo(() => new Set((data?.battles ?? []).filter((b) => b.status === 'planned').map((b) => b.place_id)), [data?.battles]);

  if (!backendConfigured) return <BackendNotice />;
  if (data === undefined) return <div className="narrow"><span className="spinner" /></div>;
  if (data === null || !row || !board) {
    return (
      <div className="narrow">
        <p className="hint">{t('nc.notFound')}</p>
        {!session && joinCode && <button className="btn primary" onClick={() => requireSignIn()}>{t('nc.signinToJoin')}</button>}
        <a href="/play/campaigns">← {t('nav.play.campaigns')}</a>
      </div>
    );
  }

  const turn = row.turn;
  const shown = replay !== null && snapshots[replay] ? boardAt(board, snapshots[replay].snapshot) : board;
  const w = winner(board, turn);

  const act = async (fn: () => Promise<unknown>, flashPlace?: number, color?: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
      const p = flashPlace !== undefined ? board.places.find((x) => x.id === flashPlace) : undefined;
      if (p) setFlashes([{ x: p.x, y: p.y, t: performance.now(), color: color ?? '#ffffff' }]);
    } catch (e) {
      setError(campaignError(e));
    }
    setBusy(false);
  };
  const onRecord = (camp: CampId, effect: Effect, target: string | null, amount: number | null, label: string | null, text: string | null) =>
    act(() => recordAction(id, camp, effect, target, amount, label, text), effect === 'take' || effect === 'fort' ? Number(target) : undefined,
      board.camps.find((c) => c.id === camp)?.color);
  const openInvite = async () => {
    const code = await inviteCode(id).catch(() => null);
    if (code) setInvite(`${location.origin}/play/campaign/${id}?join=${code}`);
  };
  const tabs: Tab[] = ['camps', 'actions', 'battles', 'victory', 'players', ...(isMaster ? ['settings' as Tab] : [])];
  const editor = isMaster && replay === null ? onEdit : null;

  return (
    <div className="nc-page">
      <a href="/play/campaigns" className="small">← {t('nav.play.campaigns')}</a>
      <div className="page-head">
        <div>
          <h1>{row.title}</h1>
          <p className="lead">{[row.sector, t('nc.turn', { n: turn }), row.status === 'finished' ? t('nc.finished') : null].filter(Boolean).join(' · ')}</p>
          {row.description && <p className="nc-desc">{row.description}</p>}
        </div>
        <div className="nc-camps-strip">
          {board.camps.map((c) => <span key={c.id} className="nc-chip" style={{ borderColor: c.color }}><Emblem camp={c} size={11} /> {c.name}</span>)}
        </div>
      </div>

      {!isMember && joinCode && <JoinCard board={board} signedIn={!!session} onJoin={(camp) => act(() => joinCampaign(id, joinCode, camp))} busy={busy} />}
      {isMaster && <p className="hint nc-save" role="status">{t(k(`nc.save.${saveState}`))}</p>}
      {error && <p className="error" role="alert">{t(k(`nc.error.${error}`))}</p>}

      <div className="nc-layout">
        <div className="nc-main">
          <NetworkBoard
            board={shown}
            onEdit={editor}
            title={row.title}
            subtitle={replay !== null ? t('nc.archive', { n: snapshots[replay]?.turn ?? 0 }) : myCamp ? t('nc.viewCamp', { camp: board.camps.find((c) => c.id === myCamp)?.name ?? '' }) : isMaster ? t('nc.viewMaster') : ''}
            isolatedLabel={t('nc.isolated')}
            winnerLabel={w && replay === null ? t('nc.winner', { camp: w.name }) : null}
            battlePlaces={battlePlaces}
            flashes={flashes}
            myCamp={myCamp}
            canPlan={isMaster || myCamp !== null}
            onPlanBattle={(p) => { setDraftPlace(p); setTab('battles'); }}
          />
          {snapshots.length > 1 && (
            <div className="nc-replay">
              <label htmlFor="nc-replay">{t('nc.replay')}</label>
              <input id="nc-replay" type="range" min={0} max={snapshots.length - 1} value={replay ?? snapshots.length - 1}
                onChange={(e) => setReplay(+e.target.value >= snapshots.length - 1 ? null : +e.target.value)} />
              <span>{replay === null ? t('nc.now', { n: turn }) : t('nc.afterTurn', { n: snapshots[replay].turn })}</span>
            </div>
          )}
          <section className="card">
            <h2>{t('nc.journal')}</h2>
            <Journal log={data.log} board={board} myCamp={myCamp} isMaster={isMaster} busy={busy}
              onContest={(l) => act(() => contestAction(l))} onResolve={(l, undo) => act(() => resolveContest(l, undo))} />
          </section>
        </div>
        <div className="nc-side">
          <div className="segmented nc-tabs" role="tablist">
            {tabs.map((x) => <button key={x} role="tab" aria-selected={tab === x} className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>{t(k(`nc.tab.${x}`))}</button>)}
          </div>
          {tab === 'camps' && <CampsPanel board={board} onEdit={editor} turn={turn} />}
          {tab === 'actions' && <ActionsPanel board={board} myCamp={myCamp} isMaster={isMaster} onRecord={onRecord} onEdit={editor} busy={busy || row.status === 'finished'} />}
          {tab === 'battles' && (
            <BattlesPanel board={board} battles={data.battles} myCamp={myCamp} isMaster={isMaster} draftPlace={draftPlace} busy={busy}
              onPlan={(p, title, date, a, b, note) => act(() => planBattle(id, p, title, date, a, b, note))}
              onResult={(b, winnerCamp) => act(() => recordBattle(b, winnerCamp), data.battles.find((x) => x.id === b)?.place_id, board.camps.find((c) => c.id === winnerCamp)?.color)}
              onCancel={(b) => act(() => cancelBattle(b))} />
          )}
          {tab === 'victory' && <VictoryPanel board={board} onEdit={editor} turn={turn} />}
          {tab === 'players' && (
            <MembersPanel board={board} members={members} isMaster={isMaster} me={me} masterId={row.master_id} busy={busy} onInvite={openInvite}
              onSet={(u, camp, remove) => act(() => setMember(id, u, camp, remove))}
              onLeave={() => act(async () => { await leaveCampaign(id); navigate('play/campaigns'); })} />
          )}
          {tab === 'settings' && isMaster && <Settings row={row} board={board} version={version} onSaved={load} onError={setError} />}
        </div>
      </div>
      {invite && <ShareSheet title={t('nc.inviteTitle')} text={t('nc.inviteText', { title: row.title })} url={invite} onClose={() => setInvite(null)} />}
    </div>
  );
}

function JoinCard({ board, signedIn, onJoin, busy }: { board: Board; signedIn: boolean; onJoin: (camp: CampId | null) => void; busy: boolean }) {
  const t = useT();
  const [camp, setCamp] = useState<CampId | ''>(board.camps[0]?.id ?? '');
  return (
    <section className="invite-banner">
      <strong>{t('nc.joinTitle')}</strong>
      {signedIn ? (
        <>
          <select className="select" value={camp} aria-label={t('nc.camp')} onChange={(e) => setCamp(e.target.value as CampId | '')}>
            {board.camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="">{t('nc.spectator')}</option>
          </select>
          <button className="btn primary" disabled={busy} onClick={() => onJoin(camp || null)}>{t('nc.join')}</button>
        </>
      ) : (
        <button className="btn primary" onClick={() => requireSignIn()}>{t('nc.signinToJoin')}</button>
      )}
    </section>
  );
}

function Settings({ row, board, version, onSaved, onError }: {
  row: CampaignRow; board: Board; version: React.MutableRefObject<number>; onSaved: () => void; onError: (e: string) => void;
}) {
  const t = useT();
  const [f, setF] = useState({ title: row.title, sector: row.sector ?? '', description: row.description ?? '', isPublic: row.is_public, finished: row.status === 'finished' });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = async () => {
    try {
      version.current = await saveBoard(row.id, board, version.current, { title: f.title, sector: f.sector, description: f.description, isPublic: f.isPublic, status: f.finished ? 'finished' : 'active' });
      onSaved();
    } catch (e) {
      onError(campaignError(e));
    }
  };
  return (
    <div className="nc-pane">
      <div className="card">
        <label className="field"><span>{t('nc.campaignTitle')}</span><input className="text-input" maxLength={80} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label className="field"><span>{t('nc.sector')}</span><input className="text-input" maxLength={80} value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })} /></label>
        <label className="field"><span>{t('nc.description')}</span><textarea className="text-input" rows={3} maxLength={1000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <label className="check"><input type="checkbox" checked={f.isPublic} onChange={(e) => setF({ ...f, isPublic: e.target.checked })} /> {t('nc.public')}</label>
        <p className="hint">{t('nc.publicHint')}</p>
        <label className="check"><input type="checkbox" checked={f.finished} onChange={(e) => setF({ ...f, finished: e.target.checked })} /> {t('nc.finishedLabel')}</label>
        <button className="btn primary" disabled={f.title.trim().length < 2} onClick={save}>{t('common.save')}</button>
      </div>
      <div className="card">
        {!confirmDelete ? (
          <button className="btn danger-ghost" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={15} /> {t('nc.delete')}</button>
        ) : (
          <div className="field-row wrap">
            <span>{t('nc.deleteConfirm')}</span>
            <button className="btn danger-ghost" onClick={async () => { try { await deleteCampaign(row.id); navigate('play/campaigns'); } catch (e) { onError(campaignError(e)); } }}>{t('nc.deleteYes')}</button>
            <button className="btn ghost" onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</button>
          </div>
        )}
      </div>
    </div>
  );
}
