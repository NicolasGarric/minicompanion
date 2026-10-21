-- =============================================================================================
-- Core: accounts, stores, published schemes, analytics events, moderation reports.
-- Shared by PAINT and PLAY. Every table has Row Level Security enabled (see the end of file).
-- =============================================================================================

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.app_lang as enum ('en', 'ja');

-- ---------------------------------------------------------------------------------------------
-- Profiles (1:1 with auth.users, created by trigger on sign-up)
-- ---------------------------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  handle         text not null unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name   text not null check (char_length(display_name) between 1 and 40),
  avatar_path    text,
  home_city      text,
  home_location  extensions.geography(Point, 4326),
  preferred_lang public.app_lang not null default 'en',
  -- Free text typed by the player. No official faction list is stored anywhere.
  factions       text[] not null default '{}' check (coalesce(array_length(factions, 1), 0) <= 10),
  is_admin       boolean not null default false,
  created_at     timestamptz not null default now()
);

create index profiles_home_location_idx on public.profiles using gist (home_location);

-- Users may edit their profile, but never grant themselves admin rights.
revoke update on public.profiles from anon, authenticated;
grant update (handle, display_name, avatar_path, home_city, home_location, preferred_lang, factions)
  on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base text := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9_]', '', 'g');
begin
  if char_length(base) < 3 then
    base := 'player';
  end if;
  insert into public.profiles (id, handle, display_name, preferred_lang)
  values (
    new.id,
    left(base, 18) || '_' || substr(replace(new.id::text, '-', ''), 1, 5),
    left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''),
                  nullif(new.raw_user_meta_data ->> 'full_name', ''),
                  split_part(new.email, '@', 1)), 40),
    case when new.raw_user_meta_data ->> 'preferred_lang' = 'ja' then 'ja' else 'en' end::public.app_lang
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------------------------
-- Stores (venues). Seed data uses fictional names.
-- ---------------------------------------------------------------------------------------------
create table public.stores (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 2 and 80),
  address    text not null,
  city       text not null,
  location   extensions.geography(Point, 4326) not null,
  website    text,
  created_at timestamptz not null default now()
);

create index stores_location_idx on public.stores using gist (location);
create index stores_city_idx on public.stores (city);

create table public.store_staff (
  store_id uuid not null references public.stores (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  role     text not null check (role in ('owner', 'staff')),
  primary key (store_id, user_id)
);

create index store_staff_user_idx on public.store_staff (user_id);

create or replace function public.is_store_staff(p_store uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.store_staff where store_id = p_store and user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------------------------
-- Schemes published from PAINT (same compact JSON as share links, never the photo)
-- ---------------------------------------------------------------------------------------------
create table public.schemes (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  payload    jsonb not null,
  is_public  boolean not null default true,
  created_at timestamptz not null default now()
);

create index schemes_owner_idx on public.schemes (owner_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- Analytics events: insert-only, no IP, no user agent. `user_id` only when signed in.
-- ---------------------------------------------------------------------------------------------
create table public.events (
  id            bigint generated always as identity primary key,
  user_id       uuid references public.profiles (id) on delete set null,
  name          text not null check (name ~ '^[a-z_]{3,40}$'),
  module        text not null check (module in ('paint', 'play', 'core')),
  tournament_id uuid,
  store_id      uuid references public.stores (id) on delete set null,
  props         jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create index events_name_time_idx on public.events (name, created_at);
create index events_user_time_idx on public.events (user_id, created_at);
create index events_store_time_idx on public.events (store_id, created_at);
create index events_tournament_idx on public.events (tournament_id);

-- ---------------------------------------------------------------------------------------------
-- Moderation reports (photos, army lists, streams, contest entries, profiles)
-- ---------------------------------------------------------------------------------------------
create type public.report_target as enum ('photo', 'list', 'stream', 'entry', 'profile');
create type public.report_status as enum ('open', 'actioned', 'dismissed');

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type public.report_target not null,
  target_id   text not null,
  reason      text not null check (char_length(reason) between 3 and 500),
  status      public.report_status not null default 'open',
  created_at  timestamptz not null default now()
);

create index reports_status_idx on public.reports (status, created_at);

-- ---------------------------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.stores      enable row level security;
alter table public.store_staff enable row level security;
alter table public.schemes     enable row level security;
alter table public.events      enable row level security;
alter table public.reports     enable row level security;

create policy "profiles are public" on public.profiles
  for select using (true);
create policy "users edit their own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "stores are public" on public.stores
  for select using (true);
create policy "staff and admins edit stores" on public.stores
  for update using (public.is_store_staff(id) or public.is_admin());
create policy "admins create stores" on public.stores
  for insert with check (public.is_admin());

create policy "staff see their store team" on public.store_staff
  for select using (user_id = auth.uid() or public.is_store_staff(store_id) or public.is_admin());
create policy "admins manage store teams" on public.store_staff
  for all using (public.is_admin()) with check (public.is_admin());

create policy "public schemes are readable" on public.schemes
  for select using (is_public or owner_id = auth.uid());
create policy "owners manage their schemes" on public.schemes
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Anyone may record an event, but only as themselves (or anonymously). Nobody reads raw events
-- from the client: the dashboard reads aggregated functions instead.
create policy "record own or anonymous events" on public.events
  for insert with check (user_id is null or user_id = auth.uid());
create policy "admins read events" on public.events
  for select using (public.is_admin());

create policy "signed-in users report content" on public.reports
  for insert with check (reporter_id = auth.uid());
create policy "admins handle reports" on public.reports
  for all using (public.is_admin()) with check (public.is_admin());
