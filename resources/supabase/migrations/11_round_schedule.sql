-- Tournaments over several weeks: each round can have its own date, time and venue.
-- A tournament without schedule rows is a one-day event (rounds follow each other at the main venue).

create table public.round_schedule (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  number        int not null check (number between 1 and 20),
  starts_at     timestamptz not null,
  -- Venue of this round: a store, or a name + address; all empty = the tournament's own venue.
  store_id      uuid references public.stores (id) on delete set null,
  venue_name    text check (char_length(venue_name) <= 80),
  address       text check (char_length(address) <= 150),
  primary key (tournament_id, number)
);

alter table public.round_schedule enable row level security;
revoke insert, update, delete on public.round_schedule from anon, authenticated;
-- Same visibility as the tournament itself (the subquery goes through the tournaments policy).
create policy "round schedule visible with the tournament" on public.round_schedule
  for select using (exists (select 1 from public.tournaments t where t.id = tournament_id));

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'join_request', 'join_answer', 'game_match', 'report_to_confirm', 'report_answer', 'message',
  'game_message', 'league_game', 'round_paired', 'match_to_confirm', 'match_answer', 'contest_results',
  'round_schedule'));

-- Replace the whole schedule. p_rounds: [{number, starts_at, store_id?, venue_name?, address?}], [] = one-day event.
-- Once the event is published, registered and waitlisted players are told about the change.
create or replace function public.set_round_schedule(p_tournament uuid, p_rounds jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
  before jsonb;
  after jsonb;
  last_start timestamptz;
begin
  select * into t from public.tournaments where id = p_tournament for update;
  if not found or not public.is_organiser(p_tournament) then
    raise exception 'not_organiser';
  end if;
  if t.status in ('finished', 'cancelled') then
    raise exception 'bad_status';
  end if;
  -- Rounds numbered 1..n (n <= planned rounds), each with a date, dates never going back in time.
  if jsonb_typeof(p_rounds) <> 'array' or jsonb_array_length(p_rounds) > t.rounds_planned
     or (select array_agg((e ->> 'number')::int order by (e ->> 'number')::int) from jsonb_array_elements(p_rounds) e)
        is distinct from (select array_agg(i order by i) from generate_series(1, jsonb_array_length(p_rounds)) i)
     or exists (select 1 from jsonb_array_elements(p_rounds) e
                 where e ->> 'starts_at' is null or char_length(e ->> 'venue_name') > 80 or char_length(e ->> 'address') > 150)
     or exists (select 1 from jsonb_array_elements(p_rounds) a, jsonb_array_elements(p_rounds) b
                 where (b ->> 'number')::int = (a ->> 'number')::int + 1
                   and (b ->> 'starts_at')::timestamptz < (a ->> 'starts_at')::timestamptz) then
    raise exception 'bad_schedule';
  end if;

  select coalesce(jsonb_agg(to_jsonb(s) - 'tournament_id' order by s.number), '[]') into before
    from public.round_schedule s where s.tournament_id = p_tournament;
  delete from public.round_schedule where tournament_id = p_tournament;
  insert into public.round_schedule (tournament_id, number, starts_at, store_id, venue_name, address)
  select p_tournament, (e ->> 'number')::int, (e ->> 'starts_at')::timestamptz, st.id,
         coalesce(st.name, nullif(trim(e ->> 'venue_name'), '')),
         coalesce(st.address, nullif(trim(e ->> 'address'), ''))
    from jsonb_array_elements(p_rounds) e
    left join public.stores st on st.id = nullif(e ->> 'store_id', '')::uuid;
  select coalesce(jsonb_agg(to_jsonb(s) - 'tournament_id' order by s.number), '[]'), max(s.starts_at) into after, last_start
    from public.round_schedule s where s.tournament_id = p_tournament;

  -- The event now runs until the end of its last round (round length from the game size).
  if last_start is not null then
    update public.tournaments
       set ends_at = greatest(ends_at, last_start + case format_id when 'skirmish' then interval '1 hour'
                                                                   when 'battle' then interval '3 hours'
                                                                   else interval '2 hours' end)
     where id = p_tournament;
  end if;

  if after is distinct from before and t.status <> 'draft' then
    insert into public.notifications (user_id, kind, payload)
    select g.user_id, 'round_schedule', jsonb_build_object('tournament', t.name, 'slug', t.slug)
      from public.registrations g
     where g.tournament_id = p_tournament and g.status in ('registered', 'waitlist');
  end if;
end;
$$;

revoke execute on function public.set_round_schedule(uuid, jsonb) from public, anon;
grant execute on function public.set_round_schedule(uuid, jsonb) to authenticated;
