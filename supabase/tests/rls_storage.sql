-- Tests for the photo storage plan: WebP names, thumbnails, quota, admin gauge and cleanup.
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

-- ---------- Formats, gallery thumbnails ----------
select pg_temp.ok((select bool_and('image/webp' = any (allowed_mime_types)) from storage.buckets
                    where id in ('contest', 'challenges', 'reports', 'gallery', 'swap', 'bug-reports')), 'every photo bucket accepts WebP');
select pg_temp.ok(public.photo_thumb('a/b.w.webp') = 'a/b.t.webp' and public.photo_thumb('a/b.jpg') = 'a/b.jpg', 'thumbnail names');

set role authenticated;
select pg_temp.as_user(pg_temp.uid(21));
insert into storage.objects (bucket_id, name, owner, metadata)
values ('gallery', pg_temp.uid(21) || '/11111111-1111-1111-1111-111111111111.w.webp', auth.uid(), '{"size": 150000}'),
       ('gallery', pg_temp.uid(21) || '/11111111-1111-1111-1111-111111111111.t.webp', auth.uid(), '{"size": 25000}');
insert into public.gallery_items (owner_id, title, image_path, is_public)
values (auth.uid(), 'Storage test', pg_temp.uid(21) || '/11111111-1111-1111-1111-111111111111.w.webp', true);
reset role;
update public.profiles set is_public = true where id = pg_temp.uid(21);
set role authenticated;
select pg_temp.as_user(pg_temp.uid(22));
select pg_temp.ok((select count(*) from storage.objects where bucket_id = 'gallery' and name like pg_temp.uid(21) || '/1111%') = 2,
                  'a shared gallery image and its thumbnail are readable by others');
select pg_temp.as_user(pg_temp.uid(21));
select pg_temp.expect_error($q$insert into public.gallery_items (owner_id, title, image_path) values (auth.uid(), 'Bad', auth.uid() || '/x.gif')$q$,
                            '23514', 'gallery paths still checked');

-- ---------- Quota ----------
select pg_temp.ok((select used = 1 and quota = 100 from public.my_photo_usage()), 'usage counts full images only');
insert into storage.objects (bucket_id, name, owner)
select 'swap', auth.uid() || '/q' || n || '.w.webp', auth.uid() from generate_series(1, 99) n;
select pg_temp.ok((select used from public.my_photo_usage()) = 100, 'quota reached at 100 photos');
select pg_temp.expect_error($q$insert into storage.objects (bucket_id, name, owner) values ('swap', auth.uid() || '/over.w.webp', auth.uid())$q$,
                            '42501', 'the 101st photo is refused');
insert into storage.objects (bucket_id, name, owner) values ('swap', auth.uid() || '/q1.t.webp', auth.uid());
insert into storage.objects (bucket_id, name, owner) values ('bug-reports', auth.uid() || '/shot.webp', auth.uid());
select pg_temp.ok(true, 'thumbnails and bug screenshots do not count against the quota');
select pg_temp.as_user(pg_temp.uid(22));
select pg_temp.ok((select used from public.my_photo_usage()) = 0, 'each player has their own quota');
insert into storage.objects (bucket_id, name, owner) values ('swap', auth.uid() || '/mine.w.webp', auth.uid());

-- ---------- Closing dates ----------
insert into public.swap_posts (user_id, kind, title, city, photo_path) values (auth.uid(), 'offer', 'Old swap', 'Tokyo', auth.uid() || '/mine.w.webp');
update public.swap_posts set status = 'closed' where title = 'Old swap';
select pg_temp.ok((select closed_at is not null from public.swap_posts where title = 'Old swap'), 'closing a swap post stamps the date');
update public.swap_posts set status = 'open' where title = 'Old swap';
select pg_temp.ok((select closed_at is null from public.swap_posts where title = 'Old swap'), 'reopening clears it');
update public.swap_posts set status = 'closed' where title = 'Old swap';

-- ---------- Admin gauge and cleanup ----------
select pg_temp.expect_error($q$select * from public.admin_storage()$q$, 'forbidden', 'players cannot read the gauge');
select pg_temp.expect_error($q$select * from public.admin_storage_cleanup()$q$, 'forbidden', 'players cannot list cleanup');
select pg_temp.expect_error($q$select public.admin_storage_forget('swap', array['x'])$q$, 'forbidden', 'players cannot forget files');
reset role;
-- Age the files and the closed post as if time had passed
update storage.objects set created_at = now() - interval '10 days' where owner in (pg_temp.uid(21), pg_temp.uid(22));
update public.swap_posts set closed_at = now() - interval '31 days' where title = 'Old swap';
set role authenticated;
select pg_temp.as_user(pg_temp.uid(48));
select pg_temp.ok((select bytes from public.admin_storage() where bucket = 'gallery') = 175000, 'gauge sums file sizes per bucket');
select pg_temp.ok((select count(*) from public.admin_storage_cleanup() where name like pg_temp.uid(21) || '/1111%') = 0,
                  'referenced images and their thumbnails are kept');
select pg_temp.ok((select count(*) from public.admin_storage_cleanup() where reason = 'orphan' and name like pg_temp.uid(21) || '/q%') = 100,
                  'unreferenced files older than 7 days are orphans');
select pg_temp.ok((select reason from public.admin_storage_cleanup() where name = pg_temp.uid(22) || '/mine.w.webp') = 'swap_closed_30d',
                  'photos of posts closed 30 days ago expire');
select pg_temp.ok(public.admin_storage_forget('swap', array[pg_temp.uid(22) || '/mine.w.webp']) = 1, 'forget clears the post photo');
select pg_temp.ok((select photo_path is null from public.swap_posts where title = 'Old swap'), 'the closed post no longer points to the file');
select pg_temp.ok((select count(*) from storage.objects where bucket_id = 'swap') > 0, 'admins can read every photo bucket');

reset role;
select 'storage tests passed';
