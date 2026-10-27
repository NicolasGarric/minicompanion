-- =============================================================================================
-- Translation suggestions (owner decision 2026-10-27): players point at a wording that sounds
-- wrong in their language and propose a better one; admins review them in /admin. The app also
-- sends the message keys whose text matches what the player saw, so a fix is one line to change.
-- Same limits as bug reports: 10 per hour per account, 30 per hour for all visitors together.
-- =============================================================================================

create table public.translation_suggestions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles (id) on delete set null,
  lang       text not null check (lang ~ '^[a-z]{2}$'),
  -- What the player saw, and the keys of the app's dictionary with that exact text (may be empty)
  shown      text not null check (char_length(btrim(shown)) between 1 and 500),
  keys       text[] not null default '{}' check (cardinality(keys) <= 20),
  suggestion text not null check (char_length(btrim(suggestion)) between 1 and 500),
  note       text check (char_length(note) <= 1000),
  page       text check (char_length(page) <= 300),
  status     text not null default 'new' check (status in ('new', 'accepted', 'rejected', 'done')),
  created_at timestamptz not null default now()
);
create index translation_suggestions_status_idx on public.translation_suggestions (status, created_at desc);

alter table public.translation_suggestions enable row level security;
revoke all on public.translation_suggestions from anon, authenticated;

create or replace function public.suggest_translation(p_lang text, p_shown text, p_keys text[], p_suggestion text, p_note text, p_page text)
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
    if public.is_suspended(me) then
      raise exception 'suspended';
    end if;
    if (select count(*) from public.translation_suggestions where user_id = me and created_at > now() - interval '1 hour') >= 10 then
      raise exception 'rate_limited';
    end if;
  elsif (select count(*) from public.translation_suggestions where user_id is null and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate_limited';
  end if;
  if btrim(coalesce(p_suggestion, '')) = btrim(coalesce(p_shown, '')) then
    raise exception 'same_text';
  end if;
  insert into public.translation_suggestions (user_id, lang, shown, keys, suggestion, note, page)
  values (me, p_lang, btrim(p_shown), coalesce(p_keys[1:20], '{}'), btrim(p_suggestion), nullif(btrim(p_note), ''), left(p_page, 300))
  returning id into new_id;
  return new_id;
end;
$$;

-- Admins: newest first, filtered by status ('' = all)
create or replace function public.admin_translation_suggestions(p_status text default 'new')
returns table (id uuid, created_at timestamptz, lang text, shown text, keys text[], suggestion text, note text, page text,
               status text, author_handle text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  return query
    select s.id, s.created_at, s.lang, s.shown, s.keys, s.suggestion, s.note, s.page, s.status, p.handle
      from public.translation_suggestions s
      left join public.profiles p on p.id = s.user_id
     where p_status = '' or s.status = p_status
     order by s.created_at desc
     limit 200;
end;
$$;

create or replace function public.admin_set_translation_suggestion(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  if p_status not in ('new', 'accepted', 'rejected', 'done') then
    raise exception 'bad_status';
  end if;
  update public.translation_suggestions set status = p_status where id = p_id;
end;
$$;

revoke execute on function public.suggest_translation(text, text, text[], text, text, text),
  public.admin_translation_suggestions(text), public.admin_set_translation_suggestion(uuid, text) from public;
grant execute on function public.suggest_translation(text, text, text[], text, text, text) to anon, authenticated;
grant execute on function public.admin_translation_suggestions(text), public.admin_set_translation_suggestion(uuid, text) to authenticated;
