-- Check of unit cards and decks (migration 23) on the live database.
-- Paste the whole file in Supabase > SQL Editor and run it.
-- It changes NOTHING: the test army, deck and campaign it creates are cancelled at the end, because
-- the script always stops on purpose with an error whose message is the report.
-- Expected: the message starts with "CARDS REPORT" and every line says "OK" (or "SKIP").
do $check$
declare
  report text := '';
  me uuid;
  other uuid;
  army uuid;
  unit uuid;
  hero uuid;
  deck uuid;
  code text;
  cid uuid;
  cdeck uuid;
  card uuid;
  d jsonb;
  ok boolean;
  board jsonb := '{
    "bg": "blue",
    "places": [
      {"id": 1, "name": "Alpha", "type": "station", "x": 100, "y": 300, "owner": "A", "capital": true, "fort": 0, "value": 2},
      {"id": 2, "name": "Gamma", "type": "planet", "x": 800, "y": 200, "owner": "B", "capital": true, "fort": 0, "value": 3}
    ],
    "routes": [{"a": 1, "b": 2, "type": "normal", "cut": false}],
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
  report := report || E'\n' || case when to_regclass('public.pile_units') is not null then 'OK   ' else 'BAD  ' end || '01 migration 23 applied (pile_units table)';
  select count(*) = 0 into ok from pg_tables
   where schemaname = 'public' and tablename in ('pile_armies', 'pile_units', 'decks', 'game_decks', 'campaign_decks', 'campaign_cards') and not rowsecurity;
  report := report || E'\n' || case when ok then 'OK   ' else 'BAD  ' end || '02 row level security on the six new tables';
  report := report || E'\n' || case when exists (select 1 from storage.buckets where id = 'pile') then 'OK   ' else 'BAD  ' end || '03 photo bucket "pile" exists';
  select count(*) = 0 into ok from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'decks' and column_name = 'share_code' and privilege_type in ('INSERT', 'UPDATE')
     and grantee in ('anon', 'authenticated');
  report := report || E'\n' || case when ok then 'OK   ' else 'BAD  ' end || '04 the share code is not writable directly';

  select id into me from public.profiles where not is_suspended order by is_admin desc, created_at limit 1;
  select id into other from public.profiles where not is_suspended and id <> me order by created_at limit 1;
  if me is null or other is null then
    raise exception 'CARDS REPORT (nothing was changed)%', report || E'\nSKIP two accounts are needed to test';
  end if;

  -- As the owner
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', me::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
  begin
    insert into public.pile_armies (name) values ('Check army') returning id into army;
    insert into public.pile_units (army_id, name, role, info)
    values (army, 'Check unit', 'troop', '[{"l": "Endurance", "t": "n", "v": 8}, {"l": "Rule", "t": "t", "v": "Riposte"}]') returning id into unit;
    insert into public.pile_units (army_id, name, role, info, linked_to)
    values (army, 'Check hero', 'leader', '[{"l": "Points", "t": "n", "v": 100}]', unit) returning id into hero;
    report := report || E'\nOK   05 the owner adds an army, a unit with its card list, and a linked hero';
  exception when others then
    reset role;
    raise exception 'CARDS REPORT (nothing was changed)%', report || E'\nBAD  05 pile insert: ' || sqlstate || ' ' || sqlerrm;
  end;
  begin
    insert into public.pile_units (army_id, name, info) values (army, 'Bad', '[{"l": "Endurance", "t": "n", "v": "8"}]');
    report := report || E'\nBAD  06 a malformed card list was accepted';
  exception when others then
    report := report || E'\nOK   06 malformed card lists are refused';
  end;
  insert into public.decks (name, groups) values ('Check deck', jsonb_build_array(jsonb_build_array(unit::text, hero::text))) returning id into deck;
  d := public.deck_view(deck);
  report := report || E'\n' || case when jsonb_array_length(d -> 'cards') = 2 then 'OK   ' else 'BAD  ' end || '07 the owner reads his deck';
  code := public.deck_share(deck, true);

  -- As another player
  perform set_config('request.jwt.claim.sub', other::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  select count(*) = 0 into ok from public.pile_units where id in (unit, hero);
  report := report || E'\n' || case when ok then 'OK   ' else 'BAD  ' end || '08 another player does not see my pile';
  update public.pile_units set name = 'Hacked' where id = unit;
  report := report || E'\n' || case when public.deck_view(deck) is null then 'OK   ' else 'BAD  ' end || '09 another player does not read my deck without the link';

  -- Visitors with the link
  set local role anon;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  report := report || E'\n' || case when jsonb_array_length(public.deck_view(deck, code) -> 'cards') = 2 then 'OK   ' else 'BAD  ' end || '10 the share link opens the deck without an account';
  report := report || E'\n' || case when public.deck_view(deck, 'wrongwrongwrong0') is null then 'OK   ' else 'BAD  ' end || '11 a wrong code shows nothing';

  -- Campaign copy
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', me::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
  report := report || E'\n' || case when (select name from public.pile_units where id = unit) = 'Check unit' then 'OK   ' else 'BAD  ' end || '12 another player could not rename my unit';
  begin
    cid := public.create_campaign('Check campaign', null, null, null, board, 'A');
    cdeck := public.bring_deck_to_campaign(cid, deck);
    select id into card from public.campaign_cards where campaign_deck_id = cdeck and name = 'Check unit';
    report := report || E'\n' || case when (select count(*) from public.campaign_cards where campaign_deck_id = cdeck) = 2 then 'OK   ' else 'BAD  ' end || '13 bringing a deck copies its cards';
    perform public.evolve_campaign_card(card, '[{"l": "Endurance", "t": "n", "v": 9}, {"l": "Rule", "t": "t", "v": "Riposte"}]', 'check');
    report := report || E'\n' || case when (select info #>> '{0,v}' from public.campaign_cards where id = card) = '9'
                                         and (select info #>> '{0,v}' from public.pile_units where id = unit) = '8' then 'OK   ' else 'BAD  ' end
                      || '14 the campaign copy evolves, the original stays';
    report := report || E'\n' || case when exists (select 1 from public.campaign_log where campaign_id = cid and effect = 'card' and detail ->> 'card' = card::text)
                                      then 'OK   ' else 'BAD  ' end || '15 the change is written to the journal';
  exception when others then
    report := report || E'\nBAD  13 campaign copy: ' || sqlstate || ' ' || sqlerrm;
  end;
  reset role;

  raise exception 'CARDS REPORT (nothing was changed)%', report;
end
$check$;
