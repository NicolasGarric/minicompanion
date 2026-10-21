-- =============================================================================================
-- PLAY: tournaments, registrations, army lists, rounds, tables, matches, painting contests,
-- stream cache. Score and vote functions come with their features (later migrations); this file
-- creates every table so the model is complete from day one.
-- =============================================================================================

create type public.tournament_type   as enum ('beginner', 'casual', 'competitive', 'narrative', 'painting_contest');
create type public.event_language    as enum ('en', 'ja', 'both');
create type public.pairing_system    as enum ('swiss', 'single_elim', 'round_robin');
create type public.lists_visibility  as enum ('hidden_until_start', 'public');
create type public.tournament_status as enum ('draft', 'published', 'in_progress', 'finished', 'cancelled');
create type public.registration_status as enum ('registered', 'waitlist', 'withdrawn', 'dropped');
create type public.list_status       as enum ('submitted', 'approved', 'rejected');
create type public.round_status      as enum ('pending', 'active', 'finished');
create type public.match_status      as enum ('scheduled', 'reported', 'confirmed', 'disputed', 'resolved');
create type public.match_result      as enum ('a_win', 'b_win', 'draw');
create type public.contest_kind      as enum ('single', 'squad', 'vehicle', 'beginner');

-- ---------------------------------------------------------------------------------------------
-- Formats: generic names, not official ones.
-- ---------------------------------------------------------------------------------------------
create table public.formats (
  id             text primary key,
  points_limit   int not null check (points_limit > 0),
  round_minutes  int not null check (round_minutes > 0),
  default_rounds int not null check (default_rounds between 1 and 10)
);

insert into public.formats (id, points_limit, round_minutes, default_rounds) values
  ('skirmish', 500, 60, 3),    -- ~1 hour games, weekday evenings, beginners
  ('clash', 1000, 120, 3),     -- ~2 hour games
  ('battle', 2000, 180, 5);    -- classic competitive, full day

-- ---------------------------------------------------------------------------------------------
-- Tournaments
-- ---------------------------------------------------------------------------------------------
create table public.tournaments (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  name                  text not null check (char_length(name) between 3 and 100),
  description           text check (char_length(description) <= 2000),
  organiser_id          uuid not null references public.profiles (id),
  store_id              uuid references public.stores (id) on delete set null,
  venue_name            text not null,
  address               text not null,
  location              extensions.geography(Point, 4326) not null,
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  format_id             text not null references public.formats (id),
  type                  public.tournament_type not null,
  language              public.event_language not null default 'ja',
  max_players           int not null check (max_players between 2 and 256),
  registration_deadline timestamptz not null,
  list_deadline         timestamptz not null,
  pairing_system        public.pairing_system not null default 'swiss',
  rounds_planned        int not null check (rounds_planned between 1 and 10),
  lists_visibility      public.lists_visibility not null default 'hidden_until_start',
  twitch_channel        text check (twitch_channel ~ '^[A-Za-z0-9_]{4,25}$'),
  status                public.tournament_status not null default 'draft',
  is_hidden             boolean not null default false,
  created_at            timestamptz not null default now(),
  check (ends_at > starts_at),
  check (registration_deadline <= starts_at),
  check (list_deadline <= starts_at)
);

create index tournaments_location_idx on public.tournaments using gist (location);
create index tournaments_status_start_idx on public.tournaments (status, starts_at);
create index tournaments_store_idx on public.tournaments (store_id);
create index tournaments_format_idx on public.tournaments (format_id);
create index tournaments_type_idx on public.tournaments (type);
create index tournaments_organiser_idx on public.tournaments (organiser_id);

alter table public.events
  add constraint events_tournament_fk foreign key (tournament_id) references public.tournaments (id) on delete set null;

-- ---------------------------------------------------------------------------------------------
-- Registrations and army lists
-- ---------------------------------------------------------------------------------------------
create table public.registrations (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  status         public.registration_status not null default 'registered',
  checked_in_at  timestamptz,
  checkin_token  uuid not null unique default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create index registrations_user_idx on public.registrations (user_id);
create index registrations_tournament_status_idx on public.registrations (tournament_id, status);

-- Only the text pasted by the player is stored. No rules, datasheets or unit profiles.
create table public.army_lists (
  id                uuid primary key default gen_random_uuid(),
  registration_id   uuid not null unique references public.registrations (id) on delete cascade,
  raw_text          text not null check (char_length(raw_text) between 1 and 20000),
  parsed_faction    text check (char_length(parsed_faction) <= 80),
  parsed_points     int check (parsed_points >= 0),
  status            public.list_status not null default 'submitted',
  organiser_comment text check (char_length(organiser_comment) <= 1000),
  is_hidden         boolean not null default false,
  submitted_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Rounds, tables and matches
-- ---------------------------------------------------------------------------------------------
create table public.rounds (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  number        int not null check (number between 1 and 20),
  status        public.round_status not null default 'pending',
  started_at    timestamptz,
  unique (tournament_id, number)
);

create table public.game_tables (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  number        int not null check (number between 1 and 200),
  qr_token      uuid not null unique default gen_random_uuid(),
  unique (tournament_id, number)
);

create table public.matches (
  id               uuid primary key default gen_random_uuid(),
  tournament_id    uuid not null references public.tournaments (id) on delete cascade,
  round_id         uuid not null references public.rounds (id) on delete cascade,
  table_id         uuid references public.game_tables (id) on delete set null,
  player_a_id      uuid not null references public.profiles (id),
  player_b_id      uuid references public.profiles (id),          -- null = bye
  a_primary        int, a_secondary int, a_bonus int,
  b_primary        int, b_secondary int, b_bonus int,
  result           public.match_result,
  status           public.match_status not null default 'scheduled',
  reported_by      uuid references public.profiles (id),
  confirmed_by     uuid references public.profiles (id),
  dispute_note     text check (char_length(dispute_note) <= 500),
  board_photo_path text,
  updated_at       timestamptz not null default now(),
  check (player_b_id is null or player_b_id <> player_a_id)
);

create index matches_tournament_round_idx on public.matches (tournament_id, round_id);
create index matches_player_a_idx on public.matches (player_a_id);
create index matches_player_b_idx on public.matches (player_b_id);

-- ---------------------------------------------------------------------------------------------
-- Painting contests
-- ---------------------------------------------------------------------------------------------
create table public.contest_categories (
  id               uuid primary key default gen_random_uuid(),
  tournament_id    uuid not null references public.tournaments (id) on delete cascade,
  kind             public.contest_kind not null,
  voting_closes_at timestamptz not null,
  jury_enabled     boolean not null default false,
  unique (tournament_id, kind)
);

create table public.contest_entries (
  id               uuid primary key default gen_random_uuid(),
  category_id      uuid not null references public.contest_categories (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 80),
  photo_paths      text[] not null check (array_length(photo_paths, 1) between 3 and 5),
  scheme_id        uuid references public.schemes (id) on delete set null,
  rights_confirmed boolean not null check (rights_confirmed),
  is_hidden        boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (category_id, user_id)
);

create index contest_entries_category_idx on public.contest_entries (category_id);

create table public.contest_votes (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.contest_categories (id) on delete cascade,
  entry_id    uuid not null references public.contest_entries (id) on delete cascade,
  voter_id    uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (category_id, voter_id)       -- one vote per account per category
);

create index contest_votes_entry_idx on public.contest_votes (entry_id);

create table public.jury_members (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  primary key (tournament_id, user_id)
);

create table public.jury_scores (
  entry_id    uuid not null references public.contest_entries (id) on delete cascade,
  juror_id    uuid not null references public.profiles (id) on delete cascade,
  technique   int not null check (technique between 1 and 10),
  composition int not null check (composition between 1 and 10),
  originality int not null check (originality between 1 and 10),
  primary key (entry_id, juror_id)
);

-- ---------------------------------------------------------------------------------------------
-- Live: cached Twitch results, written by the Edge Function (service role) only
-- ---------------------------------------------------------------------------------------------
create table public.stream_cache (
  category_key text primary key,
  payload      jsonb not null,
  fetched_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Helpers used by policies and functions
-- ---------------------------------------------------------------------------------------------
create or replace function public.is_organiser(p_tournament uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tournaments t
    where t.id = p_tournament
      and (t.organiser_id = auth.uid()
           or (t.store_id is not null and public.is_store_staff(t.store_id))
           or public.is_admin())
  );
$$;

create or replace function public.tournament_visible(p_tournament uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tournaments t
    where t.id = p_tournament and t.status <> 'draft' and not t.is_hidden
  ) or public.is_organiser(p_tournament);
$$;

-- ---------------------------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------------------------
alter table public.formats            enable row level security;
alter table public.tournaments        enable row level security;
alter table public.registrations      enable row level security;
alter table public.army_lists         enable row level security;
alter table public.rounds             enable row level security;
alter table public.game_tables        enable row level security;
alter table public.matches            enable row level security;
alter table public.contest_categories enable row level security;
alter table public.contest_entries    enable row level security;
alter table public.contest_votes      enable row level security;
alter table public.jury_members       enable row level security;
alter table public.jury_scores        enable row level security;
alter table public.stream_cache       enable row level security;   -- no policy: service role only

create policy "formats are public" on public.formats for select using (true);

create policy "published tournaments are public" on public.tournaments
  for select using ((status <> 'draft' and not is_hidden) or public.is_organiser(id));
create policy "signed-in users organise tournaments" on public.tournaments
  for insert with check (organiser_id = auth.uid());
create policy "organisers edit their tournaments" on public.tournaments
  for update using (public.is_organiser(id)) with check (public.is_organiser(id));
create policy "organisers delete draft tournaments" on public.tournaments
  for delete using (public.is_organiser(id) and status = 'draft');

-- Registrations are created and changed through functions (capacity, waitlist, deadlines).
create policy "registrations visible with the tournament" on public.registrations
  for select using (user_id = auth.uid() or public.tournament_visible(tournament_id));
create policy "organisers manage registrations" on public.registrations
  for update using (public.is_organiser(tournament_id)) with check (public.is_organiser(tournament_id));

-- Army lists: owner and organiser always; others when the tournament makes them public or has started.
create policy "army lists visibility" on public.army_lists
  for select using (
    exists (
      select 1 from public.registrations r join public.tournaments t on t.id = r.tournament_id
      where r.id = army_lists.registration_id
        and (r.user_id = auth.uid()
             or public.is_organiser(t.id)
             or (not army_lists.is_hidden
                 and public.tournament_visible(t.id)
                 and (t.lists_visibility = 'public' or t.status in ('in_progress', 'finished'))))
    )
  );

create policy "rounds visible with the tournament" on public.rounds
  for select using (public.tournament_visible(tournament_id));
create policy "organisers manage rounds" on public.rounds
  for all using (public.is_organiser(tournament_id)) with check (public.is_organiser(tournament_id));

create policy "tables visible with the tournament" on public.game_tables
  for select using (public.tournament_visible(tournament_id));
create policy "organisers manage tables" on public.game_tables
  for all using (public.is_organiser(tournament_id)) with check (public.is_organiser(tournament_id));

-- Scores only change through report / confirm / dispute / resolve functions.
create policy "matches visible with the tournament" on public.matches
  for select using (public.tournament_visible(tournament_id));

create policy "categories visible with the tournament" on public.contest_categories
  for select using (public.tournament_visible(tournament_id));
create policy "organisers manage categories" on public.contest_categories
  for all using (public.is_organiser(tournament_id)) with check (public.is_organiser(tournament_id));

-- Entries are read through a function that hides authors until results (blind vote).
create policy "authors and organisers read entries" on public.contest_entries
  for select using (
    user_id = auth.uid()
    or public.is_organiser((select tournament_id from public.contest_categories c where c.id = category_id))
  );
create policy "authors submit entries" on public.contest_entries
  for insert with check (user_id = auth.uid());
create policy "authors edit entries" on public.contest_entries
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "organisers hide entries" on public.contest_entries
  for update using (public.is_organiser((select tournament_id from public.contest_categories c where c.id = category_id)));

-- Votes are cast through a function (verified email, no self-vote, voting window).
create policy "voters see their own votes" on public.contest_votes
  for select using (voter_id = auth.uid());

create policy "jury list visible with the tournament" on public.jury_members
  for select using (public.tournament_visible(tournament_id));
create policy "organisers manage the jury" on public.jury_members
  for all using (public.is_organiser(tournament_id)) with check (public.is_organiser(tournament_id));

create policy "jurors manage their scores" on public.jury_scores
  for all using (juror_id = auth.uid()) with check (
    juror_id = auth.uid()
    and exists (
      select 1 from public.contest_entries e
      join public.contest_categories c on c.id = e.category_id
      join public.jury_members j on j.tournament_id = c.tournament_id and j.user_id = auth.uid()
      where e.id = jury_scores.entry_id
    )
  );

-- ---------------------------------------------------------------------------------------------
-- Functions: search, registration, army lists
-- ---------------------------------------------------------------------------------------------

-- One function serves both the list view and the map view.
create or replace function public.search_tournaments(
  p_lat        double precision default null,
  p_lng        double precision default null,
  p_radius_km  double precision default null,
  p_from       timestamptz default now(),
  p_to         timestamptz default null,
  p_formats    text[] default null,
  p_types      public.tournament_type[] default null,
  p_language   public.event_language default null,
  p_store      uuid default null,
  p_has_spots  boolean default false
)
returns table (
  id uuid, slug text, name text, starts_at timestamptz, ends_at timestamptz,
  format_id text, type public.tournament_type, language public.event_language,
  venue_name text, address text, store_id uuid, store_name text,
  lat double precision, lng double precision, distance_km double precision,
  max_players int, registered int, spots_left int, twitch_channel text, status public.tournament_status
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with origin as (
    select case when p_lat is not null and p_lng is not null
                then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end as g
  )
  select
    t.id, t.slug, t.name, t.starts_at, t.ends_at, t.format_id, t.type, t.language,
    t.venue_name, t.address, t.store_id, s.name,
    st_y(t.location::geometry), st_x(t.location::geometry),
    case when o.g is not null then round((st_distance(t.location, o.g) / 1000)::numeric, 1)::double precision end,
    t.max_players,
    coalesce(r.n, 0)::int,
    greatest(t.max_players - coalesce(r.n, 0), 0)::int,
    t.twitch_channel, t.status
  from public.tournaments t
  cross join origin o
  left join public.stores s on s.id = t.store_id
  left join lateral (
    select count(*) as n from public.registrations x
    where x.tournament_id = t.id and x.status = 'registered'
  ) r on true
  where t.status in ('published', 'in_progress')
    and not t.is_hidden
    and t.starts_at >= coalesce(p_from, now())
    and (p_to is null or t.starts_at <= p_to)
    and (p_formats is null or t.format_id = any (p_formats))
    and (p_types is null or t.type = any (p_types))
    and (p_language is null or t.language = p_language or t.language = 'both')
    and (p_store is null or t.store_id = p_store)
    and (o.g is null or p_radius_km is null or st_dwithin(t.location, o.g, p_radius_km * 1000))
    and (not p_has_spots or coalesce(r.n, 0) < t.max_players)
  order by case when o.g is not null then st_distance(t.location, o.g) end nulls last, t.starts_at;
$$;

-- Registers the current user; full events put the player on the waitlist.
create or replace function public.register_for_tournament(p_tournament uuid)
returns public.registration_status
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
  taken int;
  new_status public.registration_status;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select * into t from public.tournaments where id = p_tournament for update;
  if not found or t.status <> 'published' or t.is_hidden then
    raise exception 'not_open';
  end if;
  if now() > t.registration_deadline then
    raise exception 'registration_closed';
  end if;
  select count(*) into taken from public.registrations
   where tournament_id = p_tournament and status = 'registered';
  new_status := case when taken < t.max_players then 'registered' else 'waitlist' end;
  insert into public.registrations (tournament_id, user_id, status)
  values (p_tournament, auth.uid(), new_status)
  on conflict (tournament_id, user_id)
    do update set status = excluded.status
    where public.registrations.status = 'withdrawn';
  return new_status;
end;
$$;

-- Withdrawing frees a spot: the oldest waitlisted player is promoted.
create or replace function public.withdraw_from_tournament(p_tournament uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  was public.registration_status;
begin
  select status into was from public.registrations
   where tournament_id = p_tournament and user_id = auth.uid()
   for update;
  if was is null or was not in ('registered', 'waitlist') then
    return;
  end if;
  update public.registrations set status = 'withdrawn'
   where tournament_id = p_tournament and user_id = auth.uid();
  if was = 'registered' then
    update public.registrations set status = 'registered'
     where id = (select id from public.registrations
                  where tournament_id = p_tournament and status = 'waitlist'
                  order by created_at limit 1);
  end if;
end;
$$;

-- The client parses the pasted text (src/play/lib/listParser.ts) and sends the result with it.
-- The database only enforces ownership and the deadline.
create or replace function public.submit_army_list(
  p_tournament uuid, p_raw_text text, p_faction text, p_points int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  reg uuid;
  deadline timestamptz;
  list_id uuid;
begin
  select r.id, t.list_deadline into reg, deadline
    from public.registrations r join public.tournaments t on t.id = r.tournament_id
   where r.tournament_id = p_tournament and r.user_id = auth.uid() and r.status in ('registered', 'waitlist');
  if reg is null then
    raise exception 'not_registered';
  end if;
  if now() > deadline then
    raise exception 'list_locked';
  end if;
  insert into public.army_lists (registration_id, raw_text, parsed_faction, parsed_points)
  values (reg, p_raw_text, left(p_faction, 80), p_points)
  on conflict (registration_id) do update
    set raw_text = excluded.raw_text, parsed_faction = excluded.parsed_faction,
        parsed_points = excluded.parsed_points, status = 'submitted',
        organiser_comment = null, submitted_at = now()
  returning id into list_id;
  return list_id;
end;
$$;

create or replace function public.review_army_list(p_list uuid, p_status public.list_status, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  tid uuid;
begin
  select r.tournament_id into tid
    from public.army_lists l join public.registrations r on r.id = l.registration_id
   where l.id = p_list;
  if tid is null or not public.is_organiser(tid) then
    raise exception 'forbidden';
  end if;
  update public.army_lists set status = p_status, organiser_comment = p_comment where id = p_list;
end;
$$;

-- Write functions: signed-in users only. Search stays public.
revoke execute on function public.register_for_tournament(uuid) from public, anon;
revoke execute on function public.withdraw_from_tournament(uuid) from public, anon;
revoke execute on function public.submit_army_list(uuid, text, text, int) from public, anon;
revoke execute on function public.review_army_list(uuid, public.list_status, text) from public, anon;
grant execute on function public.register_for_tournament(uuid) to authenticated;
grant execute on function public.withdraw_from_tournament(uuid) to authenticated;
grant execute on function public.submit_army_list(uuid, text, text, int) to authenticated;
grant execute on function public.review_army_list(uuid, public.list_status, text) to authenticated;
