-- Bug reports sent from the footer: a description, technical context, and (signed in) up to 3 screenshots.
-- Anyone can report; only admins read them. Screenshots live in a private bucket, one folder per user.

create table public.bug_reports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles (id) on delete set null,
  message    text not null check (char_length(message) between 5 and 4000),
  page       text check (char_length(page) <= 300),
  -- Browser, language, screen size, app version: what helps reproduce, nothing personal.
  context    jsonb not null default '{}'::jsonb check (pg_column_size(context) <= 4000),
  contact    text check (char_length(contact) <= 200),
  photos     text[] not null default '{}' check (cardinality(photos) <= 3),
  status     text not null default 'new' check (status in ('new', 'seen', 'fixed', 'wontfix')),
  created_at timestamptz not null default now()
);
create index bug_reports_created_idx on public.bug_reports (created_at desc);

alter table public.bug_reports enable row level security;
revoke insert, update, delete on public.bug_reports from anon, authenticated;
grant update (status) on public.bug_reports to authenticated;
create policy "admins read bug reports" on public.bug_reports for select using (public.is_admin());
create policy "admins triage bug reports" on public.bug_reports for update using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bug-reports', 'bug-reports', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "bug screenshots: signed-in users upload to their folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bug-reports' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "bug screenshots: admins read" on storage.objects
  for select to authenticated
  using (bucket_id = 'bug-reports' and public.is_admin());

-- Send a report. Limits: 10 per hour per account; 30 per hour for all anonymous visitors together.
create or replace function public.submit_bug_report(p_message text, p_page text, p_context jsonb, p_contact text, p_photos text[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  new_id uuid;
begin
  if me is not null then
    if (select count(*) from public.bug_reports where user_id = me and created_at > now() - interval '1 hour') >= 10 then
      raise exception 'rate_limited';
    end if;
  elsif (select count(*) from public.bug_reports where user_id is null and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate_limited';
  end if;
  -- Screenshots: signed-in users only, from their own folder.
  if coalesce(cardinality(p_photos), 0) > 0
     and (me is null or exists (select 1 from unnest(p_photos) p where p not like me::text || '/%')) then
    raise exception 'bad_photos';
  end if;
  insert into public.bug_reports (user_id, message, page, context, contact, photos)
  values (me, trim(p_message), left(p_page, 300), coalesce(p_context, '{}'::jsonb), nullif(trim(p_contact), ''), coalesce(p_photos, '{}'))
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.submit_bug_report(text, text, jsonb, text, text[]) from public;
grant execute on function public.submit_bug_report(text, text, jsonb, text, text[]) to anon, authenticated;
