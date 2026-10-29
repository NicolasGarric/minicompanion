-- "Suggest improvements" (owner request 2026-10-29): a footer button on every page. A suggestion
-- arrives as a message in the admin inbox (/admin/suggestions) and every admin gets a notification.
-- An admin answers from the inbox: the answer is a direct message to the author (who gets the usual
-- "new message" notification and can reply in Messages). Visitors can suggest too (optional email,
-- no in-app answer).

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'join_request', 'join_answer', 'game_match', 'report_to_confirm', 'report_answer', 'message',
  'game_message', 'league_game', 'round_paired', 'match_to_confirm', 'match_answer', 'contest_results',
  'round_schedule', 'mentor_request', 'mentor_answer', 'game_deleted', 'suggestion'));

create table public.suggestions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles (id) on delete set null,
  topic       text not null default 'other' check (topic in ('feature', 'improve', 'content', 'design', 'other')),
  message     text not null check (char_length(btrim(message)) between 5 and 2000),
  page        text check (char_length(page) <= 300),
  lang        text check (lang ~ '^[a-z]{2}$'),
  contact     text check (char_length(contact) <= 200),
  status      text not null default 'new' check (status in ('new', 'seen', 'planned', 'done', 'declined')),
  answered_at timestamptz,
  created_at  timestamptz not null default now()
);
create index suggestions_created_idx on public.suggestions (created_at desc);
create index suggestions_status_idx on public.suggestions (status);

alter table public.suggestions enable row level security;
revoke all on public.suggestions from anon, authenticated;
grant select on public.suggestions to authenticated;
grant update (status) on public.suggestions to authenticated;
create policy "admins read suggestions" on public.suggestions for select using (public.is_admin());
create policy "admins triage suggestions" on public.suggestions for update using (public.is_admin()) with check (public.is_admin());

create or replace function public.submit_suggestion(p_topic text, p_message text, p_page text, p_lang text, p_contact text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  new_id uuid;
  who text;
  a uuid;
begin
  if me is not null then
    if public.is_suspended(me) then
      raise exception 'suspended';
    end if;
    if (select count(*) from public.suggestions where user_id = me and created_at > now() - interval '1 hour') >= 10 then
      raise exception 'rate_limited';
    end if;
  elsif (select count(*) from public.suggestions where user_id is null and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate_limited';
  end if;
  if p_topic is null or p_topic not in ('feature', 'improve', 'content', 'design', 'other') then
    raise exception 'bad_topic';
  end if;
  insert into public.suggestions (user_id, topic, message, page, lang, contact)
  values (me, p_topic, btrim(p_message), left(p_page, 300), case when p_lang ~ '^[a-z]{2}$' then p_lang end,
          case when me is null then nullif(btrim(left(p_contact, 200)), '') end)
  returning id into new_id;
  select display_name into who from public.profiles where id = me;
  -- One unread "suggestion" notification per admin is enough
  for a in select id from public.profiles where is_admin and id is distinct from me loop
    if not exists (select 1 from public.notifications where user_id = a and kind = 'suggestion' and read_at is null) then
      perform public.notify(a, 'suggestion', jsonb_build_object('from', coalesce(who, ''), 'topic', p_topic));
    end if;
  end loop;
  return new_id;
end;
$$;

-- An admin answers: a direct message to the author, and the suggestion is marked seen and answered.
create or replace function public.answer_suggestion(p_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.suggestions;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  select * into s from public.suggestions where id = p_id;
  if not found then
    raise exception 'not_found';
  end if;
  if s.user_id is null then
    raise exception 'no_author';
  end if;
  if s.user_id = auth.uid() then
    raise exception 'own_suggestion';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 1000 then
    raise exception 'bad_message';
  end if;
  insert into public.direct_messages (sender_id, recipient_id, body) values (auth.uid(), s.user_id, btrim(p_body));
  update public.suggestions set answered_at = now(), status = case when status = 'new' then 'seen' else status end where id = p_id;
end;
$$;

revoke execute on function public.submit_suggestion(text, text, text, text, text), public.answer_suggestion(uuid, text) from public, anon, authenticated;
grant execute on function public.submit_suggestion(text, text, text, text, text) to anon, authenticated;
grant execute on function public.answer_suggestion(uuid, text) to authenticated;
