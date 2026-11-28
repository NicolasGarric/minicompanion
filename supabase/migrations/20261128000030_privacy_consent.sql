-- =============================================================================================
-- Cookies and statistics (owner decisions 2026-11-28):
--   * anonymous page counts (page_views_daily) are sent by the app only after the visitor accepts
--     statistics in the cookie banner: track_page_view no longer records anything about the player.
--   * active days of signed-in players are kept on legitimate interest (counting active players),
--     through their own function, and each player can object in My account: recording stops and
--     their past active days are erased.
-- =============================================================================================

alter table public.profiles add column if not exists activity_stats boolean not null default true;

-- Same as migration 19, without the active day (now mark_active_day).
create or replace function public.track_page_view(p_page text, p_lang text, p_new_visit boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_page !~ '^[a-z][a-z.]{1,39}$' or p_lang !~ '^[a-z]{2}$' or p_page like 'admin%' then
    return;
  end if;
  if exists (select 1 from public.page_views_daily where day = current_date and page = p_page and lang = p_lang)
     or (select count(*) from public.page_views_daily where day = current_date) < 1000 then
    insert into public.page_views_daily (day, page, lang, views, visits)
    values (current_date, p_page, p_lang, 1, case when p_new_visit then 1 else 0 end)
    on conflict (day, page, lang) do update
      set views = page_views_daily.views + 1,
          visits = page_views_daily.visits + case when p_new_visit then 1 else 0 end;
  end if;
end;
$$;
revoke execute on function public.track_page_view(text, text, boolean) from public;
grant execute on function public.track_page_view(text, text, boolean) to anon, authenticated;

-- One row per day a signed-in player opens the app, unless they objected.
create or replace function public.mark_active_day()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.active_days (user_id, day)
  select p.id, current_date from public.profiles p
   where p.id = auth.uid() and p.activity_stats and p.deleted_at is null
  on conflict do nothing;
$$;

-- The player objects (false) or agrees again (true). Objecting erases the days already recorded.
create or replace function public.set_activity_stats(p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  update public.profiles set activity_stats = coalesce(p_on, true) where id = auth.uid();
  if not coalesce(p_on, true) then
    delete from public.active_days where user_id = auth.uid();
  end if;
end;
$$;

revoke execute on function public.mark_active_day(), public.set_activity_stats(boolean) from public, anon;
grant execute on function public.mark_active_day(), public.set_activity_stats(boolean) to authenticated;
