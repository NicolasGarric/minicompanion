-- Tests for migration 31: army cost label and list limit (owner rows only, RLS unchanged).
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
delete from public.pile_armies where owner_id = pg_temp.uid(32) and local_id like 'costs-%';
delete from public.decks where owner_id = pg_temp.uid(32) and name like 'Costs %';
set role authenticated;
select pg_temp.as_user(pg_temp.uid(32));

insert into public.pile_armies (local_id, name, cost_label) values ('costs-a', 'Costs army', 'Crowns');
select pg_temp.ok((select cost_label from public.pile_armies where local_id = 'costs-a') = 'Crowns', 'an army names its cost');
insert into public.decks (name, point_limit) values ('Costs list', 2000);
select pg_temp.ok((select point_limit from public.decks where name = 'Costs list') = 2000, 'a list keeps its limit');
select pg_temp.expect_error($$insert into public.decks (name, point_limit) values ('Costs bad', 0)$$, '23514', 'a limit is at least 1');
select pg_temp.expect_error($$insert into public.pile_armies (local_id, name, cost_label) values ('costs-b', 'Costs b', repeat('a', 21))$$, '23514', 'a cost label is 20 characters at most');

update public.decks set point_limit = 1500 where name = 'Costs list';
select pg_temp.ok((select point_limit from public.decks where name = 'Costs list') = 1500, 'the owner changes the limit');
select pg_temp.expect_error($$update public.decks set share_code = 'abcdefghijklmnop' where name = 'Costs list'$$, '42501', 'the share code still goes through deck_share() only');

select pg_temp.as_user(pg_temp.uid(33));
select pg_temp.ok((select count(*) from public.pile_armies where local_id = 'costs-a') = 0, 'another player does not see the army');

reset role;
delete from public.pile_armies where owner_id = pg_temp.uid(32) and local_id like 'costs-%';
delete from public.decks where owner_id = pg_temp.uid(32) and name like 'Costs %';
