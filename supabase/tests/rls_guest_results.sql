-- Tests for migration 26: guest players (no account) in battle reports. Run after migrations and seeds.
create or replace function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
$$;
create or replace function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;
create or replace function pg_temp.uid(n int) returns uuid language sql as $$ select md5('demo-user-' || n)::uuid $$;
create or replace function pg_temp.expect_error(sql text, code text, label text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FAIL: % (no error)', label;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  if code is not null and sqlerrm <> code and sqlstate <> code then raise exception 'FAIL: % (got % / %)', label, sqlstate, sqlerrm; end if;
  raise notice 'ok - %', label;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;
set client_min_messages = notice;
\pset tuples_only on
\pset format unaligned

reset role;
-- 30 hosted a game nobody joined on the site; 30 + 31 played a 3-player game with someone without an account.
insert into public.games (id, host_id, game_system, starts_at, country, city, players_count, max_players, status)
values (md5('t-guest-solo')::uuid, pg_temp.uid(30), 'Guest check solo', now() - interval '2 hours', 'JP', 'Tokyo', 1, 2, 'open'),
       (md5('t-guest-trio')::uuid, pg_temp.uid(30), 'Guest check trio', now() - interval '2 hours', 'JP', 'Tokyo', 2, 3, 'open'),
       (md5('t-guest-later')::uuid, pg_temp.uid(30), 'Guest check later', now() + interval '2 days', 'JP', 'Tokyo', 1, 2, 'open');
insert into public.game_players (game_id, player_id, status) values (md5('t-guest-trio')::uuid, pg_temp.uid(31), 'accepted');
set role authenticated;

-- Solo host: no opponent without a guest, confirmed at once with one.
select pg_temp.as_user(pg_temp.uid(30));
select pg_temp.expect_error(format($q$select public.submit_game_report(md5('t-guest-solo')::uuid, '[{"player_id":"%s","placement":1}]'::jsonb)$q$, pg_temp.uid(30)),
  'no_opponent', 'alone and no guest: no opponent');
select pg_temp.expect_error(format($q$select public.submit_game_report(md5('t-guest-later')::uuid, '[{"player_id":"%s","placement":1}]'::jsonb, null, '{}', '[{"name":"Ken","placement":2}]'::jsonb)$q$, pg_temp.uid(30)),
  'not_played_yet', 'no guest result before the game');
select pg_temp.expect_error(format($q$select public.submit_game_report(md5('t-guest-solo')::uuid, '[{"player_id":"%s","placement":1}]'::jsonb, null, '{}', '[{"name":"  ","placement":2}]'::jsonb)$q$, pg_temp.uid(30)),
  'bad_results', 'a guest needs a name');
select pg_temp.expect_error(format($q$select public.submit_game_report(md5('t-guest-solo')::uuid, '[{"player_id":"%s","placement":1}]'::jsonb, null, '{}', jsonb_build_array(jsonb_build_object('name', repeat('x', 41), 'placement', 2)))$q$, pg_temp.uid(30)),
  'bad_results', 'a guest name has 40 characters at most');
select pg_temp.expect_error(format($q$select public.submit_game_report(md5('t-guest-solo')::uuid, '[{"player_id":"%s","placement":1}]'::jsonb, null, '{}', '[{"name":"Ken","placement":3}]'::jsonb)$q$, pg_temp.uid(30)),
  'bad_results', 'placements stay within the number of players');
select pg_temp.expect_error(format($q$select public.submit_game_report(md5('t-guest-solo')::uuid, '[{"player_id":"%s","placement":1}]'::jsonb, null, '{}',
  '[{"name":"a","placement":2},{"name":"b","placement":2},{"name":"c","placement":2},{"name":"d","placement":2},{"name":"e","placement":2},{"name":"f","placement":2},{"name":"g","placement":2},{"name":"h","placement":2}]'::jsonb)$q$, pg_temp.uid(30)),
  'bad_results', '8 players at most, guests included');
select pg_temp.expect_error(format($q$select public.submit_game_report(md5('t-guest-solo')::uuid, '[{"player_id":"%s","placement":1}]'::jsonb, null, '{}', '{"name":"Ken"}'::jsonb)$q$, pg_temp.uid(30)),
  'bad_results', 'guests are a list');

select pg_temp.ok(public.submit_game_report(md5('t-guest-solo')::uuid,
  jsonb_build_array(jsonb_build_object('player_id', pg_temp.uid(30), 'placement', 1, 'score', 85, 'army', 'Iron line')),
  'Ken has no account yet', '{}',
  jsonb_build_array(jsonb_build_object('name', ' Ken ', 'placement', 2, 'score', 60, 'army', 'Swamp raiders'))) = 'confirmed',
  'alone with a guest: confirmed at once');
select pg_temp.ok((select status = 'confirmed' and confirmed_at is not null from public.game_reports where game_id = md5('t-guest-solo')::uuid), 'the report is stored as confirmed');
select pg_temp.ok((select name = 'Ken' and score = 60 and placement = 2 and army = 'Swamp raiders' from public.game_guest_results where game_id = md5('t-guest-solo')::uuid), 'the guest result is stored, name trimmed');
select pg_temp.ok((select count(*) from public.player_ratings where game_key = 'guest check solo') = 0, 'a game with guests changes no rating');
select pg_temp.ok(public.submit_game_report(md5('t-guest-solo')::uuid,
  jsonb_build_array(jsonb_build_object('player_id', pg_temp.uid(30), 'placement', 2, 'score', 70)), null, '{}',
  jsonb_build_array(jsonb_build_object('name', 'Kenji', 'placement', 1, 'score', 90))) = 'confirmed',
  'the host can still correct a report only they could write');
select pg_temp.ok((select string_agg(name || ':' || placement, ',') from public.game_guest_results where game_id = md5('t-guest-solo')::uuid) = 'Kenji:1', 'the correction replaces the guests');
select pg_temp.expect_error($q$insert into public.game_guest_results (game_id, slot, name, placement) values (md5('t-guest-solo')::uuid, 2, 'x', 1)$q$, '42501', 'no direct write of guest results');

set role anon;
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) from public.game_guest_results where game_id = md5('t-guest-solo')::uuid) = 1, 'guest results are public like the report');
select pg_temp.expect_error($q$select public.submit_game_report(md5('t-guest-solo')::uuid, '[]'::jsonb)$q$, '42501', 'visitors cannot report');

-- Two players with an account and one guest: the usual confirmation, the guests stay the host's.
set role authenticated;
select pg_temp.as_user(pg_temp.uid(30));
select pg_temp.ok(public.submit_game_report(md5('t-guest-trio')::uuid,
  jsonb_build_array(jsonb_build_object('player_id', pg_temp.uid(30), 'placement', 1),
                    jsonb_build_object('player_id', pg_temp.uid(31), 'placement', 3)), null, '{}',
  jsonb_build_array(jsonb_build_object('name', 'Aiko', 'placement', 2))) = 'reported', 'with another account: waits for confirmation');
select pg_temp.as_user(pg_temp.uid(31));
select pg_temp.expect_error(format($q$select public.submit_game_report(md5('t-guest-trio')::uuid, '[{"player_id":"%s","placement":1},{"player_id":"%s","placement":2}]'::jsonb, null, '{}', '[{"name":"Someone else","placement":3}]'::jsonb)$q$, pg_temp.uid(30), pg_temp.uid(31)),
  'not_host', 'another player cannot change the guests');
select pg_temp.ok(public.submit_game_report(md5('t-guest-trio')::uuid,
  jsonb_build_array(jsonb_build_object('player_id', pg_temp.uid(30), 'placement', 1),
                    jsonb_build_object('player_id', pg_temp.uid(31), 'placement', 2))) = 'reported', 'another player edits the scores, guests omitted');
select pg_temp.ok((select string_agg(name || ':' || placement, ',') from public.game_guest_results where game_id = md5('t-guest-trio')::uuid) = 'Aiko:2', 'the guests are kept');
select pg_temp.as_user(pg_temp.uid(30));
select pg_temp.ok(public.answer_game_report(md5('t-guest-trio')::uuid, true) = 'confirmed', 'the host confirms');
select pg_temp.ok((select count(*) from public.player_ratings where game_key = 'guest check trio') = 0, 'still no rating with a guest');
select pg_temp.expect_error($q$select public.submit_game_report(md5('t-guest-trio')::uuid, '[]'::jsonb)$q$, 'already_confirmed', 'confirmed by others: final');

reset role;
delete from public.notifications where payload ->> 'game_id' in (md5('t-guest-solo')::uuid::text, md5('t-guest-trio')::uuid::text);
delete from public.games where id in (md5('t-guest-solo')::uuid, md5('t-guest-trio')::uuid, md5('t-guest-later')::uuid);
select 'guest result tests passed';
