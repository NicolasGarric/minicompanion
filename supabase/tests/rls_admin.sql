-- Tests for the admin dashboard: traffic counters, admin-only reads, moderation and suspension.
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
update public.profiles set is_admin = true where id = pg_temp.uid(49);

-- ---------- Traffic ----------
set role anon;
select pg_temp.as_user(null);
select public.track_page_view('play.tournament', 'ja', true);
select public.track_page_view('play.tournament', 'ja', false);
select public.track_page_view('../etc/passwd', 'ja', true);
select public.track_page_view('admin.dashboard', 'en', true);
select pg_temp.expect_error($q$select * from public.page_views_daily$q$, '42501', 'visitors cannot read the counters');
set role authenticated;
select pg_temp.as_user(pg_temp.uid(12));
select public.track_page_view('home', 'en', true);
reset role;
select pg_temp.ok((select views = 2 and visits = 1 from public.page_views_daily where page = 'play.tournament' and day = current_date), 'page views and visits are counted');
select pg_temp.ok((select count(*) from public.page_views_daily where page not in ('play.tournament', 'home')) = 0, 'bad or admin page names are ignored');
select pg_temp.ok((select count(*) from public.active_days where user_id = pg_temp.uid(12)) = 1, 'signed-in players get an active day');
select pg_temp.ok((select count(*) from public.active_days) = 1, 'visitors leave no active day');

-- ---------- Admin-only reads ----------
set role authenticated;
select pg_temp.as_user(pg_temp.uid(12));
select pg_temp.expect_error($q$select public.admin_overview()$q$, 'forbidden', 'players cannot read the overview');
select pg_temp.expect_error($q$select * from public.admin_users()$q$, 'forbidden', 'players cannot list accounts');
select pg_temp.expect_error($q$select * from public.admin_reports()$q$, 'forbidden', 'players cannot read reports');
select pg_temp.expect_error($q$select public.admin_suspend(pg_temp.uid(13), true, 'x')$q$, 'forbidden', 'players cannot suspend');
select pg_temp.expect_error($q$update public.profiles set is_suspended = false where id = auth.uid()$q$, '42501', 'players cannot lift their own suspension');
select pg_temp.as_user(pg_temp.uid(49));
select pg_temp.ok((public.admin_overview() ->> 'users')::int >= 50, 'admin overview counts accounts');
select pg_temp.ok((public.admin_overview() ->> 'active_today')::int = 1, 'admin overview counts active players');
select pg_temp.ok((select count(*) from public.admin_daily(7)) = 7, 'one row per day');
select pg_temp.ok((select views from public.admin_top_pages(7) where page = 'play.tournament') = 2, 'top pages');
select pg_temp.ok((select count(*) from public.admin_users('', 'active', 10)) = 10, 'account list');
select pg_temp.ok((select handle from public.admin_users('', 'active', 1)) = (select handle from public.profiles where id = pg_temp.uid(12)), 'sorted by last activity');
select pg_temp.ok((select count(*) from public.admin_recent(20)) = 20, 'activity feed');
select pg_temp.ok((select count(*) from public.admin_content('tournament', 5)) > 0, 'content lists');

-- ---------- Moderation ----------
set role authenticated;
select pg_temp.as_user(pg_temp.uid(14));
insert into public.swap_posts (user_id, kind, title, city) values (auth.uid(), 'offer', 'Admin test swap', 'Tokyo');
select pg_temp.as_user(pg_temp.uid(15));
select public.report_swap((select id from public.swap_posts where title = 'Admin test swap'), 'looks odd');
select pg_temp.as_user(pg_temp.uid(49));
select pg_temp.ok((select owner_handle from public.admin_reports('open') where target_label = 'Admin test swap')
  = (select handle from public.profiles where id = pg_temp.uid(14)), 'report shows the content and its owner');
select public.admin_moderate('swap', (select id::text from public.swap_posts where title = 'Admin test swap'), true);
select public.admin_set_report((select id from public.admin_reports('open') where target_label = 'Admin test swap'), 'actioned');
select pg_temp.ok((select target_hidden from public.admin_reports('actioned') where target_label = 'Admin test swap'), 'content hidden, report actioned');
select pg_temp.expect_error($q$select public.admin_moderate('nothing', 'x', true)$q$, 'bad_type', 'unknown content type refused');

-- ---------- Suspension ----------
select pg_temp.expect_error($q$select public.admin_suspend(auth.uid(), true, 'oops')$q$, 'own_account', 'an admin cannot suspend themselves');
select public.admin_suspend(pg_temp.uid(14), true, 'spam');
select pg_temp.as_user(pg_temp.uid(14));
select pg_temp.expect_error($q$insert into public.swap_posts (user_id, kind, title, city) values (auth.uid(), 'offer', 'Another one', 'Tokyo')$q$, 'suspended', 'a suspended account cannot post');
select pg_temp.expect_error($q$insert into public.lfg_posts (author_id, game_system, country, city, from_date, to_date) values (auth.uid(), 'Any game', 'JP', 'Tokyo', current_date, current_date + 7)$q$, 'suspended', 'nor look for games');
select pg_temp.as_user(pg_temp.uid(49));
select public.admin_suspend(pg_temp.uid(14), false);
reset role;
select pg_temp.ok((select not is_suspended and suspended_reason is null from public.profiles where id = pg_temp.uid(14)), 'suspension lifted');
update public.profiles set is_admin = false where id = pg_temp.uid(49);
