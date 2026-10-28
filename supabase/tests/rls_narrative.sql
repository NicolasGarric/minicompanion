-- Tests for migration 21: narrative campaigns (board, members, actions, contests, battles, secrecy).
create or replace function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
$$;
create or replace function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;
create or replace function pg_temp.uid(n int) returns uuid language sql as $$ select md5('demo-user-' || n)::uuid $$;
create or replace function pg_temp.expect_error(sql text, code text, label text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FAIL: % (no error)', label;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  if code is not null and sqlerrm <> code and sqlstate <> code then raise exception 'FAIL: % (got % / %)', label, sqlstate, sqlerrm; end if;
  raise notice 'ok - %', label;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;
set client_min_messages = notice;
\pset tuples_only on
\pset format unaligned

-- A small board: 4 places, a secret route known by camp A, camp B holds a fortified place.
create temporary table fx_board as select '{
  "bg": "blue",
  "places": [
    {"id": 1, "name": "Quorvane", "type": "station", "x": 100, "y": 300, "owner": "A", "capital": true, "fort": 0, "value": 2},
    {"id": 2, "name": "Vey", "type": "moon", "x": 300, "y": 250, "owner": null, "capital": false, "fort": 0, "value": 1, "map": "jeyJ2IjoxfQ"},
    {"id": 3, "name": "Corvo", "type": "planet", "x": 600, "y": 400, "owner": "B", "capital": false, "fort": 1, "value": 2},
    {"id": 4, "name": "Durn-Kael", "type": "planet", "x": 800, "y": 200, "owner": "B", "capital": true, "fort": 0, "value": 3}
  ],
  "routes": [
    {"a": 1, "b": 2, "type": "normal", "cut": false},
    {"a": 2, "b": 3, "type": "normal", "cut": false},
    {"a": 3, "b": 4, "type": "normal", "cut": false},
    {"a": 1, "b": 3, "type": "secret", "owner": "A", "cut": false}
  ],
  "zones": [],
  "camps": [
    {"id": "A", "name": "Veilleurs", "color": "#ff4f7b", "shape": "shield", "sign": "eye", "motto": "", "res": 3, "heroes": [{"name": "Ilsa", "xp": 0, "fallen": false}]},
    {"id": "B", "name": "Compagnie", "color": "#ffd23f", "shape": "hex", "sign": "claw", "motto": "", "res": 2, "heroes": []}
  ],
  "custom": [],
  "victory": {"rule": "capital", "n": 8}
}'::jsonb as s;
grant select on fx_board to anon, authenticated;
create temporary table fx (id uuid, code text, log uuid, battle uuid);
grant all on fx to anon, authenticated;
insert into fx values (null, null, null, null);

-- ---------- Creating ----------
set role authenticated;
select pg_temp.as_user(pg_temp.uid(41));
update fx set id = public.create_campaign('Le Voile d''Ambre', 'Voile d''Ambre', 'Test', 'veil', (select s from fx_board), null);
select pg_temp.ok((select count(*) from public.campaign_members where campaign_id = (select id from fx)) = 1, 'the master is the first member');
select pg_temp.ok((select turn = 0 from public.campaigns where id = (select id from fx)), 'a new campaign starts at turn 0');
update fx set code = public.campaign_invite_code((select id from fx));
select pg_temp.ok((select char_length(code) = 12 from fx), 'the master gets the invitation code');
select pg_temp.expect_error($q$select public.create_campaign('Bad', null, null, null, (select s || '{"camps": []}' from fx_board))$q$, 'bad_state', 'a board without camps is refused');
select pg_temp.expect_error($q$select public.create_campaign('Bad', null, null, null,
  jsonb_set((select s from fx_board), '{places,1,map}', '"z<script>"'))$q$, 'bad_state', 'a place map with other characters is refused');
select pg_temp.expect_error($q$select public.create_campaign('Bad', null, null, null,
  jsonb_set((select s from fx_board), '{places,1,owner}', '"D"'))$q$, 'bad_state', 'an owner that is not a camp is refused');
select pg_temp.expect_error($q$select state from public.campaigns$q$, '42501', 'the board column is never read directly');

-- ---------- Joining and reading ----------
select pg_temp.as_user(pg_temp.uid(42));
select pg_temp.ok((select count(*) from public.campaigns where id = (select id from fx)) = 0, 'a stranger does not see a private campaign');
select pg_temp.expect_error($q$select public.campaign_view((select id from fx))$q$, 'forbidden', 'a stranger cannot read the board');
select pg_temp.ok(public.campaign_invite_code((select id from fx)) is null, 'a stranger does not get the code');
select pg_temp.expect_error($q$select public.join_campaign((select id from fx), 'wrongcode', 'B')$q$, 'bad_invite', 'a wrong code is refused');
select public.join_campaign((select id from fx), (select code from fx), 'B');
select pg_temp.ok(public.my_campaign_camp((select id from fx)) = 'B', 'the invited player joins camp B');
select pg_temp.ok(jsonb_array_length(public.campaign_view((select id from fx)) -> 'routes') = 3, 'camp B does not see camp A''s secret route');
select pg_temp.as_user(pg_temp.uid(43));
select public.join_campaign((select id from fx), (select code from fx), 'A');
select pg_temp.ok(jsonb_array_length(public.campaign_view((select id from fx)) -> 'routes') = 4, 'camp A sees its secret route');
select pg_temp.as_user(pg_temp.uid(41));
select pg_temp.ok(jsonb_array_length(public.campaign_view((select id from fx)) -> 'routes') = 4, 'the master sees every route');
select pg_temp.ok((select count(*) from public.my_campaigns()) = 1, 'the campaign is in the master''s list');

-- ---------- Actions ----------
select pg_temp.as_user(pg_temp.uid(42));
select pg_temp.expect_error($q$select public.record_campaign_action((select id from fx), 'A', 'take', '2')$q$, 'not_your_camp', 'a player cannot act for another camp');
select pg_temp.expect_error($q$select public.save_campaign_state((select id from fx), (select s from fx_board), 1)$q$, 'not_master', 'a player cannot save the whole board');
update fx set log = public.record_campaign_action((select id from fx), 'B', 'take', '2');
select pg_temp.ok((select public.campaign_view((select id from fx)) -> 'places' -> 1 ->> 'owner') = 'B', 'camp B takes Vey');
select pg_temp.ok((select detail ->> 'result' = 'taken' and turn = 1 from public.campaign_log where id = (select log from fx)), 'the journal says Vey was taken, turn 1');
select pg_temp.ok((select snapshot -> 'places' -> '2' ->> 'owner' = 'B' from public.campaign_log where id = (select log from fx)), 'the turn keeps a snapshot for the replay');
select public.record_campaign_action((select id from fx), 'B', 'res', null, 3, 'Raid', null);
select pg_temp.ok((select (c ->> 'res')::int = 5 from jsonb_array_elements(public.campaign_view((select id from fx)) -> 'camps') c where c ->> 'id' = 'B'), 'a custom action gives 3 resources');
select pg_temp.expect_error($q$select public.record_campaign_action((select id from fx), 'B', 'fort', '1')$q$, 'not_your_place', 'a camp only fortifies its own places');
select pg_temp.expect_error($q$select public.record_campaign_action((select id from fx), 'B', 'take', '99')$q$, 'bad_target', 'an unknown place is refused');

select pg_temp.as_user(pg_temp.uid(43));
select public.record_campaign_action((select id from fx), 'A', 'take', '3');
select pg_temp.ok((select (p ->> 'fort')::int = 0 and p ->> 'owner' = 'B' from jsonb_array_elements(public.campaign_view((select id from fx)) -> 'places') p where p ->> 'id' = '3'),
                  'a fortified place resists once and loses its fortification');
select public.record_campaign_action((select id from fx), 'A', 'cut', '1-3');
select pg_temp.ok((select detail = '{"secret": true}'::jsonb from public.campaign_log where campaign_id = (select id from fx) and effect = 'cut'), 'cutting a secret route does not name it in the journal');
select pg_temp.ok((select not (snapshot -> 'cut') ? '1-3' from public.campaign_log where campaign_id = (select id from fx) and effect = 'cut'), 'nor in the replay');
select public.record_campaign_action((select id from fx), 'A', 'xp', '0');
select pg_temp.ok((select (c -> 'heroes' -> 0 ->> 'xp')::int = 1 from jsonb_array_elements(public.campaign_view((select id from fx)) -> 'camps') c where c ->> 'id' = 'A'), 'a hero gains experience');
select public.record_campaign_action((select id from fx), 'A', 'event', null, null, null, 'Une tempête ionique');
select pg_temp.ok((select detail ->> 'text' = 'Une tempête ionique' from public.campaign_log where campaign_id = (select id from fx) and effect = 'event' and turn > 0), 'an event keeps its text');

-- ---------- Contests ----------
select pg_temp.expect_error($q$select public.contest_campaign_action((select id from public.campaign_log where effect = 'xp' and campaign_id = (select id from fx)))$q$,
                            'not_other_camp', 'a camp cannot contest its own action');
select public.contest_campaign_action((select log from fx));
select pg_temp.ok((select contested_by = pg_temp.uid(43) from public.campaign_log where id = (select log from fx)), 'camp A contests the taking of Vey');
select pg_temp.expect_error($q$select public.resolve_campaign_contest((select log from fx), true)$q$, 'not_master', 'only the master settles a contest');
select pg_temp.as_user(pg_temp.uid(41));
select public.resolve_campaign_contest((select log from fx), true);
select pg_temp.ok((select public.campaign_view((select id from fx)) -> 'places' -> 1 -> 'owner') = 'null'::jsonb, 'the master undoes it: Vey is free again');
select pg_temp.ok((select resolution = 'undone' from public.campaign_log where id = (select log from fx)), 'the journal shows it was undone');

-- ---------- Battles ----------
select pg_temp.as_user(pg_temp.uid(42));
update fx set battle = public.plan_campaign_battle((select id from fx), 2, 'Le pont de Vey', current_date + 7, 'B', 'A', 'Enjeu : la route');
select pg_temp.expect_error($q$select public.plan_campaign_battle((select id from fx), 99, 'X', current_date, 'A', 'B', null)$q$, 'bad_target', 'a battle needs a real place');
select pg_temp.expect_error($q$select public.record_campaign_battle((select battle from fx), 'C')$q$, 'bad_camp', 'the winner must be one of the two camps');
select pg_temp.expect_error($q$select public.record_campaign_battle((select battle from fx), null)$q$, 'bad_camp', 'a battle needs a winner');
select public.record_campaign_battle((select battle from fx), 'A');
select pg_temp.ok((select status = 'played' and winner = 'A' from public.campaign_battles where id = (select battle from fx)), 'the battle is played, camp A wins');
select pg_temp.ok((select public.campaign_view((select id from fx)) -> 'places' -> 1 ->> 'owner') = 'A', 'the winner takes the place');
select pg_temp.expect_error($q$select public.record_campaign_battle((select battle from fx), 'B')$q$, 'already_played', 'a battle is recorded once');

-- ---------- Saving the board ----------
select pg_temp.as_user(pg_temp.uid(41));
select pg_temp.expect_error($q$select public.save_campaign_state((select id from fx), (select s from fx_board), 1)$q$, 'version_conflict', 'an old version is refused');
select public.save_campaign_state((select id from fx), public.campaign_view((select id from fx)) || '{"bg": "paper"}',
                                  (select version from public.campaigns where id = (select id from fx)), 'Le Voile d''Ambre (v2)', null, null, true);
select pg_temp.ok((select is_public and title = 'Le Voile d''Ambre (v2)' from public.campaigns where id = (select id from fx)), 'the master saves the board and makes it public');

-- ---------- Public read, strangers, members ----------
set role anon;
select pg_temp.as_user(null);
select pg_temp.ok(jsonb_array_length(public.campaign_view((select id from fx)) -> 'routes') = 3, 'a public campaign is readable, without secret routes');
select pg_temp.ok((select count(*) from public.campaign_log where campaign_id = (select id from fx)) >= 7, 'its journal is readable');
select pg_temp.expect_error($q$select public.record_campaign_action((select id from fx), 'A', 'take', '2')$q$, '42501', 'visitors cannot act');
set role authenticated;
select pg_temp.as_user(pg_temp.uid(44));
select pg_temp.expect_error($q$select public.record_campaign_action((select id from fx), 'A', 'take', '2')$q$, 'not_your_camp', 'a non-member cannot act on a public campaign');
select pg_temp.as_user(pg_temp.uid(41));
select public.set_campaign_member((select id from fx), pg_temp.uid(42), null, true);
select pg_temp.ok((select count(*) from public.campaign_members where campaign_id = (select id from fx)) = 2, 'the master removes a player');
select pg_temp.expect_error($q$select public.leave_campaign((select id from fx))$q$, 'master_stays', 'the master cannot leave');
select public.delete_campaign((select id from fx));
select pg_temp.ok((select count(*) from public.campaign_log where campaign_id = (select id from fx)) = 0, 'deleting the campaign removes its journal');

reset role;
select 'narrative campaign tests passed';
