-- Tests for translation suggestions: anyone can send (rate limited), only admins read and triage.
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
update public.profiles set is_admin = true where id = pg_temp.uid(47);

set role anon;
select pg_temp.as_user(null);
select public.suggest_translation('ja', 'ウォッシュ', array['term.wash'], 'シェーディング', null, '/ja/paint');
select pg_temp.expect_error($q$select * from public.translation_suggestions$q$, '42501', 'visitors cannot read suggestions');
select pg_temp.expect_error($q$select public.suggest_translation('fr', 'Lavis', '{}', 'Lavis', null, '/fr')$q$, 'same_text', 'a suggestion must change the text');

set role authenticated;
select pg_temp.as_user(pg_temp.uid(30));
select public.suggest_translation('fr', 'Brossage à sec', array['term.drybrush'], 'Brossage à sec (drybrush)', 'Les joueurs disent drybrush', '/fr/paint')
  from generate_series(1, 10);
select pg_temp.expect_error($q$select public.suggest_translation('fr', 'x', '{}', 'y', null, '/')$q$, 'rate_limited', '10 suggestions per hour per account');
select pg_temp.expect_error($q$select * from public.admin_translation_suggestions('new')$q$, 'forbidden', 'players cannot read the queue');
select pg_temp.expect_error($q$select public.admin_set_translation_suggestion(gen_random_uuid(), 'done')$q$, 'forbidden', 'players cannot triage');

select pg_temp.as_user(pg_temp.uid(47));
select pg_temp.ok((select count(*) from public.admin_translation_suggestions('new')) = 11, 'admins read new suggestions');
select pg_temp.ok((select keys = array['term.wash'] and author_handle is null from public.admin_translation_suggestions('') where lang = 'ja'), 'keys kept, visitors stay anonymous');
select public.admin_set_translation_suggestion((select id from public.admin_translation_suggestions('') where lang = 'ja'), 'accepted');
select pg_temp.ok((select count(*) from public.admin_translation_suggestions('accepted')) = 1, 'status changes');
select pg_temp.expect_error($q$select public.admin_set_translation_suggestion(gen_random_uuid(), 'maybe')$q$, 'bad_status', 'unknown status refused');

reset role;
select 'translation tests passed';
