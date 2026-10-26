-- Tests for challenges, predictions, mentoring, campaign maps, swap board and hobby stats.
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
-- Fixtures: an open challenge (whatever today is), a past one, and a scheduled tournament match
insert into public.season_challenges (id, theme_key, palette, starts_on, ends_on)
values (md5('test-open-challenge')::uuid, 'test_open', array['#000000', '#ffffff'], current_date - 3, current_date + 3),
       (md5('test-past-challenge')::uuid, 'test_past', array['#000000', '#ffffff'], current_date - 60, current_date - 30);
create temporary table fx as
  select (select m.id from public.matches m where m.status = 'scheduled' and m.player_b_id is not null
             and public.tournament_visible(m.tournament_id) and pg_temp.uid(20) not in (m.player_a_id, m.player_b_id) limit 1) as match_id,
         (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id
           where t.slug = 'kanda-live-friday' and m.status = 'confirmed' limit 1) as done_match;
grant select on fx to anon, authenticated;

-- ---------- Challenges ----------
set role authenticated;
select pg_temp.as_user(pg_temp.uid(10));
select pg_temp.expect_error($q$select public.submit_challenge_entry(md5('test-open-challenge')::uuid, 'Lantern guard', 'elsewhere/x.jpg', true)$q$, 'bad_photos', 'entry photo must be in the challenge folder');
select pg_temp.expect_error($q$select public.submit_challenge_entry(md5('test-open-challenge')::uuid, 'Lantern guard', md5('test-open-challenge')::uuid || '/x.jpg', false)$q$, 'rights_required', 'rights must be confirmed');
select pg_temp.expect_error($q$select public.submit_challenge_entry(md5('test-past-challenge')::uuid, 'Late', md5('test-past-challenge')::uuid || '/x.jpg', true)$q$, 'challenge_closed', 'no entry once the month is over');
select public.submit_challenge_entry(md5('test-open-challenge')::uuid, 'Lantern guard', md5('test-open-challenge')::uuid || '/a.jpg', true);
select public.submit_challenge_entry(md5('test-open-challenge')::uuid, 'Lantern guard v2', md5('test-open-challenge')::uuid || '/b.jpg', true);
select pg_temp.ok((select count(*) from public.challenge_entries_of(md5('test-open-challenge')::uuid) where is_mine) = 1, 'one entry per player, updated in place');
select pg_temp.expect_error($q$insert into public.challenge_entries (challenge_id, user_id, title, photo_path) values (md5('test-open-challenge')::uuid, auth.uid(), 'x', 'x')$q$, '42501', 'no direct insert');
select pg_temp.expect_error($q$select public.toggle_challenge_like((select id from public.challenge_entries_of(md5('test-open-challenge')::uuid) where is_mine))$q$, 'own_entry', 'no like on your own entry');
select pg_temp.as_user(pg_temp.uid(11));
select pg_temp.ok(public.toggle_challenge_like((select id from public.challenge_entries_of(md5('test-open-challenge')::uuid) limit 1)), 'like');
select pg_temp.ok((select likes from public.challenge_entries_of(md5('test-open-challenge')::uuid) limit 1) = 1 and (select liked from public.challenge_entries_of(md5('test-open-challenge')::uuid) limit 1), 'like counted');
select pg_temp.ok(not public.toggle_challenge_like((select id from public.challenge_entries_of(md5('test-open-challenge')::uuid) limit 1)), 'unlike');
select pg_temp.ok((select count(*) from public.challenge_likes) = 0, 'raw likes are private');
-- Three reports hide an entry
select public.report_challenge_entry((select id from public.challenge_entries_of(md5('test-open-challenge')::uuid) limit 1), 'not a miniature');
select pg_temp.as_user(pg_temp.uid(12));
select public.report_challenge_entry((select id from public.challenge_entries_of(md5('test-open-challenge')::uuid) limit 1), 'spam');
select pg_temp.as_user(pg_temp.uid(13));
select public.report_challenge_entry((select id from public.challenge_entries_of(md5('test-open-challenge')::uuid) limit 1), 'spam');
select pg_temp.ok((select count(*) from public.challenge_entries_of(md5('test-open-challenge')::uuid)) = 0, 'three reports hide the entry from others');
select pg_temp.as_user(pg_temp.uid(10));
select pg_temp.ok((select count(*) from public.challenge_entries_of(md5('test-open-challenge')::uuid) where is_hidden) = 1, 'the author still sees it, marked hidden');
select pg_temp.expect_error($q$select public.admin_hide_challenge_entry((select id from public.challenge_entries where false), false)$q$, 'forbidden', 'only admins restore entries');

-- ---------- Predictions ----------
select pg_temp.as_user(pg_temp.uid(20));
select public.predict_match((select match_id from fx), (select player_a_id from public.matches where id = (select match_id from fx)));
select public.predict_match((select match_id from fx), (select player_b_id from public.matches where id = (select match_id from fx)));
select pg_temp.ok((select for_b from public.tournament_predictions((select tournament_id from public.matches where id = (select match_id from fx))) where match_id = (select match_id from fx)) = 1, 'changing a pick moves it');
select pg_temp.expect_error($q$select public.predict_match((select match_id from fx), pg_temp.uid(9))$q$, 'bad_pick', 'pick one of the two players');
select pg_temp.expect_error($q$select public.predict_match((select done_match from fx), (select player_a_id from public.matches where id = (select done_match from fx)))$q$, 'prediction_closed', 'no pick after the score');
select pg_temp.as_user((select player_a_id from public.matches where id = (select match_id from fx)));
select pg_temp.expect_error($q$select public.predict_match((select match_id from fx), auth.uid())$q$, 'own_match', 'players do not predict their own table');
set role anon;
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) from public.tournament_predictions((select tournament_id from public.matches where id = (select match_id from fx)))) > 0, 'visitors see the crowd split');
select pg_temp.ok((select count(*) from public.match_predictions) = 0, 'raw predictions are private');
select pg_temp.expect_error($q$select public.predict_match((select match_id from fx), pg_temp.uid(1))$q$, '42501', 'visitors cannot predict');

-- ---------- Mentoring ----------
set role authenticated;
select pg_temp.as_user(pg_temp.uid(30));
insert into public.mentor_profiles (user_id, games, availability, area) values (auth.uid(), 'Skirmish games', 'Saturday afternoon', 'Tokyo');
select pg_temp.expect_error($q$insert into public.mentor_profiles (user_id, games, availability, area) values (pg_temp.uid(31), 'x x', 'x x', 'x x')$q$, null, 'no mentor profile for someone else');
select pg_temp.expect_error($q$select public.request_mentor(auth.uid(), 'hi')$q$, 'own_mentor', 'cannot mentor yourself');
select pg_temp.as_user(pg_temp.uid(31));
select public.request_mentor(pg_temp.uid(30), 'First game please');
select pg_temp.expect_error($q$select public.request_mentor(pg_temp.uid(30), 'again')$q$, 'already_mentored', 'one mentor at a time');
select pg_temp.expect_error($q$select public.answer_mentorship((select id from public.my_mentorships() limit 1), true)$q$, 'forbidden', 'the beginner cannot accept for the mentor');
select pg_temp.as_user(pg_temp.uid(30));
select pg_temp.ok((select count(*) from public.notifications where user_id = auth.uid() and kind = 'mentor_request') = 1, 'mentor is notified');
select public.answer_mentorship((select id from public.my_mentorships() limit 1), true);
select public.mark_mentorship_step((select id from public.my_mentorships() limit 1), 'met', true);
select pg_temp.as_user(pg_temp.uid(31));
select public.mark_mentorship_step((select id from public.my_mentorships() limit 1), 'first_paint', true);
select pg_temp.ok((select met_at is not null and first_paint_at is not null and status = 'active' from public.my_mentorships() limit 1), 'both sides tick steps');
select pg_temp.expect_error($q$select public.mark_mentorship_step((select id from public.my_mentorships() limit 1), 'drop_table', true)$q$, 'bad_step', 'unknown step refused');
select pg_temp.as_user(pg_temp.uid(32));
select pg_temp.ok((select count(*) from public.mentorships) = 0, 'others do not see the mentorship');
select pg_temp.expect_error($q$select public.end_mentorship((select id from public.mentorships where false))$q$, 'forbidden', 'others cannot end it');
select pg_temp.ok((select mentees from public.mentors_list() where user_id = pg_temp.uid(30)) = 1, 'mentor list counts guided beginners');

-- ---------- Campaign ----------
select pg_temp.as_user(pg_temp.uid(1));
select pg_temp.expect_error($q$select public.create_league_campaign(md5('demo-league-1')::uuid, 'planet', 12)$q$, 'forbidden', 'only the organiser creates the campaign');
select pg_temp.as_user(pg_temp.uid(0));
select public.create_league_campaign(md5('demo-league-1')::uuid, 'planet', 12);
select pg_temp.ok((select count(*) from public.campaign_territories where league_id = md5('demo-league-1')::uuid) = 12, 'territories created');
select pg_temp.as_user(pg_temp.uid(1));
select pg_temp.ok(public.campaign_conquests_left(md5('demo-league-1')::uuid, auth.uid()) = 2, 'two confirmed league wins = two conquests');
select public.claim_territory(md5('demo-league-1')::uuid, 0);
select public.claim_territory(md5('demo-league-1')::uuid, 1);
select pg_temp.expect_error($q$select public.claim_territory(md5('demo-league-1')::uuid, 2)$q$, 'no_conquest', 'no win left');
select pg_temp.as_user(pg_temp.uid(2));
select public.claim_territory(md5('demo-league-1')::uuid, 0);
select pg_temp.ok((select owner_id from public.campaign_territories where league_id = md5('demo-league-1')::uuid and idx = 0) = pg_temp.uid(2), 'a territory can be taken from a rival');
select pg_temp.ok((select taken_from from public.campaign_events where player_id = pg_temp.uid(2) limit 1) = pg_temp.uid(1), 'the log remembers who lost it');
select pg_temp.as_user(pg_temp.uid(9));
select pg_temp.expect_error($q$select public.claim_territory(md5('demo-league-1')::uuid, 3)$q$, 'not_member', 'outsiders cannot claim');
select pg_temp.expect_error($q$update public.campaign_territories set owner_id = auth.uid()$q$, '42501', 'no direct edits of the map');
select pg_temp.as_user(pg_temp.uid(0));
select public.organiser_set_territory(md5('demo-league-1')::uuid, 0, null);
select pg_temp.ok((select owner_id is null from public.campaign_territories where league_id = md5('demo-league-1')::uuid and idx = 0), 'organiser fixes the map');

-- ---------- Swap board ----------
select pg_temp.as_user(pg_temp.uid(40));
insert into public.swap_posts (user_id, kind, title, city) values (auth.uid(), 'offer', 'Spare shields x10', 'Tokyo');
select pg_temp.expect_error($q$insert into public.swap_posts (user_id, kind, title, city) values (pg_temp.uid(41), 'offer', 'Not mine', 'Tokyo')$q$, null, 'no post in someone else''s name');
select pg_temp.expect_error($q$update public.swap_posts set is_hidden = false where user_id = auth.uid()$q$, '42501', 'authors cannot unhide their posts');
select pg_temp.expect_error($q$insert into public.swap_posts (user_id, kind, title, city, photo_path) values (auth.uid(), 'want', 'Heads', 'Tokyo', 'someone-else/x.jpg')$q$, null, 'photo must be in the author folder');
set role anon;
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) from public.swap_posts where title = 'Spare shields x10') = 1, 'visitors see open posts');
set role authenticated;
select pg_temp.as_user(pg_temp.uid(41)); select public.report_swap((select id from public.swap_posts where title = 'Spare shields x10'), 'scam');
select public.report_swap((select id from public.swap_posts where title = 'Spare shields x10'), 'scam again');
select pg_temp.as_user(pg_temp.uid(42)); select public.report_swap((select id from public.swap_posts where title = 'Spare shields x10'), 'scam');
select pg_temp.ok((select count(*) from public.swap_posts where title = 'Spare shields x10') = 1, 'two reporters do not hide yet (the same one twice counts once)');
select pg_temp.as_user(pg_temp.uid(43)); select public.report_swap((select id from public.swap_posts where title = 'Spare shields x10'), 'scam');
select pg_temp.ok((select count(*) from public.swap_posts where title = 'Spare shields x10') = 0, 'three reporters hide the post');
select pg_temp.as_user(pg_temp.uid(40));
select pg_temp.ok((select is_hidden from public.swap_posts where title = 'Spare shields x10'), 'the author sees it hidden');
select pg_temp.expect_error($q$select public.admin_hide_swap((select id from public.swap_posts where title = 'Spare shields x10'), false)$q$, 'forbidden', 'only admins restore posts');

-- ---------- Stats ----------
select pg_temp.as_user(pg_temp.uid(1));
select pg_temp.ok((public.my_hobby_stats() ->> 'wins')::int >= 2, 'stats count league wins');
select pg_temp.ok((public.my_hobby_stats(1990) ->> 'games')::int = 0, 'stats can be limited to a year');
set role anon;
select pg_temp.as_user(null);
select pg_temp.expect_error($q$select public.my_hobby_stats()$q$, '42501', 'stats need an account');
reset role;
