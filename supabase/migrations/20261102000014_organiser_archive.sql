-- Organisers may hide (archive) their own tournament, never un-hide one: a moderation hide stays.
grant update (is_hidden) on public.tournaments to authenticated;

create or replace function public.tournaments_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'published') or new.is_hidden then
      raise exception 'bad_status';
    end if;
    return new;
  end if;
  if old.is_hidden and not new.is_hidden then
    raise exception 'forbidden';
  end if;
  if new.status is distinct from old.status
     and not (old.status in ('draft', 'published') and new.status in ('draft', 'published', 'cancelled')) then
    raise exception 'bad_status';
  end if;
  return new;
end;
$$;

-- Leftover from the live check run of 2026-10-23, when hiding was refused.
update public.tournaments set is_hidden = true where name = 'Automated check tournament' and not is_hidden;
