-- =============================================================================================
-- DEMO DATA ONLY — fictional stores, players and tournaments around Tokyo.
-- Never run this on a production database with real users.
--
-- Demo accounts (password for both: demo-password-2026):
--   organiser@demo.example  — owner of "Kanda Miniature Hall", organises most events
--   player@demo.example     — a regular player
-- Dates are relative to now() so the tournaments are always upcoming.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Users (auth.users + identities); profiles are created by the on_auth_user_created trigger
-- ---------------------------------------------------------------------------------------------
create temporary table seed_people (n int, email text, display_name text, lang text, city text, factions text[]);

insert into seed_people values
  (0, 'organiser@demo.example', 'Kanda Hall Staff', 'ja', 'Tokyo', '{}'),
  (1, 'player@demo.example', 'Demo Player', 'en', 'Tokyo', '{"Space knights"}');

insert into seed_people
select i, format('player%s@demo.example', i), name, case when i % 3 = 0 then 'en' else 'ja' end, city, factions
from (
  select i,
         (array['Haruto K.', 'Yui T.', 'Sora M.', 'Ren A.', 'Hina S.', 'Kaito N.', 'Mio Y.', 'Riku O.',
                'Aoi F.', 'Yuto H.', 'Sakura I.', 'Daiki W.', 'Alex P.', 'Sam R.', 'Jordan L.', 'Chris B.',
                'Takumi E.', 'Nanami G.', 'Kenta J.', 'Emi U.', 'Shota V.', 'Rina C.', 'Yusuke D.', 'Mai Z.'])[1 + (i % 24)]
           || case when i > 25 then ' ' || i else '' end as name,
         (array['Tokyo', 'Tokyo', 'Tokyo', 'Yokohama', 'Saitama', 'Chiba'])[1 + (i % 6)] as city,
         (array['{"Space knights"}', '{"Undead legion"}', '{"Insect swarm"}', '{"Machine cult"}',
                '{"Orc warband"}', '{"Elf corsairs"}', '{"Imperial guard","Space knights"}'])[1 + (i % 7)]::text[] as factions
  from generate_series(2, 49) i
) x;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000',
       md5('demo-user-' || n)::uuid,
       'authenticated', 'authenticated', email,
       extensions.crypt('demo-password-2026', extensions.gen_salt('bf')),
       now(),
       '{"provider": "email", "providers": ["email"]}',
       jsonb_build_object('display_name', display_name, 'preferred_lang', lang),
       now() - (n || ' days')::interval, now(),
       '', '', '', ''
from seed_people;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select md5('demo-identity-' || n)::uuid, md5('demo-user-' || n)::uuid, md5('demo-user-' || n)::uuid::text,
       jsonb_build_object('sub', md5('demo-user-' || n)::uuid::text, 'email', email),
       'email', now(), now(), now()
from seed_people;

update public.profiles p
   set home_city = sp.city,
       factions = sp.factions,
       handle = case when sp.n = 0 then 'kanda_hall' when sp.n = 1 then 'demo_player' else 'demo_' || sp.n end
  from seed_people sp
 where p.id = md5('demo-user-' || sp.n)::uuid;

-- ---------------------------------------------------------------------------------------------
-- Stores (fictional names, real neighbourhoods)
-- ---------------------------------------------------------------------------------------------
insert into public.stores (id, name, address, city, location) values
  (md5('store-1')::uuid, 'Kanda Miniature Hall',  'Sotokanda, Chiyoda-ku, Tokyo',          'Tokyo',    'SRID=4326;POINT(139.7712 35.6995)'),
  (md5('store-2')::uuid, 'Shibuya Paint Lounge',  'Udagawacho, Shibuya-ku, Tokyo',         'Tokyo',    'SRID=4326;POINT(139.6982 35.6614)'),
  (md5('store-3')::uuid, 'Ikebukuro Battle Table', 'Higashi-Ikebukuro, Toshima-ku, Tokyo', 'Tokyo',    'SRID=4326;POINT(139.7193 35.7295)'),
  (md5('store-4')::uuid, 'Nakano Hobby Den',      'Nakano, Nakano-ku, Tokyo',              'Tokyo',    'SRID=4326;POINT(139.6659 35.7074)'),
  (md5('store-5')::uuid, 'Shinjuku Dice Club',    'Shinjuku, Shinjuku-ku, Tokyo',          'Tokyo',    'SRID=4326;POINT(139.7034 35.6938)'),
  (md5('store-6')::uuid, 'Kichijoji Craft & Play', 'Kichijoji Honcho, Musashino, Tokyo',   'Tokyo',    'SRID=4326;POINT(139.5797 35.7032)'),
  (md5('store-7')::uuid, 'Machida Wargame Cafe',  'Haramachida, Machida, Tokyo',           'Tokyo',    'SRID=4326;POINT(139.4466 35.5420)'),
  (md5('store-8')::uuid, 'Akabane Table Top',     'Akabane, Kita-ku, Tokyo',               'Tokyo',    'SRID=4326;POINT(139.7208 35.7778)'),
  (md5('store-9')::uuid, 'Harbor Hobby Yokohama', 'Minatomirai, Nishi-ku, Yokohama',       'Yokohama', 'SRID=4326;POINT(139.6317 35.4531)');

insert into public.store_staff (store_id, user_id, role) values
  (md5('store-1')::uuid, md5('demo-user-0')::uuid, 'owner');

-- ---------------------------------------------------------------------------------------------
-- 20 upcoming tournaments
--   d = days from now, h = start hour (JST), fill = share of seats already taken
-- ---------------------------------------------------------------------------------------------
create temporary table seed_events (
  slug text, name text, store int, d int, h int, format text, type public.tournament_type,
  lang public.event_language, max_players int, fill numeric, pairing public.pairing_system,
  vis public.lists_visibility
);

insert into seed_events values
  ('kanda-first-steps-1',     'First Steps Night',              1,  2, 19, 'skirmish', 'beginner',         'both', 12, 0.50, 'swiss',       'public'),
  ('shibuya-weekday-clash',   'Weekday Clash',                  2,  3, 18, 'clash',    'casual',           'ja',   16, 0.75, 'swiss',       'hidden_until_start'),
  ('ikebukuro-grand-battle',  'Ikebukuro Grand Battle',         3,  5, 10, 'battle',   'competitive',      'ja',   32, 0.90, 'swiss',       'hidden_until_start'),
  ('nakano-story-campaign',   'Nakano Story Campaign — Act I',  4,  6, 13, 'clash',    'narrative',        'ja',   12, 0.40, 'round_robin', 'public'),
  ('kanda-paint-off-autumn',  'Autumn Paint-Off',               1,  7, 14, 'skirmish', 'painting_contest', 'both', 40, 0.30, 'swiss',       'public'),
  ('shinjuku-english-night',  'English Friendly Night',         5,  8, 19, 'skirmish', 'casual',           'en',   10, 1.00, 'swiss',       'public'),
  ('kichijoji-family-day',    'Family Hobby Day',               6,  9, 11, 'skirmish', 'beginner',         'ja',   16, 0.25, 'round_robin', 'public'),
  ('machida-clash-cup',       'Machida Clash Cup',              7, 12, 10, 'clash',    'competitive',      'ja',   24, 0.60, 'swiss',       'hidden_until_start'),
  ('akabane-rookie-league-1', 'Rookie League — Week 1',         8, 13, 19, 'skirmish', 'beginner',         'ja',   12, 0.66, 'swiss',       'public'),
  ('yokohama-harbor-open',    'Harbor Open',                    9, 14, 10, 'battle',   'competitive',      'both', 48, 0.55, 'swiss',       'hidden_until_start'),
  ('kanda-first-steps-2',     'First Steps Night',              1, 16, 19, 'skirmish', 'beginner',         'both', 12, 0.20, 'swiss',       'public'),
  ('shibuya-squad-showcase',  'Squad Showcase Contest',         2, 17, 15, 'skirmish', 'painting_contest', 'ja',   30, 0.10, 'swiss',       'public'),
  ('ikebukuro-night-clash',   'Night Clash',                    3, 19, 18, 'clash',    'casual',           'ja',   16, 0.45, 'swiss',       'public'),
  ('nakano-story-campaign-2', 'Nakano Story Campaign — Act II', 4, 20, 13, 'clash',    'narrative',        'ja',   12, 0.10, 'round_robin', 'public'),
  ('shinjuku-team-battle',    'Shinjuku Team Battle',           5, 21, 10, 'battle',   'competitive',      'ja',   32, 0.35, 'swiss',       'hidden_until_start'),
  ('kichijoji-casual-sunday', 'Casual Sunday',                  6, 23, 12, 'clash',    'casual',           'both', 16, 0.15, 'swiss',       'public'),
  ('machida-beginner-camp',   'Beginner Boot Camp',             7, 26, 13, 'skirmish', 'beginner',         'ja',   10, 0.00, 'round_robin', 'public'),
  ('akabane-rookie-league-2', 'Rookie League — Week 2',         8, 27, 19, 'skirmish', 'beginner',         'ja',   12, 0.00, 'swiss',       'public'),
  ('kanda-winter-major',      'Winter Major',                   1, 33, 9,  'battle',   'competitive',      'both', 64, 0.25, 'swiss',       'hidden_until_start'),
  ('shibuya-vehicle-contest', 'Vehicle Painting Contest',       2, 35, 14, 'clash',    'painting_contest', 'both', 30, 0.00, 'swiss',       'public');

insert into public.tournaments (
  slug, name, organiser_id, store_id, venue_name, address, location, starts_at, ends_at,
  format_id, type, language, max_players, registration_deadline, list_deadline,
  pairing_system, rounds_planned, lists_visibility, status
)
select e.slug, e.name, md5('demo-user-0')::uuid, s.id, s.name, s.address, s.location,
       start_at,
       start_at + make_interval(mins => f.round_minutes * f.default_rounds + 60),
       e.format, e.type, e.lang, e.max_players,
       start_at - interval '1 hour',
       start_at - interval '1 day',
       e.pairing, f.default_rounds, e.vis, 'published'
from seed_events e
join public.stores s on s.id = md5('store-' || e.store)::uuid
join public.formats f on f.id = e.format
cross join lateral (
  -- Tokyo time, whatever the server time zone is
  select ((date_trunc('day', now() at time zone 'Asia/Tokyo') + make_interval(days => e.d, hours => e.h))
          at time zone 'Asia/Tokyo') as start_at
) t;

-- Registrations: each event is filled to its `fill` ratio with seeded players (never the demo player).
insert into public.registrations (tournament_id, user_id, status, created_at)
select t.id, p.id, 'registered', now() - (p.rn || ' hours')::interval
from seed_events e
join public.tournaments t on t.slug = e.slug
cross join lateral (
  select pr.id, row_number() over () as rn
  from public.profiles pr
  where pr.handle like 'demo\_%' escape '\' and pr.handle <> 'demo_player'
  order by md5(e.slug || pr.id::text)
  limit floor(e.max_players * e.fill)::int
) p;

-- Painting contest categories
insert into public.contest_categories (tournament_id, kind, voting_closes_at)
select t.id, k.kind, t.ends_at + interval '3 days'
from public.tournaments t
cross join (values ('single'::public.contest_kind), ('squad'), ('vehicle'), ('beginner')) k(kind)
where t.type = 'painting_contest';

drop table seed_people;
drop table seed_events;
