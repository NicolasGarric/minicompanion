-- Tests for migration 22: deleting a game, upcoming or played, and rebuilding the ratings.
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

-- Two confirmed games of a test system between 45 (host, wins both) and 46, and one upcoming game.
reset role;
insert into public.games (id, host_id, game_system, starts_at, country, city, players_count, max_players, status) values
  (md5('del-g1')::uuid, pg_temp.uid(45), 'Test Skirmish', now() - interval '3 days', 'JP', 'Tokyo', 2, 2, 'full'),
  (md5('del-g2')::uuid, pg_temp.uid(45), 'Test Skirmish', now() - interval '1 day', 'JP', 'Tokyo', 2, 2, 'full'),
  (md5('del-g3')::uuid, pg_temp.uid(45), 'Test Skirmish', now() + interval '3 days', 'JP', 'Tokyo', 2, 2, 'full');
insert into public.game_players (game_id, player_id, status) values
  (md5('del-g1')::uuid, pg_temp.uid(46), 'accepted'), (md5('del-g2')::uuid, pg_temp.uid(46), 'accepted'), (md5('del-g3')::uuid, pg_temp.uid(46), 'accepted');
insert into public.game_reports (game_id, reported_by, status, confirmed_at) values
  (md5('del-g1')::uuid, pg_temp.uid(45), 'confirmed', now() - interval '3 days'),
  (md5('del-g2')::uuid, pg_temp.uid(45), 'confirmed', now() - interval '1 day');
insert into public.game_results (game_id, player_id, placement, agreed) values
  (md5('del-g1')::uuid, pg_temp.uid(45), 1, true), (md5('del-g1')::uuid, pg_temp.uid(46), 2, true),
  (md5('del-g2')::uuid, pg_temp.uid(45), 1, true), (md5('del-g2')::uuid, pg_temp.uid(46), 2, true);
select public.apply_report_ratings(md5('del-g1')::uuid);
create temporary table after_one as select player_id, rating, games, wins, losses from public.player_ratings where game_key = 'test skirmish';
select public.apply_report_ratings(md5('del-g2')::uuid);
create temporary table after_two as select player_id, rating, games, wins, losses from public.player_ratings where game_key = 'test skirmish';
select public.recompute_game_ratings('test skirmish');
select pg_temp.ok((select count(*) from public.player_ratings r join after_two a using (player_id)
                    where r.game_key = 'test skirmish' and (r.rating, r.games, r.wins, r.losses) = (a.rating, a.games, a.wins, a.losses)) = 2,
                  'rebuilding the ratings gives the same result');
grant select on after_one to authenticated;

-- ---------- Who can delete ----------
set role authenticated;
select pg_temp.as_user(pg_temp.uid(46));
select pg_temp.expect_error($q$select public.delete_game(md5('del-g2')::uuid)$q$, 'not_host', 'a player who is not the host cannot delete the game');
set role anon;
select pg_temp.as_user(null);
select pg_temp.expect_error($q$select public.delete_game(md5('del-g2')::uuid)$q$, '42501', 'visitors cannot call it');

-- ---------- Deleting a played game ----------
set role authenticated;
select pg_temp.as_user(pg_temp.uid(45));
select public.delete_game(md5('del-g2')::uuid);
select pg_temp.ok((select count(*) from public.games where id = md5('del-g2')::uuid) = 0, 'the host deletes a played game');
reset role;
select pg_temp.ok((select count(*) from public.game_results where game_id = md5('del-g2')::uuid) = 0
                  and (select count(*) from public.game_reports where game_id = md5('del-g2')::uuid) = 0
                  and (select count(*) from public.game_players where game_id = md5('del-g2')::uuid) = 0, 'its report, results and players go with it');
select pg_temp.ok((select count(*) from public.player_ratings r join after_one a using (player_id)
                    where r.game_key = 'test skirmish' and (r.rating, r.games, r.wins, r.losses) = (a.rating, a.games, a.wins, a.losses)) = 2,
                  'the ratings are as if the game had never been played');
select pg_temp.ok((select count(*) from public.notifications where user_id = pg_temp.uid(46) and kind = 'game_deleted' and payload ->> 'game' = 'Test Skirmish') = 1,
                  'the other player is told');
select pg_temp.ok((select count(*) from public.notifications where user_id = pg_temp.uid(45) and kind = 'game_deleted') = 0, 'not the host');

-- ---------- Deleting an upcoming game ----------
set role authenticated;
select pg_temp.as_user(pg_temp.uid(45));
select public.delete_game(md5('del-g3')::uuid);
reset role;
select pg_temp.ok((select count(*) from public.games where id = md5('del-g3')::uuid) = 0, 'an upcoming game can be deleted too');
select pg_temp.ok((select games from public.player_ratings where game_key = 'test skirmish' and player_id = pg_temp.uid(45)) = 1, 'without touching the ratings');

-- ---------- Admins ----------
update public.profiles set is_admin = true where id = pg_temp.uid(48);
set role authenticated;
select pg_temp.as_user(pg_temp.uid(48));
select public.delete_game(md5('del-g1')::uuid);
reset role;
select pg_temp.ok((select count(*) from public.player_ratings where game_key = 'test skirmish') = 0, 'an admin deletes a game; with no game left, the ratings are empty');
update public.profiles set is_admin = false where id = pg_temp.uid(48);

select 'delete game tests passed';
