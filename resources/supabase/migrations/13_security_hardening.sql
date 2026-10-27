-- Security pass (2026-10-23). Principle: the browser key may only do what the app does.
-- Everything else goes through the SECURITY DEFINER functions, which keep working unchanged.

-- 1. TRUNCATE ignores Row Level Security: nobody but the owner needs it.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate on public.%I from anon, authenticated', r.tablename);
  end loop;
end $$;

-- 2. Tables only changed through functions: no direct writes from the browser.
revoke insert, update, delete on public.registrations, public.army_lists, public.rounds, public.matches,
  public.game_tables, public.stores, public.store_staff, public.events, public.formats, public.stream_cache
  from anon, authenticated;
-- Analytics events are counted on the device; nothing writes this table (it was open to anonymous spam).
drop policy if exists "record own or anonymous events" on public.events;

-- 3. Check-in tokens were never used and were readable with the registrations: removed.
alter table public.registrations drop column if exists checkin_token;

-- 4. Tournaments: organisers edit the event, not its moderation flag, owner or flow.
revoke insert, update on public.tournaments from anon, authenticated;
grant insert (slug, name, description, organiser_id, store_id, venue_name, address, location, starts_at, ends_at,
  registration_deadline, list_deadline, format_id, type, language, max_players, rounds_planned, lists_visibility,
  pairing_system, twitch_channel, game_system, status) on public.tournaments to authenticated;
grant update (name, description, store_id, venue_name, address, location, starts_at, ends_at, registration_deadline,
  list_deadline, format_id, type, language, max_players, rounds_planned, lists_visibility, twitch_channel, game_system,
  status) on public.tournaments to authenticated;

-- Status moves made directly from the browser: draft <-> published, or cancelled before it starts.
-- Starting, rounds and finishing go through start_tournament / create_round / finish_tournament.
create or replace function public.tournaments_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'published') then
      raise exception 'bad_status';
    end if;
  elsif new.status is distinct from old.status
        and not (old.status in ('draft', 'published') and new.status in ('draft', 'published', 'cancelled')) then
    raise exception 'bad_status';
  end if;
  return new;
end;
$$;
drop trigger if exists tournaments_guard on public.tournaments;
create trigger tournaments_guard before insert or update on public.tournaments
  for each row execute function public.tournaments_guard();

-- 5. Contest entries are written by submit_contest_entry; the browser only hides / shows them (organiser).
drop policy if exists "authors edit entries" on public.contest_entries;
drop policy if exists "authors submit entries" on public.contest_entries;
revoke insert, update, delete on public.contest_entries from anon, authenticated;
grant update (is_hidden) on public.contest_entries to authenticated;

-- 6. Profiles: everyone sees the name card; city, armies and the rest only through the functions below.
revoke select on public.profiles from anon, authenticated;
grant select (id, handle, display_name, avatar_path, is_public, created_at) on public.profiles to anon, authenticated;

-- My own full profile (session, account page).
create or replace function public.my_profile()
returns setof public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles where id = auth.uid();
$$;
revoke execute on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- A player's page: city and armies only when the profile is public (or mine).
create or replace function public.player_card(p_handle text)
returns table (id uuid, handle text, display_name text, home_city text, factions text[], is_public boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.handle, p.display_name,
         case when public.profile_is_visible(p.id) then p.home_city end,
         case when public.profile_is_visible(p.id) then p.factions else '{}'::text[] end,
         p.is_public
    from public.profiles p
   where p.handle = lower(p_handle);
$$;
grant execute on function public.player_card(text) to anon, authenticated;
