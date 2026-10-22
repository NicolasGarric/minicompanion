-- RLS and function tests for the core + PLAY migrations. Run after migrations and seed.
-- Each block impersonates a role (anon / authenticated user) the way PostgREST does.
-- A failed expectation raises an exception and stops the script.

create or replace function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
$$;
create or replace function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;
create or replace function pg_temp.uid(n int) returns uuid language sql as $$ select md5('demo-user-' || n)::uuid $$;
create or replace function pg_temp.tid(s text) returns uuid language sql as $$ select id from public.tournaments where slug = s $$;
grant execute on all functions in schema pg_temp to anon, authenticated;
set client_min_messages = notice;
\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------------------------
-- Search (anonymous visitor)
-- ---------------------------------------------------------------------------------------------
set role anon;
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) from public.search_tournaments()) = 20, 'anon sees the 20 published tournaments');
select pg_temp.ok(
  (select count(*) from public.search_tournaments(35.6812, 139.7671, 15)) between 1 and 19,
  'radius 15 km around Tokyo station excludes far events (Yokohama, Machida)');
select pg_temp.ok(
  (select bool_and(distance_km <= 15) from public.search_tournaments(35.6812, 139.7671, 15)),
  'every result is within the radius');
select pg_temp.ok(
  (select array_agg(distance_km order by ordinality) = array_agg(distance_km order by distance_km)
     from public.search_tournaments(35.6812, 139.7671, 50) with ordinality),
  'results are sorted by distance');
select pg_temp.ok(
  not exists (select 1 from public.search_tournaments(p_has_spots => true) where slug = 'shinjuku-english-night'),
  'has_spots hides the full event');
select pg_temp.ok(
  (select bool_and(format_id = 'skirmish') from public.search_tournaments(p_formats => array['skirmish'])),
  'format filter');
select pg_temp.ok(
  (select bool_and(language in ('en', 'both')) from public.search_tournaments(p_language => 'en')),
  'language filter keeps bilingual events');

do $$ begin
  perform public.register_for_tournament(pg_temp.tid('kanda-first-steps-1'));
  raise exception 'FAIL: anon could register';
exception when insufficient_privilege then raise notice 'ok - anon cannot call write functions';
end $$;

do $$ begin
  insert into public.events (name, module, user_id) values ('page_view', 'core', pg_temp.uid(1));
  raise exception 'FAIL: anon recorded an event for someone else';
exception when insufficient_privilege then raise notice 'ok - anon cannot record events as another user';
end $$;
insert into public.events (name, module) values ('page_view', 'core');
select pg_temp.ok((select count(*) from public.events) = 0, 'anon can record anonymous events but cannot read them');
reset role;

-- ---------------------------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------------------------
set role authenticated;
select pg_temp.as_user(pg_temp.uid(1));
update public.profiles set display_name = 'Renamed Player' where id = pg_temp.uid(1);
select pg_temp.ok((select display_name from public.profiles where id = pg_temp.uid(1)) = 'Renamed Player', 'user edits own profile');
update public.profiles set display_name = 'Hacked' where id = pg_temp.uid(2);
select pg_temp.ok((select display_name from public.profiles where id = pg_temp.uid(2)) <> 'Hacked', 'user cannot edit another profile');
do $$ begin
  update public.profiles set is_admin = true where id = pg_temp.uid(1);
  raise exception 'FAIL: user made themselves admin';
exception when insufficient_privilege then raise notice 'ok - user cannot grant themselves admin';
end $$;

-- ---------------------------------------------------------------------------------------------
-- Registration, waitlist, withdrawal
-- ---------------------------------------------------------------------------------------------
select pg_temp.ok(public.register_for_tournament(pg_temp.tid('kanda-first-steps-1')) = 'registered', 'player registers to an open event');
select pg_temp.ok(public.register_for_tournament(pg_temp.tid('shinjuku-english-night')) = 'waitlist', 'full event puts the player on the waitlist');

-- A registered player of the full event withdraws: the waitlisted demo player is promoted.
select pg_temp.as_user((select user_id from public.registrations
                         where tournament_id = pg_temp.tid('shinjuku-english-night') and status = 'registered'
                         order by created_at limit 1));
select public.withdraw_from_tournament(pg_temp.tid('shinjuku-english-night'));
select pg_temp.ok(
  (select status from public.registrations where tournament_id = pg_temp.tid('shinjuku-english-night') and user_id = pg_temp.uid(1)) = 'registered',
  'withdrawal promotes the oldest waitlisted player');

-- ---------------------------------------------------------------------------------------------
-- Army lists
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.uid(1));
select public.submit_army_list(pg_temp.tid('kanda-first-steps-1'), 'Space knights - 495 points', 'Space knights', 495);
select public.register_for_tournament(pg_temp.tid('shibuya-weekday-clash'));
select public.submit_army_list(pg_temp.tid('shibuya-weekday-clash'), 'My secret list', 'Orc warband', 1000);
select pg_temp.ok((select count(*) from public.army_lists) = 2, 'owner sees both of their lists');

select pg_temp.as_user(pg_temp.uid(3));
select pg_temp.ok(
  (select count(*) from public.army_lists l join public.registrations r on r.id = l.registration_id
    where r.tournament_id = pg_temp.tid('kanda-first-steps-1')) = 1,
  'another player sees a list when the event makes lists public');
select pg_temp.ok(
  (select count(*) from public.army_lists l join public.registrations r on r.id = l.registration_id
    where r.tournament_id = pg_temp.tid('shibuya-weekday-clash')) = 0,
  'another player cannot see a list hidden until start');

do $$ begin
  perform public.review_army_list((select id from public.army_lists limit 1), 'approved');
  raise exception 'FAIL: a player approved a list';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok - only the organiser can review lists';
end $$;

select pg_temp.as_user(pg_temp.uid(0));   -- organiser (store owner)
select pg_temp.ok((select count(*) from public.army_lists) = 2, 'organiser sees lists of their events');
select public.review_army_list(l.id, 'rejected', 'Please add unit points')
  from public.army_lists l join public.registrations r on r.id = l.registration_id
 where r.tournament_id = pg_temp.tid('kanda-first-steps-1');
reset role;

-- Deadline passed: the list is locked.
update public.tournaments set list_deadline = now() - interval '1 minute' where slug = 'kanda-first-steps-1';
set role authenticated;
select pg_temp.as_user(pg_temp.uid(1));
do $$ begin
  perform public.submit_army_list(pg_temp.tid('kanda-first-steps-1'), 'late edit', null, 0);
  raise exception 'FAIL: list edited after the deadline';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok - list is locked after the deadline (%)', sqlerrm;
end $$;
select pg_temp.ok(
  (select l.status = 'rejected' and l.organiser_comment = 'Please add unit points'
     from public.army_lists l join public.registrations r on r.id = l.registration_id
    where r.tournament_id = pg_temp.tid('kanda-first-steps-1')),
  'player sees the organiser decision and comment');

-- ---------------------------------------------------------------------------------------------
-- Tournament ownership and drafts
-- ---------------------------------------------------------------------------------------------
do $$ begin
  insert into public.tournaments (slug, name, organiser_id, venue_name, address, location, starts_at, ends_at,
    format_id, type, max_players, registration_deadline, list_deadline, rounds_planned)
  values ('fake-event', 'Fake event', pg_temp.uid(0), 'x', 'x', 'SRID=4326;POINT(139.7 35.7)',
    now() + interval '2 days', now() + interval '3 days', 'clash', 'casual', 8, now() + interval '1 day', now() + interval '1 day', 3);
  raise exception 'FAIL: created a tournament in someone else''s name';
exception when insufficient_privilege then raise notice 'ok - cannot organise in someone else''s name';
end $$;

-- RETURNING like PostgREST does: the new row must also pass the SELECT policy (regression test).
insert into public.tournaments (slug, name, organiser_id, venue_name, address, location, starts_at, ends_at,
  format_id, type, max_players, registration_deadline, list_deadline, rounds_planned)
values ('my-draft-event', 'My draft event', pg_temp.uid(1), 'Home', 'Tokyo', 'SRID=4326;POINT(139.7 35.7)',
  now() + interval '2 days', now() + interval '3 days', 'clash', 'casual', 8, now() + interval '1 day', now() + interval '1 day', 3)
returning id;
select pg_temp.ok(exists (select 1 from public.tournaments where slug = 'my-draft-event'), 'organiser sees their draft');
select pg_temp.as_user(pg_temp.uid(3));
select pg_temp.ok(not exists (select 1 from public.tournaments where slug = 'my-draft-event'), 'drafts are invisible to others');
update public.tournaments set name = 'Hijacked' where slug = 'kanda-first-steps-2';
reset role;
select pg_temp.ok((select name from public.tournaments where slug = 'kanda-first-steps-2') <> 'Hijacked', 'players cannot edit other tournaments');

\echo 'All RLS tests passed.'
