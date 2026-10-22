// Smoke test of the LIVE Supabase project: auth, RLS and PLAY functions, with the public anon key
// only (no secret). Writes are reversible: a registration is withdrawn, a draft tournament deleted.
// Usage: node scripts/check-supabase.mjs   (reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env)
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const URL_ = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;
const PASSWORD = 'demo-password-2026';
const client = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

let failures = 0;
const ok = (cond, label, detail = '') => {
  if (!cond) failures++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} - ${label}${detail ? `  (${detail})` : ''}`);
};

// --- Anonymous visitor ----------------------------------------------------------------------
const anon = client();
{
  const { data, error } = await anon.rpc('search_tournaments');
  ok(!error && data.length === 20, 'anon lists the 20 published tournaments', error?.message ?? `${data?.length} rows`);

  const near = await anon.rpc('search_tournaments', { p_lat: 35.6812, p_lng: 139.7671, p_radius_km: 15 });
  const d = near.data?.map((r) => r.distance_km) ?? [];
  ok(!near.error && d.length > 0 && d.length < 20, 'PostGIS radius search (15 km around Tokyo station)', `${d.length} rows, max ${Math.max(...d)} km`);
  ok(d.every((x, i) => x <= 15 && (i === 0 || d[i - 1] <= x)), 'results within radius and sorted by distance');

  const full = await anon.rpc('search_tournaments', { p_has_spots: true });
  ok(!full.error && !full.data.some((r) => r.slug === 'shinjuku-english-night'), '"spots remaining" filter hides the full event');

  for (const table of ['events', 'reports', 'stream_cache', 'contest_votes']) {
    const r = await anon.from(table).select('*').limit(1);
    ok(!r.error ? r.data.length === 0 : true, `anon cannot read ${table}`, r.error?.message ?? `${r.data.length} rows`);
  }
  const reg = await anon.rpc('register_for_tournament', { p_tournament: '00000000-0000-0000-0000-000000000000' });
  ok(!!reg.error, 'anon cannot call write functions', reg.error?.message);
}

// --- Player --------------------------------------------------------------------------------
const player = client();
const signIn = await player.auth.signInWithPassword({ email: 'player@demo.example', password: PASSWORD });
ok(!signIn.error, 'demo player signs in with email + password', signIn.error?.message);
const playerId = signIn.data.user?.id;
if (playerId) {
  const me = await player.from('profiles').select('handle, display_name, preferred_lang').eq('id', playerId).single();
  ok(me.data?.handle === 'demo_player', 'profile created by the sign-up trigger', JSON.stringify(me.data));

  const admin = await player.from('profiles').update({ is_admin: true }).eq('id', playerId);
  ok(!!admin.error, 'player cannot make themselves admin', admin.error?.message);

  const other = await player.from('profiles').select('id, display_name').neq('id', playerId).limit(1).single();
  await player.from('profiles').update({ display_name: 'Hacked' }).eq('id', other.data.id);
  const after = await anon.from('profiles').select('display_name').eq('id', other.data.id).single();
  ok(after.data?.display_name === other.data.display_name, 'player cannot edit another profile');

  const t = (await anon.from('tournaments').select('id, slug').eq('slug', 'kanda-first-steps-2').single()).data;
  const r1 = await player.rpc('register_for_tournament', { p_tournament: t.id });
  ok(!r1.error && r1.data === 'registered', 'player registers to an open event', r1.error?.message ?? r1.data);
  const w = await player.rpc('withdraw_from_tournament', { p_tournament: t.id });
  const st = await player.from('registrations').select('status').eq('tournament_id', t.id).eq('user_id', playerId).single();
  ok(!w.error && st.data?.status === 'withdrawn', 'player withdraws (registration reverted)', w.error?.message ?? st.data?.status);
}

// --- Organiser -----------------------------------------------------------------------------
const organiser = client();
const orgIn = await organiser.auth.signInWithPassword({ email: 'organiser@demo.example', password: PASSWORD });
ok(!orgIn.error, 'demo organiser signs in', orgIn.error?.message);
if (orgIn.data.user) {
  const store = (await anon.from('stores').select('id, name, address, location').eq('name', 'Kanda Miniature Hall').single()).data;
  const start = new Date(Date.now() + 10 * 864e5);
  const draft = {
    slug: `check-draft-${Date.now()}`,
    name: 'Automated check draft',
    organiser_id: orgIn.data.user.id,
    store_id: store.id,
    venue_name: store.name,
    address: store.address,
    location: 'SRID=4326;POINT(139.7712 35.6995)',
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + 4 * 36e5).toISOString(),
    registration_deadline: new Date(start.getTime() - 36e5).toISOString(),
    list_deadline: new Date(start.getTime() - 864e5).toISOString(),
    format_id: 'skirmish',
    type: 'beginner',
    max_players: 8,
    rounds_planned: 3,
  };
  const ins = await organiser.from('tournaments').insert(draft).select('id').single();
  ok(!ins.error, 'organiser creates a draft tournament', ins.error?.message);
  if (ins.data) {
    const seenByPlayer = await player.from('tournaments').select('id').eq('id', ins.data.id);
    ok(seenByPlayer.data?.length === 0, 'drafts are invisible to other players');
    const del = await organiser.from('tournaments').delete().eq('id', ins.data.id);
    const gone = await organiser.from('tournaments').select('id').eq('id', ins.data.id);
    ok(!del.error && gone.data?.length === 0, 'organiser deletes the draft (cleanup)', del.error?.message);
  }
  const hijack = await player.from('tournaments').update({ name: 'Hijacked' }).eq('slug', 'kanda-first-steps-1').select('id');
  ok((hijack.data ?? []).length === 0, 'player cannot edit someone else\'s tournament');
}

// --- Quick play (migration 20261024000005) ---------------------------------------------------
{
  const games = await anon.from('games').select('id, game_system, status');
  ok(!games.error && games.data.length >= 8, 'anon lists the demo quick play games', games.error?.message ?? `${games.data?.length} rows`);
  const addr = await anon.from('game_private').select('address');
  ok(!addr.error && addr.data.length === 0, 'anon sees no exact address', addr.error?.message);
  if (playerId) {
    const mine = await player.from('game_private').select('game_id');
    ok(!mine.error && mine.data.length === 1, 'player sees only the address of the game they were accepted to', `${mine.data?.length} rows`);
  }
  if (playerId && orgIn.data.user) {
    const start = new Date(Date.now() + 3 * 864e5).toISOString();
    const created = await organiser.rpc('create_game', {
      p_game_system: 'Automated check', p_format: null, p_points: null, p_starts_at: start, p_duration_minutes: 60,
      p_max_players: 2, p_level: 'casual', p_language: 'en', p_country: 'JP', p_city: 'Tokyo', p_area: 'Check',
      p_address: 'Check address 1-2-3', p_store: null, p_note: 'Created and cancelled by scripts/check-supabase.mjs',
    });
    ok(!created.error, 'organiser hosts a game through create_game', created.error?.message);
    const id = created.data;
    if (id) {
      const req = await player.rpc('request_join_game', { p_game: id, p_message: 'check' });
      ok(!req.error && req.data === 'pending', 'player asks to join', req.error?.message ?? req.data);
      const hidden = await player.from('game_private').select('address').eq('game_id', id);
      ok(hidden.data?.length === 0, 'no address while pending');
      const acc = await organiser.rpc('respond_join_game', { p_game: id, p_player: playerId, p_accept: true });
      ok(!acc.error && acc.data === 'accepted', 'host accepts', acc.error?.message ?? acc.data);
      const shown = await player.from('game_private').select('address').eq('game_id', id);
      ok(shown.data?.length === 1, 'address visible once accepted');
      await player.rpc('leave_game', { p_game: id });
      const can = await organiser.rpc('cancel_game', { p_game: id });
      ok(!can.error, 'host cancels the check game (cleanup)', can.error?.message);
    }
  }
}

// --- Gallery (migration 20261023000004) ----------------------------------------------------
if (playerId) {
  // 1×1 transparent PNG
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const path = `${playerId}/${crypto.randomUUID()}.png`;
  const up = await player.storage.from('gallery').upload(path, png, { contentType: 'image/png' });
  ok(!up.error, 'player uploads into their gallery folder', up.error?.message);
  const row = await player.from('gallery_items').insert({ owner_id: playerId, title: 'Check', image_path: path, paints: [] }).select('id').single();
  ok(!row.error, 'player records the gallery item', row.error?.message);
  const foreign = await organiser.from('gallery_items').select('id').eq('id', row.data?.id ?? '');
  ok((foreign.data ?? []).length === 0, 'another player cannot see it');
  const signed = await player.storage.from('gallery').createSignedUrl(path, 60);
  ok(!signed.error && !!signed.data?.signedUrl, 'owner gets a signed URL', signed.error?.message);
  const sneaky = await organiser.storage.from('gallery').createSignedUrl(path, 60);
  ok(!!sneaky.error, 'another player gets no signed URL', sneaky.error?.message);
  if (row.data) await player.from('gallery_items').delete().eq('id', row.data.id);
  await player.storage.from('gallery').remove([path]);
  const gone = await player.from('gallery_items').select('id').eq('id', row.data?.id ?? '');
  ok((gone.data ?? []).length === 0, 'player deletes it (cleanup)');
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll live checks passed.');
process.exit(failures ? 1 : 0);
