-- =============================================================================================
-- Painting contest: entries with photos, blind public vote (one per category and account, not for
-- yourself), optional jury, results and podium once voting closes. Categories belong to a
-- tournament (usually of type "painting_contest").
-- =============================================================================================

-- 1 to 5 photos (3 angles recommended in the form, not enforced)
alter table public.contest_entries drop constraint contest_entries_photo_paths_check;
alter table public.contest_entries add constraint contest_entries_photo_paths_check
  check (array_length(photo_paths, 1) between 1 and 5);

-- Photos: public bucket (entries are public by design), one folder per category.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contest', 'contest', true, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;
create policy "contest photos: signed-in players upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'contest'
              and exists (select 1 from public.contest_categories c
                           where c.id::text = (storage.foldername(name))[1] and c.voting_closes_at > now()));
create policy "contest photos: uploaders delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'contest' and owner = auth.uid());

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'join_request', 'join_answer', 'game_match', 'report_to_confirm', 'report_answer', 'message',
  'game_message', 'league_game', 'round_paired', 'match_to_confirm', 'match_answer', 'contest_results'));

create or replace function public.contest_closed(p_category uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select voting_closes_at <= now() from public.contest_categories where id = p_category), false);
$$;

-- Entries of a category. While voting is open the author stays hidden (blind vote) and votes are
-- not counted publicly; the organiser always sees everything.
create or replace function public.contest_entries_of(p_category uuid)
returns table (id uuid, title text, photo_paths text[], is_mine boolean, my_vote boolean, is_hidden boolean,
               author_name text, author_handle text, votes bigint)
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select cc.*, public.is_organiser(cc.tournament_id) as organiser, cc.voting_closes_at <= now() as closed
      from public.contest_categories cc
     where cc.id = p_category and public.tournament_visible(cc.tournament_id)
  )
  select e.id, e.title, e.photo_paths, e.user_id = auth.uid(),
         exists (select 1 from public.contest_votes v where v.entry_id = e.id and v.voter_id = auth.uid()),
         e.is_hidden,
         case when c.closed or c.organiser or e.user_id = auth.uid() then p.display_name end,
         case when c.closed or c.organiser or e.user_id = auth.uid() then p.handle end,
         case when c.closed or c.organiser then (select count(*) from public.contest_votes v where v.entry_id = e.id) end
    from c
    join public.contest_entries e on e.category_id = c.id
    join public.profiles p on p.id = e.user_id
   where not e.is_hidden or c.organiser
   order by case when c.closed then (select count(*) from public.contest_votes v where v.entry_id = e.id) end desc nulls last,
            e.created_at;
$$;

-- Enters (or updates) your entry while the category is open; you confirm the photos are yours.
create or replace function public.submit_contest_entry(p_category uuid, p_title text, p_photos text[], p_rights boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  entry uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not p_rights then
    raise exception 'rights_required';
  end if;
  if public.contest_closed(p_category) or not exists (select 1 from public.contest_categories where id = p_category) then
    raise exception 'contest_closed';
  end if;
  if exists (select 1 from unnest(p_photos) ph where split_part(ph, '/', 1) <> p_category::text) then
    raise exception 'bad_photos';
  end if;
  insert into public.contest_entries (category_id, user_id, title, photo_paths, rights_confirmed)
  values (p_category, auth.uid(), btrim(p_title), p_photos, true)
  on conflict (category_id, user_id)
    do update set title = excluded.title, photo_paths = excluded.photo_paths
  returning id into entry;
  return entry;
end;
$$;

create or replace function public.withdraw_contest_entry(p_category uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.contest_closed(p_category) then
    raise exception 'contest_closed';
  end if;
  delete from public.contest_entries where category_id = p_category and user_id = auth.uid();
end;
$$;

-- One vote per account and category (voting again moves it); not for your own entry; confirmed
-- e-mail only, so throwaway accounts cannot stuff the ballot.
create or replace function public.cast_contest_vote(p_entry uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  e public.contest_entries;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null) then
    raise exception 'email_not_confirmed';
  end if;
  select * into e from public.contest_entries where id = p_entry;
  if not found or e.is_hidden then
    raise exception 'no_entry';
  end if;
  if public.contest_closed(e.category_id) then
    raise exception 'contest_closed';
  end if;
  if e.user_id = auth.uid() then
    raise exception 'own_entry';
  end if;
  insert into public.contest_votes (category_id, entry_id, voter_id)
  values (e.category_id, p_entry, auth.uid())
  on conflict (category_id, voter_id) do update set entry_id = excluded.entry_id, created_at = now();
end;
$$;

-- Results once voting is closed (the organiser can preview them): public votes and jury average
-- (technique + composition + originality, out of 30).
create or replace function public.contest_results(p_category uuid)
returns table (entry_id uuid, title text, photo_paths text[], author_name text, author_handle text,
               votes bigint, public_rank bigint, jury_score numeric, jury_rank bigint)
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select * from public.contest_categories
     where id = p_category and (voting_closes_at <= now() or public.is_organiser(tournament_id))
  ), scored as (
    select e.id, e.title, e.photo_paths, p.display_name, p.handle,
           (select count(*) from public.contest_votes v where v.entry_id = e.id) as votes,
           (select round(avg(technique + composition + originality), 1) from public.jury_scores j where j.entry_id = e.id) as jury
      from c join public.contest_entries e on e.category_id = c.id and not e.is_hidden
      join public.profiles p on p.id = e.user_id
  )
  select id, title, photo_paths, display_name, handle, votes,
         rank() over (order by votes desc),
         jury,
         case when jury is not null then rank() over (order by jury desc nulls last) end
    from scored
   order by votes desc, jury desc nulls last;
$$;

-- Jurors read their own scores through RLS; this lists the entries they still have to score.
create or replace function public.is_juror(p_category uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.contest_categories c join public.jury_members j on j.tournament_id = c.tournament_id
                  where c.id = p_category and j.user_id = auth.uid() and c.jury_enabled);
$$;

revoke execute on function public.submit_contest_entry(uuid, text, text[], boolean) from public, anon;
revoke execute on function public.withdraw_contest_entry(uuid) from public, anon;
revoke execute on function public.cast_contest_vote(uuid) from public, anon;
grant execute on function public.submit_contest_entry(uuid, text, text[], boolean) to authenticated;
grant execute on function public.withdraw_contest_entry(uuid) to authenticated;
grant execute on function public.cast_contest_vote(uuid) to authenticated;
grant execute on function public.contest_entries_of(uuid) to anon, authenticated;
grant execute on function public.contest_results(uuid) to anon, authenticated;
grant execute on function public.is_juror(uuid) to authenticated;
