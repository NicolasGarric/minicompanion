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
    // Multi-week events: one date and venue per round
    const week = (n) => new Date(Date.now() + (30 + 7 * n) * 864e5).toISOString();
    const plan = await organiser.rpc('set_round_schedule', {
      p_tournament: ins.data.id,
      p_rounds: [1, 2, 3].map((n) => ({ number: n, starts_at: week(n), venue_name: n === 3 ? 'Community hall' : null, address: n === 3 ? 'Kanda, Tokyo' : null })),
    });
    const slots = await organiser.from('round_schedule').select('number, venue_name').eq('tournament_id', ins.data.id).order('number');
    ok(!plan.error && slots.data?.length === 3 && slots.data[2].venue_name === 'Community hall', 'organiser sets a date and venue per round', plan.error?.message);
    const badPlan = await player.rpc('set_round_schedule', { p_tournament: ins.data.id, p_rounds: [] });
    ok(!!badPlan.error, 'players cannot change the schedule');
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
    const upcoming = (await anon.from('games').select('id').gt('starts_at', new Date().toISOString())).data?.map((g) => g.id) ?? [];
    const mine = await player.from('game_private').select('game_id').in('game_id', upcoming);
    ok(!mine.error && mine.data.length === 1, 'player sees only the address of the upcoming game they were accepted to', `${mine.data?.length} rows`);
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
      ok(!can.error, 'host cancels the check game', can.error?.message);
      const purge = await organiser.rpc('purge_check_games');
      ok(!purge.error && purge.data >= 1, 'host deletes the cancelled check games (cleanup)', purge.error?.message ?? `${purge.data} deleted`);
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

// --- Social layer (migration 20261025000006): read-only checks on the demo data -----------------
{
  const league = await anon.from('leagues').select('id').eq('name', 'Autumn Kill Team League').maybeSingle();
  ok(!league.error && !!league.data, 'anon sees the demo league', league.error?.message);
  if (league.data) {
    const table = await anon.rpc('league_standings', { p_league: league.data.id });
    ok(!table.error && table.data.length === 6 && table.data[0].points >= table.data[5].points, 'league standings (6 members, sorted)', table.error?.message);
  }
  const posts = await anon.from('lfg_posts').select('id');
  ok(!posts.error && posts.data.length >= 3, 'anon lists "looking for a game" posts', posts.error?.message);
  const reports = await anon.from('game_reports').select('game_id').eq('status', 'confirmed');
  ok(!reports.error && reports.data.length >= 6, 'confirmed battle reports are public', reports.error?.message);
  if (playerId) {
    const ratings = await anon.from('player_ratings').select('rating').eq('player_id', playerId);
    ok(!ratings.error && ratings.data.length === 1 && ratings.data[0].rating > 1000, 'public profile: rating visible to anon', ratings.error?.message);
    const stats = await anon.rpc('player_stats', { p_user: orgIn.data.user?.id });
    ok(!stats.error && stats.data === null, 'private profile: stats hidden from anon', stats.error?.message);
    const notes = await anon.from('notifications').select('id');
    ok(!notes.error && notes.data.length === 0, 'anon reads no notification');
    const dms = await player.from('direct_messages').select('sender_id, recipient_id');
    ok(!dms.error && dms.data.length >= 3 && dms.data.every((m) => m.sender_id === playerId || m.recipient_id === playerId), 'player reads only their own messages', dms.error?.message);
    const stranger = await organiser.from('direct_messages').select('id').or(`sender_id.eq.${playerId},recipient_id.eq.${playerId}`);
    ok((stranger.data ?? []).length === 0, 'another player cannot read them');
  }
}

// --- Tournament flow (migration 20261027000008): a full mini event, hidden afterwards ----------
if (playerId && orgIn.data.user) {
  const live = await anon.from('matches').select('id, tournament:tournaments!inner(slug)').eq('tournament.slug', 'kanda-live-friday');
  ok(!live.error && live.data.length >= 8, 'anon sees the pairings of the demo event in progress', live.error?.message);
  const qr = await anon.from('game_tables').select('qr_token').limit(1);
  ok(!qr.error && qr.data.length === 0, 'anon cannot read table QR tokens', qr.error?.message);

  const store = (await anon.from('stores').select('id, name, address, location').eq('name', 'Kanda Miniature Hall').single()).data;
  const start = new Date(Date.now() + 2 * 864e5);
  const ins = await organiser.from('tournaments').insert({
    slug: `check-flow-${Date.now()}`, name: 'Automated check tournament', organiser_id: orgIn.data.user.id, store_id: store.id,
    venue_name: store.name, address: store.address, location: 'SRID=4326;POINT(139.7712 35.6995)',
    starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 4 * 36e5).toISOString(),
    registration_deadline: new Date(start.getTime() - 36e5).toISOString(), list_deadline: new Date(start.getTime() - 864e5).toISOString(),
    format_id: 'skirmish', type: 'casual', max_players: 4, rounds_planned: 1, status: 'published', game_system: 'Check',
  }).select('id').single();
  ok(!ins.error, 'organiser publishes a tournament', ins.error?.message);
  const tid = ins.data?.id;
  if (tid) {
    const r1 = await player.rpc('register_for_tournament', { p_tournament: tid });
    const r2 = await organiser.rpc('register_for_tournament', { p_tournament: tid });
    ok(!r1.error && !r2.error, 'two players register', r1.error?.message ?? r2.error?.message);
    const st = await organiser.rpc('start_tournament', { p_tournament: tid });
    ok(!st.error && st.data === 1, 'organiser starts it (1 table)', st.error?.message);
    const tokens = await organiser.from('game_tables').select('qr_token').eq('tournament_id', tid);
    ok(tokens.data?.length === 1, 'organiser reads the table QR token');
    const bad = await player.rpc('create_round', { p_tournament: tid, p_pairings: [{ a: playerId, b: orgIn.data.user.id }] });
    ok(!!bad.error, 'players cannot pair rounds', bad.error?.message);
    const round = await organiser.rpc('create_round', { p_tournament: tid, p_pairings: [{ a: playerId, b: orgIn.data.user.id }] });
    ok(!round.error, 'organiser publishes round 1', round.error?.message);
    const table = await anon.rpc('table_match', { p_token: tokens.data?.[0]?.qr_token });
    const m = table.data?.[0];
    ok(!table.error && m?.player_a === playerId, 'the QR page shows the match of the table', table.error?.message);
    const rep = await player.rpc('report_match', { p_match: m?.match_id, p_a_primary: 10, p_a_secondary: 4, p_b_primary: 8, p_b_secondary: 3, p_result: 'a_win' });
    ok(!rep.error && rep.data === 'reported', 'player reports the score', rep.error?.message ?? rep.data);
    const conf = await organiser.rpc('confirm_match', { p_match: m?.match_id, p_agree: true });
    ok(!conf.error && conf.data === 'confirmed', 'opponent confirms', conf.error?.message ?? conf.data);
    const fr = await organiser.rpc('finish_round', { p_tournament: tid });
    const ft = await organiser.rpc('finish_tournament', { p_tournament: tid });
    ok(!fr.error && !ft.error, 'round and tournament closed', fr.error?.message ?? ft.error?.message);
    const hide = await organiser.from('tournaments').update({ is_hidden: true }).eq('id', tid);
    ok(!hide.error, 'check tournament hidden (cleanup)', hide.error?.message);
  }
}

// --- Painting contest (migration 20261028000009) -------------------------------------------
{
  const cat = await anon.from('contest_categories').select('id, tournament:tournaments!inner(slug)').eq('tournament.slug', 'summer-paint-off').eq('kind', 'single').maybeSingle();
  ok(!cat.error && !!cat.data, 'anon sees the finished demo contest', cat.error?.message);
  if (cat.data) {
    const res = await anon.rpc('contest_results', { p_category: cat.data.id });
    ok(!res.error && res.data[0]?.title === 'Crimson Warden', 'public podium of the finished contest', res.error?.message ?? res.data?.[0]?.title);
  }
  const open = await anon.from('contest_categories').select('id, tournament:tournaments!inner(slug)').eq('tournament.slug', 'kanda-paint-off-autumn').eq('kind', 'single').maybeSingle();
  if (open.data) {
    const entries = await anon.rpc('contest_entries_of', { p_category: open.data.id });
    ok(!entries.error && entries.data.length >= 4 && entries.data.every((e) => e.author_name === null && e.votes === null), 'open contest: blind entries (no author, no count)', entries.error?.message);
    const early = await anon.rpc('contest_results', { p_category: open.data.id });
    ok(!early.error && early.data.length === 0, 'open contest: no results yet', early.error?.message);
  }
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll live checks passed.');
process.exit(failures ? 1 : 0);
