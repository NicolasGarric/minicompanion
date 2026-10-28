-- Tests for migration 19 (security audit 2026-10-28): thumbnail quota hole, page view cap,
-- hidden content photos in the cleanup.
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
update public.profiles set is_admin = true where id = pg_temp.uid(48);
insert into public.season_challenges (id, theme_key, palette, starts_on, ends_on)
values (md5('test-fix-challenge')::uuid, 'test_fix', array['#000000', '#ffffff'], current_date - 1, current_date + 1);

-- ---------- 1. Thumbnails only next to their own full image ----------
set role authenticated;
select pg_temp.as_user(pg_temp.uid(44));
insert into storage.objects (bucket_id, name, owner)
values ('challenges', md5('test-fix-challenge')::uuid || '/a.w.webp', auth.uid());
insert into storage.objects (bucket_id, name, owner)
values ('challenges', md5('test-fix-challenge')::uuid || '/a.t.webp', auth.uid());
select pg_temp.ok(true, 'a thumbnail next to its own full image is accepted');
select pg_temp.expect_error($q$insert into storage.objects (bucket_id, name, owner)
                               values ('challenges', md5('test-fix-challenge')::uuid || '/fake.t.webp', auth.uid())$q$,
                            '42501', 'a thumbnail without its full image is refused');
insert into storage.objects (bucket_id, name, owner)
values ('challenges', md5('test-fix-challenge')::uuid || '/b.w.webp', auth.uid());
select pg_temp.as_user(pg_temp.uid(45));
select pg_temp.expect_error($q$insert into storage.objects (bucket_id, name, owner)
                               values ('challenges', md5('test-fix-challenge')::uuid || '/b.t.webp', auth.uid())$q$,
                            '42501', 'a thumbnail of someone else''s image is refused');
select pg_temp.ok((select used from public.my_photo_usage()) = 0, 'refused thumbnails left nothing behind');
select pg_temp.as_user(pg_temp.uid(44));
select pg_temp.ok((select used from public.my_photo_usage()) = 2, 'full images still count, thumbnails do not');
insert into storage.objects (bucket_id, name, owner) values ('bug-reports', auth.uid() || '/shot.webp', auth.uid());
select pg_temp.ok(true, 'bug screenshots are still outside the quota');

-- ---------- 2. Page view counters ----------
set role anon;
select pg_temp.as_user(null);
select public.track_page_view('home', 'en', true);
reset role;
select pg_temp.ok((select views >= 1 from public.page_views_daily where day = current_date and page = 'home' and lang = 'en'),
                  'a page view is counted');
create temporary table pv_before as select views from public.page_views_daily where day = current_date and page = 'home' and lang = 'en';
insert into public.page_views_daily (day, page, lang, views, visits)
select current_date, 'zz' || translate(n::text, '0123456789', 'abcdefghij'), 'en', 1, 0
  from generate_series(1, 1000) n
on conflict do nothing;
set role anon;
select public.track_page_view('madeupname', 'en', true);
select public.track_page_view('home', 'en', false);
reset role;
select pg_temp.ok(not exists (select 1 from public.page_views_daily where day = current_date and page = 'madeupname'),
                  'no new page row once the day has 1,000');
select pg_temp.ok((select views from public.page_views_daily where day = current_date and page = 'home' and lang = 'en')
                  = (select views from pv_before) + 1, 'existing pages keep counting');
delete from public.page_views_daily where day = current_date and page like 'zz%';

-- ---------- 3. Hidden content ----------
set role authenticated;
select pg_temp.as_user(pg_temp.uid(44));
insert into storage.objects (bucket_id, name, owner) values ('swap', auth.uid() || '/s.w.webp', auth.uid());
insert into storage.objects (bucket_id, name, owner) values ('swap', auth.uid() || '/s.t.webp', auth.uid());
insert into public.swap_posts (user_id, kind, title, city, photo_path)
values (auth.uid(), 'offer', 'Hidden swap', 'Osaka', auth.uid() || '/s.w.webp');
select public.submit_challenge_entry(md5('test-fix-challenge')::uuid, 'Hidden entry',
                                     md5('test-fix-challenge')::uuid || '/a.w.webp', true);

-- Challenge entries are only read through functions: their id is looked up as the owner.
reset role;
create temporary table fx_entry as select id from public.challenge_entries where title = 'Hidden entry';
grant select on fx_entry to authenticated;
set role authenticated;
select pg_temp.as_user(pg_temp.uid(48));
select public.admin_hide_swap((select id from public.swap_posts where title = 'Hidden swap'), true);
select public.admin_hide_challenge_entry((select id from fx_entry), true);
select pg_temp.ok((select hidden_at is not null from public.swap_posts where title = 'Hidden swap'), 'hiding a swap post stamps the date');
select public.admin_hide_swap((select id from public.swap_posts where title = 'Hidden swap'), false);
select pg_temp.ok((select hidden_at is null from public.swap_posts where title = 'Hidden swap'), 'showing it again clears the date');
select public.admin_hide_swap((select id from public.swap_posts where title = 'Hidden swap'), true);
select pg_temp.ok(not exists (select 1 from public.admin_storage_cleanup() where reason = 'hidden_7d' and name like '%/s.%.webp'),
                  'recently hidden photos are kept (time to restore)');

reset role;
update public.swap_posts set hidden_at = now() - interval '8 days' where title = 'Hidden swap';
select pg_temp.ok((select is_hidden and hidden_at is not null from public.challenge_entries where title = 'Hidden entry'),
                  'hiding a challenge entry stamps the date');
update public.challenge_entries set hidden_at = now() - interval '8 days' where title = 'Hidden entry';
update public.contest_entries set is_hidden = true where id = (select id from public.contest_entries order by id limit 1);
select pg_temp.ok((select hidden_at is not null from public.contest_entries order by id limit 1), 'hiding a contest entry stamps the date');
update public.contest_entries set is_hidden = false where id = (select id from public.contest_entries order by id limit 1);

set role authenticated;
select pg_temp.as_user(pg_temp.uid(48));
select pg_temp.ok((select count(*) from public.admin_storage_cleanup()
                    where reason = 'hidden_7d' and bucket = 'swap' and name like pg_temp.uid(44) || '/s.%') = 2,
                  'a swap photo hidden 8 days ago and its thumbnail are offered for deletion');
select pg_temp.ok((select count(*) from public.admin_storage_cleanup()
                    where reason = 'hidden_7d' and bucket = 'challenges' and name like md5('test-fix-challenge')::uuid || '/a.%') = 2,
                  'a hidden challenge photo and its thumbnail are offered for deletion');
select pg_temp.ok(public.admin_storage_forget('swap', array[pg_temp.uid(44) || '/s.w.webp']) = 1, 'forget clears the hidden post photo');
select pg_temp.ok((select photo_path is null from public.swap_posts where title = 'Hidden swap'), 'the hidden post no longer points to the file');
select pg_temp.as_user(pg_temp.uid(44));
select pg_temp.expect_error($q$select * from public.admin_storage_cleanup()$q$, 'forbidden', 'players still cannot list cleanup');

reset role;
select 'security fixes tests passed';
