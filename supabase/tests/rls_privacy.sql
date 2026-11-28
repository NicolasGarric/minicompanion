-- Tests for migration 30: page counts without the player, active days with the right to object.
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
delete from public.active_days where user_id in (pg_temp.uid(30), pg_temp.uid(31));
set role authenticated;

select pg_temp.as_user(pg_temp.uid(30));
select public.track_page_view('play', 'en', true);
reset role;
select pg_temp.ok(not exists (select 1 from public.active_days where user_id = pg_temp.uid(30)), 'a page count records nothing about the player');
set role authenticated;
select public.mark_active_day();
select public.mark_active_day();
reset role;
select pg_temp.ok((select count(*) = 1 from public.active_days where user_id = pg_temp.uid(30) and day = current_date), 'one active day per day');
set role authenticated;
select pg_temp.ok((select activity_stats from public.my_profile()), 'active days are counted by default');
select pg_temp.expect_error($q$update public.profiles set activity_stats = false where id = auth.uid()$q$, '42501', 'no direct write of the choice');

select public.set_activity_stats(false);
reset role;
select pg_temp.ok(not exists (select 1 from public.active_days where user_id = pg_temp.uid(30)), 'objecting erases the recorded days');
set role authenticated;
select public.mark_active_day();
reset role;
select pg_temp.ok(not exists (select 1 from public.active_days where user_id = pg_temp.uid(30)), 'and nothing is recorded any more');
set role authenticated;
select public.set_activity_stats(true);
select public.mark_active_day();
reset role;
select pg_temp.ok(exists (select 1 from public.active_days where user_id = pg_temp.uid(30)), 'agreeing again resumes the count');
set role authenticated;

select pg_temp.as_user(pg_temp.uid(31));
reset role;
select pg_temp.ok((select activity_stats from public.profiles where id = pg_temp.uid(30)), 'each player has their own choice');
set role anon;
select pg_temp.as_user(null);
select pg_temp.expect_error('select public.mark_active_day()', '42501', 'visitors record no active day');
select pg_temp.expect_error('select public.set_activity_stats(false)', '42501', 'visitors have no choice to store');
select public.track_page_view('play', 'en', false);
select pg_temp.ok(true, 'visitors still send page counts (after consent, in the app)');
reset role;
