-- RLS and function tests for Quick play. Run after migrations and seeds.
create or replace function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
$$;
create or replace function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;
create or replace function pg_temp.uid(n int) returns uuid language sql as $$ select md5('demo-user-' || n)::uuid $$;
grant execute on all functions in schema pg_temp to anon, authenticated;
set client_min_messages = notice;
\pset tuples_only on
\pset format unaligned

-- Anonymous visitors browse games but never see an address or pending requests.
set role anon;
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) from public.games) = 8, 'anon sees the 8 demo games');
select pg_temp.ok((select count(*) from public.game_private) = 0, 'anon sees no address');
select pg_temp.ok((select count(*) from public.game_players) = 1, 'anon sees accepted players only');
select pg_temp.ok((select count(*) from public.popular_game_texts()) >= 5, 'anon gets the popular game texts');
do $$ begin
  perform public.request_join_game(md5('demo-game-3')::uuid, null);
  raise exception 'FAIL: anon joined';
exception when insufficient_privilege then raise notice 'ok - anon cannot ask to join';
end $$;

set role authenticated;
-- Host 3 creates a game; direct inserts are refused.
select pg_temp.as_user(pg_temp.uid(30));
do $$ begin
  insert into public.games (host_id, game_system, starts_at, country, city) values (pg_temp.uid(30), 'X', now() + interval '1 day', 'JP', 'Tokyo');
  raise exception 'FAIL: direct insert';
exception when insufficient_privilege then raise notice 'ok - games are created through create_game only';
end $$;
create table if not exists pg_temp.ids (k text, id uuid);
insert into pg_temp.ids select 'g', public.create_game('Kill Team', null, null, now() + interval '2 days', 90, 2, 'casual', 'ja',
                                                      'jp', 'Tokyo', 'Ueno', '1-2-3 Test street', null, 'test');
select pg_temp.ok((select country from public.games where id = (select id from pg_temp.ids)) = 'JP', 'country is stored upper case');
select pg_temp.ok((select count(*) from public.game_private where game_id = (select id from pg_temp.ids)) = 1, 'host reads their address');
do $$ begin
  perform public.create_game('Kill Team', null, null, now() - interval '1 day', 90, 2, 'casual', 'ja', 'JP', 'Tokyo', null, 'addr', null, null);
  raise exception 'FAIL: game in the past';
exception when others then
  if sqlerrm <> 'starts_in_past' then raise; end if;
  raise notice 'ok - no games in the past';
end $$;

-- Player 31 asks to join: no address until accepted.
select pg_temp.as_user(pg_temp.uid(31));
select pg_temp.ok(public.request_join_game((select id from pg_temp.ids), 'hi') = 'pending', 'request is pending');
select pg_temp.ok((select count(*) from public.game_private where game_id = (select id from pg_temp.ids)) = 0, 'pending player sees no address');
do $$ begin
  perform public.respond_join_game((select id from pg_temp.ids), pg_temp.uid(31), true);
  raise exception 'FAIL: player accepted themselves';
exception when others then
  if sqlerrm <> 'not_host' then raise; end if;
  raise notice 'ok - only the host accepts';
end $$;

-- Player 32 asks too; another player does not see 32's pending request.
select pg_temp.as_user(pg_temp.uid(32));
select public.request_join_game((select id from pg_temp.ids), null);
select pg_temp.as_user(pg_temp.uid(31));
select pg_temp.ok((select count(*) from public.game_players where game_id = (select id from pg_temp.ids)) = 1, 'players only see their own request');

-- Host accepts 31: the 2-player game is full, 32 cannot be accepted.
select pg_temp.as_user(pg_temp.uid(30));
select pg_temp.ok((select count(*) from public.game_players where game_id = (select id from pg_temp.ids)) = 2, 'host sees every request');
select pg_temp.ok(public.respond_join_game((select id from pg_temp.ids), pg_temp.uid(31), true) = 'accepted', 'host accepts');
select pg_temp.ok((select status from public.games where id = (select id from pg_temp.ids)) = 'full', 'game is full');
do $$ begin
  perform public.respond_join_game((select id from pg_temp.ids), pg_temp.uid(32), true);
  raise exception 'FAIL: accepted beyond capacity';
exception when others then
  if sqlerrm <> 'game_full' then raise; end if;
  raise notice 'ok - no player beyond capacity';
end $$;

select pg_temp.as_user(pg_temp.uid(31));
select pg_temp.ok((select count(*) from public.game_private where game_id = (select id from pg_temp.ids)) = 1, 'accepted player reads the address');
select public.leave_game((select id from pg_temp.ids));
select pg_temp.ok((select status::text || players_count from public.games where id = (select id from pg_temp.ids)) = 'open1', 'leaving reopens the game');
select pg_temp.ok((select count(*) from public.game_private where game_id = (select id from pg_temp.ids)) = 0, 'a player who left loses the address');

select pg_temp.as_user(pg_temp.uid(32));
do $$ begin
  perform public.cancel_game((select id from pg_temp.ids));
  raise exception 'FAIL: cancelled someone else''s game';
exception when others then
  if sqlerrm <> 'not_host' then raise; end if;
  raise notice 'ok - only the host cancels';
end $$;
reset role;
select 'quick play tests passed';
