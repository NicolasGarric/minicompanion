-- Tests for the painting contest. Run after migrations and seeds.
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
create temporary table cat as
  select c.id from public.contest_categories c join public.tournaments t on t.id = c.tournament_id
   where t.slug = 'kanda-paint-off-autumn' and c.kind = 'single';
grant select on cat to anon, authenticated;

-- Finished contest: results and podium are public
set role anon;
select pg_temp.as_user(null);
select pg_temp.ok((select title from public.contest_results(md5('demo-summer-single')::uuid) where public_rank = 1) = 'Crimson Warden', 'public vote winner');
select pg_temp.ok((select title from public.contest_results(md5('demo-summer-single')::uuid) where jury_rank = 1) = 'Royal Guard', 'jury winner');
select pg_temp.ok((select count(*) from public.contest_entries_of(md5('demo-summer-single')::uuid) where author_name is not null) = 6, 'authors are shown once closed');

-- Open contest: blind vote
select pg_temp.ok((select count(*) from public.contest_entries_of((select id from cat))) = 4, 'anon sees the open entries');
select pg_temp.ok((select count(*) from public.contest_entries_of((select id from cat)) where author_name is not null or votes is not null) = 0, 'but no author and no count while open');
select pg_temp.ok((select count(*) from public.contest_results((select id from cat))) = 0, 'no results while open');
select pg_temp.ok((select count(*) from public.contest_votes) = 0, 'raw votes are private');

set role authenticated;
select pg_temp.as_user(pg_temp.uid(3));
select pg_temp.ok((select count(*) from public.contest_entries_of((select id from cat)) where is_mine and author_name is not null) = 1, 'authors see their own entry');
select pg_temp.expect_error($q$select public.cast_contest_vote(md5('demo-autumn-entry-1')::uuid)$q$, 'own_entry', 'no vote for your own entry');
select public.cast_contest_vote(md5('demo-autumn-entry-2')::uuid);
select public.cast_contest_vote(md5('demo-autumn-entry-3')::uuid);
select pg_temp.ok((select count(*) from public.contest_votes where voter_id = pg_temp.uid(3)) = 1, 'voting again moves the vote');
select pg_temp.ok((select my_vote from public.contest_entries_of((select id from cat)) where id = md5('demo-autumn-entry-3')::uuid), 'my vote is shown');
select pg_temp.expect_error($q$select public.cast_contest_vote(md5('demo-entry-1')::uuid)$q$, 'contest_closed', 'no vote after closing');
select pg_temp.expect_error(format($q$select public.submit_contest_entry('%s', 'x', array['other/x.jpg'], true)$q$, (select id from cat)), 'bad_photos', 'photos must be in the category folder');
select pg_temp.expect_error(format($q$select public.submit_contest_entry('%s', 'x', array['%s/x.jpg'], false)$q$, (select id from cat), (select id from cat)), 'rights_required', 'rights must be confirmed');
select pg_temp.as_user(pg_temp.uid(30));
select pg_temp.ok(public.submit_contest_entry((select id from cat), 'New entry', array[(select id from cat) || '/a.jpg'], true) is not null, 'a player enters');
select pg_temp.expect_error($q$select public.submit_contest_entry(md5('demo-summer-single')::uuid, 'Late', array[md5('demo-summer-single')::uuid || '/a.jpg'], true)$q$, 'contest_closed', 'no entry after closing');

-- Organiser: preview and moderation
select pg_temp.as_user(pg_temp.uid(0));
select pg_temp.ok((select count(*) from public.contest_results((select id from cat))) = 5, 'organiser previews the results');
update public.contest_entries set is_hidden = true where id = md5('demo-autumn-entry-4')::uuid;
select pg_temp.as_user(pg_temp.uid(31));
select pg_temp.ok((select count(*) from public.contest_entries_of((select id from cat))) = 4, 'hidden entries disappear');
select pg_temp.expect_error($q$select public.cast_contest_vote(md5('demo-autumn-entry-4')::uuid)$q$, 'no_entry', 'and cannot get votes');

-- Jury
select pg_temp.as_user(pg_temp.uid(41));
select pg_temp.ok(public.is_juror(md5('demo-summer-single')::uuid), 'jurors are recognised');
select pg_temp.as_user(pg_temp.uid(43));
select pg_temp.expect_error($q$insert into public.jury_scores (entry_id, juror_id, technique, composition, originality) values (md5('demo-entry-1')::uuid, auth.uid(), 10, 10, 10)$q$, '42501', 'non-jurors cannot score');
reset role;
select 'contest tests passed';
