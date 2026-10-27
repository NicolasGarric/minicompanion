-- =============================================================================================
-- DEMO DATA ONLY - painting contests. Photos are the app's own demo figure painted with the
-- built-in schemes, served by the app from public/demo/contest/ (paths starting with "demo/").
--   * "Summer Paint-Off": finished, results and podium (public vote + jury)
--   * "Autumn Paint-Off" (from seed.sql): open, a few entries and votes (blind until it closes)
-- =============================================================================================

insert into public.tournaments (
  id, slug, name, organiser_id, store_id, venue_name, address, location, starts_at, ends_at,
  format_id, type, language, max_players, registration_deadline, list_deadline,
  pairing_system, rounds_planned, lists_visibility, status, game_system, description
)
select md5('demo-summer-contest')::uuid, 'summer-paint-off', 'Summer Paint-Off', md5('demo-user-0')::uuid, s.id, s.name, s.address, s.location,
       now() - interval '20 days', now() - interval '20 days' + interval '6 hours',
       'skirmish', 'painting_contest', 'both', 60, now() - interval '21 days', now() - interval '22 days',
       'swiss', 1, 'public', 'finished', null, 'Painting contest: single miniature and squad categories, public vote and jury.'
from public.stores s where s.id = md5('store-2')::uuid;

insert into public.contest_categories (id, tournament_id, kind, voting_closes_at, jury_enabled) values
  (md5('demo-summer-single')::uuid, md5('demo-summer-contest')::uuid, 'single', now() - interval '10 days', true),
  (md5('demo-summer-squad')::uuid, md5('demo-summer-contest')::uuid, 'squad', now() - interval '10 days', false);

insert into public.jury_members (tournament_id, user_id) values
  (md5('demo-summer-contest')::uuid, md5('demo-user-41')::uuid),
  (md5('demo-summer-contest')::uuid, md5('demo-user-42')::uuid);

-- (author, scheme file, title)
insert into public.contest_entries (id, category_id, user_id, title, photo_paths, rights_confirmed, created_at)
select md5('demo-entry-' || e.n)::uuid, md5('demo-summer-' || e.cat)::uuid, md5('demo-user-' || e.u)::uuid, e.title,
       array['demo/contest/' || e.file || '.jpg'], true, now() - interval '15 days'
from (values
  (1, 'single', 2, 'crimson-gold', 'Crimson Warden'),
  (2, 'single', 3, 'royal-blue-gold', 'Royal Guard'),
  (3, 'single', 4, 'frost-grey', 'Winter Sentinel'),
  (4, 'single', 5, 'gunmetal-glow', 'Forge Walker'),
  (5, 'single', 6, 'emerald-brass', 'Emerald Knight'),
  (6, 'single', 1, 'turquoise-gold', 'Lagoon Champion'),
  (7, 'squad', 7, 'desert-ochre', 'Dune Patrol'),
  (8, 'squad', 8, 'weathered-green', 'Old Guard Squad'),
  (9, 'squad', 9, 'black-ivory', 'Night Watch')
) as e(n, cat, u, file, title);

-- Public votes: voters 10..49, spread unevenly (entry 1 wins the single category, entry 6 is 3rd)
insert into public.contest_votes (category_id, entry_id, voter_id)
select md5('demo-summer-single')::uuid,
       md5('demo-entry-' || (array[1,1,1,1,1,1,1,1,1,2,2,2,2,2,2,2,6,6,6,6,6,3,3,3,4,4,5,1,2,6])[1 + (v % 30)])::uuid,
       md5('demo-user-' || v)::uuid
from generate_series(10, 39) v;
insert into public.contest_votes (category_id, entry_id, voter_id)
select md5('demo-summer-squad')::uuid, md5('demo-entry-' || (array[7,7,8,7,9,8,7,9,7,8])[1 + (v % 10)])::uuid, md5('demo-user-' || v)::uuid
from generate_series(10, 29) v;

-- Jury (out of 10 each): the jury prefers entry 2
insert into public.jury_scores (entry_id, juror_id, technique, composition, originality)
select md5('demo-entry-' || j.n)::uuid, md5('demo-user-' || j.juror)::uuid, j.t, j.c, j.o
from (values (1, 41, 8, 7, 7), (1, 42, 7, 8, 6), (2, 41, 9, 8, 8), (2, 42, 9, 9, 7), (3, 41, 7, 7, 8), (3, 42, 6, 7, 8),
             (4, 41, 8, 6, 9), (4, 42, 7, 7, 9), (5, 41, 6, 7, 6), (5, 42, 7, 6, 6), (6, 41, 8, 8, 7), (6, 42, 8, 7, 7))
  as j(n, juror, t, c, o);

-- Autumn Paint-Off (open): a few entries and votes in "single"
insert into public.contest_entries (id, category_id, user_id, title, photo_paths, rights_confirmed)
select md5('demo-autumn-entry-' || e.n)::uuid,
       (select c.id from public.contest_categories c join public.tournaments t on t.id = c.tournament_id
         where t.slug = 'kanda-paint-off-autumn' and c.kind = 'single'),
       md5('demo-user-' || e.u)::uuid, e.title, array['demo/contest/' || e.file || '.jpg'], true
from (values (1, 3, 'bright-yellow', 'Sunburst Ranger'), (2, 4, 'green-skin', 'Swamp Brute'),
             (3, 5, 'dark-green-bone', 'Forest Keeper'), (4, 6, 'crimson-gold', 'Ember Lord')) as e(n, u, file, title);
insert into public.contest_votes (category_id, entry_id, voter_id)
select e.category_id, e.id, md5('demo-user-' || v)::uuid
from generate_series(20, 27) v
join public.contest_entries e on e.id = md5('demo-autumn-entry-' || (1 + v % 4))::uuid;
