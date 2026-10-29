-- Unit cards and combat decks (owner decisions of 2026-10-29, visual "Cartes d'unite MiniCompanion" v2).
--
--   * My pile moves to the account: armies and units (pile_armies, pile_units), written directly by
--     their owner under RLS. The local armies are imported once (local_id keeps the import idempotent).
--     Painting sessions and the painted log stay on the device.
--   * Each unit carries its card: a free info list (info), one card photo chosen among the unit's
--     photos, and an optional link to another unit (a hero linked to an infantry unit; one level).
--       info   [{l: label (1-30), t: 'n' | 't', v: number | text (<= 500)}], at most 40 lines
--       photos [{p: "<owner>/<uuid>.w.webp", at: epoch ms}], at most 40
--   * Composed decks (decks): cards picked from any of the owner's armies, in scroll order, linked
--     cards grouped: groups [[unit, unit], [unit], ...], at most 60 cards. Private; the owner can turn
--     on a share code (read-only link, no account), and attach a deck to a game he plays in
--     (game_decks) so the other players can swipe it. Others only read decks through deck_view().
--   * Narrative campaigns: bringing a deck makes a campaign copy (campaign_decks, campaign_cards);
--     the player (or the master) evolves a card with evolve_campaign_card(), which writes a 'card'
--     entry in the campaign journal (before / after, contestable like the actions). The card history
--     is read from the journal. The original cards are never touched.
--   * Photos: public bucket "pile" (random file names, like the swap and challenge photos), own
--     folder per player, 500 photos per player (thumbnails not counted), 3 MB per file.

-- ---------------------------------------------------------------------------------------------
-- Checks of the JSON columns
-- ---------------------------------------------------------------------------------------------
create or replace function public.card_info_ok(i jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  x jsonb;
begin
  if i is null or jsonb_typeof(i) <> 'array' or jsonb_array_length(i) > 40 then
    return false;
  end if;
  for x in select value from jsonb_array_elements(i) loop
    if jsonb_typeof(x) <> 'object' or (select count(*) from jsonb_object_keys(x)) <> 3
       or jsonb_typeof(x -> 'l') <> 'string' or char_length(btrim(x ->> 'l')) not between 1 and 30 then
      return false;
    end if;
    if x ->> 't' = 'n' then
      if jsonb_typeof(x -> 'v') <> 'number' or abs((x ->> 'v')::numeric) >= 1000000 then
        return false;
      end if;
    elsif x ->> 't' = 't' then
      if jsonb_typeof(x -> 'v') <> 'string' or char_length(x ->> 'v') > 500 then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.pile_photo_path_ok(p text)
returns boolean
language sql
immutable
as $$ select p ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}(\.w)?\.(webp|jpg|png)$' $$;

create or replace function public.pile_photos_ok(ph jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  x jsonb;
begin
  if ph is null or jsonb_typeof(ph) <> 'array' or jsonb_array_length(ph) > 40 then
    return false;
  end if;
  for x in select value from jsonb_array_elements(ph) loop
    if jsonb_typeof(x) <> 'object' or jsonb_typeof(x -> 'p') <> 'string' or not public.pile_photo_path_ok(x ->> 'p')
       or jsonb_typeof(x -> 'at') <> 'number' then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- [[uuid, ...], ...], every id at most once, at most 60 cards.
create or replace function public.deck_groups_ok(g jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  grp jsonb;
  x jsonb;
  seen text[] := '{}';
begin
  if g is null or jsonb_typeof(g) <> 'array' then
    return false;
  end if;
  for grp in select value from jsonb_array_elements(g) loop
    if jsonb_typeof(grp) <> 'array' or jsonb_array_length(grp) = 0 then
      return false;
    end if;
    for x in select value from jsonb_array_elements(grp) loop
      if jsonb_typeof(x) <> 'string' or (x #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or (x #>> '{}') = any (seen) then
        return false;
      end if;
      seen := seen || (x #>> '{}');
    end loop;
  end loop;
  return cardinality(seen) <= 60;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- My pile, on the account
-- ---------------------------------------------------------------------------------------------
create table public.pile_armies (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  local_id   text check (local_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  colour     text not null default '#1d2a5b' check (colour ~ '^#[0-9a-fA-F]{6}$'),
  position   int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, local_id)
);
create index pile_armies_owner_idx on public.pile_armies (owner_id, position);

create table public.pile_units (
  id         uuid primary key default gen_random_uuid(),
  army_id    uuid not null references public.pile_armies (id) on delete cascade,
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  local_id   text check (local_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  role       text not null default 'troop' check (role in ('leader', 'troop', 'elite', 'support', 'other')),
  stage      text not null default 'box' check (stage in ('box', 'built', 'primed', 'painted', 'based')),
  count      int not null default 1 check (count between 1 and 999),
  painted    int not null default 0,
  note       text check (char_length(note) <= 500),
  info       jsonb not null default '[]'::jsonb check (public.card_info_ok(info)),
  photos     jsonb not null default '[]'::jsonb check (public.pile_photos_ok(photos)),
  card_photo text check (card_photo is null or public.pile_photo_path_ok(card_photo)),
  linked_to  uuid references public.pile_units (id) on delete set null,
  position   int not null default 0,
  done_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, local_id),
  check (painted between 0 and count),
  check (linked_to is null or linked_to <> id)
);
create index pile_units_army_idx on public.pile_units (army_id, position);
create index pile_units_owner_idx on public.pile_units (owner_id);
create index pile_units_linked_idx on public.pile_units (linked_to);

-- Same owner everywhere, photos in the owner's folder, the card photo is one of the unit's photos,
-- links one level deep, and a ceiling per player.
create or replace function public.pile_unit_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.pile_units;
begin
  -- Triggers run before the check constraints: refuse malformed photos before reading them
  if not public.pile_photos_ok(new.photos) then
    raise exception 'bad_photos';
  end if;
  if not exists (select 1 from public.pile_armies where id = new.army_id and owner_id = new.owner_id) then
    raise exception 'not_your_army';
  end if;
  if exists (select 1 from jsonb_array_elements(new.photos) x where split_part(x ->> 'p', '/', 1) <> new.owner_id::text) then
    raise exception 'not_your_photo';
  end if;
  if new.card_photo is not null and not exists (select 1 from jsonb_array_elements(new.photos) x where x ->> 'p' = new.card_photo) then
    raise exception 'card_photo_not_in_photos';
  end if;
  if new.linked_to is not null then
    select * into t from public.pile_units where id = new.linked_to;
    if not found or t.owner_id <> new.owner_id then
      raise exception 'not_your_unit';
    end if;
    if t.linked_to is not null or exists (select 1 from public.pile_units where linked_to = new.id) then
      raise exception 'link_depth';
    end if;
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.pile_units where owner_id = new.owner_id) >= 1000 then
    raise exception 'too_many_units';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger pile_unit_check before insert or update on public.pile_units
  for each row execute function public.pile_unit_check();

create or replace function public.pile_army_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.pile_armies where owner_id = new.owner_id) >= 100 then
    raise exception 'too_many_armies';
  end if;
  if tg_op = 'UPDATE' and new.owner_id <> old.owner_id then
    raise exception 'owner_is_fixed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger pile_army_check before insert or update on public.pile_armies
  for each row execute function public.pile_army_check();

alter table public.pile_armies enable row level security;
alter table public.pile_units enable row level security;
revoke all on public.pile_armies, public.pile_units from anon, authenticated;
grant select, insert, update, delete on public.pile_armies, public.pile_units to authenticated;

create policy "pile armies: owner only" on public.pile_armies
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and not public.is_suspended(auth.uid()));
create policy "pile units: owner only" on public.pile_units
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and not public.is_suspended(auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- Photos of My pile
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pile', 'pile', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function public.pile_photo_count()
returns int
language sql
stable
security definer
set search_path = public, storage
as $$
  select count(*)::int from storage.objects o
   where o.owner = auth.uid() and o.bucket_id = 'pile' and o.name !~ '\.t\.(webp|jpg|png)$'
$$;

create policy "pile photos: owners upload in their folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pile' and (storage.foldername(name))[1] = auth.uid()::text
              and not public.is_suspended(auth.uid())
              and (name ~ '\.t\.(webp|jpg|png)$' or public.pile_photo_count() < 500));
create policy "pile photos: owners delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'pile' and owner = auth.uid());

-- ---------------------------------------------------------------------------------------------
-- Composed decks
-- ---------------------------------------------------------------------------------------------
create table public.decks (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  groups     jsonb not null default '[]'::jsonb check (public.deck_groups_ok(groups)),
  -- null = private; set by deck_share() only
  share_code text unique check (share_code ~ '^[a-z0-9]{16}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index decks_owner_idx on public.decks (owner_id);

-- Keeps only the owner's units (deleted units drop out of the deck), and a ceiling per player.
create or replace function public.deck_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  grp jsonb;
  kept jsonb;
  out jsonb := '[]'::jsonb;
begin
  if tg_op = 'UPDATE' and new.owner_id <> old.owner_id then
    raise exception 'owner_is_fixed';
  end if;
  if not public.deck_groups_ok(new.groups) then
    raise exception 'bad_groups';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.decks where owner_id = new.owner_id) >= 50 then
    raise exception 'too_many_decks';
  end if;
  for grp in select value from jsonb_array_elements(new.groups) loop
    select coalesce(jsonb_agg(x.value order by x.ordinality), '[]'::jsonb) into kept
      from jsonb_array_elements(grp) with ordinality x
     where exists (select 1 from public.pile_units u where u.id = (x.value #>> '{}')::uuid and u.owner_id = new.owner_id);
    if jsonb_array_length(kept) > 0 then
      out := out || jsonb_build_array(kept);
    end if;
  end loop;
  new.groups := out;
  new.updated_at := now();
  return new;
end;
$$;
create trigger deck_check before insert or update on public.decks
  for each row execute function public.deck_check();

create table public.game_decks (
  game_id   uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  deck_id   uuid not null references public.decks (id) on delete cascade,
  primary key (game_id, player_id)
);
create index game_decks_deck_idx on public.game_decks (deck_id);

alter table public.decks enable row level security;
alter table public.game_decks enable row level security;
revoke all on public.decks, public.game_decks from anon, authenticated;
-- The owner writes the name and the order; the share code goes through deck_share().
grant select, delete on public.decks to authenticated;
grant insert (name, groups), update (name, groups) on public.decks to authenticated;
grant select on public.game_decks to anon, authenticated;

create policy "decks: owner only" on public.decks
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and not public.is_suspended(auth.uid()));
create policy "game decks: players of the game" on public.game_decks
  for select using (public.is_game_host(game_id) or public.is_game_player(game_id));

-- Turn the read-only link on (returns the code) or off (returns null).
create or replace function public.deck_share(p_deck uuid, p_on boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
begin
  if not exists (select 1 from public.decks where id = p_deck and owner_id = auth.uid()) then
    raise exception 'not_owner';
  end if;
  if p_on and public.is_suspended(auth.uid()) then
    raise exception 'suspended';
  end if;
  update public.decks
     set share_code = case when p_on then coalesce(share_code, substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)) end
   where id = p_deck
  returning share_code into code;
  return code;
end;
$$;

-- Attach my deck to a game I play in (host or accepted player); null detaches it.
create or replace function public.set_game_deck(p_game uuid, p_deck uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not (public.is_game_host(p_game) or public.is_game_player(p_game)) then
    raise exception 'not_player';
  end if;
  if p_deck is null then
    delete from public.game_decks where game_id = p_game and player_id = auth.uid();
    return;
  end if;
  if public.is_suspended(auth.uid()) then
    raise exception 'suspended';
  end if;
  if not exists (select 1 from public.decks where id = p_deck and owner_id = auth.uid()) then
    raise exception 'not_owner';
  end if;
  insert into public.game_decks (game_id, player_id, deck_id) values (p_game, auth.uid(), p_deck)
  on conflict (game_id, player_id) do update set deck_id = excluded.deck_id;
end;
$$;

-- One card as the readers see it.
create or replace function public.card_json(u public.pile_units)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', u.id, 'name', u.name, 'role', u.role, 'info', u.info, 'linked_to', u.linked_to,
    'photo', coalesce(u.card_photo, u.photos -> -1 ->> 'p'),
    'army', a.name, 'colour', a.colour)
    from public.pile_armies a where a.id = u.army_id
$$;

-- A deck for its owner, for a share link (no account needed), or for the players of a game it is
-- attached to. Null when the reader may not see it.
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
    'cards', coalesce((select jsonb_agg(public.card_json(u)) from public.pile_units u
                        where u.owner_id = d.owner_id
                          and u.id::text in (select jsonb_array_elements_text(x.value) from jsonb_array_elements(d.groups) x)), '[]'::jsonb),
    'updated_at', d.updated_at);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Campaign copies
-- ---------------------------------------------------------------------------------------------
alter table public.campaign_log drop constraint campaign_log_effect_check;
alter table public.campaign_log add constraint campaign_log_effect_check
  check (effect in ('take', 'fort', 'cut', 'res', 'xp', 'fall', 'event', 'battle', 'card'));

create table public.campaign_decks (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  camp        text check (camp in ('A', 'B', 'C', 'D')),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  -- Same shape as decks.groups, with campaign card ids
  groups      jsonb not null default '[]'::jsonb check (public.deck_groups_ok(groups)),
  source_deck uuid references public.decks (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (campaign_id, owner_id),
  -- Leaving the campaign removes the copy
  foreign key (campaign_id, owner_id) references public.campaign_members (campaign_id, user_id) on delete cascade
);

create table public.campaign_cards (
  id               uuid primary key default gen_random_uuid(),
  campaign_deck_id uuid not null references public.campaign_decks (id) on delete cascade,
  campaign_id      uuid not null references public.campaigns (id) on delete cascade,
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  source_unit      uuid references public.pile_units (id) on delete set null,
  name             text not null check (char_length(btrim(name)) between 1 and 60),
  role             text not null check (role in ('leader', 'troop', 'elite', 'support', 'other')),
  army             text check (char_length(army) <= 60),
  colour           text check (colour ~ '^#[0-9a-fA-F]{6}$'),
  photo            text check (photo is null or public.pile_photo_path_ok(photo)),
  info             jsonb not null check (public.card_info_ok(info)),
  linked_to        uuid references public.campaign_cards (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index campaign_cards_deck_idx on public.campaign_cards (campaign_deck_id);
create index campaign_cards_campaign_idx on public.campaign_cards (campaign_id);

alter table public.campaign_decks enable row level security;
alter table public.campaign_cards enable row level security;
revoke all on public.campaign_decks, public.campaign_cards from anon, authenticated;
grant select on public.campaign_decks, public.campaign_cards to anon, authenticated;
create policy "campaign decks: readable with the campaign" on public.campaign_decks
  for select using (public.campaign_readable(campaign_id));
create policy "campaign cards: readable with the campaign" on public.campaign_cards
  for select using (public.campaign_readable(campaign_id));

-- Bring one of my decks into a campaign where I have a camp: every card is copied. Replacing the
-- copy is allowed while none of its cards has evolved.
create or replace function public.bring_deck_to_campaign(p_campaign uuid, p_deck uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.decks;
  mine text;
  old_id uuid;
  cd_id uuid;
  grp jsonb;
  ng jsonb;
  out jsonb := '[]'::jsonb;
  u public.pile_units;
  a public.pile_armies;
  cid uuid;
  ids jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if public.is_suspended(auth.uid()) then
    raise exception 'suspended';
  end if;
  mine := public.my_campaign_camp(p_campaign);
  if mine is null then
    raise exception 'not_your_camp';
  end if;
  if (select status from public.campaigns where id = p_campaign) <> 'active' then
    raise exception 'campaign_finished';
  end if;
  select * into d from public.decks where id = p_deck and owner_id = auth.uid();
  if not found then
    raise exception 'not_owner';
  end if;
  select id into old_id from public.campaign_decks where campaign_id = p_campaign and owner_id = auth.uid();
  if old_id is not null then
    if exists (select 1 from public.campaign_log l
                where l.campaign_id = p_campaign and l.effect = 'card'
                  and (l.detail ->> 'card')::uuid in (select id from public.campaign_cards where campaign_deck_id = old_id)) then
      raise exception 'deck_has_history';
    end if;
    delete from public.campaign_decks where id = old_id;
  end if;
  insert into public.campaign_decks (campaign_id, owner_id, camp, name, source_deck)
  values (p_campaign, auth.uid(), mine, d.name, d.id)
  returning id into cd_id;
  for grp in select value from jsonb_array_elements(d.groups) loop
    ng := '[]'::jsonb;
    for u in select p.* from jsonb_array_elements_text(grp) with ordinality x(v, n)
               join public.pile_units p on p.id = x.v::uuid and p.owner_id = auth.uid()
              order by x.n loop
      select * into a from public.pile_armies where id = u.army_id;
      insert into public.campaign_cards (campaign_deck_id, campaign_id, owner_id, source_unit, name, role, army, colour, photo, info)
      values (cd_id, p_campaign, auth.uid(), u.id, u.name, u.role, a.name, a.colour,
              coalesce(u.card_photo, u.photos -> -1 ->> 'p'), u.info)
      returning id into cid;
      ids := ids || jsonb_build_object(u.id::text, cid);
      ng := ng || to_jsonb(cid::text);
    end loop;
    if jsonb_array_length(ng) > 0 then
      out := out || jsonb_build_array(ng);
    end if;
  end loop;
  -- Links between copied cards follow the links of the units
  update public.campaign_cards c set linked_to = (ids ->> p.linked_to::text)::uuid
    from public.pile_units p
   where c.campaign_deck_id = cd_id and p.id = c.source_unit and p.linked_to is not null and ids ? p.linked_to::text;
  update public.campaign_decks set groups = out where id = cd_id;
  return cd_id;
end;
$$;

-- Take my copy out of the campaign (only while none of its cards has evolved).
create or replace function public.remove_campaign_deck(p_campaign uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_id uuid;
begin
  select id into old_id from public.campaign_decks where campaign_id = p_campaign and owner_id = auth.uid();
  if old_id is null then
    raise exception 'not_found';
  end if;
  if exists (select 1 from public.campaign_log l
              where l.campaign_id = p_campaign and l.effect = 'card'
                and (l.detail ->> 'card')::uuid in (select id from public.campaign_cards where campaign_deck_id = old_id)) then
    raise exception 'deck_has_history';
  end if;
  delete from public.campaign_decks where id = old_id;
end;
$$;

-- A card evolves (stats, rules gained or lost): new info list, written to the journal with the
-- list before and after, so the other camps can contest it and the card shows its history.
create or replace function public.evolve_campaign_card(p_card uuid, p_info jsonb, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  k public.campaign_cards;
  c public.campaigns;
  d public.campaign_decks;
  log_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select * into k from public.campaign_cards where id = p_card;
  if not found or not (coalesce(k.owner_id = auth.uid(), false) or public.is_campaign_master(k.campaign_id)) then
    raise exception 'not_your_card';
  end if;
  if public.is_suspended(auth.uid()) then
    raise exception 'suspended';
  end if;
  if not public.card_info_ok(p_info) then
    raise exception 'bad_info';
  end if;
  if p_info = k.info then
    raise exception 'no_change';
  end if;
  if (select count(*) from public.campaign_log where author_id = auth.uid() and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited';
  end if;
  select * into c from public.campaigns where id = k.campaign_id for update;
  if c.status <> 'active' then
    raise exception 'campaign_finished';
  end if;
  select * into d from public.campaign_decks where id = k.campaign_deck_id;
  update public.campaign_cards set info = p_info, updated_at = now() where id = p_card;
  insert into public.campaign_log (campaign_id, turn, camp, author_id, effect, label, detail, inverse, snapshot)
  values (k.campaign_id, c.turn, d.camp, auth.uid(), 'card', left(k.name, 60),
          jsonb_build_object('card', k.id, 'before', k.info, 'after', p_info, 'note', left(btrim(coalesce(p_note, '')), 200)),
          jsonb_build_object('card', k.id, 'info', k.info),
          public.cn_snapshot(c.state))
  returning id into log_id;
  return log_id;
end;
$$;

-- Same as before, plus card entries: undoing one puts the list back, if the card has not changed since.
create or replace function public.resolve_campaign_contest(p_log uuid, p_undo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.campaign_log;
begin
  select * into l from public.campaign_log where id = p_log;
  if not found or not public.is_campaign_master(l.campaign_id) then
    raise exception 'not_master';
  end if;
  if l.contested_by is null or l.resolution is not null then
    raise exception 'not_contested';
  end if;
  if p_undo and l.effect = 'card' then
    if (select info from public.campaign_cards where id = (l.inverse ->> 'card')::uuid) is distinct from l.detail -> 'after' then
      raise exception 'card_changed_since';
    end if;
    update public.campaign_cards set info = l.inverse -> 'info', updated_at = now() where id = (l.inverse ->> 'card')::uuid;
  elsif p_undo then
    update public.campaigns set state = public.cn_unapply(state, l.inverse), version = version + 1, updated_at = now()
     where id = l.campaign_id;
  end if;
  update public.campaign_log set resolution = case when p_undo then 'undone' else 'kept' end where id = p_log;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------
revoke execute on function public.deck_share(uuid, boolean), public.set_game_deck(uuid, uuid),
  public.bring_deck_to_campaign(uuid, uuid), public.remove_campaign_deck(uuid), public.evolve_campaign_card(uuid, jsonb, text),
  public.deck_view(uuid, text), public.card_json(public.pile_units), public.pile_photo_count(),
  public.pile_unit_check(), public.pile_army_check(), public.deck_check()
  from public, anon, authenticated;
grant execute on function public.deck_share(uuid, boolean), public.set_game_deck(uuid, uuid),
  public.bring_deck_to_campaign(uuid, uuid), public.remove_campaign_deck(uuid), public.evolve_campaign_card(uuid, jsonb, text)
  to authenticated;
grant execute on function public.deck_view(uuid, text) to anon, authenticated;
-- Used by the storage policy, which runs as the uploader
grant execute on function public.pile_photo_count() to authenticated;
