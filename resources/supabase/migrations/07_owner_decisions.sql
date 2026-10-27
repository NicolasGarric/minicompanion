-- =============================================================================================
-- Owner decisions of 2026-10-25 (docs/CONTEXT.md):
--   * report photos and attached painted armies follow the author's profile: public profile ->
--     everyone, private profile -> the players of the game only
--   * "show on my profile" gallery images are only visible while the profile itself is public
--   * Supabase Realtime for messages and notifications
--   * cleanup of the games created by the automated live checks
-- =============================================================================================

-- Report photos: private bucket; a photo is readable when its uploader's profile is public, or by
-- the players of the game (the folder is the game id).
update storage.buckets set public = false where id = 'reports';
create policy "report photos: readable per uploader profile" on storage.objects
  for select
  using (bucket_id = 'reports'
         and (public.profile_is_visible(owner)
              or public.is_game_participant(((storage.foldername(name))[1])::uuid)));

-- Gallery images: "show on my profile" needs a public profile; an army attached to a report is
-- readable by the players of that game, and by everyone when the owner's profile is public.
create or replace function public.gallery_item_visible(p_item uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.gallery_items g
     where g.id = p_item
       and (g.owner_id = auth.uid()
            or (g.is_public and public.profile_is_visible(g.owner_id))
            or exists (select 1 from public.game_results r
                        where r.gallery_item_id = g.id
                          and (public.profile_is_visible(g.owner_id) or public.is_game_participant(r.game_id))))
  );
$$;

drop policy "public gallery items are readable" on public.gallery_items;
create policy "shared gallery items are readable" on public.gallery_items
  for select using (public.gallery_item_visible(id));
drop policy "gallery files: public items are readable" on storage.objects;
create policy "gallery files: shared items are readable" on storage.objects
  for select
  using (bucket_id = 'gallery'
         and exists (select 1 from public.gallery_items g where g.image_path = name and public.gallery_item_visible(g.id)));

-- Attaching an army no longer makes the gallery image public.
create or replace function public.submit_game_report(p_game uuid, p_results jsonb, p_summary text default null, p_photos text[] default '{}')
returns public.game_report_status
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games;
  participants uuid[];
  r jsonb;
  item uuid;
begin
  if not public.is_game_participant(p_game) then
    raise exception 'not_participant';
  end if;
  select * into g from public.games where id = p_game;
  if g.status = 'cancelled' or g.starts_at > now() then
    raise exception 'not_played_yet';
  end if;
  if exists (select 1 from public.game_reports where game_id = p_game and status = 'confirmed') then
    raise exception 'already_confirmed';
  end if;
  select array_agg(u) into participants
    from (select g.host_id as u union select player_id from public.game_players where game_id = p_game and status = 'accepted') x;
  if array_length(participants, 1) < 2 then
    raise exception 'no_opponent';
  end if;
  if jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) <> array_length(participants, 1)
     or (select count(distinct (e ->> 'player_id')) from jsonb_array_elements(p_results) e) <> array_length(participants, 1)
     or exists (select 1 from jsonb_array_elements(p_results) e where (e ->> 'player_id')::uuid <> all (participants)) then
    raise exception 'bad_results';
  end if;
  if exists (select 1 from unnest(coalesce(p_photos, '{}')) ph where split_part(ph, '/', 1) <> p_game::text) then
    raise exception 'bad_photos';
  end if;

  delete from public.game_reports where game_id = p_game;
  insert into public.game_reports (game_id, reported_by, summary, photos)
  values (p_game, auth.uid(), nullif(btrim(p_summary), ''), coalesce(p_photos, '{}'));
  for r in select * from jsonb_array_elements(p_results) loop
    item := nullif(r ->> 'gallery_item_id', '')::uuid;
    -- Gallery items: only your own. Who sees it follows your profile (see the policies above).
    if item is not null and ((r ->> 'player_id')::uuid <> auth.uid()
        or not exists (select 1 from public.gallery_items where id = item and owner_id = auth.uid())) then
      item := null;
    end if;
    insert into public.game_results (game_id, player_id, score, placement, gallery_item_id, army, agreed)
    values (p_game, (r ->> 'player_id')::uuid, nullif(r ->> 'score', '')::int, (r ->> 'placement')::int, item,
            nullif(btrim(r ->> 'army'), ''), case when (r ->> 'player_id')::uuid = auth.uid() then true end);
  end loop;

  insert into public.notifications (user_id, kind, payload)
  select u, 'report_to_confirm', jsonb_build_object('game_id', p_game, 'game', g.game_system)
    from unnest(participants) u where u <> auth.uid();
  return 'reported';
end;
$$;

-- Realtime: new messages and notifications are pushed to the browser (RLS still applies).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.direct_messages, public.game_messages, public.notifications;
  end if;
end $$;

-- The live checks (scripts/check-supabase.mjs) delete the test games they host once cancelled.
create or replace function public.purge_check_games()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  delete from public.games
   where host_id = auth.uid() and status = 'cancelled' and game_system = 'Automated check';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.purge_check_games() from public, anon;
grant execute on function public.purge_check_games() to authenticated;
