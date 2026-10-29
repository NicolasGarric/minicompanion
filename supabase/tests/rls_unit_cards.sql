-- Tests for migration 23: My pile on the account, card info lists, composed decks, sharing, decks
-- attached to games, campaign copies that evolve through the journal.
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

-- 37 owns the cards, 38 plays against 37, 39 is a stranger.
reset role;
create temporary table fx (army uuid, garde uuid, capitaine uuid, eclaireurs uuid, deck uuid, code text, game uuid,
  campaign uuid, invite text, cdeck uuid, card uuid, log1 uuid, log2 uuid, log3 uuid);
grant all on fx to anon, authenticated;
insert into fx default values;
create or replace function pg_temp.photo(n int, k int) returns text language sql as $$
  select pg_temp.uid(n)::text || '/' || md5('pile-photo-' || k)::uuid::text || '.w.webp'
$$;
grant execute on function pg_temp.photo(int, int) to anon, authenticated;

-- ---------- My pile ----------
set role authenticated;
select pg_temp.as_user(pg_temp.uid(37));
with a as (insert into public.pile_armies (local_id, name, colour) values ('arm1', 'La Veille', '#33407a') returning id) update fx set army = (select id from a);
with u as (
  insert into public.pile_units (army_id, local_id, name, role, count, info, photos, card_photo)
  values ((select army from fx), 'u1', 'Garde d''élite', 'elite', 5,
          '[{"l": "Points", "t": "n", "v": 150}, {"l": "Endurance", "t": "n", "v": 8}, {"l": "Règle", "t": "t", "v": "Riposte"}]',
          jsonb_build_array(jsonb_build_object('p', pg_temp.photo(37, 1), 'at', 1), jsonb_build_object('p', pg_temp.photo(37, 2), 'at', 2)),
          pg_temp.photo(37, 1))
  returning id) update fx set garde = (select id from u);
with u as (insert into public.pile_units (army_id, local_id, name, role, info)
  values ((select army from fx), 'u2', 'Capitaine', 'leader', '[{"l": "Points", "t": "n", "v": 120}]') returning id) update fx set capitaine = (select id from u);
with u as (insert into public.pile_units (army_id, local_id, name, info)
  values ((select army from fx), 'u3', 'Éclaireurs', '[]') returning id) update fx set eclaireurs = (select id from u);
select pg_temp.ok((select count(*) from public.pile_units) = 3, 'the owner adds units with their card info');

select pg_temp.expect_error($q$insert into public.pile_units (army_id, name, info) values ((select army from fx), 'X', '[{"l": "Endurance", "t": "n", "v": "8"}]')$q$,
  '23514', 'a number line must hold a number');
select pg_temp.expect_error($q$insert into public.pile_units (army_id, name, info) values ((select army from fx), 'X', '[{"l": "Endurance", "t": "x", "v": 8}]')$q$,
  '23514', 'a line is a number or a text');
select pg_temp.expect_error($q$insert into public.pile_units (army_id, name, info) values ((select army from fx), 'X', '[{"l": "", "t": "t", "v": "a"}]')$q$,
  '23514', 'a line needs a label');
select pg_temp.expect_error($q$insert into public.pile_units (army_id, name, info) values ((select army from fx), 'X',
  (select jsonb_agg(jsonb_build_object('l', 'L' || i, 't', 'n', 'v', i)) from generate_series(1, 41) i))$q$,
  '23514', 'at most 40 lines');
select pg_temp.expect_error($q$insert into public.pile_units (army_id, name, photos) values ((select army from fx), 'X',
  jsonb_build_array(jsonb_build_object('p', pg_temp.photo(38, 1), 'at', 1)))$q$, 'not_your_photo', 'photos come from the owner''s folder');
select pg_temp.expect_error($q$update public.pile_units set card_photo = pg_temp.photo(37, 9) where id = (select garde from fx)$q$,
  'card_photo_not_in_photos', 'the card photo is one of the unit''s photos');
select pg_temp.expect_error($q$update public.pile_units set photos = '{"p": 1}' where id = (select garde from fx)$q$,
  'bad_photos', 'malformed photos are refused');

update public.pile_units set linked_to = (select garde from fx) where id = (select capitaine from fx);
select pg_temp.ok((select linked_to = (select garde from fx) from public.pile_units where id = (select capitaine from fx)), 'a hero is linked to a unit');
select pg_temp.expect_error($q$update public.pile_units set linked_to = (select capitaine from fx) where id = (select eclaireurs from fx)$q$,
  'link_depth', 'no link to a unit that is itself linked');
select pg_temp.expect_error($q$update public.pile_units set linked_to = (select eclaireurs from fx) where id = (select garde from fx)$q$,
  'link_depth', 'a unit others are linked to cannot be linked in turn');
insert into public.pile_armies (local_id, name) values ('arm1', 'Again') on conflict (owner_id, local_id) do nothing;
select pg_temp.ok((select count(*) from public.pile_armies) = 1, 'importing the same local army twice adds nothing');

select pg_temp.as_user(pg_temp.uid(38));
select pg_temp.ok((select count(*) from public.pile_units) = 0 and (select count(*) from public.pile_armies) = 0, 'another player sees nothing of my pile');
update public.pile_units set name = 'Hacked';
select pg_temp.expect_error($q$insert into public.pile_units (army_id, name) values ((select army from fx), 'X')$q$,
  'not_your_army', 'nobody adds a unit to my army');
select pg_temp.expect_error($q$insert into public.pile_units (army_id, owner_id, name) values ((select army from fx), pg_temp.uid(37), 'X')$q$,
  '42501', 'nobody writes a unit in my name');
select pg_temp.as_user(pg_temp.uid(37));
select pg_temp.ok((select name from public.pile_units where id = (select garde from fx)) = 'Garde d''élite', 'another player cannot change my units');

-- ---------- Photos ----------
insert into storage.objects (bucket_id, name, owner) values ('pile', pg_temp.photo(37, 1), pg_temp.uid(37));
select pg_temp.expect_error($q$insert into storage.objects (bucket_id, name, owner) values ('pile', pg_temp.photo(38, 3), pg_temp.uid(37))$q$,
  '42501', 'photos go to my own folder only');

-- ---------- Decks ----------
with d as (insert into public.decks (name, groups)
  values ('Liste 270', jsonb_build_array(jsonb_build_array((select garde from fx)::text, (select capitaine from fx)::text),
                                         jsonb_build_array(gen_random_uuid()::text))) returning id) update fx set deck = (select id from d);
select pg_temp.ok((select groups = jsonb_build_array(jsonb_build_array((select garde from fx)::text, (select capitaine from fx)::text))
                     from public.decks where id = (select deck from fx)), 'unknown cards drop out of the deck, the linked group stays in order');
select pg_temp.expect_error($q$update public.decks set groups = jsonb_build_array(jsonb_build_array((select garde from fx)::text), jsonb_build_array((select garde from fx)::text))
  where id = (select deck from fx)$q$, 'bad_groups', 'a card appears once in a deck');
select pg_temp.expect_error($q$update public.decks set share_code = 'abcdefabcdefabcd' where id = (select deck from fx)$q$,
  '42501', 'the share code is not written directly');
select pg_temp.ok((public.deck_view((select deck from fx)) -> 'cards') @> jsonb_build_array(jsonb_build_object('name', 'Garde d''élite', 'photo', pg_temp.photo(37, 1))),
  'the owner reads his deck with the chosen photo');

select pg_temp.as_user(pg_temp.uid(38));
select pg_temp.ok(public.deck_view((select deck from fx)) is null, 'a private deck is not readable by others');
select pg_temp.ok((select count(*) from public.decks) = 0, 'decks of others are not listed');
select pg_temp.expect_error($q$select public.deck_share((select deck from fx), true)$q$, 'not_owner', 'only the owner shares a deck');

select pg_temp.as_user(pg_temp.uid(37));
update fx set code = public.deck_share((select deck from fx), true);
select pg_temp.ok((select char_length(code) = 16 from fx), 'sharing gives a code');
select pg_temp.as_user(pg_temp.uid(38));
select pg_temp.ok(public.deck_view((select deck from fx)) is null, 'a shared deck still needs the code');
set role anon;
select pg_temp.as_user(null);
select pg_temp.ok(public.deck_view((select deck from fx)) is null, 'a visitor without the code sees nothing');
select pg_temp.ok(jsonb_array_length(public.deck_view((select deck from fx), (select code from fx)) -> 'cards') = 2, 'the link opens the deck without an account');
select pg_temp.ok(public.deck_view((select deck from fx), 'wrongwrongwrong0') is null, 'a wrong code shows nothing');
set role authenticated;
select pg_temp.as_user(pg_temp.uid(37));
select pg_temp.ok(public.deck_share((select deck from fx), false) is null, 'sharing can be turned off');
set role anon;
select pg_temp.as_user(null);
select pg_temp.ok(public.deck_view((select deck from fx), (select code from fx)) is null, 'the old link stops working');

-- ---------- A deck attached to a game ----------
reset role;
update fx set game = md5('cards-game')::uuid;
insert into public.games (id, host_id, game_system, starts_at, country, city, players_count, max_players, status)
values (md5('cards-game')::uuid, pg_temp.uid(37), 'Test Skirmish', now() + interval '2 days', 'JP', 'Tokyo', 2, 2, 'full');
insert into public.game_players (game_id, player_id, status) values (md5('cards-game')::uuid, pg_temp.uid(38), 'accepted');
set role authenticated;
select pg_temp.as_user(pg_temp.uid(39));
select pg_temp.expect_error($q$select public.set_game_deck((select game from fx), null)$q$, 'not_player', 'only the players of the game attach a deck');
select pg_temp.as_user(pg_temp.uid(38));
select pg_temp.expect_error($q$select public.set_game_deck((select game from fx), (select deck from fx))$q$, 'not_owner', 'a player attaches only his own deck');
select pg_temp.as_user(pg_temp.uid(37));
select public.set_game_deck((select game from fx), (select deck from fx));
select pg_temp.as_user(pg_temp.uid(38));
select pg_temp.ok((select count(*) from public.game_decks) = 1, 'the opponent sees which deck is attached');
select pg_temp.ok(jsonb_array_length(public.deck_view((select deck from fx)) -> 'cards') = 2, 'the opponent swipes the attached deck');
select pg_temp.as_user(pg_temp.uid(39));
select pg_temp.ok((select count(*) from public.game_decks) = 0 and public.deck_view((select deck from fx)) is null, 'a stranger to the game does not');

-- ---------- Campaign copies ----------
select pg_temp.as_user(pg_temp.uid(37));
update fx set campaign = public.create_campaign('Cartes', null, null, null, '{
  "bg": "blue",
  "places": [
    {"id": 1, "name": "Quorvane", "type": "station", "x": 100, "y": 300, "owner": "A", "capital": true, "fort": 0, "value": 2},
    {"id": 2, "name": "Durn-Kael", "type": "planet", "x": 800, "y": 200, "owner": "B", "capital": true, "fort": 0, "value": 3}
  ],
  "routes": [{"a": 1, "b": 2, "type": "normal", "cut": false}],
  "zones": [],
  "camps": [
    {"id": "A", "name": "Veilleurs", "color": "#ff4f7b", "shape": "shield", "sign": "eye", "motto": "", "res": 3, "heroes": []},
    {"id": "B", "name": "Compagnie", "color": "#ffd23f", "shape": "hex", "sign": "claw", "motto": "", "res": 2, "heroes": []}
  ],
  "custom": [],
  "victory": {"rule": "capital", "n": 8}
}'::jsonb, 'A');
update fx set invite = public.campaign_invite_code((select campaign from fx));
select pg_temp.as_user(pg_temp.uid(38));
select public.join_campaign((select campaign from fx), (select invite from fx), 'B');

select pg_temp.as_user(pg_temp.uid(39));
select pg_temp.expect_error($q$select public.bring_deck_to_campaign((select campaign from fx), (select deck from fx))$q$, 'not_your_camp', 'only a camp member brings a deck');
select pg_temp.as_user(pg_temp.uid(38));
select pg_temp.expect_error($q$select public.bring_deck_to_campaign((select campaign from fx), (select deck from fx))$q$, 'not_owner', 'a player brings only his own deck');
select pg_temp.as_user(pg_temp.uid(37));
update fx set cdeck = public.bring_deck_to_campaign((select campaign from fx), (select deck from fx));
update fx set card = (select id from public.campaign_cards where campaign_deck_id = (select cdeck from fx) and name = 'Garde d''élite');
select pg_temp.ok((select count(*) from public.campaign_cards where campaign_deck_id = (select cdeck from fx)) = 2, 'bringing a deck copies its cards');
select pg_temp.ok((select linked_to = (select card from fx) from public.campaign_cards where campaign_deck_id = (select cdeck from fx) and name = 'Capitaine'),
  'links follow the copy');
select pg_temp.ok((select jsonb_array_length(groups -> 0) = 2 and groups #>> '{0,0}' = (select card from fx)::text and camp = 'A'
                     from public.campaign_decks where id = (select cdeck from fx)), 'the copy keeps the scroll order and the camp');
-- Bringing it again before any change replaces the copy
update fx set cdeck = public.bring_deck_to_campaign((select campaign from fx), (select deck from fx));
update fx set card = (select id from public.campaign_cards where campaign_deck_id = (select cdeck from fx) and name = 'Garde d''élite');
select pg_temp.ok((select count(*) from public.campaign_cards where campaign_id = (select campaign from fx)) = 2, 'the copy can be replaced while nothing has evolved');

select pg_temp.as_user(pg_temp.uid(38));
select pg_temp.ok((select count(*) from public.campaign_cards where campaign_id = (select campaign from fx)) = 2, 'the other camp reads the cards of the campaign');
select pg_temp.expect_error($q$select public.evolve_campaign_card((select card from fx), '[]')$q$, 'not_your_card', 'the other camp does not change my cards');
select pg_temp.as_user(pg_temp.uid(39));
select pg_temp.ok((select count(*) from public.campaign_cards where campaign_id = (select campaign from fx)) = 0, 'a private campaign hides its cards');

select pg_temp.as_user(pg_temp.uid(37));
select pg_temp.expect_error($q$select public.evolve_campaign_card((select card from fx), '[{"l": "x", "t": "n", "v": "9"}]')$q$, 'bad_info', 'a bad list is refused');
select pg_temp.expect_error($q$select public.evolve_campaign_card((select card from fx), (select info from public.campaign_cards where id = (select card from fx)))$q$,
  'no_change', 'nothing to record when nothing changed');
update fx set log1 = public.evolve_campaign_card((select card from fx),
  '[{"l": "Points", "t": "n", "v": 150}, {"l": "Endurance", "t": "n", "v": 9}, {"l": "Règle", "t": "t", "v": "Riposte"}]', 'Bataille 3');
select pg_temp.ok((select info #>> '{1,v}' = '9' from public.campaign_cards where id = (select card from fx)), 'the card evolves in the campaign');
select pg_temp.ok((select info #>> '{1,v}' = '8' from public.pile_units where id = (select garde from fx)), 'the original card is untouched');
select pg_temp.ok((select effect = 'card' and camp = 'A' and detail #>> '{before,1,v}' = '8' and detail #>> '{after,1,v}' = '9' and detail ->> 'note' = 'Bataille 3'
                     from public.campaign_log where id = (select log1 from fx)), 'the change is in the journal, before and after');
select pg_temp.expect_error($q$select public.bring_deck_to_campaign((select campaign from fx), (select deck from fx))$q$, 'deck_has_history', 'a copy with history is not replaced');
select pg_temp.expect_error($q$select public.remove_campaign_deck((select campaign from fx))$q$, 'deck_has_history', 'nor removed');

-- Contest and undo
select pg_temp.as_user(pg_temp.uid(38));
select public.contest_campaign_action((select log1 from fx));
select pg_temp.as_user(pg_temp.uid(37));
select public.resolve_campaign_contest((select log1 from fx), true);
select pg_temp.ok((select info #>> '{1,v}' = '8' from public.campaign_cards where id = (select card from fx)), 'an upheld contest puts the card back');
update fx set log2 = public.evolve_campaign_card((select card from fx), '[{"l": "Endurance", "t": "n", "v": 9}]');
update fx set log3 = public.evolve_campaign_card((select card from fx), '[{"l": "Endurance", "t": "n", "v": 10}]');
select pg_temp.as_user(pg_temp.uid(38));
select public.contest_campaign_action((select log2 from fx));
select pg_temp.as_user(pg_temp.uid(37));
select pg_temp.expect_error($q$select public.resolve_campaign_contest((select log2 from fx), true)$q$, 'card_changed_since',
  'an older change is not undone over a newer one');
select public.resolve_campaign_contest((select log2 from fx), false);
select pg_temp.ok((select resolution = 'kept' from public.campaign_log where id = (select log2 from fx)), 'the master can keep it');

-- Leaving the campaign removes the copy; deleting a unit removes it from decks
select pg_temp.as_user(pg_temp.uid(38));
select pg_temp.ok((select count(*) from public.campaign_cards where campaign_id = (select campaign from fx)) = 2, 'cards stay while the player is in');
select pg_temp.as_user(pg_temp.uid(37));
delete from public.pile_units where id = (select capitaine from fx);
update public.decks set name = 'Liste 150' where id = (select deck from fx);
select pg_temp.ok((select groups = jsonb_build_array(jsonb_build_array((select garde from fx)::text)) from public.decks where id = (select deck from fx)),
  'a deleted unit leaves the deck at the next save');
select pg_temp.ok((select count(*) from public.campaign_cards where campaign_id = (select campaign from fx)) = 2, 'campaign copies survive the original');

reset role;
