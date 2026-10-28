-- Security fixes (audit of 2026-10-28).
-- 1. Photo quota: a thumbnail only skips the quota when its full image is already there and is
--    the uploader's own (any "*.t.webp" name used to skip it, so the storage could be filled).
-- 2. Page view counters: a cap on new rows per day (any route-like name made a new row).
-- 3. Hidden content: the date it was hidden is kept, and the cleanup offers the photos of
--    contest entries, challenge entries and swap posts hidden for more than 7 days (their
--    buckets are public, so a hidden photo stayed reachable by its address).

-- ---------------------------------------------------------------------------------------------
-- 1. Quota: thumbnails only next to their own full image
-- ---------------------------------------------------------------------------------------------
-- "<id>.t.webp" -> "<id>.w.webp" exists in the same bucket and belongs to the uploader.
create or replace function public.thumb_has_main(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select p_name ~ '\.t\.(webp|jpg|png)$'
     and exists (select 1 from storage.objects o
                  where o.bucket_id = p_bucket
                    and o.name = regexp_replace(p_name, '\.t\.(webp|jpg|png)$', '.w.\1')
                    and o.owner = auth.uid())
$$;
revoke execute on function public.thumb_has_main(text, text) from public, anon;
grant execute on function public.thumb_has_main(text, text) to authenticated;

drop policy if exists "photos: quota per player" on storage.objects;
create policy "photos: quota per player" on storage.objects
  as restrictive
  for insert to authenticated
  with check (bucket_id not in ('contest', 'challenges', 'reports', 'gallery', 'swap')
              or public.thumb_has_main(bucket_id, name)
              or (name !~ '\.t\.(webp|jpg|png)$' and public.photo_count() < public.photo_quota()));

-- ---------------------------------------------------------------------------------------------
-- 2. Page view counters: at most 1,000 page / language rows per day
-- ---------------------------------------------------------------------------------------------
-- The app has about 45 route names in 9 languages; made-up names beyond the cap are dropped.
create or replace function public.track_page_view(p_page text, p_lang text, p_new_visit boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_page !~ '^[a-z][a-z.]{1,39}$' or p_lang !~ '^[a-z]{2}$' or p_page like 'admin%' then
    return;
  end if;
  if exists (select 1 from public.page_views_daily where day = current_date and page = p_page and lang = p_lang)
     or (select count(*) from public.page_views_daily where day = current_date) < 1000 then
    insert into public.page_views_daily (day, page, lang, views, visits)
    values (current_date, p_page, p_lang, 1, case when p_new_visit then 1 else 0 end)
    on conflict (day, page, lang) do update
      set views = page_views_daily.views + 1,
          visits = page_views_daily.visits + case when p_new_visit then 1 else 0 end;
  end if;
  if auth.uid() is not null then
    insert into public.active_days (user_id, day) values (auth.uid(), current_date) on conflict do nothing;
  end if;
end;
$$;
revoke execute on function public.track_page_view(text, text, boolean) from public;
grant execute on function public.track_page_view(text, text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Hidden content: when, and cleanup of its photos after 7 days
-- ---------------------------------------------------------------------------------------------
alter table public.contest_entries add column if not exists hidden_at timestamptz;
alter table public.challenge_entries add column if not exists hidden_at timestamptz;
alter table public.swap_posts add column if not exists hidden_at timestamptz;
update public.contest_entries set hidden_at = now() where is_hidden and hidden_at is null;
update public.challenge_entries set hidden_at = now() where is_hidden and hidden_at is null;
update public.swap_posts set hidden_at = now() where is_hidden and hidden_at is null;

create or replace function public.stamp_hidden_at()
returns trigger
language plpgsql
as $$
begin
  new.hidden_at := case when new.is_hidden then coalesce(old.hidden_at, now()) end;
  return new;
end;
$$;
drop trigger if exists contest_entries_hidden_at on public.contest_entries;
create trigger contest_entries_hidden_at before update of is_hidden on public.contest_entries
  for each row execute function public.stamp_hidden_at();
drop trigger if exists challenge_entries_hidden_at on public.challenge_entries;
create trigger challenge_entries_hidden_at before update of is_hidden on public.challenge_entries
  for each row execute function public.stamp_hidden_at();
drop trigger if exists swap_posts_hidden_at on public.swap_posts;
create trigger swap_posts_hidden_at before update of is_hidden on public.swap_posts
  for each row execute function public.stamp_hidden_at();

-- Same as migration 17, plus the "hidden_7d" reason.
create or replace function public.admin_storage_cleanup()
returns table (bucket text, name text, reason text, bytes bigint)
language plpgsql
stable
security definer
set search_path = public, storage
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  return query
  with refs as (
    -- Every path still referenced by the app, and its thumbnail
    select r.bucket, p.path from (
      select 'contest'::text as bucket, unnest(e.photo_paths) as path from public.contest_entries e
      union all select 'challenges', c.photo_path from public.challenge_entries c
      union all select 'reports', unnest(g.photos) from public.game_reports g
      union all select 'gallery', i.image_path from public.gallery_items i
      union all select 'swap', s.photo_path from public.swap_posts s where s.photo_path is not null
      union all select 'bug-reports', unnest(b.photos) from public.bug_reports b
    ) r
    cross join lateral (values (r.path), (public.photo_thumb(r.path))) p(path)
  ),
  expired as (
    select 'bug-reports'::text as bucket, unnest(b.photos) as path, 'bug_closed_90d'::text as reason
      from public.bug_reports b where b.closed_at < now() - interval '90 days'
    union all
    select 'swap', s.photo_path, 'swap_closed_30d'
      from public.swap_posts s where s.closed_at < now() - interval '30 days' and s.photo_path is not null
    union all
    select 'challenges', c.photo_path, 'challenge_12m'
      from public.challenge_entries c
      join public.season_challenges sc on sc.id = c.challenge_id
     where sc.ends_on < current_date - interval '12 months'
       and c.id not in (select l.id from public.challenge_entries l
                         where l.challenge_id = c.challenge_id
                         order by (select count(*) from public.challenge_likes k where k.entry_id = l.id) desc, l.created_at
                         limit 10)
    union all
    select 'contest', unnest(e.photo_paths), 'contest_12m'
      from public.contest_entries e
      join public.contest_categories cc on cc.id = e.category_id
     where cc.voting_closes_at < now() - interval '12 months'
       and not exists (select 1 from public.contest_results(cc.id) cr
                        where cr.entry_id = e.id and (cr.public_rank <= 3 or cr.jury_rank <= 3))
    union all
    select 'contest', unnest(e.photo_paths), 'hidden_7d'
      from public.contest_entries e where e.is_hidden and e.hidden_at < now() - interval '7 days'
    union all
    select 'challenges', c.photo_path, 'hidden_7d'
      from public.challenge_entries c where c.is_hidden and c.hidden_at < now() - interval '7 days'
    union all
    select 'swap', s.photo_path, 'hidden_7d'
      from public.swap_posts s
     where s.is_hidden and s.hidden_at < now() - interval '7 days' and s.photo_path is not null
  ),
  expired_files as (
    select x.bucket, p.path, x.reason
      from expired x cross join lateral (values (x.path), (public.photo_thumb(x.path))) p(path)
  )
  select o.bucket_id, o.name, f.reason, coalesce((o.metadata ->> 'size')::bigint, 0)
    from storage.objects o join expired_files f on f.bucket = o.bucket_id and f.path = o.name
  union
  select o.bucket_id, o.name, 'orphan', coalesce((o.metadata ->> 'size')::bigint, 0)
    from storage.objects o
   where o.bucket_id in ('contest', 'challenges', 'reports', 'gallery', 'swap', 'bug-reports')
     and o.created_at < now() - interval '7 days'
     and not exists (select 1 from refs r where r.bucket = o.bucket_id and r.path = o.name);
end;
$$;

-- Same as migration 17; hidden swap posts also lose their photo (challenge and contest entries
-- pointing to a removed file were already deleted).
create or replace function public.admin_storage_forget(p_bucket text, p_names text[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  if p_bucket = 'swap' then
    update public.swap_posts set photo_path = null
     where photo_path = any (p_names) and (status = 'closed' or is_hidden);
    get diagnostics n = row_count;
  elsif p_bucket = 'bug-reports' then
    update public.bug_reports set photos = '{}' where photos && p_names and closed_at is not null;
    get diagnostics n = row_count;
  elsif p_bucket = 'challenges' then
    delete from public.challenge_entries where photo_path = any (p_names);
    get diagnostics n = row_count;
  elsif p_bucket = 'contest' then
    delete from public.contest_entries where photo_paths && p_names;
    get diagnostics n = row_count;
  end if;
  return n;
end;
$$;
