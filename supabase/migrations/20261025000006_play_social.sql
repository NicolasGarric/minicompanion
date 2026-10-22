-- =============================================================================================
-- PLAY, social layer (docs/PLAY_PLAN.md §6, phases 2–5):
--   * public / private player profiles, public gallery items
--   * battle reports confirmed by the players, photos, painted armies, friendly rating per game
--   * "looking for a game" posts, in-app notifications, direct and game messages
--   * store leagues, store regular nights
-- Writes with business rules go through SECURITY DEFINER functions; simple owner edits use RLS.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Profile privacy (private by default) and public gallery items
-- ---------------------------------------------------------------------------------------------
alter table public.profiles add column is_public boolean not null default false;
grant update (is_public) on public.profiles to authenticated;

alter table public.gallery_items add column is_public boolean not null default false;
grant update (is_public) on public.gallery_items to authenticated;

create policy "public gallery items are readable" on public.gallery_items
  for select using (is_public);
create policy "gallery files: public items are readable" on storage.objects
  for select
  using (bucket_id = 'gallery'
         and exists (select 1 from public.gallery_items g where g.image_path = name and g.is_public));

create or replace function public.profile_is_visible(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_user = auth.uid(), false) or coalesce((select is_public from public.profiles where id = p_user), false);
$$;

-- Host or accepted player of a game.
create or replace function public.is_game_participant(p_game uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.games where id = p_game and host_id = p_user)
      or exists (select 1 from public.game_players where game_id = p_game and player_id = p_user and status = 'accepted');
$$;

-- ---------------------------------------------------------------------------------------------
-- Notifications (in-app only)
-- ---------------------------------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('join_request', 'join_answer', 'game_match', 'report_to_confirm',
                                            'report_answer', 'message', 'game_message', 'league_game')),
  payload    jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
revoke insert, update, delete on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;
create policy "users read their notifications" on public.notifications
  for select using (user_id = auth.uid());
create policy "users mark their notifications read" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users clear their notifications" on public.notifications
  for delete using (user_id = auth.uid());

create or replace function public.notify(p_user uuid, p_kind text, p_payload jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, kind, payload) select p_user, p_kind, p_payload where p_user is not null;
$$;
revoke execute on function public.notify(uuid, text, jsonb) from public, anon, authenticated;

-- Join requests and answers
create or replace function public.game_players_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games;
  who text;
begin
  if tg_op = 'UPDATE' and new.status = old.status then
    return new;
  end if;
  select * into g from public.games where id = new.game_id;
  select display_name into who from public.profiles where id = new.player_id;
  if new.status = 'pending' then
    perform public.notify(g.host_id, 'join_request',
      jsonb_build_object('game_id', g.id, 'game', g.game_system, 'from', who, 'message', new.message));
  elsif new.status in ('accepted', 'declined') then
    perform public.notify(new.player_id, 'join_answer',
      jsonb_build_object('game_id', g.id, 'game', g.game_system, 'status', new.status));
  end if;
  return new;
end;
$$;
create trigger game_players_notify
  after insert or update of status on public.game_players
  for each row execute function public.game_players_notify();

-- ---------------------------------------------------------------------------------------------
-- Looking for a game (opponent finder)
-- ---------------------------------------------------------------------------------------------
create table public.lfg_posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles (id) on delete cascade,
  game_system text not null check (char_length(btrim(game_system)) between 2 and 60),
  format      text check (char_length(format) <= 60),
  level       public.game_level not null default 'casual',
  country     text not null check (country ~ '^[A-Z]{2}$'),
  city        text check (char_length(city) <= 80),
  area        text check (char_length(area) <= 80),
  from_date   date not null,
  to_date     date not null,
  note        text check (char_length(note) <= 500),
  is_open     boolean not null default true,
  created_at  timestamptz not null default now(),
  check (to_date >= from_date and to_date <= from_date + 60)
);
create index lfg_posts_open_idx on public.lfg_posts (is_open, to_date);
create index lfg_posts_match_idx on public.lfg_posts (lower(game_system), country);

alter table public.lfg_posts enable row level security;
revoke update on public.lfg_posts from anon, authenticated;
grant update (game_system, format, level, country, city, area, from_date, to_date, note, is_open) on public.lfg_posts to authenticated;
create policy "open posts are public" on public.lfg_posts
  for select using (is_open or author_id = auth.uid());
create policy "authors post" on public.lfg_posts
  for insert with check (author_id = auth.uid()
    and (select count(*) from public.lfg_posts where author_id = auth.uid() and is_open) < 10);
create policy "authors edit their posts" on public.lfg_posts
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "authors delete their posts" on public.lfg_posts
  for delete using (author_id = auth.uid());

-- A new game alerts the authors of matching open posts (same game, country, city if given, dates).
create or replace function public.games_notify_matches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, kind, payload)
  select distinct p.author_id, 'game_match',
         jsonb_build_object('game_id', new.id, 'game', new.game_system, 'city', new.city, 'starts_at', new.starts_at)
    from public.lfg_posts p
   where p.is_open
     and p.author_id <> new.host_id
     and lower(btrim(p.game_system)) = lower(btrim(new.game_system))
     and p.country = new.country
     and (p.city is null or btrim(p.city) = '' or lower(btrim(p.city)) = lower(btrim(new.city)))
     and (new.starts_at at time zone 'UTC')::date between p.from_date - 1 and p.to_date + 1;
  return new;
end;
$$;
create trigger games_notify_matches
  after insert on public.games
  for each row execute function public.games_notify_matches();

-- ---------------------------------------------------------------------------------------------
-- Messages: direct (between two players) and game chat (host + accepted players)
-- ---------------------------------------------------------------------------------------------
create table public.direct_messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  body         text not null check (char_length(btrim(body)) between 1 and 1000),
  -- What the conversation is about (optional)
  game_id      uuid references public.games (id) on delete set null,
  lfg_post_id  uuid references public.lfg_posts (id) on delete set null,
  read_at      timestamptz,
  created_at   timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index direct_messages_pair_idx on public.direct_messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at);
create index direct_messages_recipient_idx on public.direct_messages (recipient_id, read_at);

-- Anyone can be contacted when there is a reason: a public profile, an open post, or a shared game
-- (host, accepted or pending player). Otherwise only once the other person wrote first.
create or replace function public.can_message(p_to uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and p_to <> auth.uid() and (
       coalesce((select is_public from public.profiles where id = p_to), false)
    or exists (select 1 from public.lfg_posts where author_id = p_to and is_open)
    or exists (select 1 from public.direct_messages where sender_id = p_to and recipient_id = auth.uid())
    or exists (
         select 1 from public.games g
          where (g.host_id = p_to and (exists (select 1 from public.game_players gp where gp.game_id = g.id and gp.player_id = auth.uid() and gp.status in ('pending', 'accepted'))))
             or (g.host_id = auth.uid() and (exists (select 1 from public.game_players gp where gp.game_id = g.id and gp.player_id = p_to and gp.status in ('pending', 'accepted'))))
       )
  );
$$;

alter table public.direct_messages enable row level security;
revoke update on public.direct_messages from anon, authenticated;
grant update (read_at) on public.direct_messages to authenticated;
create policy "people in the conversation read it" on public.direct_messages
  for select using (sender_id = auth.uid() or recipient_id = auth.uid());
create policy "send when allowed" on public.direct_messages
  for insert with check (sender_id = auth.uid() and public.can_message(recipient_id));
create policy "recipients mark messages read" on public.direct_messages
  for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

create table public.game_messages (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references public.games (id) on delete cascade,
  sender_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index game_messages_game_idx on public.game_messages (game_id, created_at);

alter table public.game_messages enable row level security;
revoke update on public.game_messages from anon, authenticated;
create policy "participants read the game chat" on public.game_messages
  for select using (public.is_game_participant(game_id));
create policy "participants write in the game chat" on public.game_messages
  for insert with check (sender_id = auth.uid() and public.is_game_participant(game_id));

-- Anti-spam: 60 messages per hour per sender, all conversations together.
create or replace function public.messages_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.direct_messages where sender_id = new.sender_id and created_at > now() - interval '1 hour')
   + (select count(*) from public.game_messages where sender_id = new.sender_id and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger direct_messages_rate before insert on public.direct_messages for each row execute function public.messages_rate_limit();
create trigger game_messages_rate before insert on public.game_messages for each row execute function public.messages_rate_limit();

create or replace function public.messages_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  who text;
  g public.games;
begin
  select display_name into who from public.profiles where id = new.sender_id;
  if tg_table_name = 'direct_messages' then
    -- One unread "message" notification per sender is enough.
    if not exists (select 1 from public.notifications
                    where user_id = new.recipient_id and kind = 'message' and read_at is null
                      and payload ->> 'from_id' = new.sender_id::text) then
      perform public.notify(new.recipient_id, 'message', jsonb_build_object('from_id', new.sender_id, 'from', who));
    end if;
  else
    select * into g from public.games where id = new.game_id;
    insert into public.notifications (user_id, kind, payload)
    select u, 'game_message', jsonb_build_object('game_id', g.id, 'game', g.game_system, 'from', who)
      from (select g.host_id as u
            union select player_id from public.game_players where game_id = g.id and status = 'accepted') x
     where u <> new.sender_id
       and not exists (select 1 from public.notifications n
                        where n.user_id = x.u and n.kind = 'game_message' and n.read_at is null
                          and n.payload ->> 'game_id' = g.id::text);
  end if;
  return new;
end;
$$;
create trigger direct_messages_notify after insert on public.direct_messages for each row execute function public.messages_notify();
create trigger game_messages_notify after insert on public.game_messages for each row execute function public.messages_notify();

-- ---------------------------------------------------------------------------------------------
-- Leagues (a season of games at a store or in a group) and store regular nights
-- ---------------------------------------------------------------------------------------------
create table public.leagues (
  id           uuid primary key default gen_random_uuid(),
  organiser_id uuid not null references public.profiles (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 3 and 80),
  game_system  text not null check (char_length(btrim(game_system)) between 2 and 60),
  store_id     uuid references public.stores (id) on delete set null,
  city         text check (char_length(city) <= 80),
  starts_on    date not null,
  ends_on      date not null,
  description  text check (char_length(description) <= 1000),
  created_at   timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on <= starts_on + 366)
);
create table public.league_members (
  league_id uuid not null references public.leagues (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, player_id)
);
create index league_members_player_idx on public.league_members (player_id);

alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
revoke update on public.leagues from anon, authenticated;
grant update (name, description, ends_on) on public.leagues to authenticated;
create policy "leagues are public" on public.leagues for select using (true);
create policy "signed-in players create leagues" on public.leagues
  for insert with check (organiser_id = auth.uid()
    and (select count(*) from public.leagues where organiser_id = auth.uid() and ends_on >= current_date) < 5);
create policy "organisers edit their leagues" on public.leagues
  for update using (organiser_id = auth.uid()) with check (organiser_id = auth.uid());
create policy "league members are public" on public.league_members for select using (true);
create policy "players join leagues" on public.league_members
  for insert with check (player_id = auth.uid()
    and exists (select 1 from public.leagues where id = league_id and ends_on >= current_date));
create policy "players leave leagues" on public.league_members
  for delete using (player_id = auth.uid());

alter table public.games add column league_id uuid references public.leagues (id) on delete set null;
create index games_league_idx on public.games (league_id);

create table public.store_slots (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores (id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  starts_at  time not null,
  ends_at    time not null,
  tables     int check (tables between 1 and 100),
  note       text check (char_length(note) <= 200),
  check (ends_at > starts_at)
);
create index store_slots_store_idx on public.store_slots (store_id, weekday);
alter table public.store_slots enable row level security;
create policy "store nights are public" on public.store_slots for select using (true);
create policy "staff manage store nights" on public.store_slots
  for all using (public.is_store_staff(store_id) or public.is_admin())
  with check (public.is_store_staff(store_id) or public.is_admin());

-- create_game gains an optional league (members only, same game).
drop function public.create_game(text, text, int, timestamptz, int, int, public.game_level, public.event_language, text, text, text, text, uuid, text);
create or replace function public.create_game(
  p_game_system text, p_format text, p_points int, p_starts_at timestamptz, p_duration_minutes int,
  p_max_players int, p_level public.game_level, p_language public.event_language,
  p_country text, p_city text, p_area text, p_address text, p_store uuid default null, p_note text default null,
  p_league uuid default null
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
  if (select count(*) from public.games
       where host_id = auth.uid() and status <> 'cancelled' and starts_at > now()) >= 20 then
    raise exception 'too_many_games';
  end if;
  if p_league is not null and not exists (select 1 from public.league_members where league_id = p_league and player_id = auth.uid()) then
    raise exception 'not_league_member';
  end if;
  insert into public.games (host_id, game_system, format, points, starts_at, duration_minutes, max_players,
                            level, language, country, city, area, store_id, note, league_id)
  values (auth.uid(), btrim(p_game_system), nullif(btrim(p_format), ''), p_points, p_starts_at,
          coalesce(p_duration_minutes, 120), coalesce(p_max_players, 2), coalesce(p_level, 'casual'),
          coalesce(p_language, 'ja'), upper(p_country), btrim(p_city), nullif(btrim(p_area), ''), p_store,
          nullif(btrim(p_note), ''), p_league)
  returning id into new_id;
  insert into public.game_private (game_id, address) values (new_id, btrim(p_address));
  return new_id;
end;
$$;
revoke execute on function public.create_game(text, text, int, timestamptz, int, int, public.game_level, public.event_language, text, text, text, text, uuid, text, uuid) from public, anon;
grant execute on function public.create_game(text, text, int, timestamptz, int, int, public.game_level, public.event_language, text, text, text, text, uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Battle reports, results, photos, friendly rating
-- ---------------------------------------------------------------------------------------------
create type public.game_report_status as enum ('reported', 'confirmed', 'disputed');

create table public.game_reports (
  game_id      uuid primary key references public.games (id) on delete cascade,
  reported_by  uuid not null references public.profiles (id) on delete cascade,
  summary      text check (char_length(summary) <= 1000),
  -- Paths in the public "reports" bucket: "<game id>/<file>.jpg"
  photos       text[] not null default '{}' check (coalesce(array_length(photos, 1), 0) <= 4),
  status       public.game_report_status not null default 'reported',
  created_at   timestamptz not null default now(),
  confirmed_at timestamptz
);

create table public.game_results (
  game_id         uuid not null references public.game_reports (game_id) on delete cascade,
  player_id       uuid not null references public.profiles (id) on delete cascade,
  score           int check (score between -1000 and 100000),
  placement       int not null check (placement between 1 and 8),
  -- The painted army, from the player's gallery (made public when attached)
  gallery_item_id uuid references public.gallery_items (id) on delete set null,
  army            text check (char_length(army) <= 80),
  agreed          boolean, -- null = not answered yet; the reporter agrees by reporting
  primary key (game_id, player_id)
);
create index game_results_player_idx on public.game_results (player_id);

create table public.player_ratings (
  player_id uuid not null references public.profiles (id) on delete cascade,
  game_key  text not null, -- lower(trim(game_system))
  game_name text not null,
  rating    int not null default 1000,
  games     int not null default 0,
  wins      int not null default 0,
  draws     int not null default 0,
  losses    int not null default 0,
  primary key (player_id, game_key)
);

alter table public.game_reports   enable row level security;
alter table public.game_results   enable row level security;
alter table public.player_ratings enable row level security;
revoke insert, update, delete on public.game_reports, public.game_results, public.player_ratings from anon, authenticated;

-- Reports of public games are public (games are); ratings follow the profile privacy.
create policy "reports are public" on public.game_reports for select using (true);
create policy "results are public" on public.game_results for select using (true);
create policy "ratings of public profiles" on public.player_ratings
  for select using (public.profile_is_visible(player_id));

-- Report photos: public bucket, participants upload into the game folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', true, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;
create policy "report photos: participants upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'reports' and public.is_game_participant(((storage.foldername(name))[1])::uuid));
create policy "report photos: uploaders delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'reports' and owner = auth.uid());

-- Submits (or resubmits while not confirmed) the report of a game that has started.
-- p_results: [{ "player_id": uuid, "placement": int, "score": int|null, "gallery_item_id": uuid|null, "army": text|null }]
-- with exactly one entry per participant. Each player may only attach their own gallery item.
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
    -- Gallery items: only your own, and attaching makes it visible on the report.
    if item is not null then
      if (r ->> 'player_id')::uuid <> auth.uid() or not exists (select 1 from public.gallery_items where id = item and owner_id = auth.uid()) then
        item := null;
      else
        update public.gallery_items set is_public = true where id = item;
      end if;
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

-- Applies a confirmed report to the friendly ratings (Elo, pairwise for multiplayer games).
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
  select * into g from public.games where id = p_game;
  key := lower(btrim(g.game_system));
  select count(*), min(placement) into n, best from public.game_results where game_id = p_game;
  select count(*) into winners from public.game_results where game_id = p_game and placement = best;
  insert into public.player_ratings (player_id, game_key, game_name)
  select player_id, key, btrim(g.game_system) from public.game_results where game_id = p_game
  on conflict (player_id, game_key) do nothing;

  -- Every player against every other one: actual score (1 / 0.5 / 0) minus the expected score.
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

-- The other players confirm (or dispute) the report. Confirmed when everyone agreed.
create or replace function public.answer_game_report(p_game uuid, p_agree boolean)
returns public.game_report_status
language plpgsql
security definer
set search_path = public
as $$
declare
  rep public.game_reports;
  next_status public.game_report_status;
begin
  select * into rep from public.game_reports where game_id = p_game for update;
  if not found then
    raise exception 'no_report';
  end if;
  if rep.status = 'confirmed' then
    return rep.status;
  end if;
  update public.game_results set agreed = p_agree where game_id = p_game and player_id = auth.uid();
  if not found then
    raise exception 'not_participant';
  end if;
  next_status := case
    when exists (select 1 from public.game_results where game_id = p_game and agreed = false) then 'disputed'
    when not exists (select 1 from public.game_results where game_id = p_game and agreed is not true) then 'confirmed'
    else 'reported' end;
  update public.game_reports
     set status = next_status, confirmed_at = case when next_status = 'confirmed' then now() end
   where game_id = p_game;
  if next_status = 'confirmed' then
    perform public.apply_report_ratings(p_game);
  end if;
  perform public.notify(rep.reported_by, 'report_answer',
    jsonb_build_object('game_id', p_game, 'status', next_status));
  return next_status;
end;
$$;

-- Stats behind badges and the profile page; null for a private profile of someone else.
create or replace function public.player_stats(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.profile_is_visible(p_user) then null else jsonb_build_object(
    'played', (select count(*) from public.game_results r join public.game_reports rep using (game_id)
                where r.player_id = p_user and rep.status = 'confirmed'),
    'wins', (select coalesce(sum(wins), 0) from public.player_ratings where player_id = p_user),
    'hosted', (select count(*) from public.games where host_id = p_user and status <> 'cancelled' and starts_at < now()),
    'systems', (select count(*) from public.player_ratings where player_id = p_user and games > 0),
    'painted', (select count(*) from public.game_results r join public.game_reports rep using (game_id)
                 where r.player_id = p_user and rep.status = 'confirmed' and r.gallery_item_id is not null),
    'leagues', (select count(*) from public.league_members where player_id = p_user),
    'gallery', (select count(*) from public.gallery_items where owner_id = p_user and (is_public or p_user = auth.uid()))
  ) end;
$$;

-- League standings from confirmed reports of league games: win 3, draw 1, loss 0.
create or replace function public.league_standings(p_league uuid)
returns table (player_id uuid, display_name text, played bigint, wins bigint, draws bigint, losses bigint, points bigint)
language sql
stable
security definer
set search_path = public
as $$
  with res as (
    select r.player_id, r.placement,
           min(r.placement) over (partition by r.game_id) as best,
           count(*) over (partition by r.game_id, r.placement) as same
      from public.game_results r
      join public.game_reports rep on rep.game_id = r.game_id and rep.status = 'confirmed'
      join public.games g on g.id = r.game_id and g.league_id = p_league
  )
  select m.player_id, p.display_name,
         count(res.player_id),
         count(*) filter (where res.placement = res.best and res.same = 1),
         count(*) filter (where res.placement = res.best and res.same > 1),
         count(*) filter (where res.placement > res.best),
         3 * count(*) filter (where res.placement = res.best and res.same = 1)
           + count(*) filter (where res.placement = res.best and res.same > 1)
    from public.league_members m
    join public.profiles p on p.id = m.player_id
    left join res on res.player_id = m.player_id
   where m.league_id = p_league
   group by m.player_id, p.display_name
   order by 7 desc, 4 desc, 3 asc, 2;
$$;

revoke execute on function public.submit_game_report(uuid, jsonb, text, text[]) from public, anon;
revoke execute on function public.answer_game_report(uuid, boolean) from public, anon;
grant execute on function public.submit_game_report(uuid, jsonb, text, text[]) to authenticated;
grant execute on function public.answer_game_report(uuid, boolean) to authenticated;
grant execute on function public.player_stats(uuid) to anon, authenticated;
grant execute on function public.league_standings(uuid) to anon, authenticated;
grant execute on function public.can_message(uuid) to authenticated;
