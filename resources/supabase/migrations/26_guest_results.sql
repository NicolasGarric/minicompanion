-- Guest players in battle reports (owner request 2026-11-10): the host can write the result of a
-- played game even when an opponent never joined it on the site, to keep a trace of what happened.
--
--   * game_guest_results: one row per player without an account (name typed by the reporter, a first
--     name or a nickname, 40 characters at most), with placement, score and army like game_results.
--     Public like the other results; written only through submit_game_report.
--   * submit_game_report takes p_guests [{ "name": text, "placement": int, "score": int|null, "army": text|null }].
--     Registered players + guests = 2 to 8. The host only adds guests; another player who edits the report
--     sends them back unchanged (the form shows them read-only) or leaves p_guests empty to keep them.
--   * Nobody left to confirm (the reporter is the only player with an account): the report is confirmed
--     at once, and the host can still correct it later. Otherwise the usual confirmation applies.
--   * A game with guests never changes the friendly ratings (the guests' results cannot be confirmed), so
--     it counts as played on the profile but not in the wins, which come from the ratings.

create table if not exists public.game_guest_results (
  game_id   uuid not null references public.game_reports (game_id) on delete cascade,
  slot      int not null check (slot between 1 and 7),
  name      text not null check (char_length(btrim(name)) between 1 and 40),
  score     int check (score between -1000 and 100000),
  placement int not null check (placement between 1 and 8),
  army      text check (char_length(army) <= 80),
  primary key (game_id, slot)
);

alter table public.game_guest_results enable row level security;
revoke insert, update, delete on public.game_guest_results from anon, authenticated;
drop policy if exists "guest results are public" on public.game_guest_results;
create policy "guest results are public" on public.game_guest_results for select using (true);

-- No ratings for games with guests (also skipped when ratings are rebuilt after a deletion).
create or replace function public.apply_report_ratings(p_game uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games;
  key text;
  n int;
  best int;
  winners int;
begin
  if exists (select 1 from public.game_guest_results where game_id = p_game) then
    return;
  end if;
  select * into g from public.games where id = p_game;
  key := lower(btrim(g.game_system));
  select count(*), min(placement) into n, best from public.game_results where game_id = p_game;
  select count(*) into winners from public.game_results where game_id = p_game and placement = best;
  insert into public.player_ratings (player_id, game_key, game_name)
  select player_id, key, btrim(g.game_system) from public.game_results where game_id = p_game
  on conflict (player_id, game_key) do nothing;

  update public.player_ratings pr
     set rating = pr.rating + round(d.delta)::int,
         games = pr.games + 1,
         wins = pr.wins + case when d.placement = best and winners = 1 then 1 else 0 end,
         draws = pr.draws + case when d.placement = best and winners > 1 then 1 else 0 end,
         losses = pr.losses + case when d.placement <> best then 1 else 0 end
    from (
      select a.player_id, a.placement,
             sum((32.0 / greatest(n - 1, 1)) * (
                   case when a.placement < b.placement then 1 when a.placement = b.placement then 0.5 else 0 end
                   - 1 / (1 + power(10, (rb.rating - ra.rating) / 400.0)))) as delta
        from public.game_results a
        join public.player_ratings ra on ra.player_id = a.player_id and ra.game_key = key
        join public.game_results b on b.game_id = a.game_id and b.player_id <> a.player_id
        join public.player_ratings rb on rb.player_id = b.player_id and rb.game_key = key
       where a.game_id = p_game
       group by a.player_id, a.placement
    ) d
   where pr.player_id = d.player_id and pr.game_key = key;
end;
$$;
revoke execute on function public.apply_report_ratings(uuid) from public, anon, authenticated;

drop function if exists public.submit_game_report(uuid, jsonb, text, text[]);
create or replace function public.submit_game_report(p_game uuid, p_results jsonb, p_summary text default null,
                                                     p_photos text[] default '{}', p_guests jsonb default '[]')
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
  guests jsonb := coalesce(p_guests, '[]'::jsonb);
  kept jsonb;
  total int;
  n int := 0;
  solo boolean;
begin
  if not public.is_game_participant(p_game) then
    raise exception 'not_participant';
  end if;
  select * into g from public.games where id = p_game;
  if g.status = 'cancelled' or g.starts_at > now() then
    raise exception 'not_played_yet';
  end if;
  select array_agg(u) into participants
    from (select g.host_id as u union select player_id from public.game_players where game_id = p_game and status = 'accepted') x;
  solo := array_length(participants, 1) = 1;
  -- A confirmed report is final, except a report the host alone could write (only guests against them).
  if exists (select 1 from public.game_reports where game_id = p_game and status = 'confirmed') and not solo then
    raise exception 'already_confirmed';
  end if;

  if jsonb_typeof(guests) <> 'array' then
    raise exception 'bad_results';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'placement', placement, 'score', score, 'army', army) order by slot), '[]'::jsonb)
    into kept from public.game_guest_results where game_id = p_game;
  if auth.uid() <> g.host_id then
    -- Other players keep the host's guests as they are.
    if jsonb_array_length(guests) = 0 then
      guests := kept;
    elsif (select array_agg(e ->> 'name' order by e ->> 'name') from jsonb_array_elements(guests) e)
          is distinct from (select array_agg(e ->> 'name' order by e ->> 'name') from jsonb_array_elements(kept) e) then
      raise exception 'not_host';
    end if;
  end if;

  total := array_length(participants, 1) + jsonb_array_length(guests);
  if total < 2 then
    raise exception 'no_opponent';
  end if;
  if total > 8 then
    raise exception 'bad_results';
  end if;
  if jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) <> array_length(participants, 1)
     or (select count(distinct (e ->> 'player_id')) from jsonb_array_elements(p_results) e) <> array_length(participants, 1)
     or exists (select 1 from jsonb_array_elements(p_results) e where (e ->> 'player_id')::uuid <> all (participants))
     or exists (select 1 from jsonb_array_elements(p_results || guests) e
                 where jsonb_typeof(e) <> 'object' or jsonb_typeof(e -> 'placement') <> 'number'
                    or (e ->> 'placement')::int not between 1 and total)
     or exists (select 1 from jsonb_array_elements(guests) e
                 where jsonb_typeof(e -> 'name') is distinct from 'string'
                    or char_length(btrim(e ->> 'name')) not between 1 and 40) then
    raise exception 'bad_results';
  end if;
  if exists (select 1 from unnest(coalesce(p_photos, '{}')) ph where split_part(ph, '/', 1) <> p_game::text) then
    raise exception 'bad_photos';
  end if;

  delete from public.game_reports where game_id = p_game;
  insert into public.game_reports (game_id, reported_by, summary, photos, status, confirmed_at)
  values (p_game, auth.uid(), nullif(btrim(p_summary), ''), coalesce(p_photos, '{}'),
          case when solo then 'confirmed'::public.game_report_status else 'reported' end,
          case when solo then now() end);
  for r in select * from jsonb_array_elements(p_results) loop
    item := nullif(r ->> 'gallery_item_id', '')::uuid;
    -- Gallery items: only your own. Who sees it follows your profile (migration 7).
    if item is not null and ((r ->> 'player_id')::uuid <> auth.uid()
        or not exists (select 1 from public.gallery_items where id = item and owner_id = auth.uid())) then
      item := null;
    end if;
    insert into public.game_results (game_id, player_id, score, placement, gallery_item_id, army, agreed)
    values (p_game, (r ->> 'player_id')::uuid, nullif(r ->> 'score', '')::int, (r ->> 'placement')::int, item,
            nullif(btrim(r ->> 'army'), ''), case when (r ->> 'player_id')::uuid = auth.uid() then true end);
  end loop;
  for r in select * from jsonb_array_elements(guests) loop
    n := n + 1;
    insert into public.game_guest_results (game_id, slot, name, score, placement, army)
    values (p_game, n, btrim(r ->> 'name'), nullif(r ->> 'score', '')::int, (r ->> 'placement')::int,
            nullif(btrim(r ->> 'army'), ''));
  end loop;

  insert into public.notifications (user_id, kind, payload)
  select u, 'report_to_confirm', jsonb_build_object('game_id', p_game, 'game', g.game_system)
    from unnest(participants) u where u <> auth.uid();
  return case when solo then 'confirmed'::public.game_report_status else 'reported' end;
end;
$$;
revoke execute on function public.submit_game_report(uuid, jsonb, text, text[], jsonb) from public, anon;
grant execute on function public.submit_game_report(uuid, jsonb, text, text[], jsonb) to authenticated;
