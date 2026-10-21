-- Test-only emulation of what Supabase provides, so migrations can be validated locally.
-- PostGIS is NOT installed here: geography is emulated as EWKT text with haversine distance.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema auth;
create table auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text unique,
  encrypted_password text, email_confirmed_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz, updated_at timestamptz,
  confirmation_token text, recovery_token text, email_change_token_new text, email_change text
);
create table auth.identities (
  id uuid primary key, user_id uuid references auth.users, provider_id text, identity_data jsonb,
  provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;

create schema extensions;
grant usage on schema extensions to anon, authenticated;
create extension pgcrypto with schema extensions;

-- PostGIS stand-in -------------------------------------------------------------------------
create domain extensions.geography as text;
create domain extensions.geometry as text;

create function extensions.st_makepoint(x float8, y float8) returns extensions.geometry
  language sql immutable as $$ select format('SRID=4326;POINT(%s %s)', x, y)::extensions.geometry $$;
create function extensions.st_setsrid(g extensions.geometry, srid int) returns extensions.geometry
  language sql immutable as $$ select g $$;
create function extensions.st_x(g extensions.geometry) returns float8 language sql immutable as $$
  select split_part(substring(g from 'POINT\(([^)]*)\)'), ' ', 1)::float8 $$;
create function extensions.st_y(g extensions.geometry) returns float8 language sql immutable as $$
  select split_part(substring(g from 'POINT\(([^)]*)\)'), ' ', 2)::float8 $$;
create function extensions.st_distance(a extensions.geography, b extensions.geography) returns float8
  language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
      sin(radians(extensions.st_y(b::extensions.geometry) - extensions.st_y(a::extensions.geometry)) / 2) ^ 2
    + cos(radians(extensions.st_y(a::extensions.geometry))) * cos(radians(extensions.st_y(b::extensions.geometry)))
    * sin(radians(extensions.st_x(b::extensions.geometry) - extensions.st_x(a::extensions.geometry)) / 2) ^ 2))
$$;
create function extensions.st_dwithin(a extensions.geography, b extensions.geography, m float8) returns boolean
  language sql immutable as $$ select extensions.st_distance(a, b) <= m $$;
