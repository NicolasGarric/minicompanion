-- =============================================================================================
-- DEMO DATA ONLY. Fixes the "Friday Live Clash" demo tournament in a database seeded before the
-- seed fix of 2026-10-22: round 2, table 3 shows 14 - 14 but is marked as a win for player A.
-- The secondary score of player A becomes 4 (16 - 14, a real win), as in seed_tournament.sql now.
--
-- Safe: it only touches that one match while it still has the wrong scores, so running it twice,
-- or on a database without the demo data (after cleanup_demo_data.sql), changes nothing.
-- Run it in the Supabase SQL Editor. The result shows how many rows were fixed (0 or 1).
-- =============================================================================================
with fixed as (
  update public.matches m
     set a_secondary = 4
   where m.round_id = md5('demo-live-r2')::uuid
     and m.table_id = md5('demo-live-table-3')::uuid
     and m.a_primary = 12 and m.a_secondary = 2
     and m.b_primary = 9 and m.b_secondary = 5
     and m.result = 'a_win'
  returning m.id
)
select count(*) as fixed_rows from fixed;
