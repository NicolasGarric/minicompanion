-- RLS tests for the gallery (table + storage). Run after migrations and seed.
create or replace function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
$$;
create or replace function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;
create or replace function pg_temp.uid(n int) returns uuid language sql as $$ select md5('demo-user-' || n)::uuid $$;
grant execute on all functions in schema pg_temp to anon, authenticated;
set client_min_messages = notice;
\pset tuples_only on
\pset format unaligned

set role authenticated;
select pg_temp.as_user(pg_temp.uid(1));
insert into public.gallery_items (owner_id, title, image_path, paints)
values (pg_temp.uid(1), 'Knight', pg_temp.uid(1) || '/11111111-1111-1111-1111-111111111111.jpg', '[{"name":"Blue","brand":"X","hex":"#0d407f"}]');
select pg_temp.ok((select count(*) from public.gallery_items) = 1, 'owner sees their item');
insert into storage.objects (bucket_id, name) values ('gallery', pg_temp.uid(1) || '/11111111-1111-1111-1111-111111111111.jpg');
select pg_temp.ok((select count(*) from storage.objects where bucket_id = 'gallery') = 1, 'owner uploads into their folder');

do $$ begin
  insert into public.gallery_items (owner_id, title, image_path)
  values (pg_temp.uid(2), 'Not mine', pg_temp.uid(2) || '/22222222-2222-2222-2222-222222222222.jpg');
  raise exception 'FAIL: inserted an item for someone else';
exception when insufficient_privilege then raise notice 'ok - cannot add to another gallery';
end $$;
do $$ begin
  insert into public.gallery_items (owner_id, title, image_path)
  values (pg_temp.uid(1), 'Wrong folder', pg_temp.uid(2) || '/33333333-3333-3333-3333-333333333333.jpg');
  raise exception 'FAIL: image path outside the owner folder';
exception when check_violation then raise notice 'ok - image path must be in the owner folder';
end $$;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('gallery', pg_temp.uid(2) || '/x.jpg');
  raise exception 'FAIL: uploaded into another folder';
exception when insufficient_privilege then raise notice 'ok - cannot upload into another folder';
end $$;
do $$ begin
  update public.gallery_items set image_path = image_path where true;
  raise exception 'FAIL: image path is editable';
exception when insufficient_privilege then raise notice 'ok - only the title is editable';
end $$;

select pg_temp.as_user(pg_temp.uid(2));
select pg_temp.ok((select count(*) from public.gallery_items) = 0, 'another player sees nothing');
select pg_temp.ok((select count(*) from storage.objects where bucket_id = 'gallery') = 0, 'another player sees no file');
delete from public.gallery_items;
select pg_temp.as_user(pg_temp.uid(1));
select pg_temp.ok((select count(*) from public.gallery_items) = 1, 'nobody else can delete it');

set role anon;
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) from public.gallery_items) = 0, 'anonymous visitors see nothing');
reset role;
select 'gallery tests passed';
