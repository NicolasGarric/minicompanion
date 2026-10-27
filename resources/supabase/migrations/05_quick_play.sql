-- =============================================================================================
-- Quick play: casual games a signed-in player hosts (game, format, date, place) and others ask
-- to join. The game and the format are free text typed by players: no official list is shipped.
-- The exact address is private: only the host and the accepted players can read it.
-- =============================================================================================

create type public.game_level  as enum ('beginner', 'casual', 'competitive');
create type public.game_status as enum ('open', 'full', 'cancelled');
create type public.join_status as enum ('pending', 'accepted', 'declined', 'withdrawn');

create table public.games (
  id               uuid primary key default gen_random_uuid(),
  host_id          uuid not null references public.profiles (id) on delete cascade,
  game_system      text not null check (char_length(btrim(game_system)) between 2 and 60),
  format           text check (char_length(format) <= 60),
  points           int check (points between 1 and 100000),
  starts_at        timestamptz not null,
  duration_minutes int not null default 120 check (duration_minutes between 15 and 1440),
  max_players      int not null default 2 check (max_players between 2 and 8),
  -- Accepted players including the host; maintained by the functions below only.
  players_count    int not null default 1,
  level            public.game_level not null default 'casual',
  language         public.event_language not null default 'ja',
  country          text not null check (country ~ '^[A-Z]{2}$'),
  city             text not null check (char_length(btrim(city)) between 1 and 80),
  -- Public hint of the place (district, station, "at the store")
  area             text check (char_length(area) <= 80),
  store_id         uuid references public.stores (id) on delete set null,
  note             text check (char_length(note) <= 500),
  status           public.game_status not null default 'open',
  created_at       timestamptz not null default now(),
  check (players_count between 1 and max_players)
);

create index games_upcoming_idx on public.games (status, starts_at);
create index games_place_idx on public.games (country, city);
create index games_host_idx on public.games (host_id);
create index games_system_idx on public.games (lower(game_system));

-- Exact address, apart so that RLS can hide it from everyone but the table.
create table public.game_private (
  game_id uuid primary key references public.games (id) on delete cascade,
  address text not null check (char_length(btrim(address)) between 3 and 200)
);

create table public.game_players (
  game_id    uuid not null references public.games (id) on delete cascade,
  player_id  uuid not null references public.profiles (id) on delete cascade,
  status     public.join_status not null default 'pending',
  message    text check (char_length(message) <= 300),
  created_at timestamptz not null default now(),
  primary key (game_id, player_id)
);

create index game_players_player_idx on public.game_players (player_id, status);

create or replace function public.is_game_host(p_game uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.games where id = p_game and host_id = auth.uid());
$$;

create or replace function public.is_game_player(p_game uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.game_players
                  where game_id = p_game and player_id = auth.uid() and status = 'accepted');
$$;

-- ---------------------------------------------------------------------------------------------
-- Row Level Security: everyone can browse games; every write goes through the functions below.
-- ---------------------------------------------------------------------------------------------
alter table public.games        enable row level security;
alter table public.game_private enable row level security;
alter table public.game_players enable row level security;

revoke insert, update, delete on public.games, public.game_private, public.game_players from anon, authenticated;

create policy "games are public" on public.games
  for select using (true);
create policy "address for the host and accepted players" on public.game_private
  for select using (public.is_game_host(game_id) or public.is_game_player(game_id));
create policy "players see accepted players, their requests, hosts see all" on public.game_players
  for select using (status = 'accepted' or player_id = auth.uid() or public.is_game_host(game_id));

-- ---------------------------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------------------------
create or replace function public.create_game(
  p_game_system text, p_format text, p_points int, p_starts_at timestamptz, p_duration_minutes int,
  p_max_players int, p_level public.game_level, p_language public.event_language,
  p_country text, p_city text, p_area text, p_address text, p_store uuid default null, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_starts_at < now() then
    raise exception 'starts_in_past';
  end if;
  -- Anti-spam: at most 20 upcoming games hosted at once.
  if (select count(*) from public.games
       where host_id = auth.uid() and status <> 'cancelled' and starts_at > now()) >= 20 then
    raise exception 'too_many_games';
  end if;
  insert into public.games (host_id, game_system, format, points, starts_at, duration_minutes, max_players,
                            level, language, country, city, area, store_id, note)
  values (auth.uid(), btrim(p_game_system), nullif(btrim(p_format), ''), p_points, p_starts_at,
          coalesce(p_duration_minutes, 120), coalesce(p_max_players, 2), coalesce(p_level, 'casual'),
          coalesce(p_language, 'ja'), upper(p_country), btrim(p_city), nullif(btrim(p_area), ''), p_store,
          nullif(btrim(p_note), ''))
  returning id into new_id;
  insert into public.game_private (game_id, address) values (new_id, btrim(p_address));
  return new_id;
end;
$$;

-- Asks to join; a declined player cannot ask again.
create or replace function public.request_join_game(p_game uuid, p_message text default null)
returns public.join_status
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select * into g from public.games where id = p_game;
  if not found or g.status <> 'open' or g.starts_at < now() then
    raise exception 'not_open';
  end if;
  if g.host_id = auth.uid() then
    raise exception 'is_host';
  end if;
  insert into public.game_players (game_id, player_id, status, message)
  values (p_game, auth.uid(), 'pending', nullif(btrim(p_message), ''))
  on conflict (game_id, player_id)
    do update set status = 'pending', message = excluded.message, created_at = now()
    where public.game_players.status = 'withdrawn';
  return (select status from public.game_players where game_id = p_game and player_id = auth.uid());
end;
$$;

-- The host accepts or declines a pending request.
create or replace function public.respond_join_game(p_game uuid, p_player uuid, p_accept boolean)
returns public.join_status
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games;
  next_status public.join_status;
begin
  select * into g from public.games where id = p_game for update;
  if not found or g.host_id is distinct from auth.uid() then
    raise exception 'not_host';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game and player_id = p_player and status = 'pending') then
    raise exception 'no_request';
  end if;
  if p_accept and g.players_count >= g.max_players then
    raise exception 'game_full';
  end if;
  next_status := case when p_accept then 'accepted' else 'declined' end;
  update public.game_players set status = next_status where game_id = p_game and player_id = p_player;
  if p_accept then
    update public.games
       set players_count = players_count + 1,
           status = case when players_count + 1 >= max_players then 'full' else status end
     where id = p_game;
  end if;
  return next_status;
end;
$$;

-- A player withdraws (pending or accepted); a full game opens again.
create or replace function public.leave_game(p_game uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  was public.join_status;
begin
  select status into was from public.game_players where game_id = p_game and player_id = auth.uid() for update;
  if was is null or was not in ('pending', 'accepted') then
    return;
  end if;
  update public.game_players set status = 'withdrawn' where game_id = p_game and player_id = auth.uid();
  if was = 'accepted' then
    update public.games
       set players_count = players_count - 1,
           status = case when status = 'full' then 'open' else status end
     where id = p_game;
  end if;
end;
$$;

create or replace function public.cancel_game(p_game uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.games set status = 'cancelled' where id = p_game and host_id = auth.uid();
  if not found then
    raise exception 'not_host';
  end if;
end;
$$;

-- What players type most, to suggest it in the form (the app ships no list of its own).
create or replace function public.popular_game_texts(p_game text default null)
returns table (game_system text, format text, games bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select min(game_system), min(format), count(*)
    from public.games
   where status <> 'cancelled'
     and (p_game is null or lower(game_system) = lower(btrim(p_game)))
   group by lower(game_system), case when p_game is null then '' else lower(coalesce(format, '')) end
   order by count(*) desc
   limit 30;
$$;

revoke execute on function public.create_game(text, text, int, timestamptz, int, int, public.game_level, public.event_language, text, text, text, text, uuid, text) from public, anon;
revoke execute on function public.request_join_game(uuid, text) from public, anon;
revoke execute on function public.respond_join_game(uuid, uuid, boolean) from public, anon;
revoke execute on function public.leave_game(uuid) from public, anon;
revoke execute on function public.cancel_game(uuid) from public, anon;
grant execute on function public.create_game(text, text, int, timestamptz, int, int, public.game_level, public.event_language, text, text, text, text, uuid, text) to authenticated;
grant execute on function public.request_join_game(uuid, text) to authenticated;
grant execute on function public.respond_join_game(uuid, uuid, boolean) to authenticated;
grant execute on function public.leave_game(uuid) to authenticated;
grant execute on function public.cancel_game(uuid) to authenticated;
grant execute on function public.popular_game_texts(text) to anon, authenticated;
