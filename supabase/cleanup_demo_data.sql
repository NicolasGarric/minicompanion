-- =============================================================================================
-- Removes ALL demo data created by seed*.sql and by scripts/check-supabase.mjs, keeping only what
-- real users created. Run it in the Supabase SQL Editor (it runs as `postgres`).
--
-- What counts as demo data:
--   * the 50 demo accounts (`*@demo.example`, ids md5('demo-user-<n>')) and everything they own:
--     profiles, tournaments, games, leagues, contest entries / votes, messages, LFG posts, gallery…
--   * the 9 fictional stores (ids md5('store-<n>')) and their slots / staff
--   * bug reports sent by the live check ("live check")
--   * the throwaway `demo_seed` schema
--
-- Real users' rows that only *point* to demo data are kept: a real tournament held at a demo store
-- keeps its copied venue name and address (store_id becomes null).
--
-- After this, scripts/check-supabase.mjs no longer works (it signs in with the demo accounts).
--
-- 1) Run the PREVIEW query alone and read the counts.
-- 2) Run the CLEANUP block. It is one transaction: if anything fails, nothing is deleted.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- 1) PREVIEW
-- ---------------------------------------------------------------------------------------------
with demo as (
  select id from auth.users
   where email like '%@demo.example'
      or id in (select md5('demo-user-' || n)::uuid from generate_series(0, 49) n)
)
select 'demo accounts' as what, count(*) from demo
union all select 'real accounts (kept)', count(*) from auth.users where id not in (select id from demo)
union all select 'demo tournaments', count(*) from public.tournaments where organiser_id in (select id from demo)
union all select 'real tournaments (kept)', count(*) from public.tournaments where organiser_id not in (select id from demo)
union all select 'demo games', count(*) from public.games where host_id in (select id from demo)
union all select 'demo leagues', count(*) from public.leagues where organiser_id in (select id from demo)
union all select 'demo stores', count(*) from public.stores where id in (select md5('store-' || n)::uuid from generate_series(1, 9) n)
union all select 'other stores (kept)', count(*) from public.stores where id not in (select md5('store-' || n)::uuid from generate_series(1, 9) n)
union all select 'live-check bug reports', count(*) from public.bug_reports where message = 'live check'
-- Must be 0: a demo player in a match of a REAL tournament would block the deletion.
union all select 'BLOCKING: demo players in real matches', count(*)
  from public.matches m join public.tournaments t on t.id = m.tournament_id
 where t.organiser_id not in (select id from demo)
   and (m.player_a_id in (select id from demo) or m.player_b_id in (select id from demo)
        or m.reported_by in (select id from demo) or m.confirmed_by in (select id from demo))
-- Files cannot be deleted from SQL: remove them in Storage > gallery if this is not 0.
union all select 'storage files of demo accounts (delete by hand)', count(*)
  from storage.objects where owner in (select id from demo);

-- ---------------------------------------------------------------------------------------------
-- 2) CLEANUP
-- ---------------------------------------------------------------------------------------------
do $$
declare
  demo uuid[] := array(
    select id from auth.users
     where email like '%@demo.example'
        or id in (select md5('demo-user-' || n)::uuid from generate_series(0, 49) n));
  n int;
begin
  -- tournaments.organiser_id and the match player columns have no ON DELETE CASCADE:
  -- remove the demo tournaments first (rounds, tables, matches, registrations, contests cascade).
  delete from public.tournaments where organiser_id = any (demo);
  get diagnostics n = row_count; raise notice 'tournaments deleted: %', n;

  -- Demo accounts: profiles and everything they own cascade from auth.users.
  delete from auth.identities where user_id = any (demo);
  delete from auth.users where id = any (demo);
  get diagnostics n = row_count; raise notice 'demo accounts deleted: %', n;

  delete from public.stores where id in (select md5('store-' || i)::uuid from generate_series(1, 9) i);
  get diagnostics n = row_count; raise notice 'demo stores deleted: %', n;

  delete from public.bug_reports where message = 'live check';
  get diagnostics n = row_count; raise notice 'live-check bug reports deleted: %', n;

  drop schema if exists demo_seed cascade;
end $$;
