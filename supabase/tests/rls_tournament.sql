-- Tests for the tournament flow. Run after migrations and seeds.
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

-- Seeded live event
set role anon;
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) from public.matches where tournament_id = md5('demo-live-t')::uuid) = 8, 'anon sees the pairings of the live event');
select pg_temp.ok((select count(*) from public.game_tables where tournament_id = md5('demo-live-t')::uuid) = 0, 'anon cannot read table QR tokens');
select pg_temp.ok((select count(*) from public.tournament_tables(md5('demo-live-t')::uuid)) = 4, 'but sees the table numbers');
select pg_temp.ok((select player_a_name from public.table_match((select qr_token from public.game_tables where false limit 1))) is null, 'unknown token: nothing');

reset role;
create temporary table qr as select qr_token from public.game_tables where id = md5('demo-live-table-4')::uuid;
grant select on qr to anon, authenticated;
set role anon;
select pg_temp.ok((select round_number = 2 and status = 'scheduled' from public.table_match((select qr_token from qr))), 'QR page shows the current match of the table');

set role authenticated;
-- Players report and confirm
select pg_temp.as_user(pg_temp.uid(5));
select pg_temp.expect_error($q$select public.report_match((select id from public.matches where round_id = md5('demo-live-r2')::uuid and table_id = md5('demo-live-table-4')::uuid), 1, 0, 0, 0, 'a_win')$q$, 'not_in_match', 'outsiders cannot report a match');
select pg_temp.as_user(pg_temp.uid(3));
select pg_temp.ok(public.report_match((select id from public.matches where round_id = md5('demo-live-r2')::uuid and table_id = md5('demo-live-table-4')::uuid), 11, 3, 14, 5, 'b_win') = 'reported', 'player reports');
select pg_temp.expect_error($q$select public.confirm_match((select id from public.matches where round_id = md5('demo-live-r2')::uuid and table_id = md5('demo-live-table-4')::uuid), true)$q$, 'not_in_match', 'the reporter cannot confirm');
select pg_temp.as_user(pg_temp.uid(7));
select pg_temp.ok((select count(*) from public.notifications where kind = 'match_to_confirm') >= 1, 'opponent is notified');
select pg_temp.ok(public.confirm_match((select id from public.matches where round_id = md5('demo-live-r2')::uuid and table_id = md5('demo-live-table-4')::uuid), true) = 'confirmed', 'opponent confirms');
select pg_temp.as_user(pg_temp.uid(2));
select pg_temp.ok(public.confirm_match((select id from public.matches where round_id = md5('demo-live-r2')::uuid and table_id = md5('demo-live-table-3')::uuid), false, 'Score was 9-12') = 'disputed', 'opponent disputes with a note');

-- Organiser: cannot close a round with a dispute, resolves it, closes, pairs round 3
select pg_temp.as_user(pg_temp.uid(1));
select pg_temp.expect_error($q$select public.finish_round(md5('demo-live-t')::uuid)$q$, 'not_organiser', 'players cannot close a round');
select pg_temp.as_user(pg_temp.uid(0));
select pg_temp.expect_error($q$select public.finish_round(md5('demo-live-t')::uuid)$q$, 'matches_pending', 'a disputed match blocks the round');
select pg_temp.ok(public.report_match((select id from public.matches where round_id = md5('demo-live-r2')::uuid and table_id = md5('demo-live-table-3')::uuid), 12, 2, 9, 5, 'a_win') = 'resolved', 'organiser resolves');
select public.finish_round(md5('demo-live-t')::uuid);
select pg_temp.ok((select status from public.rounds where id = md5('demo-live-r2')::uuid) = 'finished', 'round 2 closed');
select public.set_registration(md5('demo-live-t')::uuid, pg_temp.uid(8), true, true);
select pg_temp.expect_error(format($q$select public.create_round(md5('demo-live-t')::uuid, '[{"a":"%s","b":"%s"}]'::jsonb)$q$, pg_temp.uid(1), pg_temp.uid(2)), 'bad_pairings', 'pairings must list every active player');
select pg_temp.ok(public.create_round(md5('demo-live-t')::uuid, jsonb_build_array(
  jsonb_build_object('a', pg_temp.uid(1), 'b', pg_temp.uid(5)), jsonb_build_object('a', pg_temp.uid(6), 'b', pg_temp.uid(4)),
  jsonb_build_object('a', pg_temp.uid(7), 'b', pg_temp.uid(2)), jsonb_build_object('a', pg_temp.uid(3), 'b', null))) is not null,
  'round 3 with a bye for the dropped player''s place');
select pg_temp.ok((select count(*) from public.matches m join public.rounds r on r.id = m.round_id where r.number = 3 and r.tournament_id = md5('demo-live-t')::uuid and m.player_b_id is null and m.status = 'confirmed') = 1, 'the bye is a confirmed win');
select pg_temp.as_user(pg_temp.uid(1));
select pg_temp.ok((select count(*) from public.notifications where kind = 'round_paired') >= 1, 'players are told their table');
select pg_temp.as_user(pg_temp.uid(0));
select pg_temp.expect_error($q$select public.create_round(md5('demo-live-t')::uuid, '[]'::jsonb)$q$, 'round_not_finished', 'one active round at a time');
select pg_temp.expect_error($q$select public.finish_tournament(md5('demo-live-t')::uuid)$q$, 'round_not_finished', 'cannot finish with a round in progress');
reset role;
select 'tournament tests passed';
