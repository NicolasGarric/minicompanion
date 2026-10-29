-- Tests for migration 24: "Suggest improvements" from the footer, admin inbox and answers.
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

-- 23 suggests, 24 is an admin for this test, 26 is another player.
reset role;
update public.profiles set is_admin = true where id = pg_temp.uid(24);
create temporary table fx (mine uuid, visitor uuid);
grant all on fx to anon, authenticated;
insert into fx default values;

set role authenticated;
select pg_temp.as_user(pg_temp.uid(23));
update fx set mine = public.submit_suggestion('feature', 'Un mode tournoi par équipes', '/play', 'fr', 'me@example.com');
select pg_temp.expect_error($q$select public.submit_suggestion('nope', 'Un texte assez long', null, 'fr', null)$q$, 'bad_topic', 'the topic is one of the list');
select pg_temp.expect_error($q$select public.submit_suggestion('other', 'abc', null, 'fr', null)$q$, '23514', 'a suggestion needs a few words');
select pg_temp.ok((select count(*) from public.suggestions) = 0, 'players do not read the suggestions');
select pg_temp.expect_error($q$insert into public.suggestions (topic, message) values ('other', 'Direct insert')$q$, '42501', 'suggestions are sent through the function only');

set role anon;
select pg_temp.as_user(null);
update fx set visitor = public.submit_suggestion('content', 'Plus de scénarios désert', '/play/campaigns', 'fr', 'visitor@example.com');

reset role;
select pg_temp.ok((select contact is null and user_id = pg_temp.uid(23) and lang = 'fr' from public.suggestions where id = (select mine from fx)),
  'a signed-in author is known, no email kept');
select pg_temp.ok((select contact = 'visitor@example.com' and user_id is null from public.suggestions where id = (select visitor from fx)), 'a visitor can leave an email');
select pg_temp.ok((select count(*) from public.notifications where user_id = pg_temp.uid(24) and kind = 'suggestion' and read_at is null) = 1,
  'admins get one unread notification, not one per suggestion');

set role authenticated;
select pg_temp.as_user(pg_temp.uid(26));
select pg_temp.expect_error($q$select public.answer_suggestion((select mine from fx), 'Merci !')$q$, 'forbidden', 'only admins answer');
update public.suggestions set status = 'done';

select pg_temp.as_user(pg_temp.uid(24));
select pg_temp.ok((select count(*) from public.suggestions where id in ((select mine from fx), (select visitor from fx))) = 2, 'admins read every suggestion');
select pg_temp.ok((select status = 'new' from public.suggestions where id = (select mine from fx)), 'players could not change the status');
select public.answer_suggestion((select mine from fx), 'Merci, c''est prévu !');
select pg_temp.expect_error($q$select public.answer_suggestion((select visitor from fx), 'Merci')$q$, 'no_author', 'a visitor gets no in-app answer');
select pg_temp.ok((select status = 'seen' and answered_at is not null from public.suggestions where id = (select mine from fx)), 'answering marks it seen');
update public.suggestions set status = 'planned' where id = (select mine from fx);
select pg_temp.ok((select status = 'planned' from public.suggestions where id = (select mine from fx)), 'admins set the status');

select pg_temp.as_user(pg_temp.uid(23));
select pg_temp.ok((select count(*) from public.direct_messages where sender_id = pg_temp.uid(24) and recipient_id = pg_temp.uid(23)) = 1, 'the author receives the answer as a message');
reset role;
select pg_temp.ok((select count(*) from public.notifications where user_id = pg_temp.uid(23) and kind = 'message') >= 1, 'with the usual message notification');
set role authenticated;
select pg_temp.as_user(pg_temp.uid(23));
insert into public.direct_messages (sender_id, recipient_id, body) values (pg_temp.uid(23), pg_temp.uid(24), 'Super, merci');
select pg_temp.ok(true, 'the author can reply in Messages');

reset role;
update public.profiles set is_admin = false where id = pg_temp.uid(24);
