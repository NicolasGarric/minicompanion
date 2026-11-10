import { supabase } from '../../core/auth/supabase';
import { removePhotos, uploadPhoto } from '../../core/lib/photo';
import { cleanGroups, cleanInfo, legacyInfo, type Groups, type InfoLine } from './cards';
import { hid, NO_SYNC, photoBlob, useHobby, type Army, type LocalDeck, type Unit, type UnitPhoto } from './store';
import type { Role } from './deckCodec';
import { cleanRefs, type RefLink } from '../../core/lib/refLinks';

/**
 * My pile on the account (migration 23). The device keeps working copy and photos; once the player
 * has imported the pile, every change is pushed (armies, units with their card, decks, photos to the
 * "pile" bucket), and opening the app pulls what other devices changed. The account wins after a push.
 */

type Labels = { points: string; stars: string; note: string };
interface ArmyRow { id: string; local_id: string | null; name: string; colour: string; position: number }
interface UnitRow {
  id: string; army_id: string; local_id: string | null; name: string; role: Role; stage: Unit['stage']; count: number; painted: number;
  note: string | null; info: InfoLine[]; photos: { p: string; at: number }[]; card_photo: string | null; linked_to: string | null;
  position: number; done_at: string | null; created_at: string;
}
interface DeckRow { id: string; name: string; groups: Groups; refs?: RefLink[]; created_at: string }

const db = () => {
  if (!supabase) throw new Error('backend');
  return supabase;
};
const must = <T>(r: { data: T | null; error: unknown }): T => {
  if (r.error) throw r.error;
  return r.data as T;
};

/** Before migration 25 the decks have no `refs` column: the links then stay on this device. */
let deckRefs = true;
const noColumn = (e: unknown) => (e as { code?: string })?.code === '42703' || /refs/.test(String((e as { message?: string })?.message ?? ''));
async function writeDeck(row: { name: string; groups: string[][]; refs: RefLink[] }, remoteId?: string): Promise<string> {
  const send = async (r: Partial<typeof row>) => remoteId
    ? (await db().from('decks').update(r).eq('id', remoteId)).error
    : await db().from('decks').insert(r).select('id').single().then((x) => (x.error ? x.error : ((remoteId = (x.data as { id: string }).id), null)));
  let err = await send(deckRefs ? row : { name: row.name, groups: row.groups });
  if (err && deckRefs && noColumn(err)) {
    deckRefs = false;
    err = await send({ name: row.name, groups: row.groups });
  }
  if (err) throw err;
  return remoteId!;
}
async function readDecks(): Promise<DeckRow[]> {
  if (deckRefs) {
    const r = await db().from('decks').select('id, name, groups, refs, created_at').order('created_at');
    if (!r.error) return r.data as DeckRow[];
    if (!noColumn(r.error)) throw r.error;
    deckRefs = false;
  }
  return must(await db().from('decks').select('id, name, groups, created_at').order('created_at')) as DeckRow[];
}

async function serverIds() {
  const armies = must(await db().from('pile_armies').select('id, local_id')) as Pick<ArmyRow, 'id' | 'local_id'>[];
  const units = must(await db().from('pile_units').select('id, local_id')) as Pick<UnitRow, 'id' | 'local_id'>[];
  return {
    army: new Map(armies.map((a) => [a.local_id ?? a.id, a.id])),
    unit: new Map(units.map((u) => [u.local_id ?? u.id, u.id])),
  };
}

/** Photos not on the account yet are uploaded (blob still on this device). */
async function uploadMissing(uid: string, armyId: string, u: Unit): Promise<UnitPhoto[]> {
  const out: UnitPhoto[] = [];
  for (const p of u.photos) {
    if (p.remote) {
      out.push(p);
      continue;
    }
    const blob = await photoBlob(p.id).catch(() => undefined);
    if (!blob) continue;
    out.push({ ...p, remote: await uploadPhoto('pile', uid, blob, { quota: false }) });
  }
  if (out.some((p, i) => p.remote !== u.photos[i]?.remote)) {
    useHobby.setState((s) => ({
      armies: s.armies.map((a) => (a.id !== armyId ? a : {
        ...a,
        units: a.units.map((x) => (x.id !== u.id ? x : { ...x, photos: x.photos.map((p) => out.find((q) => q.id === p.id) ?? p) })),
      })),
    }));
  }
  return out;
}

/** Sends what changed since the last push. */
export async function pushPile(uid: string, labels: Labels) {
  const st = useHobby.getState();
  const { dirty, gone } = st.sync;
  if (!dirty.length && !gone.armies.length && !gone.units.length && !gone.decks.length) return;
  const ids = await serverIds();

  if (gone.decks.length) {
    const remote = gone.decks.filter((d) => /^[0-9a-f-]{36}$/.test(d));
    if (remote.length) must(await db().from('decks').delete().in('id', remote));
  }
  const goneUnits = gone.units.map((l) => ids.unit.get(l)).filter(Boolean) as string[];
  if (goneUnits.length) must(await db().from('pile_units').delete().in('id', goneUnits));
  const goneArmies = gone.armies.map((l) => ids.army.get(l)).filter(Boolean) as string[];
  if (goneArmies.length) must(await db().from('pile_armies').delete().in('id', goneArmies));

  const keys = new Set(dirty);
  const armies = st.armies;
  // Armies first (units need their id), every army whose unit changed too
  const armyRows = armies
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => keys.has(`a:${a.id}`) || a.units.some((u) => keys.has(`u:${a.id}:${u.id}`)) || !ids.army.has(a.id))
    .map(({ a, i }) => ({ local_id: a.id, name: a.name.trim().slice(0, 60) || '—', colour: /^#[0-9a-f]{6}$/i.test(a.colour) ? a.colour : '#1d2a5b', position: i }));
  if (armyRows.length) {
    const back = must(await db().from('pile_armies').upsert(armyRows, { onConflict: 'owner_id,local_id' }).select('id, local_id')) as Pick<ArmyRow, 'id' | 'local_id'>[];
    for (const r of back) ids.army.set(r.local_id!, r.id);
  }

  const unitRows: Record<string, unknown>[] = [];
  const links: [string, string | undefined][] = [];
  for (const a of armies) {
    for (const [i, u] of a.units.entries()) {
      if (!keys.has(`u:${a.id}:${u.id}`) && ids.unit.has(u.id)) continue;
      const photos = (await uploadMissing(uid, a.id, u)).filter((p) => p.remote);
      const card = photos.find((p) => p.id === u.cardPhoto);
      unitRows.push({
        local_id: u.id,
        army_id: ids.army.get(a.id),
        name: u.name.trim().slice(0, 60) || '—',
        role: u.role,
        stage: u.stage,
        count: u.count,
        painted: Math.min(u.painted, u.count),
        note: u.note?.slice(0, 500) ?? null,
        info: cleanInfo(u.info ?? legacyInfo(u, labels)),
        photos: photos.slice(-40).map((p) => ({ p: p.remote, at: p.at })),
        card_photo: card?.remote ?? null,
        linked_to: null,
        position: i,
        done_at: u.doneAt ? new Date(u.doneAt).toISOString() : null,
      });
      links.push([u.id, u.linkedTo]);
    }
  }
  if (unitRows.length) {
    const back = must(await db().from('pile_units').upsert(unitRows, { onConflict: 'owner_id,local_id' }).select('id, local_id')) as Pick<UnitRow, 'id' | 'local_id'>[];
    for (const r of back) ids.unit.set(r.local_id!, r.id);
    // Links once every unit has its id (a link may point to a unit pushed in the same batch)
    for (const [local, to] of links) {
      const target = to ? ids.unit.get(to) : null;
      must(await db().from('pile_units').update({ linked_to: target ?? null }).eq('id', ids.unit.get(local)!));
    }
  }

  const decks = useHobby.getState().decks;
  const remoteIds = new Map<string, string>();
  for (const d of decks) {
    if (!keys.has(`d:${d.id}`) && d.remoteId) continue;
    const groups = d.groups.map((g) => g.map((id) => ids.unit.get(id)).filter(Boolean) as string[]).filter((g) => g.length);
    const row = { name: d.name.trim().slice(0, 60) || '—', groups, refs: cleanRefs(d.refs) };
    if (d.remoteId) await writeDeck(row, d.remoteId);
    else remoteIds.set(d.id, await writeDeck(row));
  }

  // Changes made while pushing stay for the next push
  const now = useHobby.getState();
  now.replaceAll(
    { armies: now.armies, decks: now.decks.map((d) => (remoteIds.has(d.id) ? { ...d, remoteId: remoteIds.get(d.id) } : d)) },
    {
      ...now.sync,
      dirty: now.sync.dirty.filter((k) => !keys.has(k)),
      gone: {
        armies: now.sync.gone.armies.filter((x) => !gone.armies.includes(x)),
        units: now.sync.gone.units.filter((x) => !gone.units.includes(x)),
        decks: now.sync.gone.decks.filter((x) => !gone.decks.includes(x)),
      },
    },
  );
}

/** Replaces the pile of this device with the account's, keeping the photos already on the device. */
export async function pullPile(uid: string) {
  const armies = must(await db().from('pile_armies').select('id, local_id, name, colour, position').order('position')) as ArmyRow[];
  const units = must(await db().from('pile_units').select('*').order('position')) as UnitRow[];
  const decks = await readDecks();
  const st = useHobby.getState();
  if (st.sync.dirty.length) return; // a change happened meanwhile: push it first
  const localUnits = new Map(st.armies.flatMap((a) => a.units).map((u) => [u.id, u]));
  const localOf = new Map(units.map((u) => [u.id, u.local_id ?? u.id]));

  const next: Army[] = armies.map((a) => {
    const old = st.armies.find((x) => x.id === (a.local_id ?? a.id));
    return {
      id: a.local_id ?? a.id,
      name: a.name,
      colour: a.colour,
      createdAt: old?.createdAt ?? Date.now(),
      units: units.filter((u) => u.army_id === a.id).map((u): Unit => {
        const id = u.local_id ?? u.id;
        const prev = localUnits.get(id);
        const photos: UnitPhoto[] = u.photos.map((p) => prev?.photos.find((q) => q.remote === p.p) ?? { id: hid(), at: p.at, remote: p.p });
        // Photos taken on this device and not uploaded yet stay
        for (const q of prev?.photos ?? []) if (!q.remote) photos.push(q);
        return {
          id,
          name: u.name,
          role: u.role,
          stage: u.stage,
          count: u.count,
          painted: u.painted,
          note: u.note ?? undefined,
          info: u.info,
          cardPhoto: photos.find((p) => p.remote && p.remote === u.card_photo)?.id,
          linkedTo: u.linked_to ? localOf.get(u.linked_to) : undefined,
          photos,
          doneAt: u.done_at ? Date.parse(u.done_at) : undefined,
          createdAt: prev?.createdAt ?? Date.parse(u.created_at),
        };
      }),
    };
  });
  const known = new Set(next.flatMap((a) => a.units.map((u) => u.id)));
  const nextDecks: LocalDeck[] = decks.map((d) => {
    const old = st.decks.find((x) => x.remoteId === d.id);
    return {
      id: old?.id ?? hid(),
      name: d.name,
      remoteId: d.id,
      refs: deckRefs ? cleanRefs(d.refs) : old?.refs,
      createdAt: old?.createdAt ?? Date.parse(d.created_at),
      groups: cleanGroups(d.groups.map((g) => g.map((x) => localOf.get(x) ?? x)), known),
    };
  });
  st.replaceAll({ armies: next, decks: nextDecks }, { ...NO_SYNC, owner: uid });
}

/** First time on this account: every army, unit and deck of the device is sent, then the account's pile comes back. */
export async function importPile(uid: string, labels: Labels) {
  const st = useHobby.getState();
  const dirty = [
    ...st.armies.flatMap((a) => [`a:${a.id}`, ...a.units.map((u) => `u:${a.id}:${u.id}`)]),
    ...st.decks.map((d) => `d:${d.id}`),
  ];
  st.setSync({ ...NO_SYNC, owner: uid, dirty });
  await pushPile(uid, labels);
  await pullPile(uid);
}

/** Photos removed on the device are removed from the account too. */
export const removeRemotePhotos = (paths: (string | undefined)[]) => removePhotos('pile', paths.filter((p): p is string => !!p)).catch(() => undefined);

/* ---------- Online decks: share link, games ---------- */

export interface OnlineDeck {
  id: string;
  name: string;
  owner: string | null;
  groups: Groups;
  refs?: RefLink[];
  cards: { id: string; name: string; role: Role; info: InfoLine[]; linked_to: string | null; photo: string | null; army: string; colour: string }[];
}

/** Turns the read-only link on (code) or off (null). */
export async function shareDeck(remoteId: string, on: boolean): Promise<string | null> {
  return must(await db().rpc('deck_share', { p_deck: remoteId, p_on: on })) as string | null;
}
export async function deckShareCode(remoteId: string): Promise<string | null> {
  const r = must(await db().from('decks').select('share_code').eq('id', remoteId).maybeSingle()) as { share_code: string | null } | null;
  return r?.share_code ?? null;
}
export const deckUrl = (remoteId: string, code: string) => `${location.origin}/deck/${remoteId}?c=${code}`;

export async function viewDeck(remoteId: string, code?: string | null): Promise<OnlineDeck | null> {
  return must(await db().rpc('deck_view', { p_deck: remoteId, p_code: code ?? null })) as OnlineDeck | null;
}

export async function setGameDeck(gameId: string, remoteId: string | null) {
  must(await db().rpc('set_game_deck', { p_game: gameId, p_deck: remoteId }));
}
export async function gameDecks(gameId: string): Promise<{ player_id: string; deck_id: string }[]> {
  return must(await db().from('game_decks').select('player_id, deck_id').eq('game_id', gameId)) as { player_id: string; deck_id: string }[];
}
