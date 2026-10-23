-- Tests for multi-week tournaments (round schedule). Run after migrations and seeds.
create or replace function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
$$;
create or replace function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;
create or replace function pg_temp.uid(n int) returns uuid language sql as $$ select md5('demo-user-' || n)::uuid $$;
create or replace function pg_temp.expect_error(sql text, code text, label text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FAIL: % (no error)', label;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  if code is not null and sqlerrm <> code and sqlstate <> code then raise exception 'FAIL: % (got % / %)', label, sqlstate, sqlerrm; end if;
  raise notice 'ok - %', label;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;
set client_min_messages = notice;
\pset tuples_only on

reset role;
create temporary table ev as select id from public.tournaments where slug = 'kanda-first-steps-1';
update public.profiles set is_public = false, factions = '{Secret army}', home_city = 'Osaka' where id = pg_temp.uid(4);
update public.profiles set is_public = true, factions = '{Open army}' where id = pg_temp.uid(5);
grant select on ev to anon, authenticated;

-- Profiles: the name card is public, the rest is not
set role anon;
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) from public.profiles where id = pg_temp.uid(4)) = 1, 'anyone sees name cards');
select pg_temp.expect_error($q$select home_city from public.profiles limit 1$q$, '42501', 'city is not readable directly');
select pg_temp.expect_error($q$select factions from public.profiles limit 1$q$, '42501', 'armies are not readable directly');
select pg_temp.expect_error($q$select is_admin from public.profiles limit 1$q$, '42501', 'admin flags are not readable');
select pg_temp.expect_error($q$select home_location from public.profiles limit 1$q$, '42501', 'home location is not readable');
select pg_temp.ok((select factions = '{}' and home_city is null from public.player_card((select handle from public.profiles where id = pg_temp.uid(4)))), 'private player card hides city and armies');
select pg_temp.ok((select factions = '{Open army}' from public.player_card((select handle from public.profiles where id = pg_temp.uid(5)))), 'public player card shows them');
select pg_temp.expect_error($q$select * from public.my_profile()$q$, '42501', 'visitors have no own profile');

set role authenticated;
select pg_temp.as_user(pg_temp.uid(4));
select pg_temp.ok((select home_city = 'Osaka' and factions = '{Secret army}' from public.my_profile()), 'I read my own full profile');
select pg_temp.ok((select factions = '{Secret army}' from public.player_card((select handle from public.profiles where id = pg_temp.uid(4)))), 'and my own private card');

-- Tournaments: organisers cannot touch moderation, ownership or the flow
select pg_temp.as_user(pg_temp.uid(0));
select pg_temp.expect_error($q$update public.tournaments set is_hidden = false where id = (select id from ev)$q$, '42501', 'organiser cannot change the moderation flag');
select pg_temp.expect_error($q$update public.tournaments set organiser_id = md5('demo-user-3')::uuid where id = (select id from ev)$q$, '42501', 'organiser cannot hand the event to someone else');
select pg_temp.expect_error($q$update public.tournaments set status = 'finished' where id = (select id from ev)$q$, 'bad_status', 'organiser cannot skip to finished');
update public.tournaments set status = 'draft' where id = (select id from ev);
update public.tournaments set status = 'published' where id = (select id from ev);
select pg_temp.ok((select status from public.tournaments where id = (select id from ev)) = 'published', 'organiser unpublishes and publishes');
select pg_temp.expect_error($q$insert into public.tournaments (slug, name, organiser_id, venue_name, address, location, starts_at, ends_at,
    registration_deadline, list_deadline, format_id, type, language, max_players, rounds_planned, lists_visibility, pairing_system, status)
  values ('sneaky', 'Sneaky', md5('demo-user-0')::uuid, 'X', 'Y', 'SRID=4326;POINT(139.7 35.6)', now() + interval '2 days', now() + interval '3 days',
    now() + interval '1 day', now() + interval '1 day', 'clash', 'casual', 'en', 8, 3, 'public', 'swiss', 'in_progress')$q$, 'bad_status', 'a new event cannot start already running');

-- Tables only changed by functions
select pg_temp.expect_error($q$update public.registrations set status = 'registered' where tournament_id = (select id from ev)$q$, '42501', 'registrations are not edited directly');
select pg_temp.expect_error($q$insert into public.rounds (tournament_id, number) values ((select id from ev), 9)$q$, '42501', 'rounds are not created directly');
select pg_temp.expect_error($q$truncate public.notifications$q$, '42501', 'nobody truncates tables');

reset role;
select 'security tests passed';
