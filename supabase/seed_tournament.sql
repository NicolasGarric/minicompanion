-- =============================================================================================
-- DEMO DATA ONLY — a tournament being played right now: 8 players, round 1 finished, round 2
-- in progress (2 results confirmed, 1 waiting for confirmation, 1 not reported yet).
-- organiser@demo.example runs it; player@demo.example plays in it.
-- =============================================================================================

insert into public.tournaments (
  id, slug, name, organiser_id, store_id, venue_name, address, location, starts_at, ends_at,
  format_id, type, language, max_players, registration_deadline, list_deadline,
  pairing_system, rounds_planned, lists_visibility, status, game_system, description
)
select md5('demo-live-t')::uuid, 'kanda-live-friday', 'Friday Live Clash', md5('demo-user-0')::uuid, s.id, s.name, s.address, s.location,
       date_trunc('hour', now()) - interval '3 hours', date_trunc('hour', now()) + interval '3 hours',
       'clash', 'casual', 'both', 8, date_trunc('hour', now()) - interval '4 hours', date_trunc('hour', now()) - interval '1 day',
       'swiss', 3, 'public', 'in_progress', 'Kill Team', 'Demo event in progress: follow the pairings and the standings live.'
from public.stores s where s.id = md5('store-1')::uuid;

insert into public.registrations (tournament_id, user_id, status, checked_in_at)
select md5('demo-live-t')::uuid, md5('demo-user-' || n)::uuid, 'registered', now() - interval '3 hours'
from generate_series(1, 8) n;

insert into public.game_tables (id, tournament_id, number)
select md5('demo-live-table-' || n)::uuid, md5('demo-live-t')::uuid, n from generate_series(1, 4) n;

insert into public.rounds (id, tournament_id, number, status, started_at) values
  (md5('demo-live-r1')::uuid, md5('demo-live-t')::uuid, 1, 'finished', now() - interval '3 hours'),
  (md5('demo-live-r2')::uuid, md5('demo-live-t')::uuid, 2, 'active', now() - interval '1 hour');

-- Round 1: 1 beat 2, 4 beat 3, 5 drew 6, 8 beat 7
insert into public.matches (tournament_id, round_id, table_id, player_a_id, player_b_id, a_primary, a_secondary, b_primary, b_secondary, result, status, reported_by, confirmed_by)
select md5('demo-live-t')::uuid, md5('demo-live-r1')::uuid, md5('demo-live-table-' || m.t)::uuid,
       md5('demo-user-' || m.a)::uuid, md5('demo-user-' || m.b)::uuid, m.ap, m.asec, m.bp, m.bsec, m.res::public.match_result,
       'confirmed', md5('demo-user-' || m.a)::uuid, md5('demo-user-' || m.b)::uuid
from (values (1, 1, 2, 15, 5, 10, 3, 'a_win'), (2, 3, 4, 9, 2, 14, 6, 'b_win'), (3, 5, 6, 12, 4, 12, 4, 'draw'), (4, 7, 8, 8, 1, 16, 5, 'b_win'))
  as m(t, a, b, ap, asec, bp, bsec, res);

-- Round 2: winners together. 1 vs 4 and 8 vs 5 confirmed, 6 vs 2 reported, 3 vs 7 to play
insert into public.matches (tournament_id, round_id, table_id, player_a_id, player_b_id, a_primary, a_secondary, b_primary, b_secondary, result, status, reported_by, confirmed_by)
select md5('demo-live-t')::uuid, md5('demo-live-r2')::uuid, md5('demo-live-table-' || m.t)::uuid,
       md5('demo-user-' || m.a)::uuid, md5('demo-user-' || m.b)::uuid, m.ap, m.asec, m.bp, m.bsec, m.res::public.match_result,
       m.st::public.match_status,
       case when m.st <> 'scheduled' then md5('demo-user-' || m.a)::uuid end,
       case when m.st = 'confirmed' then md5('demo-user-' || m.b)::uuid end
from (values (1, 1, 4, 13, 5, 11, 4, 'a_win', 'confirmed'), (2, 8, 5, 10, 3, 10, 6, 'b_win', 'confirmed'),
             (3, 6, 2, 12, 2, 9, 5, 'a_win', 'reported'), (4, 3, 7, null, null, null, null, null, 'scheduled'))
  as m(t, a, b, ap, asec, bp, bsec, res, st);
