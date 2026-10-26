-- =============================================================================================
-- Hobby & community (owner choices of 2026-10-26):
--   1. Seasonal painting challenges: one theme + palette a month, entries with a photo, likes.
--   2. Tournament predictions: spectators pick the winner of each table (points only, no money).
--   3. Mentoring: experienced players offer to guide a beginner through four shared steps.
--   4. Living campaign map for leagues: each confirmed league win conquers a territory.
--   5. Swap board: "I offer / I look for" posts, contact by message, meet in a store; reports
--      hide a post automatically, admins can hide or restore it.
--   6. my_hobby_stats(): counters for levels and the year in review.
-- Writes with rules go through SECURITY DEFINER functions; tables only expose what is needed.
-- =============================================================================================

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'join_request', 'join_answer', 'game_match', 'report_to_confirm', 'report_answer', 'message',
  'game_message', 'league_game', 'round_paired', 'match_to_confirm', 'match_answer', 'contest_results',
  'round_schedule', 'mentor_request', 'mentor_answer'));

-- ---------------------------------------------------------------------------------------------
-- 1. Seasonal challenges
-- ---------------------------------------------------------------------------------------------
create table public.season_challenges (
  id        uuid primary key default gen_random_uuid(),
  -- Translation key suffix of the theme and constraint (texts live in the app, in every language)
  theme_key text not null unique check (theme_key ~ '^[a-z0-9_]{2,40}$'),
  palette   text[] not null check (array_length(palette, 1) between 2 and 5),
  starts_on date not null,
  ends_on   date not null,
  check (ends_on >= starts_on)
);
create index season_challenges_dates_idx on public.season_challenges (starts_on);

create table public.challenge_entries (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.season_challenges (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  title        text not null check (char_length(btrim(title)) between 1 and 80),
  -- "<challenge id>/<file>.jpg" in the public "challenges" bucket
  photo_path   text not null,
  is_hidden    boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (challenge_id, user_id)
);
create table public.challenge_likes (
  entry_id   uuid not null references public.challenge_entries (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, user_id)
);

alter table public.season_challenges enable row level security;
alter table public.challenge_entries enable row level security;
alter table public.challenge_likes   enable row level security;
revoke insert, update, delete, truncate on public.season_challenges, public.challenge_entries, public.challenge_likes from anon, authenticated;
create policy "challenges are public" on public.season_challenges for select using (true);
-- Entries and likes are read through challenge_entries_of()

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('challenges', 'challenges', true, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;
create policy "challenge photos: players upload while open" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'challenges'
              and exists (select 1 from public.season_challenges c
                           where c.id::text = (storage.foldername(name))[1] and current_date between c.starts_on and c.ends_on));
create policy "challenge photos: uploaders delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'challenges' and owner = auth.uid());

-- Twelve months of themes, from October 2026. Palettes are plain colours, no brand.
insert into public.season_challenges (theme_key, palette, starts_on, ends_on) values
  ('lanterns',  array['#2b1a3a', '#ff7a1a', '#ffd23f', '#3b5f4a'], '2026-10-01', '2026-10-31'),
  ('rust',      array['#8a4b2a', '#c8693a', '#5e6b6e', '#e0c080'], '2026-11-01', '2026-11-30'),
  ('frost',     array['#9fc3d9', '#e6eef2', '#3d6b8f', '#c0c0c0'], '2026-12-01', '2026-12-31'),
  ('snow',      array['#dfe8f0', '#2b2b2b', '#a32a2a', '#8a9aa6'], '2027-01-01', '2027-01-31'),
  ('crimson',   array['#c8283f', '#1d1d1d', '#d9b77a', '#f2efe6'], '2027-02-01', '2027-02-28'),
  ('undergrowth', array['#3b5f4a', '#6b4e2e', '#a8b56a', '#2b2b2b'], '2027-03-01', '2027-03-31'),
  ('sakura',    array['#f7b6c8', '#6b3a2e', '#fffaf0', '#3d4f7a'], '2027-04-01', '2027-04-30'),
  ('bronze',    array['#a47552', '#2f6b5a', '#e0c080', '#3a2a20'], '2027-05-01', '2027-05-31'),
  ('rainy',     array['#6c8ea6', '#5b2a6e', '#9fb37a', '#2b3440'], '2027-06-01', '2027-06-30'),
  ('desert',    array['#d9b77a', '#a0522d', '#3d6b8f', '#f2e6c9'], '2027-07-01', '2027-07-31'),
  ('neon',      array['#ff4f7b', '#2de2e6', '#1d1d3a', '#ffd23f'], '2027-08-01', '2027-08-31'),
  ('moon',      array['#e6e2d3', '#1d2a5b', '#8a8fb0', '#c9b25a'], '2027-09-01', '2027-09-30');

-- Entries of a challenge with their likes; hidden entries only for their author and admins.
create or replace function public.challenge_entries_of(p_challenge uuid)
returns table (id uuid, title text, photo_path text, author_name text, author_handle text,
               likes bigint, liked boolean, is_mine boolean, is_hidden boolean, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.title, e.photo_path, p.display_name, p.handle,
         (select count(*) from public.challenge_likes l where l.entry_id = e.id),
         exists (select 1 from public.challenge_likes l where l.entry_id = e.id and l.user_id = auth.uid()),
         e.user_id = auth.uid(), e.is_hidden, e.created_at
    from public.challenge_entries e
    join public.profiles p on p.id = e.user_id
   where e.challenge_id = p_challenge
     and (not e.is_hidden or e.user_id = auth.uid() or public.is_admin())
   order by (select count(*) from public.challenge_likes l where l.entry_id = e.id) desc, e.created_at desc;
$$;

create or replace function public.submit_challenge_entry(p_challenge uuid, p_title text, p_photo text, p_rights boolean)
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
  if not exists (select 1 from public.season_challenges where id = p_challenge and current_date between starts_on and ends_on) then
    raise exception 'challenge_closed';
  end if;
  if split_part(p_photo, '/', 1) <> p_challenge::text then
    raise exception 'bad_photos';
  end if;
  insert into public.challenge_entries (challenge_id, user_id, title, photo_path)
  values (p_challenge, auth.uid(), btrim(p_title), p_photo)
  on conflict (challenge_id, user_id) do update set title = excluded.title, photo_path = excluded.photo_path
  returning id into entry;
  return entry;
end;
$$;

create or replace function public.withdraw_challenge_entry(p_challenge uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.challenge_entries where challenge_id = p_challenge and user_id = auth.uid();
$$;

-- Like / unlike, while the challenge is open; not your own entry. Returns the new state.
create or replace function public.toggle_challenge_like(p_entry uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.challenge_entries;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select * into e from public.challenge_entries where id = p_entry and not is_hidden;
  if not found then
    raise exception 'no_entry';
  end if;
  if e.user_id = auth.uid() then
    raise exception 'own_entry';
  end if;
  if not exists (select 1 from public.season_challenges where id = e.challenge_id and current_date between starts_on and ends_on) then
    raise exception 'challenge_closed';
  end if;
  delete from public.challenge_likes where entry_id = p_entry and user_id = auth.uid();
  if found then
    return false;
  end if;
  insert into public.challenge_likes (entry_id, user_id) values (p_entry, auth.uid());
  return true;
end;
$$;

create or replace function public.admin_hide_challenge_entry(p_entry uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  update public.challenge_entries set is_hidden = p_hidden where id = p_entry;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Tournament predictions
-- ---------------------------------------------------------------------------------------------
create table public.match_predictions (
  match_id   uuid not null references public.matches (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  pick_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);
create index match_predictions_user_idx on public.match_predictions (user_id);
alter table public.match_predictions enable row level security;
revoke insert, update, delete, truncate on public.match_predictions from anon, authenticated;
-- Read through tournament_predictions() and prediction_leaderboard()

-- Pick the winner of a table before its score is reported; not on your own table.
create or replace function public.predict_match(p_match uuid, p_pick uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.matches;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select * into m from public.matches where id = p_match;
  if not found or not public.tournament_visible(m.tournament_id) then
    raise exception 'no_match';
  end if;
  if m.player_b_id is null or p_pick not in (m.player_a_id, m.player_b_id) then
    raise exception 'bad_pick';
  end if;
  if auth.uid() in (m.player_a_id, m.player_b_id) then
    raise exception 'own_match';
  end if;
  if m.status <> 'scheduled' then
    raise exception 'prediction_closed';
  end if;
  insert into public.match_predictions (match_id, user_id, pick_id) values (p_match, auth.uid(), p_pick)
  on conflict (match_id, user_id) do update set pick_id = excluded.pick_id, created_at = now();
end;
$$;

-- Per match of the tournament: how many picked each side, and my pick.
create or replace function public.tournament_predictions(p_tournament uuid)
returns table (match_id uuid, for_a bigint, for_b bigint, my_pick uuid)
language sql
stable
security definer
set search_path = public
as $$
  select m.id,
         count(*) filter (where pr.pick_id = m.player_a_id),
         count(*) filter (where pr.pick_id = m.player_b_id),
         (select pick_id from public.match_predictions x where x.match_id = m.id and x.user_id = auth.uid())
    from public.matches m
    left join public.match_predictions pr on pr.match_id = m.id
   where m.tournament_id = p_tournament and public.tournament_visible(p_tournament) and m.player_b_id is not null
   group by m.id;
$$;

-- Best forecasters: correct picks on matches with a final result.
create or replace function public.prediction_leaderboard(p_tournament uuid)
returns table (user_id uuid, display_name text, handle text, correct bigint, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.handle,
         count(*) filter (where (m.result = 'a_win' and pr.pick_id = m.player_a_id) or (m.result = 'b_win' and pr.pick_id = m.player_b_id)),
         count(*)
    from public.match_predictions pr
    join public.matches m on m.id = pr.match_id
    join public.profiles p on p.id = pr.user_id
   where m.tournament_id = p_tournament and public.tournament_visible(p_tournament)
     and m.status in ('confirmed', 'resolved') and m.result is not null
   group by p.id, p.display_name, p.handle
   order by 4 desc, 5 asc, 2
   limit 20;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Mentoring
-- ---------------------------------------------------------------------------------------------
create table public.mentor_profiles (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  games        text not null check (char_length(btrim(games)) between 2 and 120),
  availability text not null check (char_length(btrim(availability)) between 2 and 120),
  area         text not null check (char_length(btrim(area)) between 2 and 80),
  active       boolean not null default true,
  updated_at   timestamptz not null default now()
);
alter table public.mentor_profiles enable row level security;
revoke insert, update, delete, truncate on public.mentor_profiles from anon, authenticated;
grant insert (user_id, games, availability, area, active), update (games, availability, area, active, updated_at)
  on public.mentor_profiles to authenticated;
grant delete on public.mentor_profiles to authenticated;
create policy "active mentors are public" on public.mentor_profiles for select using (active or user_id = auth.uid());
create policy "players manage their mentor profile" on public.mentor_profiles
  for insert with check (user_id = auth.uid());
create policy "players edit their mentor profile" on public.mentor_profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "players remove their mentor profile" on public.mentor_profiles
  for delete using (user_id = auth.uid());

create type public.mentorship_status as enum ('requested', 'active', 'declined', 'ended');
create table public.mentorships (
  id                  uuid primary key default gen_random_uuid(),
  mentor_id           uuid not null references public.profiles (id) on delete cascade,
  mentee_id           uuid not null references public.profiles (id) on delete cascade,
  status              public.mentorship_status not null default 'requested',
  message             text check (char_length(message) <= 500),
  met_at              timestamptz,
  first_paint_at      timestamptz,
  first_game_at       timestamptz,
  first_tournament_at timestamptz,
  created_at          timestamptz not null default now(),
  check (mentor_id <> mentee_id)
);
-- One open request or active mentorship per pair
create unique index mentorships_open_pair_idx on public.mentorships (mentor_id, mentee_id) where status in ('requested', 'active');
create index mentorships_mentee_idx on public.mentorships (mentee_id);
alter table public.mentorships enable row level security;
revoke insert, update, delete, truncate on public.mentorships from anon, authenticated;
create policy "both sides read their mentorships" on public.mentorships
  for select using (auth.uid() in (mentor_id, mentee_id));

-- Mentors list with how many beginners they guided (ended or active).
create or replace function public.mentors_list()
returns table (user_id uuid, display_name text, handle text, games text, availability text, area text, mentees bigint)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, p.display_name, p.handle, m.games, m.availability, m.area,
         (select count(*) from public.mentorships s where s.mentor_id = m.user_id and s.status in ('active', 'ended'))
    from public.mentor_profiles m
    join public.profiles p on p.id = m.user_id
   where m.active
   order by 7 desc, m.updated_at desc
   limit 100;
$$;

create or replace function public.request_mentor(p_mentor uuid, p_message text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ms uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_mentor = auth.uid() then
    raise exception 'own_mentor';
  end if;
  if not exists (select 1 from public.mentor_profiles where user_id = p_mentor and active) then
    raise exception 'no_mentor';
  end if;
  -- A beginner follows one mentor at a time
  if exists (select 1 from public.mentorships where mentee_id = auth.uid() and status in ('requested', 'active')) then
    raise exception 'already_mentored';
  end if;
  insert into public.mentorships (mentor_id, mentee_id, message) values (p_mentor, auth.uid(), nullif(btrim(p_message), ''))
  returning id into ms;
  perform public.notify(p_mentor, 'mentor_request',
    jsonb_build_object('mentorship_id', ms, 'from', (select display_name from public.profiles where id = auth.uid())));
  return ms;
end;
$$;

create or replace function public.answer_mentorship(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.mentorships;
begin
  select * into s from public.mentorships where id = p_id;
  if not found or s.mentor_id <> auth.uid() or s.status <> 'requested' then
    raise exception 'forbidden';
  end if;
  update public.mentorships set status = case when p_accept then 'active' else 'declined' end::public.mentorship_status where id = p_id;
  perform public.notify(s.mentee_id, 'mentor_answer',
    jsonb_build_object('mentorship_id', p_id, 'status', case when p_accept then 'accepted' else 'declined' end,
                       'from', (select display_name from public.profiles where id = auth.uid())));
end;
$$;

-- Either side ticks a step of the path (met, first_paint, first_game, first_tournament) or unticks it.
create or replace function public.mark_mentorship_step(p_id uuid, p_step text, p_done boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.mentorships;
  stamp timestamptz := case when p_done then now() end;
begin
  select * into s from public.mentorships where id = p_id;
  if not found or auth.uid() not in (s.mentor_id, s.mentee_id) or s.status <> 'active' then
    raise exception 'forbidden';
  end if;
  case p_step
    when 'met' then update public.mentorships set met_at = stamp where id = p_id;
    when 'first_paint' then update public.mentorships set first_paint_at = stamp where id = p_id;
    when 'first_game' then update public.mentorships set first_game_at = stamp where id = p_id;
    when 'first_tournament' then update public.mentorships set first_tournament_at = stamp where id = p_id;
    else raise exception 'bad_step';
  end case;
end;
$$;

create or replace function public.end_mentorship(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.mentorships set status = 'ended'
   where id = p_id and auth.uid() in (mentor_id, mentee_id) and status in ('requested', 'active');
  if not found then
    raise exception 'forbidden';
  end if;
end;
$$;

-- My mentorships, both sides, with the other player's name.
create or replace function public.my_mentorships()
returns table (id uuid, role text, other_id uuid, other_name text, other_handle text, status public.mentorship_status,
               message text, met_at timestamptz, first_paint_at timestamptz, first_game_at timestamptz,
               first_tournament_at timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, case when s.mentor_id = auth.uid() then 'mentor' else 'mentee' end,
         o.id, o.display_name, o.handle, s.status, s.message, s.met_at, s.first_paint_at, s.first_game_at,
         s.first_tournament_at, s.created_at
    from public.mentorships s
    join public.profiles o on o.id = case when s.mentor_id = auth.uid() then s.mentee_id else s.mentor_id end
   where auth.uid() in (s.mentor_id, s.mentee_id)
   order by (s.status in ('requested', 'active')) desc, s.created_at desc;
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. Campaign map for leagues
-- ---------------------------------------------------------------------------------------------
create table public.league_campaigns (
  league_id   uuid primary key references public.leagues (id) on delete cascade,
  -- 'planet': regions of one world; 'system': planets and moons around a star
  map_kind    text not null check (map_kind in ('planet', 'system')),
  seed        int not null check (seed between 1 and 999999),
  territories int not null check (territories between 6 and 40),
  created_at  timestamptz not null default now()
);
create table public.campaign_territories (
  league_id uuid not null references public.league_campaigns (league_id) on delete cascade,
  idx       int not null check (idx >= 0),
  owner_id  uuid references public.profiles (id) on delete set null,
  primary key (league_id, idx)
);
create table public.campaign_events (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references public.league_campaigns (league_id) on delete cascade,
  player_id  uuid not null references public.profiles (id) on delete cascade,
  idx        int not null,
  taken_from uuid references public.profiles (id) on delete set null,
  by_organiser boolean not null default false,
  created_at timestamptz not null default now()
);
create index campaign_events_league_idx on public.campaign_events (league_id, created_at desc);
alter table public.league_campaigns     enable row level security;
alter table public.campaign_territories enable row level security;
alter table public.campaign_events      enable row level security;
revoke insert, update, delete, truncate on public.league_campaigns, public.campaign_territories, public.campaign_events from anon, authenticated;
create policy "campaigns are public" on public.league_campaigns for select using (true);
create policy "territories are public" on public.campaign_territories for select using (true);
create policy "campaign log is public" on public.campaign_events for select using (true);

create or replace function public.create_league_campaign(p_league uuid, p_kind text, p_territories int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.leagues where id = p_league and organiser_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  if exists (select 1 from public.league_campaigns where league_id = p_league) then
    raise exception 'campaign_exists';
  end if;
  insert into public.league_campaigns (league_id, map_kind, seed, territories)
  values (p_league, p_kind, 1 + floor(random() * 999998)::int, p_territories);
  insert into public.campaign_territories (league_id, idx) select p_league, g from generate_series(0, p_territories - 1) g;
end;
$$;

-- Conquests left: confirmed league wins minus territories already claimed.
create or replace function public.campaign_conquests_left(p_league uuid, p_player uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select greatest(0,
    (select count(*)::int from public.game_results r
       join public.game_reports gr on gr.game_id = r.game_id and gr.status = 'confirmed'
       join public.games g on g.id = r.game_id
      where g.league_id = p_league and r.player_id = p_player and r.placement = 1)
    - (select count(*)::int from public.campaign_events e where e.league_id = p_league and e.player_id = p_player and not e.by_organiser));
$$;

-- A league member spends one conquest on a territory (free, or held by someone else).
create or replace function public.claim_territory(p_league uuid, p_idx int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  prev uuid;
begin
  if not exists (select 1 from public.league_members where league_id = p_league and player_id = auth.uid()) then
    raise exception 'not_member';
  end if;
  if public.campaign_conquests_left(p_league, auth.uid()) < 1 then
    raise exception 'no_conquest';
  end if;
  select owner_id into prev from public.campaign_territories where league_id = p_league and idx = p_idx for update;
  if not found then
    raise exception 'no_territory';
  end if;
  if prev = auth.uid() then
    raise exception 'already_yours';
  end if;
  update public.campaign_territories set owner_id = auth.uid() where league_id = p_league and idx = p_idx;
  insert into public.campaign_events (league_id, player_id, idx, taken_from) values (p_league, auth.uid(), p_idx, prev);
end;
$$;

-- The organiser fixes the map by hand (null = free territory).
create or replace function public.organiser_set_territory(p_league uuid, p_idx int, p_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  prev uuid;
begin
  if not exists (select 1 from public.leagues where id = p_league and organiser_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  if p_owner is not null and not exists (select 1 from public.league_members where league_id = p_league and player_id = p_owner) then
    raise exception 'not_member';
  end if;
  select owner_id into prev from public.campaign_territories where league_id = p_league and idx = p_idx;
  if not found then
    raise exception 'no_territory';
  end if;
  update public.campaign_territories set owner_id = p_owner where league_id = p_league and idx = p_idx;
  if p_owner is not null then
    insert into public.campaign_events (league_id, player_id, idx, taken_from, by_organiser) values (p_league, p_owner, p_idx, prev, true);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. Swap board
-- ---------------------------------------------------------------------------------------------
create table public.swap_posts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('offer', 'want')),
  title      text not null check (char_length(btrim(title)) between 3 and 80),
  details    text check (char_length(details) <= 600),
  condition  text check (char_length(condition) <= 40),
  city       text not null check (char_length(btrim(city)) between 2 and 80),
  meet_place text check (char_length(meet_place) <= 80),
  -- "<user id>/<file>.jpg" in the public "swap" bucket
  photo_path text,
  status     text not null default 'open' check (status in ('open', 'closed')),
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now(),
  check (photo_path is null or split_part(photo_path, '/', 1) = user_id::text)
);
create index swap_posts_open_idx on public.swap_posts (status, created_at desc);
alter table public.swap_posts enable row level security;
revoke insert, update, delete, truncate on public.swap_posts from anon, authenticated;
grant insert (user_id, kind, title, details, condition, city, meet_place, photo_path) on public.swap_posts to authenticated;
grant update (title, details, condition, city, meet_place, photo_path, status) on public.swap_posts to authenticated;
grant delete on public.swap_posts to authenticated;
create policy "swap posts are public unless hidden" on public.swap_posts
  for select using ((not is_hidden and status = 'open') or user_id = auth.uid() or public.is_admin());
create policy "players post swaps" on public.swap_posts
  for insert with check (user_id = auth.uid()
    and (select count(*) from public.swap_posts where user_id = auth.uid() and status = 'open') < 20);
create policy "players edit their swaps" on public.swap_posts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "players delete their swaps" on public.swap_posts
  for delete using (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('swap', 'swap', true, 3145728, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;
create policy "swap photos: owners upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'swap' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "swap photos: owners delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'swap' and owner = auth.uid());

alter type public.report_target add value if not exists 'swap';
alter type public.report_target add value if not exists 'challenge';

-- Report a swap post; three distinct reporters hide it until an admin looks at it.
create or replace function public.report_swap(p_post uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from public.swap_posts where id = p_post) then
    raise exception 'no_post';
  end if;
  if exists (select 1 from public.reports where reporter_id = auth.uid() and target_type::text = 'swap' and target_id = p_post::text) then
    return;
  end if;
  insert into public.reports (reporter_id, target_type, target_id, reason)
  values (auth.uid(), 'swap', p_post::text, left(btrim(p_reason), 500));
  if (select count(distinct reporter_id) from public.reports where target_type::text = 'swap' and target_id = p_post::text and status = 'open') >= 3 then
    update public.swap_posts set is_hidden = true where id = p_post;
  end if;
end;
$$;

-- Report a challenge entry (same rule: three reports hide it).
create or replace function public.report_challenge_entry(p_entry uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if exists (select 1 from public.reports where reporter_id = auth.uid() and target_type::text = 'challenge' and target_id = p_entry::text) then
    return;
  end if;
  insert into public.reports (reporter_id, target_type, target_id, reason)
  values (auth.uid(), 'challenge', p_entry::text, left(btrim(p_reason), 500));
  if (select count(distinct reporter_id) from public.reports where target_type::text = 'challenge' and target_id = p_entry::text and status = 'open') >= 3 then
    update public.challenge_entries set is_hidden = true where id = p_entry;
  end if;
end;
$$;

create or replace function public.admin_hide_swap(p_post uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  update public.swap_posts set is_hidden = p_hidden where id = p_post;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. Counters for levels and the year in review (p_year null = all time)
-- ---------------------------------------------------------------------------------------------
create or replace function public.my_hobby_stats(p_year int default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as id),
  span as (select case when p_year is null then '-infinity'::timestamptz else make_timestamptz(p_year, 1, 1, 0, 0, 0) end as a,
                  case when p_year is null then 'infinity'::timestamptz else make_timestamptz(p_year + 1, 1, 1, 0, 0, 0) end as b)
  select jsonb_build_object(
    'games', (select count(*) from public.game_results r join public.game_reports gr on gr.game_id = r.game_id, span
               where r.player_id = (select id from me) and gr.created_at >= span.a and gr.created_at < span.b),
    'wins', (select count(*) from public.game_results r join public.game_reports gr on gr.game_id = r.game_id, span
              where r.player_id = (select id from me) and r.placement = 1 and gr.created_at >= span.a and gr.created_at < span.b),
    'opponents', (select count(distinct o.player_id) from public.game_results r
                    join public.game_results o on o.game_id = r.game_id and o.player_id <> r.player_id
                    join public.game_reports gr on gr.game_id = r.game_id, span
                   where r.player_id = (select id from me) and gr.created_at >= span.a and gr.created_at < span.b),
    'tournaments', (select count(*) from public.registrations g join public.tournaments t on t.id = g.tournament_id, span
                     where g.user_id = (select id from me) and g.status <> 'withdrawn' and t.starts_at >= span.a and t.starts_at < span.b),
    'tournament_matches', (select count(*) from public.matches m, span
                            where (select id from me) in (m.player_a_id, m.player_b_id) and m.status in ('confirmed', 'resolved')
                              and m.updated_at >= span.a and m.updated_at < span.b),
    'stores', (select count(distinct coalesce(g.store_id::text, lower(btrim(g.city)))) from public.game_results r
                 join public.games g on g.id = r.game_id, span
                where r.player_id = (select id from me) and g.starts_at >= span.a and g.starts_at < span.b),
    'contest_entries', (select count(*) from public.contest_entries e, span
                         where e.user_id = (select id from me) and e.created_at >= span.a and e.created_at < span.b),
    'challenge_entries', (select count(*) from public.challenge_entries e, span
                           where e.user_id = (select id from me) and e.created_at >= span.a and e.created_at < span.b),
    'mentees', (select count(*) from public.mentorships s where s.mentor_id = (select id from me) and s.status in ('active', 'ended')),
    'predictions_right', (select count(*) from public.match_predictions pr join public.matches m on m.id = pr.match_id, span
                           where pr.user_id = (select id from me) and pr.created_at >= span.a and pr.created_at < span.b
                             and ((m.result = 'a_win' and pr.pick_id = m.player_a_id) or (m.result = 'b_win' and pr.pick_id = m.player_b_id))),
    'swaps', (select count(*) from public.swap_posts s, span where s.user_id = (select id from me) and s.created_at >= span.a and s.created_at < span.b)
  )
  where auth.uid() is not null;
$$;

revoke execute on function
  public.challenge_entries_of(uuid), public.submit_challenge_entry(uuid, text, text, boolean), public.withdraw_challenge_entry(uuid),
  public.toggle_challenge_like(uuid), public.admin_hide_challenge_entry(uuid, boolean),
  public.predict_match(uuid, uuid), public.tournament_predictions(uuid), public.prediction_leaderboard(uuid),
  public.mentors_list(), public.request_mentor(uuid, text), public.answer_mentorship(uuid, boolean),
  public.mark_mentorship_step(uuid, text, boolean), public.end_mentorship(uuid), public.my_mentorships(),
  public.create_league_campaign(uuid, text, int), public.campaign_conquests_left(uuid, uuid), public.claim_territory(uuid, int),
  public.organiser_set_territory(uuid, int, uuid), public.report_swap(uuid, text), public.report_challenge_entry(uuid, text),
  public.admin_hide_swap(uuid, boolean), public.my_hobby_stats(int)
  from public, anon;
-- Read-only views of public data stay open to visitors
grant execute on function public.challenge_entries_of(uuid), public.tournament_predictions(uuid), public.prediction_leaderboard(uuid),
  public.mentors_list(), public.campaign_conquests_left(uuid, uuid) to anon;
grant execute on function
  public.challenge_entries_of(uuid), public.submit_challenge_entry(uuid, text, text, boolean), public.withdraw_challenge_entry(uuid),
  public.toggle_challenge_like(uuid), public.admin_hide_challenge_entry(uuid, boolean),
  public.predict_match(uuid, uuid), public.tournament_predictions(uuid), public.prediction_leaderboard(uuid),
  public.mentors_list(), public.request_mentor(uuid, text), public.answer_mentorship(uuid, boolean),
  public.mark_mentorship_step(uuid, text, boolean), public.end_mentorship(uuid), public.my_mentorships(),
  public.create_league_campaign(uuid, text, int), public.campaign_conquests_left(uuid, uuid), public.claim_territory(uuid, int),
  public.organiser_set_territory(uuid, int, uuid), public.report_swap(uuid, text), public.report_challenge_entry(uuid, text),
  public.admin_hide_swap(uuid, boolean), public.my_hobby_stats(int)
  to authenticated;
