-- Check of migration 28 (storage ceilings, rights, account deletion) on the live database.
-- Paste the whole file in Supabase > SQL Editor and run it.
-- It changes NOTHING: the test account it creates and deletes is cancelled at the end, because the
-- script always stops on purpose with an error whose message is the report.
-- Expected: the message starts with "ACCOUNT REPORT" and every line says "OK".
do $check$
declare
  report text := '';
  u uuid := gen_random_uuid();
  ok boolean;
begin
  report := report || E'\n' || case when to_regproc('public.delete_my_account') is not null then 'OK   ' else 'BAD  ' end || '01 migration 28 applied';
  select count(*) = 4 into ok from pg_policies where schemaname = 'storage'
     and policyname in ('files: size per player', 'bug screenshots: number per player', 'own files: owners read', 'own files: owners delete');
  report := report || E'\n' || case when ok then 'OK   ' else 'BAD  ' end || '02 storage policies there';
  select count(*) = 0 into ok from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type = 'TRUNCATE';
  report := report || E'\n' || case when ok then 'OK   ' else 'BAD  ' end || '03 no TRUNCATE for visitors and players';
  select not has_function_privilege('anon', 'public.delete_my_account()', 'execute') into ok;
  report := report || E'\n' || case when ok then 'OK   ' else 'BAD  ' end || '04 visitors cannot call the deletion';
  begin
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change, email_change_token_new)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'check-' || u || '@example.invalid', 'x', now(), now(),
            '{}', '{"display_name": "Check"}', now(), now(), '', '', '', '');
    perform set_config('request.jwt.claim.sub', u::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform public.delete_my_account();
    select p.display_name = 'Deleted player' and p.deleted_at is not null and a.email like 'deleted-%' and a.encrypted_password = '' and a.banned_until > now()
      into ok from public.profiles p join auth.users a on a.id = p.id where p.id = u;
    report := report || E'\n' || case when ok then 'OK   ' else 'BAD  ' end || '05 an account can be deleted (test account, cancelled)';
  exception when others then
    report := report || E'\nBAD  05 account deletion: ' || sqlerrm;
  end;
  raise exception 'ACCOUNT REPORT (nothing was changed)%', report;
end $check$;
