import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankBoard, boardAt, isolated, progress, routeKey, winner, type Board } from '../../src/play/lib/narrativeBoard.ts';
import { TEMPLATES, templateBoard } from '../../src/play/data/campaignTemplates.ts';

const board = (): Board => {
  const b = blankBoard();
  b.places = [1, 2, 3, 4].map((id) => ({ id, name: `P${id}`, type: 'planet' as const, x: id * 100, y: 100, owner: null, capital: false, fort: 0, value: id, scenario: '', notes: '', map: null }));
  b.places[0] = { ...b.places[0], owner: 'A', capital: true };
  b.places[1] = { ...b.places[1], owner: 'A' };
  b.places[3] = { ...b.places[3], owner: 'B', capital: true };
  b.routes = [{ a: 1, b: 2, type: 'normal', owner: null, cut: false }, { a: 2, b: 3, type: 'normal', owner: null, cut: false }, { a: 3, b: 4, type: 'normal', owner: null, cut: false }];
  return b;
};

test('route keys do not depend on the direction', () => {
  assert.equal(routeKey({ a: 7, b: 2 }), routeKey({ a: 2, b: 7 }));
});

test('a place cut from its capital is isolated', () => {
  const b = board();
  assert.equal(isolated(b).size, 0);
  b.routes[0].cut = true;
  assert.deepEqual([...isolated(b)], [2]);
  // A place of another camp in between also isolates
  const c = board();
  c.places[1].owner = 'B';
  c.places[2].owner = 'A';
  assert.ok(isolated(c).has(3));
});

test('the replay shows the board of an earlier turn', () => {
  const b = board();
  const past = boardAt(b, { places: { '2': { owner: null, capital: false, fort: 0 } }, cut: ['1-2'], res: { A: 7 } });
  assert.equal(past.places[1].owner, null);
  assert.equal(past.places[0].owner, null, 'places missing from the snapshot are shown free');
  assert.equal(past.routes[0].cut, true);
  assert.equal(past.camps[0].res, 7);
  assert.equal(b.places[1].owner, 'A', 'the live board is untouched');
});

test('victory rules', () => {
  const b = board();
  assert.equal(winner(b, 0), null, 'nobody wins before the first turn');
  assert.equal(winner(b, 3), null, 'two capitals: no winner yet');
  b.places[3] = { ...b.places[3], owner: 'A', capital: false };
  assert.equal(winner(b, 4)?.id, 'A');
  assert.deepEqual(progress(b, 'A', 4), [1, 1]);
  const c = { ...board(), victory: { rule: 'count' as const, n: 2 } };
  assert.equal(winner(c, 1)?.id, 'A');
  const d = { ...board(), victory: { rule: 'turns' as const, n: 5 } };
  assert.equal(winner(d, 4), null);
  assert.equal(winner(d, 5)?.id, 'B', 'after N turns the highest value wins (B holds a place worth 4)');
});

test('templates are valid boards', () => {
  for (const t of TEMPLATES) {
    for (const lang of ['en', 'fr', 'ja', 'ko'] as const) {
      const b = templateBoard(t, lang, ['North', 'South']);
      const ids = new Set(b.places.map((p) => p.id));
      assert.equal(ids.size, b.places.length, `${t.key}: unique place ids`);
      assert.ok(b.routes.every((r) => ids.has(r.a) && ids.has(r.b) && r.a !== r.b), `${t.key}: routes join places`);
      assert.ok(b.places.every((p) => p.x >= 20 && p.x <= 880 && p.y >= 30 && p.y <= 580), `${t.key}: places on the board`);
      assert.ok(b.places.every((p) => p.name.length <= 40 && p.scenario.length <= 80 && p.notes.length <= 1000), `${t.key}: texts fit the database limits`);
      assert.equal(b.camps.filter((c) => b.places.some((p) => p.owner === c.id && p.capital)).length, 2, `${t.key}: one capital per camp`);
      assert.equal(b.camps[0].name, 'North');
      assert.equal(isolated(b).size, 0, `${t.key}: nothing isolated at the start`);
    }
  }
});
