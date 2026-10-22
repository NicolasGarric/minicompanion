-- =============================================================================================
-- DEMO DATA ONLY — played games with confirmed reports (ratings, badges), a store league,
-- "looking for a game" posts, store regular nights and a short conversation.
-- =============================================================================================

-- Profiles of the demo player and a few regulars are public, so the profile pages have content.
update public.profiles set is_public = true
 where id in (select md5('demo-user-' || n)::uuid from generate_series(1, 6) n);

-- A league at the first store, run by the organiser; the demo player and five regulars are in.
insert into public.leagues (id, organiser_id, name, game_system, store_id, city, starts_on, ends_on, description)
select md5('demo-league-1')::uuid, md5('demo-user-0')::uuid, 'Autumn Kill Team League', 'Kill Team',
       (select id from public.stores order by name limit 1), 'Tokyo',
       current_date - 21, current_date + 35, 'Play any league member at least once a week. Win 3, draw 1.';
insert into public.leagues (id, organiser_id, name, game_system, store_id, city, starts_on, ends_on, description)
select md5('demo-league-2')::uuid, md5('demo-user-3')::uuid, 'Yokohama Beginners Season', 'Warhammer 40,000', null, 'Yokohama',
       current_date - 7, current_date + 50, 'Small games (500–1000 pts) for new players.';
insert into public.league_members (league_id, player_id)
select md5('demo-league-1')::uuid, md5('demo-user-' || n)::uuid from generate_series(1, 6) n;
insert into public.league_members (league_id, player_id)
select md5('demo-league-2')::uuid, md5('demo-user-' || n)::uuid from generate_series(3, 8) n;

-- Six played league games (two players each) with confirmed reports.
insert into public.games (id, host_id, game_system, format, points, starts_at, duration_minutes, max_players, players_count,
                          level, language, country, city, area, store_id, status, league_id)
select md5('demo-past-' || g.n)::uuid, md5('demo-user-' || g.a)::uuid, 'Kill Team', null, null,
       date_trunc('hour', now()) - make_interval(days => g.days, hours => 2), 90, 2, 2,
       'casual', 'ja', 'JP', 'Tokyo', 'Akihabara', (select id from public.stores order by name limit 1), 'full',
       md5('demo-league-1')::uuid
from (values (1, 1, 2, 18), (2, 3, 4, 17), (3, 1, 3, 11), (4, 5, 6, 10), (5, 2, 5, 4), (6, 1, 4, 3)) as g(n, a, b, days);

insert into public.game_private (game_id, address)
select md5('demo-past-' || n)::uuid, 'Demo store, fictional address' from generate_series(1, 6) n;
insert into public.game_players (game_id, player_id, status)
select md5('demo-past-' || g.n)::uuid, md5('demo-user-' || g.b)::uuid, 'accepted'
from (values (1, 2), (2, 4), (3, 3), (4, 6), (5, 5), (6, 4)) as g(n, b);

insert into public.game_reports (game_id, reported_by, summary, status, confirmed_at)
select md5('demo-past-' || n)::uuid, (select host_id from public.games where id = md5('demo-past-' || n)::uuid),
       (array['Close game decided on the last turn.', 'Great scenario, rematch next week!', 'Learned a lot, thanks.',
              'Tight objectives game.', 'Dice were spicy today.', 'Clean win, well played.'])[n],
       'confirmed', now() - make_interval(days => 1)
from generate_series(1, 6) n;
-- (game, winner, loser, winner score, loser score)
insert into public.game_results (game_id, player_id, score, placement, agreed)
select md5('demo-past-' || r.n)::uuid, md5('demo-user-' || r.p)::uuid, r.score, r.place, true
from (values (1, 1, 18, 1), (1, 2, 14, 2), (2, 3, 12, 1), (2, 4, 12, 1), (3, 1, 20, 1), (3, 3, 11, 2),
             (4, 6, 16, 1), (4, 5, 9, 2), (5, 2, 15, 1), (5, 5, 13, 2), (6, 4, 17, 1), (6, 1, 16, 2)) as r(n, p, score, place);

do $$ begin
  for i in 1..6 loop
    perform public.apply_report_ratings(md5('demo-past-' || i)::uuid);
  end loop;
end $$;

-- Looking for a game
insert into public.lfg_posts (author_id, game_system, format, level, country, city, area, from_date, to_date, note)
values
  (md5('demo-user-7')::uuid, 'Kill Team', null, 'beginner', 'JP', 'Tokyo', 'Shibuya', current_date, current_date + 10, 'New to the game, any evening works.'),
  (md5('demo-user-8')::uuid, 'Age of Sigmar', 'Spearhead', 'casual', 'JP', 'Yokohama', null, current_date + 2, current_date + 14, 'Weekends only.'),
  (md5('demo-user-9')::uuid, 'Warhammer 40,000', 'Strike Force', 'competitive', 'JP', 'Tokyo', 'Shinjuku', current_date + 1, current_date + 20, 'Testing a list before a GT.');

-- Store regular nights (0 = Sunday)
insert into public.store_slots (store_id, weekday, starts_at, ends_at, tables, note)
select s.id, x.d, x.a::time, x.b::time, x.t, x.note
from (select id from public.stores order by name limit 1) s,
     (values (3, '18:00', '22:00', 6, 'Open gaming night'), (6, '12:00', '20:00', 10, 'Saturday tables, beginners welcome'),
             (0, '13:00', '18:00', 8, 'League day')) as x(d, a, b, t, note);

-- A short conversation between the demo player and a regular
insert into public.direct_messages (sender_id, recipient_id, body, created_at, read_at)
values
  (md5('demo-user-2')::uuid, md5('demo-user-1')::uuid, 'Rematch next Wednesday at the store?', now() - interval '2 days', now() - interval '2 days'),
  (md5('demo-user-1')::uuid, md5('demo-user-2')::uuid, 'Sure! 19:00 works for me.', now() - interval '2 days' + interval '20 minutes', null),
  (md5('demo-user-2')::uuid, md5('demo-user-1')::uuid, 'Great, I will book a table.', now() - interval '1 day', null);
