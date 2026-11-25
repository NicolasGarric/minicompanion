-- Tests for migration 28: storage ceilings, revoked rights, account deletion.
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

-- ---------- 1. Storage ----------
reset role;
delete from storage.objects where owner in (pg_temp.uid(40), pg_temp.uid(41));
set role authenticated;
select pg_temp.as_user(pg_temp.uid(40));
select pg_temp.expect_error($q$insert into storage.objects (bucket_id, name, owner) values ('pile', auth.uid() || '/a/x.t.webp', auth.uid())$q$,
                            '42501', 'pile: a thumbnail without its full image is refused');
insert into storage.objects (bucket_id, name, owner) values ('pile', auth.uid() || '/a/x.w.webp', auth.uid());
insert into storage.objects (bucket_id, name, owner) values ('pile', auth.uid() || '/a/x.t.webp', auth.uid());
select pg_temp.ok((select count(*) = 2 from storage.objects where owner = auth.uid()), 'pile: a photo and its thumbnail are accepted and readable by their owner');
delete from storage.objects where bucket_id = 'pile' and name = auth.uid() || '/a/x.t.webp';
select pg_temp.ok((select count(*) = 1 from public.my_files()), 'pile: the owner can delete a file, my_files lists the rest');
insert into storage.objects (bucket_id, name, owner) select 'bug-reports', auth.uid() || '/s' || i || '.webp', auth.uid() from generate_series(1, 59) i;
insert into storage.objects (bucket_id, name, owner) values ('bug-reports', auth.uid() || '/s60.webp', auth.uid());
select pg_temp.expect_error($q$insert into storage.objects (bucket_id, name, owner) values ('bug-reports', auth.uid() || '/s61.webp', auth.uid())$q$,
                            '42501', 'bug screenshots: 60 per player');
select pg_temp.as_user(pg_temp.uid(41));
select pg_temp.ok((select count(*) = 0 from storage.objects where owner = pg_temp.uid(40) and bucket_id in ('pile', 'bug-reports')), 'files of others stay out of the list');
delete from storage.objects where owner = pg_temp.uid(40);
reset role;
select pg_temp.ok((select count(*) = 61 from storage.objects where owner = pg_temp.uid(40)), 'files of others cannot be deleted');
update storage.objects set metadata = jsonb_build_object('size', 160 * 1024 * 1024) where owner = pg_temp.uid(40) and bucket_id = 'pile';
set role authenticated;
select pg_temp.as_user(pg_temp.uid(40));
select pg_temp.expect_error($q$insert into storage.objects (bucket_id, name, owner) values ('pile', auth.uid() || '/a/y.w.webp', auth.uid())$q$,
                            '42501', 'every bucket: 150 MB per player');
reset role;
delete from storage.objects where owner = pg_temp.uid(40);

-- ---------- 2. Rights ----------
select pg_temp.ok((select count(*) = 0 from information_schema.role_table_grants
                    where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')),
                  'no TRUNCATE, TRIGGER or REFERENCES left');
select pg_temp.ok((select count(*) = 0 from information_schema.role_table_grants
                    where table_schema = 'public' and grantee = 'anon' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')), 'visitors write to no table');
select pg_temp.ok(not has_function_privilege('anon', 'public.tournament_players(uuid)', 'execute')
              and not has_function_privilege('authenticated', 'public.tournament_players(uuid)', 'execute'), 'tournament_players is internal');
select pg_temp.ok(not has_function_privilege('anon', 'public.delete_my_account()', 'execute')
              and not has_function_privilege('anon', 'public.my_files()', 'execute'), 'visitors cannot call the account functions');

-- ---------- 3. Account deletion ----------
-- A host (42) with a played game against 43, an upcoming one, and content everywhere
insert into public.games (id, host_id, game_system, starts_at, duration_minutes, max_players, players_count, level, language, country, city, area, note)
values (md5('del-past')::uuid, pg_temp.uid(42), 'Deletion Game', now() - interval '3 days', 120, 2, 2, 'casual', 'en', 'JP', 'Tokyo', 'Home', 'my note'),
       (md5('del-next')::uuid, pg_temp.uid(42), 'Deletion Game', now() + interval '3 days', 120, 2, 2, 'casual', 'en', 'JP', 'Tokyo', null, null),
       (md5('del-other')::uuid, pg_temp.uid(43), 'Deletion Game', now() + interval '3 days', 120, 2, 2, 'casual', 'en', 'JP', 'Tokyo', null, null);
insert into public.game_players (game_id, player_id, status)
select md5(g)::uuid, u, 'accepted' from unnest(array['del-past', 'del-next', 'del-other']) g, unnest(array[pg_temp.uid(42), pg_temp.uid(43)]) u
on conflict do nothing;
insert into public.game_private (game_id, address) values (md5('del-past')::uuid, '1 Secret street') on conflict (game_id) do update set address = excluded.address;
insert into public.game_reports (game_id, reported_by, summary, photos, status, confirmed_at)
values (md5('del-past')::uuid, pg_temp.uid(42), 'my words', '{}', 'confirmed', now());
insert into public.game_results (game_id, player_id, placement, agreed) values (md5('del-past')::uuid, pg_temp.uid(42), 1, true), (md5('del-past')::uuid, pg_temp.uid(43), 2, true);
insert into public.leagues (id, organiser_id, name, game_system, starts_on, ends_on)
values (md5('del-league')::uuid, pg_temp.uid(42), 'Deletion league', 'Deletion Game', current_date, current_date + 30);
insert into public.league_members (league_id, player_id) values (md5('del-league')::uuid, pg_temp.uid(42)), (md5('del-league')::uuid, pg_temp.uid(43)) on conflict do nothing;
insert into public.direct_messages (sender_id, recipient_id, body) values (pg_temp.uid(42), pg_temp.uid(43), 'hello'), (pg_temp.uid(43), pg_temp.uid(42), 'hi');
update auth.users set last_sign_in_at = now() - interval '1 day' where id = pg_temp.uid(42);
create temp table before_del as select email, (select display_name from public.profiles p where p.id = u.id) as name from auth.users u where id = pg_temp.uid(42);

set role authenticated;
select pg_temp.as_user(null);
select pg_temp.expect_error('select public.delete_my_account()', 'not_authenticated', 'deletion needs a session');
select pg_temp.as_user(pg_temp.uid(48));
select pg_temp.expect_error('select public.delete_my_account()', 'admin_account', 'an admin account is not deleted this way');
select pg_temp.as_user(pg_temp.uid(42));
select pg_temp.expect_error('select public.delete_my_account()', 'recent_sign_in', 'deletion needs a recent sign-in');
reset role;
update auth.users set last_sign_in_at = now() where id = pg_temp.uid(42);
insert into storage.objects (bucket_id, name, owner) values ('pile', pg_temp.uid(42) || '/a/z.w.webp', pg_temp.uid(42));
set role authenticated;
select pg_temp.expect_error('select public.delete_my_account()', 'files_left', 'deletion waits for the files');
reset role;
delete from storage.objects where owner = pg_temp.uid(42);
insert into public.tournaments (id, slug, name, organiser_id, venue_name, address, location, starts_at, ends_at, format_id, type, language, max_players,
                                registration_deadline, list_deadline, pairing_system, rounds_planned, lists_visibility, status)
select md5('del-tour')::uuid, 'del-tour', 'Deletion cup', pg_temp.uid(42), venue_name, address, location, starts_at, ends_at, format_id, type, language, max_players,
       registration_deadline, list_deadline, pairing_system, rounds_planned, lists_visibility, 'in_progress' from public.tournaments limit 1;
set role authenticated;
select pg_temp.expect_error('select public.delete_my_account()', 'tournament_running', 'a running tournament is finished first');
reset role;
update public.tournaments set status = 'published' where id = md5('del-tour')::uuid;
set role authenticated;
select public.delete_my_account();
select pg_temp.expect_error('select public.delete_my_account()', 'not_found', 'a deleted account is deleted once');
select pg_temp.expect_error($q$insert into public.lfg_posts (author_id, game_system, level, country, from_date, to_date) values (auth.uid(), 'X game', 'casual', 'JP', current_date, current_date)$q$,
                            null, 'a session left open cannot post');
reset role;
select pg_temp.ok((select display_name = 'Deleted player' and handle like 'deleted\_%' and home_city is null and not is_public and is_suspended and deleted_at is not null
                     from public.profiles where id = pg_temp.uid(42)), 'the profile is anonymous');
select pg_temp.ok((select u.email like 'deleted-%@deleted.invalid' and u.encrypted_password = '' and u.banned_until > now() and u.raw_user_meta_data = '{}' from auth.users u where id = pg_temp.uid(42)),
                  'the sign-in data is erased and the account closed');
select pg_temp.ok((select count(*) = 0 from auth.identities where user_id = pg_temp.uid(42)), 'no identity left');
select pg_temp.ok((select count(*) = 0 from public.direct_messages where pg_temp.uid(42) in (sender_id, recipient_id)), 'messages are gone');
select pg_temp.ok(not exists (select 1 from public.games where id = md5('del-next')::uuid), 'the upcoming game I host is gone');
select pg_temp.ok(exists (select 1 from public.notifications where user_id = pg_temp.uid(43) and kind = 'game_deleted' and payload ->> 'from' = 'Deleted player'), 'its players are told, without the name');
select pg_temp.ok((select players_count = 1 from public.games where id = md5('del-other')::uuid), 'the seat in someone else''s game is free again');
select pg_temp.ok((select count(*) = 2 from public.game_results where game_id = md5('del-past')::uuid), 'the opponent keeps the played game');
select pg_temp.ok((select note is null and area is null from public.games where id = md5('del-past')::uuid), 'without my notes');
select pg_temp.ok(not exists (select 1 from public.game_private where game_id = md5('del-past')::uuid), 'nor my address');
select pg_temp.ok((select summary is null from public.game_reports where game_id = md5('del-past')::uuid), 'nor my text');
select pg_temp.ok((select organiser_id = pg_temp.uid(43) from public.leagues where id = md5('del-league')::uuid), 'the league has a new organiser');
select pg_temp.ok((select status = 'cancelled' from public.tournaments where id = md5('del-tour')::uuid), 'the published tournament is cancelled');
select pg_temp.ok(not exists (select 1 from public.notifications n, before_del b where n.payload ->> 'from' = b.name and n.kind = 'game_deleted'), 'no notice keeps the name');
-- Every demo player can leave, whatever they did (foreign keys, triggers)
do $$
declare u uuid; n int := 0;
begin
  for u in select p.id from public.profiles p where not p.is_admin and p.deleted_at is null loop
    update auth.users set last_sign_in_at = now() where id = u;
    delete from storage.objects where owner = u;
    update public.tournaments set status = 'finished' where organiser_id = u and status = 'in_progress';
    perform set_config('request.jwt.claim.sub', u::text, true);
    perform public.delete_my_account();
    n := n + 1;
  end loop;
  perform pg_temp.ok(n > 20, 'every demo player can delete their account (' || n || ')');
end $$;
select pg_temp.ok((select count(*) = 0 from auth.users u join public.profiles p on p.id = u.id where p.deleted_at is not null and u.email not like '%@deleted.invalid'), 'no e-mail left behind');
\echo account tests passed
