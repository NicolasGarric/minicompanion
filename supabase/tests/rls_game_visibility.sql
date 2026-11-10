-- Tests for migration 27: public / private played games, "finished" mark, comments. Run after migrations and seeds.
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

reset role;
-- 33 hosts, 34 plays; 35 is a stranger. One played game, one still to come.
insert into public.games (id, host_id, game_system, starts_at, country, city, players_count, max_players, status)
values (md5('t-vis-played')::uuid, pg_temp.uid(33), 'Visibility check', now() - interval '3 hours', 'JP', 'Tokyo', 2, 2, 'full'),
       (md5('t-vis-later')::uuid, pg_temp.uid(33), 'Visibility later', now() + interval '2 days', 'JP', 'Tokyo', 1, 2, 'open');
insert into public.game_players (game_id, player_id, status) values (md5('t-vis-played')::uuid, pg_temp.uid(34), 'accepted');
set role authenticated;

select pg_temp.as_user(pg_temp.uid(33));
select pg_temp.ok((select is_public and finished_at is null from public.games where id = md5('t-vis-played')::uuid), 'a game is public and not finished by default');
select public.submit_game_report(md5('t-vis-played')::uuid,
  jsonb_build_array(jsonb_build_object('player_id', pg_temp.uid(33), 'placement', 1), jsonb_build_object('player_id', pg_temp.uid(34), 'placement', 2)), 'Close game');

-- Finished
select pg_temp.as_user(pg_temp.uid(34));
select pg_temp.expect_error($q$select public.set_game_finished(md5('t-vis-played')::uuid)$q$, 'not_host', 'only the host marks the game finished');
select pg_temp.as_user(pg_temp.uid(33));
select pg_temp.expect_error($q$select public.set_game_finished(md5('t-vis-later')::uuid)$q$, 'not_played_yet', 'not finished before it starts');
select pg_temp.ok(public.set_game_finished(md5('t-vis-played')::uuid) is not null, 'the host marks the game finished');
select pg_temp.ok((select finished_at is not null from public.games where id = md5('t-vis-played')::uuid), 'the finish time is stored');
select pg_temp.as_user(pg_temp.uid(34));
select pg_temp.ok((select count(*) from public.notifications where user_id = pg_temp.uid(34) and kind = 'game_finished' and payload ->> 'game_id' = md5('t-vis-played')::uuid::text) = 1, 'the player is told to add the result');
select pg_temp.as_user(pg_temp.uid(33));
select pg_temp.ok(public.set_game_finished(md5('t-vis-played')::uuid, false) is null, 'the host can undo it');
select pg_temp.ok((select finished_at is null from public.games where id = md5('t-vis-played')::uuid), 'not finished any more');
select public.set_game_finished(md5('t-vis-played')::uuid);
select pg_temp.expect_error($q$update public.games set finished_at = null where id = md5('t-vis-played')::uuid$q$, '42501', 'no direct write of the mark');

-- Comments on a public game
select pg_temp.as_user(pg_temp.uid(35));
select pg_temp.ok(public.add_game_comment(md5('t-vis-played')::uuid, ' Great game! ') is not null, 'a stranger comments on a public game');
select pg_temp.ok((select body from public.game_comments where game_id = md5('t-vis-played')::uuid and author_id = pg_temp.uid(35)) = 'Great game!', 'the comment is stored, trimmed');
select pg_temp.expect_error($q$select public.add_game_comment(md5('t-vis-later')::uuid, 'hi')$q$, 'not_played_yet', 'no comment before the game');
select pg_temp.expect_error($q$select public.add_game_comment(md5('t-vis-played')::uuid, '   ')$q$, 'bad_comment', 'an empty comment is refused');
select pg_temp.expect_error(format($q$select public.add_game_comment(md5('t-vis-played')::uuid, %L)$q$, repeat('x', 501)), 'bad_comment', '500 characters at most');
select pg_temp.expect_error($q$insert into public.game_comments (game_id, author_id, body) values (md5('t-vis-played')::uuid, md5('demo-user-35')::uuid, 'x')$q$, '42501', 'no direct write of comments');
select pg_temp.as_user(pg_temp.uid(33));
select pg_temp.ok((select count(*) from public.notifications where user_id = pg_temp.uid(33) and kind = 'game_comment') = 1, 'the host hears about the comment');
select pg_temp.as_user(pg_temp.uid(35));
select public.add_game_comment(md5('t-vis-played')::uuid, 'And a second one');
select pg_temp.as_user(pg_temp.uid(33));
select pg_temp.ok((select count(*) from public.notifications where user_id = pg_temp.uid(33) and kind = 'game_comment') = 1, 'one unread alert per game, not one per comment');

set role anon;
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) from public.game_comments where game_id = md5('t-vis-played')::uuid) = 2, 'visitors read the comments of a public game');
select pg_temp.ok((select count(*) from public.game_reports where game_id = md5('t-vis-played')::uuid) = 1, 'visitors read the report of a public game');
select pg_temp.ok((select count(*) from public.game_results where game_id = md5('t-vis-played')::uuid) = 2, 'visitors read the results of a public game');
select pg_temp.expect_error($q$select public.add_game_comment(md5('t-vis-played')::uuid, 'x')$q$, '42501', 'visitors cannot comment');

-- Private game
set role authenticated;
select pg_temp.as_user(pg_temp.uid(34));
select pg_temp.expect_error($q$select public.set_game_public(md5('t-vis-played')::uuid, false)$q$, 'not_host', 'only the host makes the game private');
select pg_temp.as_user(pg_temp.uid(33));
select public.set_game_public(md5('t-vis-played')::uuid, false);
select pg_temp.as_user(pg_temp.uid(35));
select pg_temp.ok((select count(*) from public.games where id = md5('t-vis-played')::uuid) = 1, 'a private game is still listed');
select pg_temp.ok((select count(*) from public.game_reports where game_id = md5('t-vis-played')::uuid) = 0, 'strangers do not see the report of a private game');
select pg_temp.ok((select count(*) from public.game_results where game_id = md5('t-vis-played')::uuid) = 0, 'nor its results');
select pg_temp.ok((select count(*) from public.game_comments where game_id = md5('t-vis-played')::uuid) = 0, 'nor its comments');
select pg_temp.expect_error($q$select public.add_game_comment(md5('t-vis-played')::uuid, 'x')$q$, 'forbidden', 'strangers cannot comment on a private game');
select pg_temp.as_user(pg_temp.uid(34));
select pg_temp.ok((select count(*) from public.game_results where game_id = md5('t-vis-played')::uuid) = 2, 'the players still see the results');
select pg_temp.ok(public.add_game_comment(md5('t-vis-played')::uuid, 'Rematch next week?') is not null, 'the players comment among themselves');
set role anon;
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) from public.game_reports where game_id = md5('t-vis-played')::uuid) = 0, 'visitors do not see a private report');

-- Delete and report
set role authenticated;
select pg_temp.as_user(pg_temp.uid(33));
select public.set_game_public(md5('t-vis-played')::uuid, true);
select pg_temp.as_user(pg_temp.uid(36));
select pg_temp.expect_error(format($q$select public.delete_game_comment(%L)$q$, (select id from public.game_comments where body = 'Great game!')), 'forbidden', 'others cannot delete a comment');
select public.report_game_comment((select id from public.game_comments where body = 'Great game!'), 'spam');
select public.report_game_comment((select id from public.game_comments where body = 'Great game!'), 'spam');
reset role;
select pg_temp.ok((select count(*) from public.reports where target_type::text = 'comment' and reporter_id = pg_temp.uid(36)) = 1, 'one report per person');
set role authenticated;
select pg_temp.as_user(pg_temp.uid(37));
select public.report_game_comment((select id from public.game_comments where body = 'Great game!'), 'spam');
select pg_temp.as_user(pg_temp.uid(38));
select public.report_game_comment((select id from public.game_comments where body = 'Great game!'), 'spam');
select pg_temp.ok((select count(*) from public.game_comments where body = 'Great game!') = 0, 'three reports hide the comment');
select pg_temp.as_user(pg_temp.uid(35));
select pg_temp.ok((select count(*) from public.game_comments where body = 'Great game!') = 1, 'its author still sees it');
select public.delete_game_comment((select id from public.game_comments where body = 'And a second one'));
select pg_temp.ok((select count(*) from public.game_comments where body = 'And a second one') = 0, 'the author deletes a comment');
select pg_temp.as_user(pg_temp.uid(33));
select public.delete_game_comment((select id from public.game_comments where body = 'Rematch next week?'));
select pg_temp.ok((select count(*) from public.game_comments where body = 'Rematch next week?') = 0, 'the host deletes a comment');

reset role;
delete from public.reports where target_type::text = 'comment';
delete from public.notifications where payload ->> 'game_id' in (md5('t-vis-played')::uuid::text, md5('t-vis-later')::uuid::text);
delete from public.games where id in (md5('t-vis-played')::uuid, md5('t-vis-later')::uuid);
select 'game visibility tests passed';
