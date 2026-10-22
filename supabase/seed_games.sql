-- =============================================================================================
-- DEMO DATA ONLY — fictional casual games (Quick play) hosted by the demo players of seed.sql.
-- Game and format texts are what players would type; the app itself ships no list of games.
-- Dates are relative to now() so the games are always upcoming.
-- =============================================================================================

insert into public.games (id, host_id, game_system, format, points, starts_at, duration_minutes, max_players,
                          level, language, country, city, area, store_id, note)
select md5('demo-game-' || g.n)::uuid,
       md5('demo-user-' || g.host)::uuid,
       g.game_system, g.format, g.points,
       date_trunc('hour', now()) + make_interval(days => g.days, hours => g.hours),
       g.minutes, g.max_players, g.level::public.game_level, g.lang::public.event_language,
       'JP', g.city, g.area,
       case when g.at_store then (select id from public.stores order by name limit 1) end,
       g.note
from (values
  (1, 2, 'Warhammer 40,000', 'Combat Patrol', 500, 2, 19, 90, 2, 'beginner', 'ja', 'Tokyo', 'Akihabara', true, 'First games welcome, I can lend an army.'),
  (2, 3, 'Warhammer 40,000', 'Strike Force', 2000, 4, 13, 180, 2, 'competitive', 'both', 'Tokyo', 'Shinjuku', false, 'Practice for the next GT.'),
  (3, 4, 'Kill Team', null, null, 3, 19, 90, 2, 'casual', 'ja', 'Yokohama', 'Kannai', true, null),
  (4, 5, 'Age of Sigmar', 'Spearhead', null, 5, 14, 90, 4, 'beginner', 'en', 'Tokyo', 'Shibuya', false, 'Two games side by side, then swap.'),
  (5, 6, 'Blood Bowl', null, 1000, 6, 15, 150, 2, 'casual', 'ja', 'Saitama', 'Omiya', true, null),
  (6, 7, 'Necromunda', 'Skirmish', null, 8, 18, 180, 4, 'casual', 'ja', 'Tokyo', 'Nakano', false, 'Small campaign, bring a gang.'),
  (7, 8, 'The Old World', null, 2000, 9, 13, 240, 2, 'casual', 'both', 'Chiba', 'Funabashi', false, null),
  (8, 9, 'Warcry', null, 1000, 10, 19, 60, 2, 'beginner', 'ja', 'Tokyo', 'Ikebukuro', true, 'Quick evening game.')
) as g(n, host, game_system, format, points, days, hours, minutes, max_players, level, lang, city, area, at_store, note);

insert into public.game_private (game_id, address)
select md5('demo-game-' || n)::uuid, format('%s-%s-%s Demo street, fictional building %s', n, n + 2, n + 5, n)
from generate_series(1, 8) n;

-- A few requests: one accepted (game 1), one pending (game 2).
insert into public.game_players (game_id, player_id, status, message) values
  (md5('demo-game-1')::uuid, md5('demo-user-1')::uuid, 'accepted', 'Count me in!'),
  (md5('demo-game-2')::uuid, md5('demo-user-1')::uuid, 'pending', 'Can I bring a 2000 pt list?');
update public.games set players_count = 2, status = 'full' where id = md5('demo-game-1')::uuid;
