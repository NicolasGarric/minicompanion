-- Tests for bug reports. Run after migrations and seeds.
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

set role anon;
select pg_temp.as_user(null);
select pg_temp.ok(public.submit_bug_report('The map does not load', '#/stores', '{"lang":"fr"}', 'me@example.com', '{}') is not null, 'visitors can report a bug');
select pg_temp.expect_error($q$select public.submit_bug_report('With a picture', '#/', '{}', null, array['x/shot.jpg'])$q$, 'bad_photos', 'visitors cannot attach screenshots');
select pg_temp.expect_error($q$select public.submit_bug_report('bad', '#/', '{}', null, '{}')$q$, '23514', 'a report needs a real description');
select pg_temp.ok((select count(*) from public.bug_reports) = 0, 'visitors cannot read reports');

set role authenticated;
select pg_temp.as_user(pg_temp.uid(3));
select pg_temp.ok(public.submit_bug_report('Score form freezes', '#/play', '{}', null, array[pg_temp.uid(3)::text || '/a.jpg']) is not null, 'players attach their own screenshots');
select pg_temp.expect_error(format($q$select public.submit_bug_report('Someone else''s file', '#/', '{}', null, array['%s/a.jpg'])$q$, pg_temp.uid(4)), 'bad_photos', 'but not files from another folder');
select pg_temp.ok((select count(*) from public.bug_reports) = 0, 'players cannot read reports');
select pg_temp.expect_error($q$insert into public.bug_reports (message) values ('direct insert')$q$, '42501', 'no direct writes');
select public.submit_bug_report('Report number ' || i, '#/', '{}', null, '{}') from generate_series(1, 9) i;
select pg_temp.expect_error($q$select public.submit_bug_report('One too many', '#/', '{}', null, '{}')$q$, 'rate_limited', '10 reports per hour per account');

reset role;
update public.profiles set is_admin = true where id = pg_temp.uid(9);
set role authenticated;
select pg_temp.as_user(pg_temp.uid(9));
select pg_temp.ok((select count(*) from public.bug_reports) = 11, 'admins read every report');
update public.bug_reports set status = 'fixed' where message = 'Score form freezes';
select pg_temp.ok((select status from public.bug_reports where message = 'Score form freezes') = 'fixed', 'admins triage');

reset role;
update public.profiles set is_admin = false where id = pg_temp.uid(9);
select 'bug report tests passed';
