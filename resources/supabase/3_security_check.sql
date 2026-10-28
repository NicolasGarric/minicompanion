-- Security check of the live database (audit of 2026-10-28, after migration 19).
-- Paste the whole file in Supabase > SQL Editor and run it.
-- It changes NOTHING: the test data it creates is cancelled at the end, because the script
-- always stops on purpose with an error whose message is the report.
-- Expected: the message starts with "SECURITY REPORT" and every line says "OK".
do $check$
declare
  report text := '';
  n int;
  me uuid;
  post uuid;
  ok boolean;
begin
  -- -------------------------------------------------------------------------------------------
  -- Structure
  -- -------------------------------------------------------------------------------------------
  select count(*) into n from pg_tables where schemaname = 'public' and not rowsecurity;
  report := report || E'\n' || case when n = 0 then 'OK   ' else 'BAD  ' end || '01 tables without row level security: ' || n;

  select count(*) into n
    from information_schema.role_table_grants
   where table_schema = 'public' and privilege_type = 'TRUNCATE' and grantee in ('anon', 'authenticated');
  report := report || E'\n' || case when n = 0 then 'OK   ' else 'BAD  ' end || '02 tables the browser key can TRUNCATE: ' || n;

  select count(*) into n
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  report := report || E'\n' || case when n = 0 then 'OK   ' else 'BAD  ' end || '03 SECURITY DEFINER functions without search_path: ' || n;

  select count(*) into n from pg_proc where proname = 'thumb_has_main';
  report := report || E'\n' || case when n = 1 then 'OK   ' else 'BAD  ' end || '04 migration 19 applied (thumb_has_main): ' || n;

  select count(*) into n from information_schema.columns
   where table_schema = 'public' and column_name = 'hidden_at'
     and table_name in ('contest_entries', 'challenge_entries', 'swap_posts');
  report := report || E'\n' || case when n = 3 then 'OK   ' else 'BAD  ' end || '05 hidden_at columns (expected 3): ' || n;

  select count(*) into n from storage.buckets where public and id not in ('contest', 'challenges', 'swap');
  report := report || E'\n' || case when n = 0 then 'OK   ' else 'BAD  ' end || '06 unexpected public buckets: ' || n;

  select count(*) into n from storage.buckets where id in ('reports', 'gallery', 'bug-reports') and public;
  report := report || E'\n' || case when n = 0 then 'OK   ' else 'BAD  ' end || '07 private buckets made public: ' || n;

  select count(*) into n from public.profiles
   where id in (select md5('demo-user-' || i)::uuid from generate_series(0, 60) i);
  report := report || E'\n' || case when n = 0 then 'OK   ' else 'WARN ' end || '08 demo accounts still present: ' || n;

  select count(*) into n from public.profiles where is_admin;
  report := report || E'\n' || case when n between 1 and 3 then 'OK   ' else 'WARN ' end || '09 admin accounts: ' || n;

  -- -------------------------------------------------------------------------------------------
  -- Behaviour, as a real visitor / player would call it
  -- -------------------------------------------------------------------------------------------
  select id into me from public.profiles where not is_admin order by created_at limit 1;
  if me is null then
    select id into me from public.profiles order by created_at limit 1;
  end if;

  -- 10. Anonymous visitors cannot read private profile columns
  begin
    set local role anon;
    perform home_city from public.profiles limit 1;
    reset role;
    report := report || E'\n' || 'BAD  10 anonymous visitor read a private profile column';
  exception when insufficient_privilege then
    reset role;
    report := report || E'\n' || 'OK   10 private profile columns closed to visitors';
  end;

  -- 11. Admin functions refuse anonymous visitors
  begin
    set local role anon;
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '{"role": "anon"}', true);
    perform * from public.admin_overview();
    reset role;
    report := report || E'\n' || 'BAD  11 admin_overview answered an anonymous visitor';
  exception when others then
    reset role;
    report := report || E'\n' || case when sqlerrm = 'forbidden' or sqlstate = '42501' then 'OK   ' else 'BAD  ' end
              || '11 admin functions refuse visitors (' || sqlerrm || ')';
  end;

  if me is null then
    report := report || E'\n' || 'SKIP  12-15 no player account to test with';
  else
    -- 12. A thumbnail without its full image is refused (the quota hole)
    begin
      set local role authenticated;
      perform set_config('request.jwt.claim.sub', me::text, true);
      perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
      insert into storage.objects (bucket_id, name, owner)
      values ('swap', me::text || '/security-check-fake.t.webp', me);
      reset role;
      report := report || E'\n' || 'BAD  12 a thumbnail without its full image was accepted';
    exception when others then
      reset role;
      report := report || E'\n' || case when sqlstate = '42501' then 'OK   ' else 'BAD  ' end
                || '12 lone thumbnails refused (' || sqlstate || ')';
    end;

    -- 13. A thumbnail next to the player's own full image is still accepted
    begin
      set local role authenticated;
      perform set_config('request.jwt.claim.sub', me::text, true);
      perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
      insert into storage.objects (bucket_id, name, owner) values ('swap', me::text || '/security-check.w.webp', me);
      insert into storage.objects (bucket_id, name, owner) values ('swap', me::text || '/security-check.t.webp', me);
      reset role;
      report := report || E'\n' || 'OK   13 normal photo + thumbnail upload still works';
    exception when others then
      reset role;
      report := report || E'\n' || 'BAD  13 normal upload refused (' || sqlstate || ' ' || sqlerrm || ')';
    end;

    -- 14. Hiding a swap post stamps hidden_at
    begin
      insert into public.swap_posts (user_id, kind, title, city)
      values (me, 'offer', 'Security check', 'Tokyo') returning id into post;
      update public.swap_posts set is_hidden = true where id = post;
      select hidden_at is not null into ok from public.swap_posts where id = post;
      report := report || E'\n' || case when ok then 'OK   ' else 'BAD  ' end || '14 hiding stamps the date';
    exception when others then
      report := report || E'\n' || 'BAD  14 ' || sqlstate || ' ' || sqlerrm;
    end;
  end if;

  -- 15. Page view counters stop at 1,000 new rows a day
  begin
    insert into public.page_views_daily (day, page, lang, views, visits)
    select current_date, 'zz' || translate(i::text, '0123456789', 'abcdefghij'), 'en', 1, 0
      from generate_series(1, 1000) i
    on conflict do nothing;
    set local role anon;
    perform public.track_page_view('securitycheck', 'en', true);
    reset role;
    select not exists (select 1 from public.page_views_daily where day = current_date and page = 'securitycheck') into ok;
    report := report || E'\n' || case when ok then 'OK   ' else 'BAD  ' end || '15 page view cap';
  exception when others then
    reset role;
    report := report || E'\n' || 'BAD  15 ' || sqlstate || ' ' || sqlerrm;
  end;

  -- Always stop here: everything above is cancelled, the message is the report.
  raise exception 'SECURITY REPORT (nothing was changed)%', report;
end
$check$;
