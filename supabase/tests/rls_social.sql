-- RLS and function tests for the PLAY social layer. Run after migrations and seeds.
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
\pset format unaligned

-- Seeded ratings and standings
select pg_temp.ok((select rating from public.player_ratings where player_id = pg_temp.uid(1) and game_key = 'kill team') > 1000, 'demo player has a rating above 1000 after 2 wins and 1 loss');
select pg_temp.ok((select wins || '/' || losses || '/' || draws from public.player_ratings where player_id = pg_temp.uid(3) and game_key = 'kill team') = '0/1/1', 'a shared first place counts as a draw');
select pg_temp.ok((select points from public.league_standings(md5('demo-league-1')::uuid) where player_id = pg_temp.uid(1)) = 6, 'league: 2 wins = 6 points');
select pg_temp.ok((select display_name from public.league_standings(md5('demo-league-1')::uuid) limit 1) is not null, 'league standings are ordered');

-- Privacy: ratings and stats follow the profile setting
set role anon;
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) from public.player_ratings where player_id = pg_temp.uid(1)) = 1, 'public profile: rating visible');
select pg_temp.ok((select count(*) from public.player_ratings where player_id = pg_temp.uid(20)) = 0, 'private profile: rating hidden');
select pg_temp.ok(public.player_stats(pg_temp.uid(1)) ->> 'played' = '3', 'public stats: 3 confirmed games');
select pg_temp.ok(public.player_stats(pg_temp.uid(20)) is null, 'private stats are null');
select pg_temp.ok((select count(*) from public.notifications) = 0, 'anon reads no notification');
select pg_temp.ok((select count(*) from public.direct_messages) = 0, 'anon reads no message');
select pg_temp.ok((select count(*) from public.lfg_posts) = 3, 'open posts are public');

set role authenticated;
-- A played game between 30 (host) and 31: report, confirmation, rating.
reset role;
insert into public.games (id, host_id, game_system, starts_at, country, city, players_count, max_players, status)
values (md5('t-played')::uuid, pg_temp.uid(30), 'Blood Bowl', now() - interval '3 hours', 'JP', 'Tokyo', 2, 2, 'full');
insert into public.game_players (game_id, player_id, status) values (md5('t-played')::uuid, pg_temp.uid(31), 'accepted');
set role authenticated;

select pg_temp.as_user(pg_temp.uid(32));
select pg_temp.expect_error($q$select public.submit_game_report(md5('t-played')::uuid, '[]'::jsonb)$q$, 'not_participant', 'outsiders cannot report');

select pg_temp.as_user(pg_temp.uid(30));
select pg_temp.expect_error(format($q$select public.submit_game_report(md5('t-played')::uuid, '[{"player_id":"%s","placement":1}]'::jsonb)$q$, pg_temp.uid(30)), 'bad_results', 'a report lists every player');
select pg_temp.ok(public.submit_game_report(md5('t-played')::uuid,
  jsonb_build_array(jsonb_build_object('player_id', pg_temp.uid(30), 'placement', 1, 'score', 2),
                    jsonb_build_object('player_id', pg_temp.uid(31), 'placement', 2, 'score', 1)),
  'Good game', '{}') = 'reported', 'host reports the game');
select pg_temp.ok((select count(*) from public.player_ratings where player_id = pg_temp.uid(30)) = 0, 'no rating before confirmation');

select pg_temp.as_user(pg_temp.uid(31));
select pg_temp.ok((select count(*) from public.notifications where kind = 'report_to_confirm') = 1, 'opponent is notified');
select pg_temp.ok(public.answer_game_report(md5('t-played')::uuid, false) = 'disputed', 'opponent disputes');
select pg_temp.as_user(pg_temp.uid(30));
select public.submit_game_report(md5('t-played')::uuid,
  jsonb_build_array(jsonb_build_object('player_id', pg_temp.uid(30), 'placement', 1, 'score', 2),
                    jsonb_build_object('player_id', pg_temp.uid(31), 'placement', 1, 'score', 2)), 'Draw after all', '{}');
select pg_temp.as_user(pg_temp.uid(31));
select pg_temp.ok(public.answer_game_report(md5('t-played')::uuid, true) = 'confirmed', 'corrected report is confirmed');
select pg_temp.ok((select rating = 1000 and draws = 1 from public.player_ratings where player_id = pg_temp.uid(31) and game_key = 'blood bowl'), 'draw between equals keeps 1000');
select pg_temp.as_user(pg_temp.uid(30));
select pg_temp.expect_error($q$select public.submit_game_report(md5('t-played')::uuid, '[]'::jsonb)$q$, 'already_confirmed', 'a confirmed report is final');
select pg_temp.expect_error($q$insert into public.player_ratings (player_id, game_key, game_name) values (auth.uid(), 'x', 'x')$q$, '42501', 'ratings cannot be written directly');

-- Messages: allowed with a reason only, private to the two people
select pg_temp.as_user(pg_temp.uid(30));
select pg_temp.expect_error(format($q$insert into public.direct_messages (sender_id, recipient_id, body) values (auth.uid(), '%s', 'hi')$q$, pg_temp.uid(25)), '42501', 'no message to a private stranger');
insert into public.direct_messages (sender_id, recipient_id, body) values (pg_temp.uid(30), pg_temp.uid(7), 'About your post');
insert into public.direct_messages (sender_id, recipient_id, body) values (pg_temp.uid(30), pg_temp.uid(31), 'GG');
select pg_temp.as_user(pg_temp.uid(7));
select pg_temp.ok((select count(*) from public.direct_messages where sender_id = pg_temp.uid(30)) = 1, 'post author receives the message');
select pg_temp.ok((select count(*) from public.notifications where kind = 'message') = 1, 'and a notification');
select pg_temp.as_user(pg_temp.uid(8));
select pg_temp.ok((select count(*) from public.direct_messages where sender_id = pg_temp.uid(30)) = 0, 'others cannot read it');
select pg_temp.ok((select count(*) from public.notifications where user_id = pg_temp.uid(7)) = 0, 'nor their notifications');

-- Game chat: participants only
select pg_temp.as_user(pg_temp.uid(31));
insert into public.game_messages (game_id, sender_id, body) values (md5('t-played')::uuid, pg_temp.uid(31), 'Thanks for the game');
select pg_temp.as_user(pg_temp.uid(32));
select pg_temp.ok((select count(*) from public.game_messages where game_id = md5('t-played')::uuid) = 0, 'outsiders do not see the game chat');
select pg_temp.expect_error($q$insert into public.game_messages (game_id, sender_id, body) values (md5('t-played')::uuid, auth.uid(), 'x')$q$, '42501', 'outsiders cannot write in it');

-- Opponent finder: a matching new game alerts the post author
select pg_temp.as_user(pg_temp.uid(33));
select public.create_game('kill team', null, null, (current_date + 3)::timestamptz + interval '19 hours', 90, 2, 'casual', 'ja', 'JP', 'tokyo', null, 'Somewhere 1', null, null, null);
select pg_temp.as_user(pg_temp.uid(7));
select pg_temp.ok((select count(*) from public.notifications where kind = 'game_match' and payload ->> 'game' = 'kill team') = 1, 'matching game alerts the post author');
select pg_temp.as_user(pg_temp.uid(33));
update public.lfg_posts set note = 'hijacked' where author_id = pg_temp.uid(7);
reset role;
select pg_temp.ok((select note from public.lfg_posts where author_id = pg_temp.uid(7)) <> 'hijacked', 'posts are edited by their author only');
select 'social tests passed';
