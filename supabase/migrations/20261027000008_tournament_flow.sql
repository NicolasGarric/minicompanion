-- =============================================================================================
-- Tournament flow (Swiss rounds): start, rounds with tables, score reports confirmed by the
-- opponent, organiser corrections, end of rounds and of the tournament, QR table pages.
-- Pairings are computed in the browser by src/play/lib/pairing.ts (unit-tested) and checked here.
-- =============================================================================================

-- The game played, free text like quick play (no official list shipped).
alter table public.tournaments add column game_system text check (char_length(game_system) <= 60);

-- New notification kinds
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'join_request', 'join_answer', 'game_match', 'report_to_confirm', 'report_answer', 'message',
  'game_message', 'league_game', 'round_paired', 'match_to_confirm', 'match_answer'));

-- Players still in the event (registered, not dropped)
create or replace function public.tournament_players(p_tournament uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select user_id from public.registrations where tournament_id = p_tournament and status = 'registered';
$$;

-- Starts the event: tables 1..n are created (one per two players unless given).
create or replace function public.start_tournament(p_tournament uuid, p_tables int default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
  n int;
begin
  select * into t from public.tournaments where id = p_tournament for update;
  if not found or not public.is_organiser(p_tournament) then
    raise exception 'not_organiser';
  end if;
  if t.status <> 'published' then
    raise exception 'bad_status';
  end if;
  select count(*) into n from public.tournament_players(p_tournament);
  if n < 2 then
    raise exception 'not_enough_players';
  end if;
  n := greatest(1, least(200, coalesce(p_tables, (n + 1) / 2)));
  insert into public.game_tables (tournament_id, number)
  select p_tournament, i from generate_series(1, n) i
  on conflict (tournament_id, number) do nothing;
  update public.tournaments set status = 'in_progress' where id = p_tournament;
  return n;
end;
$$;

-- Creates the next round from pairings [{ "a": uuid, "b": uuid | null }], tables in order.
-- A bye (b = null) is a confirmed win for a.
create or replace function public.create_round(p_tournament uuid, p_pairings jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
  next_number int;
  new_round uuid;
  players uuid[];
  listed uuid[];
  p jsonb;
  i int := 0;
  table_ids uuid[];
begin
  select * into t from public.tournaments where id = p_tournament for update;
  if not found or not public.is_organiser(p_tournament) then
    raise exception 'not_organiser';
  end if;
  if t.status <> 'in_progress' then
    raise exception 'bad_status';
  end if;
  if exists (select 1 from public.rounds where tournament_id = p_tournament and status <> 'finished') then
    raise exception 'round_not_finished';
  end if;
  select coalesce(max(number), 0) + 1 into next_number from public.rounds where tournament_id = p_tournament;
  if next_number > t.rounds_planned then
    raise exception 'all_rounds_played';
  end if;
  select array_agg(u) into players from public.tournament_players(p_tournament) u;
  select array_agg(x) into listed from (
    select (e ->> 'a')::uuid as x from jsonb_array_elements(p_pairings) e
    union all
    select (e ->> 'b')::uuid from jsonb_array_elements(p_pairings) e where e ->> 'b' is not null) s;
  -- Every active player exactly once, nobody else.
  if coalesce(array_length(listed, 1), 0) <> coalesce(array_length(players, 1), 0)
     or (select count(distinct x) from unnest(listed) x) <> array_length(listed, 1)
     or exists (select 1 from unnest(listed) x where x <> all (players))
     or (select count(*) from jsonb_array_elements(p_pairings) e where e ->> 'b' is null) > 1 then
    raise exception 'bad_pairings';
  end if;

  insert into public.rounds (tournament_id, number, status, started_at)
  values (p_tournament, next_number, 'active', now())
  returning id into new_round;
  select array_agg(id order by number) into table_ids from public.game_tables where tournament_id = p_tournament;

  for p in select * from jsonb_array_elements(p_pairings) loop
    if p ->> 'b' is null then
      insert into public.matches (tournament_id, round_id, player_a_id, player_b_id, result, status)
      values (p_tournament, new_round, (p ->> 'a')::uuid, null, 'a_win', 'confirmed');
    else
      i := i + 1;
      insert into public.matches (tournament_id, round_id, table_id, player_a_id, player_b_id)
      values (p_tournament, new_round, table_ids[i], (p ->> 'a')::uuid, (p ->> 'b')::uuid);
    end if;
  end loop;

  insert into public.notifications (user_id, kind, payload)
  select m.player_id, 'round_paired',
         jsonb_build_object('tournament', t.name, 'slug', t.slug, 'round', next_number, 'table', gt.number)
    from (select player_a_id as player_id, table_id from public.matches where round_id = new_round
          union all
          select player_b_id, table_id from public.matches where round_id = new_round and player_b_id is not null) m
    left join public.game_tables gt on gt.id = m.table_id;
  return new_round;
end;
$$;

-- A player (or the organiser) reports the score of a match of the active round.
-- From a player: waits for the opponent's confirmation. From the organiser: final ('resolved').
create or replace function public.report_match(
  p_match uuid, p_a_primary int, p_a_secondary int, p_b_primary int, p_b_secondary int, p_result public.match_result
)
returns public.match_status
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.matches;
  organiser boolean;
  next_status public.match_status;
  t public.tournaments;
begin
  select * into m from public.matches where id = p_match for update;
  if not found then
    raise exception 'no_match';
  end if;
  organiser := public.is_organiser(m.tournament_id);
  if not organiser and auth.uid() is distinct from m.player_a_id and auth.uid() is distinct from m.player_b_id then
    raise exception 'not_in_match';
  end if;
  if m.player_b_id is null then
    raise exception 'bye';
  end if;
  if not organiser and (m.status in ('confirmed', 'resolved')
       or (select status from public.rounds where id = m.round_id) <> 'active') then
    raise exception 'match_closed';
  end if;
  next_status := case when organiser then 'resolved' else 'reported' end;
  update public.matches
     set a_primary = p_a_primary, a_secondary = p_a_secondary, b_primary = p_b_primary, b_secondary = p_b_secondary,
         result = p_result, status = next_status, reported_by = auth.uid(), confirmed_by = null,
         dispute_note = null, updated_at = now()
   where id = p_match;
  if not organiser then
    select * into t from public.tournaments where id = m.tournament_id;
    perform public.notify(case when auth.uid() = m.player_a_id then m.player_b_id else m.player_a_id end,
      'match_to_confirm', jsonb_build_object('tournament', t.name, 'slug', t.slug));
  end if;
  return next_status;
end;
$$;

-- The opponent confirms, or disputes with a note (the organiser then resolves).
create or replace function public.confirm_match(p_match uuid, p_agree boolean, p_note text default null)
returns public.match_status
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.matches;
  opponent uuid;
  next_status public.match_status;
  t public.tournaments;
begin
  select * into m from public.matches where id = p_match for update;
  if not found or m.status <> 'reported' then
    raise exception 'nothing_to_confirm';
  end if;
  opponent := case when m.reported_by = m.player_a_id then m.player_b_id else m.player_a_id end;
  if auth.uid() is distinct from opponent then
    raise exception 'not_in_match';
  end if;
  next_status := case when p_agree then 'confirmed' else 'disputed' end;
  update public.matches
     set status = next_status, confirmed_by = case when p_agree then auth.uid() end,
         dispute_note = case when p_agree then null else left(p_note, 500) end, updated_at = now()
   where id = p_match;
  select * into t from public.tournaments where id = m.tournament_id;
  perform public.notify(m.reported_by, 'match_answer',
    jsonb_build_object('tournament', t.name, 'slug', t.slug, 'status', next_status));
  return next_status;
end;
$$;

-- Closes the active round once every match is confirmed or resolved.
create or replace function public.finish_round(p_tournament uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rounds;
begin
  if not public.is_organiser(p_tournament) then
    raise exception 'not_organiser';
  end if;
  select * into r from public.rounds where tournament_id = p_tournament and status = 'active' for update;
  if not found then
    raise exception 'no_active_round';
  end if;
  if exists (select 1 from public.matches where round_id = r.id and status not in ('confirmed', 'resolved')) then
    raise exception 'matches_pending';
  end if;
  update public.rounds set status = 'finished' where id = r.id;
end;
$$;

create or replace function public.finish_tournament(p_tournament uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_organiser(p_tournament) then
    raise exception 'not_organiser';
  end if;
  if exists (select 1 from public.rounds where tournament_id = p_tournament and status <> 'finished') then
    raise exception 'round_not_finished';
  end if;
  update public.tournaments set status = 'finished' where id = p_tournament and status = 'in_progress';
end;
$$;

-- Organiser: check a player in, or drop them (they get no more pairings).
create or replace function public.set_registration(p_tournament uuid, p_user uuid, p_checked_in boolean, p_dropped boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_organiser(p_tournament) then
    raise exception 'not_organiser';
  end if;
  update public.registrations
     set checked_in_at = case when p_checked_in then coalesce(checked_in_at, now()) end,
         status = case when p_dropped then 'dropped'
                       when status = 'dropped' then 'registered' else status end
   where tournament_id = p_tournament and user_id = p_user and status in ('registered', 'dropped');
end;
$$;

-- QR code on a table: the match currently played there (public information, like the pairings).
create or replace function public.table_match(p_token uuid)
returns table (tournament_slug text, tournament_name text, table_number int, round_number int,
               match_id uuid, player_a uuid, player_a_name text, player_b uuid, player_b_name text,
               status public.match_status, a_primary int, a_secondary int, b_primary int, b_secondary int,
               result public.match_result, reported_by uuid)
language sql
stable
security definer
set search_path = public
as $$
  select t.slug, t.name, gt.number, r.number, m.id, m.player_a_id, pa.display_name, m.player_b_id, pb.display_name,
         m.status, m.a_primary, m.a_secondary, m.b_primary, m.b_secondary, m.result, m.reported_by
    from public.game_tables gt
    join public.tournaments t on t.id = gt.tournament_id and public.tournament_visible(t.id)
    left join public.rounds r on r.tournament_id = t.id and r.status = 'active'
    left join public.matches m on m.round_id = r.id and m.table_id = gt.id
    left join public.profiles pa on pa.id = m.player_a_id
    left join public.profiles pb on pb.id = m.player_b_id
   where gt.qr_token = p_token;
$$;

-- Tables carry their QR token: only the organiser reads them (the page prints the codes).
drop policy "tables visible with the tournament" on public.game_tables;
create policy "organisers read tables" on public.game_tables
  for select using (public.is_organiser(tournament_id));
create or replace function public.tournament_tables(p_tournament uuid)
returns table (id uuid, number int)
language sql
stable
security definer
set search_path = public
as $$
  select id, number from public.game_tables where tournament_id = p_tournament and public.tournament_visible(p_tournament);
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.matches, public.rounds;
  end if;
end $$;

revoke execute on function public.start_tournament(uuid, int) from public, anon;
revoke execute on function public.create_round(uuid, jsonb) from public, anon;
revoke execute on function public.report_match(uuid, int, int, int, int, public.match_result) from public, anon;
revoke execute on function public.confirm_match(uuid, boolean, text) from public, anon;
revoke execute on function public.finish_round(uuid) from public, anon;
revoke execute on function public.finish_tournament(uuid) from public, anon;
revoke execute on function public.set_registration(uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.start_tournament(uuid, int) to authenticated;
grant execute on function public.create_round(uuid, jsonb) to authenticated;
grant execute on function public.report_match(uuid, int, int, int, int, public.match_result) to authenticated;
grant execute on function public.confirm_match(uuid, boolean, text) to authenticated;
grant execute on function public.finish_round(uuid) to authenticated;
grant execute on function public.finish_tournament(uuid) to authenticated;
grant execute on function public.set_registration(uuid, uuid, boolean, boolean) to authenticated;
grant execute on function public.table_match(uuid) to anon, authenticated;
grant execute on function public.tournament_tables(uuid) to anon, authenticated;
