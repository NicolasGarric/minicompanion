-- Reference links (owner decision 2026-11-09): decks, games, campaigns and their places point to the
-- rules where they are published (e.g. Wahapedia) instead of copying any rules text.
--
--   * A list of links is a JSON array of at most 8 objects {u, l?}: u an https address (300 characters
--     at most, no spaces, quotes or angle brackets), l an optional label (60 characters at most).
--     Checked by ref_links_ok(), the same rules as cleanRefs() in src/core/lib/refLinks.ts.
--   * decks.refs: written by the owner like name and groups; returned by deck_view (share link, games).
--   * games.refs: public like the game; set only by the host through set_game_refs (game not cancelled).
--   * campaigns: state.refs (whole campaign) and places[].refs, saved with the board; campaign_state_ok
--     now checks them.
--   * Unit cards need nothing new: their links are text rows of the info list (value = one address).
--   * Table maps carry their links inside the map code (field "l"), already limited to 6,000 characters.

create or replace function public.ref_links_ok(j jsonb)
returns boolean
language sql
immutable
as $$
  select j is not null and jsonb_typeof(j) = 'array' and jsonb_array_length(j) <= 8
     and not exists (
       select 1 from jsonb_array_elements(j) x
        where jsonb_typeof(x) <> 'object'
           or exists (select 1 from jsonb_object_keys(x) k where k not in ('u', 'l'))
           or jsonb_typeof(x -> 'u') is distinct from 'string'
           or char_length(x ->> 'u') > 300
           or (x ->> 'u') !~ '^https://[^][:space:]<>"''`\\]+\.[^][:space:]<>"''`\\]+$'
           or (x ? 'l' and (jsonb_typeof(x -> 'l') <> 'string' or char_length(x ->> 'l') > 60)))
     and (select count(distinct x ->> 'u') from jsonb_array_elements(j) x) = jsonb_array_length(j);
$$;

-- ---------------------------------------------------------------------------------------------
-- Decks
-- ---------------------------------------------------------------------------------------------
alter table public.decks add column if not exists refs jsonb not null default '[]'::jsonb
  check (public.ref_links_ok(refs));
grant insert (refs), update (refs) on public.decks to authenticated;

create or replace function public.deck_view(p_deck uuid, p_code text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d public.decks;
begin
  select * into d from public.decks where id = p_deck;
  if not found then
    return null;
  end if;
  -- coalesce: without an account auth.uid() is null, which must count as "no"
  if not (coalesce(d.owner_id = auth.uid(), false)
          or coalesce(d.share_code = p_code, false)
          or exists (select 1 from public.game_decks g
                      where g.deck_id = d.id and (public.is_game_host(g.game_id) or public.is_game_player(g.game_id)))) then
    return null;
  end if;
  return jsonb_build_object(
    'id', d.id, 'name', d.name, 'owner', (select display_name from public.profiles where id = d.owner_id),
    'groups', d.groups,
    'refs', d.refs,
    'cards', coalesce((select jsonb_agg(public.card_json(u)) from public.pile_units u
                        where u.owner_id = d.owner_id
                          and u.id::text in (select jsonb_array_elements_text(x.value) from jsonb_array_elements(d.groups) x)), '[]'::jsonb),
    'updated_at', d.updated_at);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Games
-- ---------------------------------------------------------------------------------------------
alter table public.games add column if not exists refs jsonb not null default '[]'::jsonb
  check (public.ref_links_ok(refs));

-- Host only, while the game is not cancelled; an empty list removes the links.
create or replace function public.set_game_refs(p_game uuid, p_refs jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if public.is_suspended(auth.uid()) then
    raise exception 'suspended';
  end if;
  if not exists (select 1 from public.games where id = p_game and host_id = auth.uid()) then
    raise exception 'not_host';
  end if;
  if exists (select 1 from public.games where id = p_game and status = 'cancelled') then
    raise exception 'game_cancelled';
  end if;
  update public.games set refs = coalesce(p_refs, '[]'::jsonb) where id = p_game;
end;
$$;
revoke execute on function public.set_game_refs(uuid, jsonb) from public, anon;
grant execute on function public.set_game_refs(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Campaigns: same checks as migration 21, plus the links of the campaign and of each place
-- ---------------------------------------------------------------------------------------------
create or replace function public.campaign_state_ok(s jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(s) = 'object'
     and pg_column_size(s) <= 256000
     and jsonb_typeof(s -> 'places') = 'array' and jsonb_array_length(s -> 'places') <= 80
     and jsonb_typeof(s -> 'routes') = 'array' and jsonb_array_length(s -> 'routes') <= 200
     and jsonb_typeof(coalesce(s -> 'zones', '[]')) = 'array' and jsonb_array_length(coalesce(s -> 'zones', '[]')) <= 40
     and jsonb_typeof(coalesce(s -> 'custom', '[]')) = 'array' and jsonb_array_length(coalesce(s -> 'custom', '[]')) <= 30
     and jsonb_typeof(s -> 'camps') = 'array' and jsonb_array_length(s -> 'camps') between 2 and 4
     and public.ref_links_ok(coalesce(s -> 'refs', '[]'))
     -- Camps: A to D, each once, a colour, short texts
     and not exists (select 1 from jsonb_array_elements(s -> 'camps') c
                      where coalesce(c ->> 'id', '') not in ('A', 'B', 'C', 'D')
                         or coalesce(c ->> 'color', '') !~ '^#[0-9a-fA-F]{6}$'
                         or char_length(coalesce(c ->> 'name', '')) not between 1 and 40
                         or char_length(coalesce(c ->> 'motto', '')) > 80
                         or jsonb_typeof(coalesce(c -> 'heroes', '[]')) <> 'array'
                         or jsonb_array_length(coalesce(c -> 'heroes', '[]')) > 12)
     and (select count(distinct c ->> 'id') from jsonb_array_elements(s -> 'camps') c) = jsonb_array_length(s -> 'camps')
     -- Places: numeric id once each, owner among the camps, a table map code or nothing, links
     and not exists (select 1 from jsonb_array_elements(s -> 'places') p
                      where jsonb_typeof(p -> 'id') <> 'number'
                         or char_length(coalesce(p ->> 'name', '')) not between 1 and 40
                         or char_length(coalesce(p ->> 'notes', '')) > 1000
                         or char_length(coalesce(p ->> 'scenario', '')) > 80
                         or (p ->> 'owner' is not null and p ->> 'owner' not in (select c ->> 'id' from jsonb_array_elements(s -> 'camps') c))
                         or (p ->> 'map' is not null and (char_length(p ->> 'map') > 6000 or p ->> 'map' !~ '^[jz][A-Za-z0-9_-]+$'))
                         or not public.ref_links_ok(coalesce(p -> 'refs', '[]')))
     and (select count(distinct p ->> 'id') from jsonb_array_elements(s -> 'places') p) = jsonb_array_length(s -> 'places')
     -- Routes join two existing places
     and not exists (select 1 from jsonb_array_elements(s -> 'routes') r
                      where not exists (select 1 from jsonb_array_elements(s -> 'places') p where p ->> 'id' = r ->> 'a')
                         or not exists (select 1 from jsonb_array_elements(s -> 'places') p where p ->> 'id' = r ->> 'b'));
$$;
