-- Check of narrative campaigns (migration 21) and game maps (migration 20) on the live database.
-- Paste the whole file in Supabase > SQL Editor and run it.
-- It changes NOTHING: the test campaign it creates is cancelled at the end, because the script
-- always stops on purpose with an error whose message is the report.
-- Expected: the message starts with "CAMPAIGN REPORT" and every line says "OK" (or "SKIP").
do $check$
declare
  report text := '';
  me uuid;
  other uuid;
  cid uuid;
  code text;
  log_id uuid;
  battle uuid;
  v int;
  s jsonb;
  ok boolean;
  board jsonb := '{
    "bg": "blue",
    "places": [
      {"id": 1, "name": "Alpha", "type": "station", "x": 100, "y": 300, "owner": "A", "capital": true, "fort": 0, "value": 2},
      {"id": 2, "name": "Beta", "type": "moon", "x": 300, "y": 250, "owner": null, "capital": false, "fort": 0, "value": 1},
      {"id": 3, "name": "Gamma", "type": "planet", "x": 800, "y": 200, "owner": "B", "capital": true, "fort": 1, "value": 3}
    ],
    "routes": [
      {"a": 1, "b": 2, "type": "normal", "cut": false},
      {"a": 2, "b": 3, "type": "normal", "cut": false},
      {"a": 1, "b": 3, "type": "secret", "owner": "A", "cut": false}
    ],
    "zones": [],
    "camps": [
      {"id": "A", "name": "North", "color": "#ff4f7b", "shape": "shield", "sign": "eye", "motto": "", "res": 1, "heroes": []},
      {"id": "B", "name": "South", "color": "#ffd23f", "shape": "hex", "sign": "claw", "motto": "", "res": 1, "heroes": []}
    ],
    "custom": [],
    "victory": {"rule": "capital", "n": 8}
  }';

begin
  -- Structure
  report := report || E'\n' || case when to_regclass('public.campaigns') is not null then 'OK   ' else 'BAD  ' end || '01 migration 21 applied (campaigns table)';
  report := report || E'\n' || case when to_regproc('public.set_game_map') is not null then 'OK   ' else 'BAD  ' end || '02 migration 20 applied (set_game_map)';
  select count(*) = 0 into ok from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'campaigns' and column_name = 'state' and privilege_type = 'SELECT' and grantee in ('anon', 'authenticated');
  report := report || E'\n' || case when ok then 'OK   ' else 'BAD  ' end || '03 the board column is not readable directly';
  select rowsecurity into ok from pg_tables where schemaname = 'public' and tablename = 'campaign_log';
  report := report || E'\n' || case when ok then 'OK   ' else 'BAD  ' end || '04 row level security on the journal';

  select id into me from public.profiles where not is_suspended order by is_admin desc, created_at limit 1;
  select id into other from public.profiles where not is_suspended and id <> me order by created_at limit 1;
  if me is null then
    raise exception 'CAMPAIGN REPORT (nothing was changed)%', report || E'\nSKIP no account to test with';
  end if;

  -- As a signed-in player
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', me::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
  begin
    cid := public.create_campaign('Check campaign', 'Check sector', null, null, board, 'A');
    report := report || E'\nOK   05 a player creates a campaign';
  exception when others then
    reset role;
    raise exception 'CAMPAIGN REPORT (nothing was changed)%', report || E'\nBAD  05 create_campaign: ' || sqlstate || ' ' || sqlerrm;
  end;

  begin
    perform public.create_campaign('Bad', null, null, null, board || '{"camps": []}', 'A');
    report := report || E'\nBAD  06 a board without camps was accepted';
  exception when others then
    report := report || E'\n' || case when sqlerrm = 'bad_state' then 'OK   ' else 'BAD  ' end || '06 bad boards are refused (' || sqlerrm || ')';
  end;

  begin
    perform state from public.campaigns where id = cid;
    report := report || E'\nBAD  07 the board column was read directly';
  exception when insufficient_privilege then
    report := report || E'\nOK   07 the board is only read through campaign_view';
  end;

  log_id := public.record_campaign_action(cid, 'A', 'take', '2');
  s := public.campaign_view(cid);
  report := report || E'\n' || case when s -> 'places' -> 1 ->> 'owner' = 'A' then 'OK   ' else 'BAD  ' end || '08 an action changes the board (Beta taken)';
  perform public.record_campaign_action(cid, 'A', 'take', '3');
  s := public.campaign_view(cid);
  report := report || E'\n' || case when s -> 'places' -> 2 ->> 'owner' = 'B' and (s -> 'places' -> 2 ->> 'fort')::int = 0 then 'OK   ' else 'BAD  ' end || '09 fortifications hold once';
  select count(*) = 3 into ok from public.campaign_log where campaign_id = cid;
  report := report || E'\n' || case when ok then 'OK   ' else 'BAD  ' end || '10 the journal has the start and both actions';

  battle := public.plan_campaign_battle(cid, 3, 'Check battle', current_date + 1, 'A', 'B', null);
  perform public.record_campaign_battle(battle, 'A');
  s := public.campaign_view(cid);
  report := report || E'\n' || case when s -> 'places' -> 2 ->> 'owner' = 'A' then 'OK   ' else 'BAD  ' end || '11 a won battle takes the place';

  select version into v from public.campaigns where id = cid;
  begin
    perform public.save_campaign_state(cid, s || '{"bg": "paper"}', v);
    report := report || E'\nOK   12 the master saves the board';
  exception when others then
    report := report || E'\nBAD  12 save_campaign_state: ' || sqlerrm;
  end;
  begin
    perform public.save_campaign_state(cid, s, v);
    report := report || E'\nBAD  13 an old version was accepted';
  exception when others then
    report := report || E'\n' || case when sqlerrm = 'version_conflict' then 'OK   ' else 'BAD  ' end || '13 an old version is refused';
  end;
  code := public.campaign_invite_code(cid);

  -- A second player, if there is one
  if other is null then
    report := report || E'\nSKIP 14-16 only one account in the database';
  else
    perform set_config('request.jwt.claim.sub', other::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
    begin
      perform public.campaign_view(cid);
      report := report || E'\nBAD  14 a stranger read a private campaign';
    exception when others then
      report := report || E'\n' || case when sqlerrm = 'forbidden' then 'OK   ' else 'BAD  ' end || '14 strangers cannot read a private campaign';
    end;
    perform public.join_campaign(cid, code, 'B');
    s := public.campaign_view(cid);
    report := report || E'\n' || case when jsonb_array_length(s -> 'routes') = 2 then 'OK   ' else 'BAD  ' end || '15 the other camp does not see the secret route';
    begin
      perform public.record_campaign_action(cid, 'A', 'take', '2');
      report := report || E'\nBAD  16 a player acted for another camp';
    exception when others then
      report := report || E'\n' || case when sqlerrm = 'not_your_camp' then 'OK   ' else 'BAD  ' end || '16 players only act for their own camp';
    end;
  end if;

  -- Visitors
  set local role anon;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  begin
    perform public.campaign_view(cid);
    report := report || E'\nBAD  17 a visitor read a private campaign';
  exception when others then
    report := report || E'\nOK   17 visitors cannot read a private campaign';
  end;
  reset role;

  raise exception 'CAMPAIGN REPORT (nothing was changed)%', report;
end
$check$;
