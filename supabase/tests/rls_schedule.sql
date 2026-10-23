-- Tests for multi-week tournaments (round schedule). Run after migrations and seeds.
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
create temporary table ev as
  select id, rounds_planned, ends_at from public.tournaments where slug = 'kanda-first-steps-2';
create temporary table plan as select jsonb_build_array(
  jsonb_build_object('number', 1, 'starts_at', now() + interval '20 days'),
  jsonb_build_object('number', 2, 'starts_at', now() + interval '27 days', 'store_id', md5('store-2')::text),
  jsonb_build_object('number', 3, 'starts_at', now() + interval '34 days', 'venue_name', 'Community hall', 'address', '1-2-3 Kanda, Tokyo')
) as p;
create temporary table player as
  select user_id as id from public.registrations where tournament_id = (select id from ev) and status = 'registered' limit 1;
grant select on ev, plan, player to anon, authenticated;

set role authenticated;
select pg_temp.as_user(pg_temp.uid(3));
select pg_temp.expect_error($q$select public.set_round_schedule((select id from ev), (select p from plan))$q$, 'not_organiser', 'only the organiser sets the schedule');

select pg_temp.as_user(pg_temp.uid(0));
select pg_temp.expect_error($q$select public.set_round_schedule((select id from ev),
  jsonb_build_array(jsonb_build_object('number', 2, 'starts_at', now())))$q$, 'bad_schedule', 'rounds must start at 1');
select pg_temp.expect_error($q$select public.set_round_schedule((select id from ev), jsonb_build_array(
  jsonb_build_object('number', 1, 'starts_at', now() + interval '9 days'),
  jsonb_build_object('number', 2, 'starts_at', now() + interval '2 days')))$q$, 'bad_schedule', 'dates cannot go back in time');
select pg_temp.expect_error($q$select public.set_round_schedule((select id from ev), (
  select jsonb_agg(jsonb_build_object('number', i, 'starts_at', now() + i * interval '7 days')) from generate_series(1, 11) i))$q$,
  'bad_schedule', 'no more rounds than planned');

select public.set_round_schedule((select id from ev), (select p from plan));
select pg_temp.ok((select count(*) from public.round_schedule where tournament_id = (select id from ev)) = 3, 'schedule saved');
select pg_temp.ok((select venue_name from public.round_schedule where tournament_id = (select id from ev) and number = 2) = 'Shibuya Paint Lounge',
  'a store venue takes the store name and address');
select pg_temp.ok((select ends_at from public.tournaments where id = (select id from ev)) >= now() + interval '34 days',
  'the event now ends after its last round');

select pg_temp.as_user((select id from player));
select pg_temp.ok((select count(*) from public.notifications where kind = 'round_schedule') = 1, 'registered players are notified');

select pg_temp.as_user(pg_temp.uid(0));
select public.set_round_schedule((select id from ev), (select p from plan));
select pg_temp.as_user((select id from player));
select pg_temp.ok((select count(*) from public.notifications where kind = 'round_schedule') = 1, 'saving the same schedule again notifies nobody');

set role anon;
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) from public.round_schedule where tournament_id = (select id from ev)) = 3, 'anyone sees the schedule of a published event');
select pg_temp.expect_error($q$insert into public.round_schedule (tournament_id, number, starts_at) values ((select id from ev), 4, now())$q$,
  '42501', 'nobody writes the schedule directly');

set role authenticated;
select pg_temp.as_user(pg_temp.uid(0));
select public.set_round_schedule((select id from ev), '[]'::jsonb);
select pg_temp.ok((select count(*) from public.round_schedule where tournament_id = (select id from ev)) = 0, 'an empty schedule makes it a one-day event again');

reset role;
select 'schedule tests passed';
