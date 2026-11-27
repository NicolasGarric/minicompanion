-- Tests for migration 29: Companies (card, joining, roles, handover, chat, calendar, moderation, account deletion).
create or replace function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
$$;
create or replace function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;
create or replace function pg_temp.cu(n int) returns uuid language sql as $$ select md5('company-user-' || n)::uuid $$;
create or replace function pg_temp.co(s text) returns uuid language sql as $$ select id from public.companies where slug = s $$;
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

-- Six fresh players: 1 founds, 2 and 3 join, 4 is invited, 5 is a stranger, 6 an admin.
reset role;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', md5('company-user-' || n)::uuid, 'authenticated', 'authenticated',
       format('company%s@demo.example', n), '', now(), '{"provider": "email"}', jsonb_build_object('display_name', 'Company player ' || n),
       now(), now(), '', '', '', '', '', '', '', ''
  from generate_series(1, 6) n;
update public.profiles set handle = 'company_p' || substr(display_name, 16) where id in (select md5('company-user-' || n)::uuid from generate_series(1, 6) n);
update public.profiles set is_admin = true where id = md5('company-user-6')::uuid;
set role authenticated;

-- ---------- Card ----------
select pg_temp.as_user(null);
select pg_temp.expect_error($q$select public.create_company('{"name": "Nope"}')$q$, 'not_authenticated', 'a visitor creates no Company');
select pg_temp.as_user(pg_temp.cu(1));
select pg_temp.expect_error($q$select public.create_company('{"name": " x "}')$q$, 'bad_name', 'a name needs 2 characters');
select pg_temp.ok(public.create_company(jsonb_build_object(
  'name', 'Brush & Dice Club', 'motto', 'Paint, play, repeat', 'city', 'Lyon', 'country', 'FR', 'languages', '["fr", "en", "xx"]'::jsonb,
  'games', 'Skirmish, big battles', 'crest', '{"shape": 9, "symbol": 3, "inks": [1, 7, "a"]}'::jsonb, 'join_open', true)) = 'brush-dice-club',
  'any player creates a Company; the slug follows the name');
select pg_temp.ok((select languages = '{en,fr}' and crest = '{"shape": 5, "division": 0, "pattern": 0, "symbol": 3, "inks": [1, 5, 2]}'::jsonb
                     and member_limit = 50 and limit_ceiling = 50 and is_public and join_open
                     from public.companies where slug = 'brush-dice-club'), 'languages and crest are cleaned, limit 50 by default');
select pg_temp.ok((select role = 'leader' and is_main from public.company_members where user_id = pg_temp.cu(1)), 'the founder leads; it is their main Company');
select pg_temp.ok(public.create_company('{"name": "Brush & Dice Club"}') like 'brush-dice-club-%', 'a taken slug gets a tail');
select pg_temp.ok(public.create_company('{"name": "筆と賽", "is_public": false}') like 'company%', 'a name without Latin letters still gets a slug');
select pg_temp.expect_error($q$select public.create_company('{"name": "Fourth"}')$q$, 'rate_limited', 'three Companies a day at most');
select pg_temp.expect_error($q$insert into public.companies (slug, name) values ('direct', 'Direct')$q$, '42501', 'no direct write of Companies');
select pg_temp.expect_error($q$update public.companies set limit_ceiling = 500$q$, '42501', 'no direct write of the ceiling');
select pg_temp.expect_error($q$select public.update_company(pg_temp.co('brush-dice-club'), '{"member_limit": 80}')$q$, 'bad_limit', 'the leader cannot pass the ceiling');
select public.update_company(pg_temp.co('brush-dice-club'), '{"member_limit": 3, "motto": "Paint together"}');
select pg_temp.ok((select member_limit = 3 and motto = 'Paint together' from public.companies where slug = 'brush-dice-club'), 'the leader lowers the limit and edits the card');

-- ---------- Joining ----------
select pg_temp.as_user(pg_temp.cu(2));
select public.join_company(pg_temp.co('brush-dice-club'));
select pg_temp.ok((select role = 'recruit' and is_main from public.company_members where user_id = pg_temp.cu(2) and company_id = pg_temp.co('brush-dice-club')),
                  'open joining: a newcomer is a recruit, main Company when they have none');
select pg_temp.expect_error($q$select public.join_company(pg_temp.co('brush-dice-club'))$q$, 'already_member', 'joined once');
select pg_temp.expect_error($q$select public.join_company((select id from public.companies where name = '筆と賽'))$q$, 'not_open', 'a closed Company cannot be joined freely');
select pg_temp.expect_error($q$select public.reset_company_link(pg_temp.co('brush-dice-club'))$q$, 'forbidden', 'a recruit makes no link');

select pg_temp.as_user(pg_temp.cu(1));
create temp table tok as select public.reset_company_link(pg_temp.co('brush-dice-club'), 7) as t;
select pg_temp.ok((select count(*) = 1 from public.company_links where expires_at > now() + interval '6 days'), 'the leader makes a 7-day link');
select pg_temp.as_user(pg_temp.cu(2));
select pg_temp.ok(not exists (select 1 from public.company_links), 'a recruit cannot read the link');
select pg_temp.as_user(pg_temp.cu(3));
select pg_temp.ok((select name = 'Brush & Dice Club' and members = 2 from public.company_link_preview((select t from tok))), 'the link shows the Company before joining');
select pg_temp.expect_error($q$select public.join_company_by_link('wrong')$q$, 'bad_link', 'a wrong link joins nothing');
select pg_temp.ok(public.join_company_by_link((select t from tok)) = 'brush-dice-club', 'the link joins the Company');
select pg_temp.as_user(pg_temp.cu(1));
select public.reset_company_link(pg_temp.co('brush-dice-club'));
select pg_temp.as_user(pg_temp.cu(5));
select pg_temp.expect_error($q$select public.join_company_by_link((select t from tok))$q$, 'bad_link', 'a new link revokes the old one');
select pg_temp.expect_error($q$select public.join_company(pg_temp.co('brush-dice-club'))$q$, 'company_full', 'the member limit holds');

select pg_temp.as_user(pg_temp.cu(1));
select public.update_company(pg_temp.co('brush-dice-club'), '{"member_limit": 10}');
select pg_temp.expect_error($q$select public.invite_to_company(pg_temp.co('brush-dice-club'), 'nobody_here')$q$, 'no_player', 'an unknown handle is refused');
select public.invite_to_company(pg_temp.co('brush-dice-club'), '@Company_p4');
select pg_temp.as_user(pg_temp.cu(4));
select pg_temp.ok((select count(*) = 1 from public.notifications where user_id = pg_temp.cu(4) and kind = 'company_invite' and payload ->> 'company_slug' = 'brush-dice-club'),
                  'the invited player is told');
select pg_temp.ok((select count(*) = 1 from public.my_company_invites()), 'they see their invitation');
select pg_temp.as_user(pg_temp.cu(5));
select pg_temp.ok(not exists (select 1 from public.company_invites), 'others do not see it');
select pg_temp.expect_error($q$select public.answer_company_invite(pg_temp.co('brush-dice-club'), true)$q$, 'no_invite', 'no invitation, no entry');
select pg_temp.as_user(pg_temp.cu(4));
select public.answer_company_invite(pg_temp.co('brush-dice-club'), true);
select pg_temp.ok(public.company_role_of(pg_temp.co('brush-dice-club')) = 'recruit' and not exists (select 1 from public.company_invites),
                  'accepting joins and clears the invitation');

-- ---------- Roles ----------
select pg_temp.as_user(pg_temp.cu(2));
select pg_temp.expect_error($q$select public.set_company_role(pg_temp.co('brush-dice-club'), pg_temp.cu(3), 'member')$q$, 'forbidden', 'a recruit promotes nobody');
select pg_temp.expect_error($q$select public.update_company(pg_temp.co('brush-dice-club'), '{"motto": "x"}')$q$, 'forbidden', 'a recruit edits nothing');
select pg_temp.as_user(pg_temp.cu(1));
select public.set_company_role(pg_temp.co('brush-dice-club'), pg_temp.cu(2), 'officer');
select pg_temp.as_user(pg_temp.cu(2));
select pg_temp.ok((select count(*) = 1 from public.notifications where user_id = pg_temp.cu(2) and kind = 'company_role' and payload ->> 'role' = 'officer'), 'the new officer is told');
select public.set_company_role(pg_temp.co('brush-dice-club'), pg_temp.cu(3), 'member');
select pg_temp.expect_error($q$select public.set_company_role(pg_temp.co('brush-dice-club'), pg_temp.cu(3), 'officer')$q$, 'forbidden', 'an officer names no officer');
select pg_temp.expect_error($q$select public.update_company(pg_temp.co('brush-dice-club'), '{"is_public": false}')$q$, 'not_leader', 'an officer changes no setting');
select public.update_company(pg_temp.co('brush-dice-club'), '{"description": "Thursday nights"}');
select pg_temp.ok((select description = 'Thursday nights' from public.companies where slug = 'brush-dice-club'), 'an officer edits the card');
select pg_temp.expect_error($q$select public.remove_company_member(pg_temp.co('brush-dice-club'), pg_temp.cu(1))$q$, 'forbidden', 'an officer cannot remove the leader');
select pg_temp.expect_error($q$update public.company_members set role = 'leader' where user_id = auth.uid()$q$, '42501', 'no direct write of roles');

-- Main Company
select pg_temp.as_user(pg_temp.cu(1));
select public.set_main_company((select id from public.companies where name = '筆と賽'));
select pg_temp.ok((select company_id = (select id from public.companies where name = '筆と賽') from public.company_members where user_id = pg_temp.cu(1) and is_main),
                  'one main Company, chosen by the player');

-- ---------- Visibility ----------
select pg_temp.as_user(pg_temp.cu(5));
select pg_temp.ok((select count(*) = 4 from public.company_members where company_id = pg_temp.co('brush-dice-club')), 'a public Company shows its members');
select pg_temp.ok((select count(*) = 0 from public.company_members where company_id = (select id from public.companies where name = '筆と賽')),
                  'a private Company hides its members');
select pg_temp.ok((select (public.company_page(slug) ->> 'can_see')::boolean = false and public.company_page(slug) -> 'members' = 'null'::jsonb
                     from public.companies where name = '筆と賽'), 'its page shows the card only');
select pg_temp.ok((select count(*) >= 2 from public.search_companies('brush')), 'Companies can be searched');
select pg_temp.ok((select count(*) = 2 from public.player_companies(pg_temp.cu(1))), 'a player page shows only the Companies the viewer may see');
select pg_temp.as_user(null);
select pg_temp.ok((public.company_page('brush-dice-club') ->> 'members_count')::int = 4, 'visitors read a public page');

-- ---------- Chat ----------
select pg_temp.as_user(pg_temp.cu(5));
select pg_temp.expect_error($q$select public.post_company_message(pg_temp.co('brush-dice-club'), 'hello')$q$, 'not_member', 'strangers do not post');
select pg_temp.as_user(pg_temp.cu(3));
select pg_temp.ok(public.post_company_message(pg_temp.co('brush-dice-club'), ' Who paints tonight? ') is not null, 'a member posts');
select pg_temp.expect_error($q$select public.post_company_message(pg_temp.co('brush-dice-club'), 'Big news', true)$q$, 'forbidden', 'members make no announcement');
select pg_temp.expect_error($q$insert into public.company_messages (company_id, sender_id, body) values (pg_temp.co('brush-dice-club'), auth.uid(), 'x')$q$,
                            '42501', 'no direct write of messages');
select pg_temp.as_user(pg_temp.cu(2));
select public.post_company_message(pg_temp.co('brush-dice-club'), 'Tournament on Saturday', true);
select pg_temp.as_user(pg_temp.cu(4));
select pg_temp.ok((select count(*) = 1 from public.notifications where user_id = pg_temp.cu(4) and kind = 'company_announcement'), 'an announcement is notified to members');
select pg_temp.ok((select count(*) = 2 from public.company_messages where company_id = pg_temp.co('brush-dice-club')), 'members read the chat');
select pg_temp.as_user(pg_temp.cu(5));
select pg_temp.ok((select count(*) = 0 from public.company_messages), 'strangers read no chat, even of a public Company');
select pg_temp.as_user(pg_temp.cu(4));
select pg_temp.expect_error($q$select public.delete_company_message((select id from public.company_messages where body = 'Who paints tonight?'))$q$, 'forbidden',
                            'a recruit deletes only their own messages');
select pg_temp.as_user(pg_temp.cu(2));
select public.pin_company_message((select id from public.company_messages where body = 'Who paints tonight?'), true);
select pg_temp.ok((select is_announcement from public.company_messages where body = 'Who paints tonight?'), 'officers pin a message');

-- Reports: three members hide a message
select pg_temp.as_user(pg_temp.cu(1));
select public.report_company_content('company_message', (select id from public.company_messages where body = 'Who paints tonight?'), 'spam');
select pg_temp.as_user(pg_temp.cu(2));
select public.report_company_content('company_message', (select id from public.company_messages where body = 'Who paints tonight?'), 'spam');
select pg_temp.as_user(pg_temp.cu(4));
select public.report_company_content('company_message', (select id from public.company_messages where body = 'Who paints tonight?'), 'spam');
select pg_temp.ok((select count(*) = 1 from public.company_messages), 'three reports hide a message from the recruits');
select pg_temp.as_user(pg_temp.cu(3));
select pg_temp.ok((select count(*) = 2 from public.company_messages), 'its author still sees it');

-- ---------- Calendar ----------
select pg_temp.expect_error(format($q$select public.save_company_event(pg_temp.co('brush-dice-club'), null, %L)$q$,
                            jsonb_build_object('title', 'Paint night', 'starts_at', now() + interval '2 days')), 'forbidden', 'members do not create events');
select pg_temp.as_user(pg_temp.cu(2));
select pg_temp.expect_error(format($q$select public.save_company_event(pg_temp.co('brush-dice-club'), null, %L)$q$,
                            jsonb_build_object('title', 'Paint night', 'starts_at', now() - interval '2 days')), 'starts_in_past', 'no event in the past');
select pg_temp.expect_error(format($q$select public.save_company_event(pg_temp.co('brush-dice-club'), null, %L)$q$,
                            jsonb_build_object('title', 'Paint night', 'starts_at', now() + interval '2 days', 'ends_at', now() + interval '1 day')), 'bad_dates', 'it ends after it starts');
select public.save_company_event(pg_temp.co('brush-dice-club'), null,
  jsonb_build_object('title', 'Paint night', 'starts_at', now() + interval '2 days', 'place', 'Back room', 'details', 'Bring brushes'));
select pg_temp.as_user(pg_temp.cu(3));
select pg_temp.ok((select count(*) = 1 from public.notifications where user_id = pg_temp.cu(3) and kind = 'company_event' and payload ->> 'game' = 'Paint night'), 'members hear about a new event');
select public.answer_company_event((select id from public.company_events where title = 'Paint night'), 'yes');
select pg_temp.as_user(pg_temp.cu(4));
select public.answer_company_event((select id from public.company_events where title = 'Paint night'), 'maybe');
select pg_temp.ok((select yes = 1 and maybe = 1 and my_answer = 'maybe' and going = array['Company player 3'] from public.company_calendar(pg_temp.co('brush-dice-club'))),
                  'the calendar counts who comes');
select pg_temp.as_user(pg_temp.cu(5));
select pg_temp.ok((select count(*) = 0 from public.company_events) and (select count(*) = 0 from public.company_calendar(pg_temp.co('brush-dice-club'))), 'strangers see no calendar');
select pg_temp.expect_error($q$select public.answer_company_event((select id from public.company_events limit 1), 'yes')$q$, 'not_member', 'strangers do not answer');

-- ---------- Handover ----------
select pg_temp.as_user(pg_temp.cu(1));
select public.leave_company(pg_temp.co('brush-dice-club'));
select pg_temp.ok((select role = 'leader' from public.company_members where company_id = pg_temp.co('brush-dice-club') and user_id = pg_temp.cu(2)),
                  'a leaving leader hands over to the oldest officer');
select pg_temp.as_user(pg_temp.cu(2));
select pg_temp.ok((select count(*) = 1 from public.notifications where user_id = pg_temp.cu(2) and kind = 'company_leader'), 'the new leader is told');
select public.set_company_role(pg_temp.co('brush-dice-club'), pg_temp.cu(3), 'leader');
select pg_temp.ok((select string_agg(role::text, ',' order by user_id) from public.company_members
                    where company_id = pg_temp.co('brush-dice-club') and user_id in (pg_temp.cu(2), pg_temp.cu(3)))
                  in ('officer,leader', 'leader,officer'), 'the leader hands over and becomes an officer');
select public.remove_company_member(pg_temp.co('brush-dice-club'), pg_temp.cu(4));
select pg_temp.as_user(pg_temp.cu(3));
select public.remove_company_member(pg_temp.co('brush-dice-club'), pg_temp.cu(2));
select pg_temp.ok((select count(*) = 1 from public.company_members where company_id = pg_temp.co('brush-dice-club')), 'the leader removes an officer');
select pg_temp.as_user(pg_temp.cu(2));
select pg_temp.ok((select count(*) = 1 from public.notifications where user_id = pg_temp.cu(2) and kind = 'company_removed'), 'a removed player is told');
select pg_temp.as_user(pg_temp.cu(3));
select public.leave_company(pg_temp.co('brush-dice-club'));
select pg_temp.ok(pg_temp.co('brush-dice-club') is null, 'an empty Company is dissolved');

-- ---------- Moderation ----------
reset role;
update public.companies set created_at = now() - interval '2 days' where created_by = md5('company-user-1')::uuid;
set role authenticated;
select pg_temp.as_user(pg_temp.cu(1));
create temp table c2 as select pg_temp.co(public.create_company('{"name": "Spam Squad"}')) as id;
select pg_temp.as_user(pg_temp.cu(2));
select public.report_company_content('company', (select id from c2), 'spam');
select pg_temp.as_user(pg_temp.cu(3));
select public.report_company_content('company', (select id from c2), 'spam');
select pg_temp.as_user(pg_temp.cu(4));
select public.report_company_content('company', (select id from c2), 'spam');
select pg_temp.as_user(pg_temp.cu(5));
select pg_temp.ok(not exists (select 1 from public.companies where id = (select id from c2)), 'three reports hide a Company');
select pg_temp.ok(not exists (select 1 from public.search_companies('spam')), 'a hidden Company leaves the search');
select pg_temp.as_user(pg_temp.cu(1));
select pg_temp.ok(exists (select 1 from public.companies where id = (select id from c2)), 'its members still see it');
select pg_temp.expect_error($q$select public.admin_set_company_ceiling((select id from c2), 200)$q$, 'forbidden', 'only an admin raises the ceiling');
select pg_temp.as_user(pg_temp.cu(6));
select pg_temp.ok(exists (select 1 from public.admin_reports() where target_type = 'company' and target_label = 'Spam Squad'), 'admins see the reports with the name');
select public.admin_moderate('company', (select id::text from c2), false);
select public.admin_set_company_ceiling((select id from c2), 200);
select pg_temp.ok((select not is_hidden and limit_ceiling = 200 from public.companies where id = (select id from c2)), 'an admin restores it and raises the ceiling');
select pg_temp.ok(exists (select 1 from public.admin_content('company') where label like 'Spam Squad (1 / 200)'), 'admins list the Companies');
select pg_temp.as_user(pg_temp.cu(1));
select public.update_company((select id from c2), '{"member_limit": 120}');
select pg_temp.ok((select member_limit = 120 from public.companies where id = (select id from c2)), 'the leader uses the raised ceiling');

-- ---------- Dissolution and account deletion ----------
select public.update_company((select id from c2), '{"join_open": true}');
select pg_temp.as_user(pg_temp.cu(5));
select public.join_company((select id from c2));
select pg_temp.ok((select is_main from public.company_members where user_id = pg_temp.cu(5)), 'joined (main Company)');
select pg_temp.as_user(pg_temp.cu(1));
select public.post_company_message((select id from c2), 'Welcome!');
reset role;
update auth.users set last_sign_in_at = now() where id = pg_temp.cu(1);
set role authenticated;
select public.delete_my_account();
select pg_temp.as_user(pg_temp.cu(5));
select pg_temp.ok((select role = 'leader' from public.company_members where user_id = pg_temp.cu(5) and company_id = (select id from c2)),
                  'deleting the leader account hands the Company over');
select pg_temp.ok((select p.display_name = 'Deleted player' from public.company_messages m join public.profiles p on p.id = m.sender_id where m.body = 'Welcome!'),
                  'their messages stay, anonymised');
select pg_temp.ok(not exists (select 1 from public.company_members where user_id = pg_temp.cu(1)), 'their memberships are gone');
select public.dissolve_company((select id from c2));
select pg_temp.ok(not exists (select 1 from public.companies where id = (select id from c2)), 'the leader dissolves the Company');
reset role;
