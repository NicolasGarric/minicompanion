-- Tests for migration 20: table maps attached to games.
create or replace function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
$$;
create or replace function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;
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
create temporary table fx_game as
  select id, host_id, status from public.games where status <> 'cancelled' order by starts_at desc limit 1;
create temporary table fx_other as
  select p.id from public.profiles p where p.id <> (select host_id from fx_game) and not p.is_suspended limit 1;
grant select on fx_game, fx_other to anon, authenticated;

set role authenticated;
select pg_temp.as_user((select host_id from fx_game));
select public.set_game_map((select id from fx_game), 'zAbc-_09');
select pg_temp.ok((select table_map = 'zAbc-_09' from public.games where id = (select id from fx_game)), 'the host attaches a map');
select pg_temp.expect_error($q$select public.set_game_map((select id from fx_game), 'z<script>')$q$, '23514', 'a map code with other characters is refused');
select pg_temp.expect_error($q$select public.set_game_map((select id from fx_game), 'z' || repeat('a', 6000))$q$, '23514', 'a map code over 6,000 characters is refused');
select pg_temp.expect_error($q$update public.games set table_map = 'jxyz' where id = (select id from fx_game)$q$, '42501', 'no direct update of the map');

select pg_temp.as_user((select id from fx_other));
select pg_temp.expect_error($q$select public.set_game_map((select id from fx_game), 'jother')$q$, 'not_host', 'another player cannot change the map');

set role anon;
select pg_temp.as_user(null);
select pg_temp.ok((select table_map = 'zAbc-_09' from public.games where id = (select id from fx_game)), 'visitors see the map of a public game');
select pg_temp.expect_error($q$select public.set_game_map((select id from fx_game), 'jx')$q$, '42501', 'visitors cannot call it');

set role authenticated;
select pg_temp.as_user((select host_id from fx_game));
select public.set_game_map((select id from fx_game), null);
select pg_temp.ok((select table_map is null from public.games where id = (select id from fx_game)), 'the host removes the map');
reset role;
update public.games set status = 'cancelled' where id = (select id from fx_game);
set role authenticated;
select pg_temp.expect_error($q$select public.set_game_map((select id from fx_game), 'jx')$q$, 'game_cancelled', 'no map on a cancelled game');
reset role;
update public.games set status = (select status from fx_game) where id = (select id from fx_game);

select 'game map tests passed';
