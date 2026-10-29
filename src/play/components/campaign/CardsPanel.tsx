import { useEffect, useMemo, useState } from 'react';
import { k, useT } from '../../../core/i18n';
import { supabase } from '../../../core/auth/supabase';
import { Icon } from '../../../core/ui/ui';
import { cleanInfo, diffInfo, markRows, sumOf, type Groups, type InfoChange, type InfoLine } from '../../../paint/hobby/cards';
import { useHobby } from '../../../paint/hobby/store';
import { InfoEditor, SwipeDeck, pileUrl, type CardView } from '../../../paint/components/UnitCard';
import { usePointsLabels } from '../../../paint/pages/Decks';
import { campaignError, type Board, type CampId, type LogRow, type Member } from '../../lib/narrative';
import type { Role } from '../../../paint/hobby/deckCodec';

/**
 * Campaign cards (migration 23): each player brings one of his combat decks; the campaign keeps a
 * copy whose cards evolve battle after battle (stats, rules gained or lost). Each change is a
 * journal entry the other camps can contest; the card shows its changed rows and its history.
 */
interface CDeck { id: string; owner_id: string; camp: CampId | null; name: string; groups: Groups }
interface CCard { id: string; campaign_deck_id: string; owner_id: string; name: string; role: Role; colour: string | null; photo: string | null; info: InfoLine[]; linked_to: string | null }

const db = () => {
  if (!supabase) throw new Error('backend');
  return supabase;
};

async function loadCards(campaign: string) {
  const [d, c] = await Promise.all([
    db().from('campaign_decks').select('id, owner_id, camp, name, groups').eq('campaign_id', campaign).order('created_at'),
    db().from('campaign_cards').select('id, campaign_deck_id, owner_id, name, role, colour, photo, info, linked_to').eq('campaign_id', campaign),
  ]);
  if (d.error) throw d.error;
  if (c.error) throw c.error;
  return { decks: d.data as CDeck[], cards: c.data as CCard[] };
}

/** One line per change: "Endurance 8 → 9", "+ Rule: Veteran", "− Shield wall". */
export function useChangeText() {
  const t = useT();
  const short = (v: unknown) => {
    const s = String(v ?? '');
    return s.length > 48 ? `${s.slice(0, 46)}…` : s;
  };
  return (c: InfoChange) =>
    c.kind === 'up' || c.kind === 'down' ? `${c.label} ${c.before} → ${c.after}`
      : c.kind === 'added' ? `+ ${c.label} : ${short(c.after)}`
        : c.kind === 'removed' ? `− ${c.label} : ${short(c.before)}`
          : t('cards.changedRow', { label: c.label });
}

export function CardsPanel({ campaignId, title, board, members, myCamp, isMaster, me, log, onChanged }: {
  campaignId: string; title: string; board: Board; members: Member[]; myCamp: CampId | null; isMaster: boolean; me: string | null;
  log: LogRow[]; onChanged: () => Promise<void> | void;
}) {
  const t = useT();
  const changeText = useChangeText();
  const pts = usePointsLabels();
  const myDecks = useHobby((s) => (me && s.sync.owner === me ? s.decks.filter((d) => d.remoteId) : []));
  const [data, setData] = useState<Awaited<ReturnType<typeof loadCards>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState('');
  const logKey = log.length + (log[0]?.id ?? '');

  useEffect(() => {
    loadCards(campaignId).then(setData, (e) => setError(campaignError(e)));
  }, [campaignId, logKey]);

  const run = async (fn: () => PromiseLike<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      if ((r as { error?: unknown })?.error) throw (r as { error: unknown }).error;
      await onChanged();
      setData(await loadCards(campaignId));
    } catch (e) {
      setError(campaignError(e));
    }
    setBusy(false);
  };

  // Journal entries of each card, oldest first
  const history = useMemo(() => {
    const m = new Map<string, LogRow[]>();
    for (const l of [...log].reverse()) {
      if (l.effect !== 'card') continue;
      const id = String((l.detail as { card?: string }).card ?? '');
      m.set(id, [...(m.get(id) ?? []), l]);
    }
    return m;
  }, [log]);

  if (!data) return <div className="nc-pane">{error ? <p className="error">{t(k(`nc.error.${error}`))}</p> : <span className="spinner" />}</div>;
  const mine = data.decks.find((d) => d.owner_id === me);
  const nameOf = (uid: string) => members.find((m) => m.user_id === uid)?.profile?.display_name ?? '?';

  const viewOf = (c: CCard): CardView => {
    const h = (history.get(c.id) ?? []).filter((l) => l.resolution !== 'undone');
    const start = (h[0]?.detail as { before?: InfoLine[] } | undefined)?.before ?? c.info;
    const { rows, lost } = markRows(start, c.info);
    const grp = data.decks.find((d) => d.id === c.campaign_deck_id)?.groups.find((g) => g.includes(c.id)) ?? [];
    return {
      id: c.id, name: c.name, role: c.role, colour: c.colour ?? '#1d2a5b', photo: c.photo ? pileUrl(c.photo) : undefined, rows, lost,
      links: grp.filter((x) => x !== c.id).map((x) => [x, data.cards.find((y) => y.id === x)?.name ?? '?']),
      history: (history.get(c.id) ?? []).map((l) => {
        const d = l.detail as { before?: InfoLine[]; after?: InfoLine[]; note?: string };
        const changes = diffInfo(d.before ?? [], d.after ?? []).map(changeText).join(' · ');
        return {
          when: t('nc.turn', { n: l.turn }),
          text: `${d.note ? `${d.note} — ` : ''}${changes || t('cards.noChange')}`,
          state: l.resolution === 'undone' ? 'undone' : l.contested_by && !l.resolution ? 'contested' : 'ok',
        };
      }),
    };
  };

  return (
    <div className="nc-pane nc-cards">
      <p className="hint">{t('cards.campaignLead')}</p>
      {error && <p className="error" role="alert">{t(k(`nc.error.${error}`))}</p>}
      {myCamp && (
        <div className="card nc-bring">
          {myDecks.length ? (
            <div className="field-row wrap">
              <select className="select" value={pick} onChange={(e) => setPick(e.target.value)} aria-label={t('cards.bringDeck')}>
                <option value="">{t('cards.chooseDeck')}</option>
                {myDecks.map((d) => <option key={d.id} value={d.remoteId}>{d.name}</option>)}
              </select>
              <button className="btn primary" disabled={busy || !pick} onClick={() => run(() => db().rpc('bring_deck_to_campaign', { p_campaign: campaignId, p_deck: pick }))}>
                <Icon name="layers" size={15} /> {t(mine ? 'cards.replaceDeck' : 'cards.bringDeck')}
              </button>
              {mine && (
                <button className="btn small ghost" disabled={busy} onClick={() => run(() => db().rpc('remove_campaign_deck', { p_campaign: campaignId }))}>{t('cards.removeDeck')}</button>
              )}
            </div>
          ) : (
            <p className="hint">{t('cards.campaignHow')} <a href="/paint/decks">{t('cards.decks')}</a></p>
          )}
        </div>
      )}
      {data.decks.length === 0 && <p className="hint">{t('cards.noCampaignDecks')}</p>}
      {data.decks.map((d) => {
        const camp = board.camps.find((c) => c.id === d.camp);
        const cards = d.groups.flat().map((id) => data.cards.find((c) => c.id === id)).filter((c): c is CCard => !!c);
        const views = cards.map(viewOf);
        const total = sumOf(views.map((v) => ({ info: v.rows })), pts);
        const canEvolve = d.owner_id === me || isMaster;
        return (
          <section key={d.id} className="nc-deck" style={camp ? { ['--camp' as string]: camp.color } : undefined}>
            <h3>{nameOf(d.owner_id)} · {camp?.name ?? t('nc.spectator')}</h3>
            <SwipeDeck cards={views} groups={d.groups} title={d.name} total={total ? `${total} ${t('pile.pts')}` : undefined} band={[title, camp?.name ?? '']} />
            {canEvolve && <Evolve cards={cards} busy={busy} onSave={(card, info, note) => run(() => db().rpc('evolve_campaign_card', { p_card: card, p_info: info, p_note: note || null }))} />}
          </section>
        );
      })}
    </div>
  );
}

/** Pick a card, change its rows, say why (battle, event): one journal entry. */
function Evolve({ cards, busy, onSave }: { cards: CCard[]; busy: boolean; onSave: (card: string, info: InfoLine[], note: string) => void }) {
  const t = useT();
  const [id, setId] = useState('');
  const [lines, setLines] = useState<InfoLine[]>([]);
  const [note, setNote] = useState('');
  const card = cards.find((c) => c.id === id);
  const changes = card ? diffInfo(card.info, cleanInfo(lines)) : [];
  return (
    <details className="nc-evolve">
      <summary>{t('cards.evolve')}</summary>
      <label className="field">
        <span>{t('cards.evolveWhich')}</span>
        <select className="select" value={id} onChange={(e) => {
          setId(e.target.value);
          setLines(cards.find((c) => c.id === e.target.value)?.info ?? []);
        }}>
          <option value="">—</option>
          {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      {card && (
        <>
          <InfoEditor lines={lines} onChange={setLines} />
          <label className="field">
            <span>{t('cards.evolveWhy')}</span>
            <input className="text-input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('cards.evolveWhyPlaceholder')} />
          </label>
          <button className="btn primary" disabled={busy || !changes.length} onClick={() => {
            onSave(card.id, cleanInfo(lines), note.trim());
            setNote('');
          }}>{t('cards.evolveSave', { n: changes.length })}</button>
        </>
      )}
    </details>
  );
}
