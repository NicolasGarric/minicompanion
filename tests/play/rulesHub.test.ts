import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, embeddable, searchGames } from '../../src/play/data/rulesHub.ts';
import { isRefUrl } from '../../src/core/lib/refLinks.ts';
import { rightsMessage } from '../../src/core/feedback/rightsMessage.ts';

test('every hub game has a unique id, https links and at least one link', () => {
  const ids = new Set(GAMES.map((g) => g.id));
  assert.equal(ids.size, GAMES.length);
  for (const g of GAMES) {
    assert.ok(g.links.length > 0, g.id);
    for (const l of g.links) assert.ok(isRefUrl(l.u), `${g.id}: ${l.u}`);
  }
});

test('publisher-owned rules are never embeddable', () => {
  for (const g of GAMES) if (g.licence === 'owner') assert.equal(embeddable(g.licence), 'no', g.id);
  assert.equal(embeddable('cc_by_sa_4'), 'yes');
  assert.equal(embeddable('cc_by_nd_4'), 'verbatim');
});

test('hub search ignores case and accents, and filters', () => {
  assert.ok(searchGames(GAMES, 'STARCRAFT').some((g) => g.id === 'starcraft'));
  assert.ok(searchGames(GAMES, 'atomic mass').length >= 3);
  assert.ok(searchGames(GAMES, '', { family: 'gw' }).every((g) => g.publisher === 'Games Workshop'));
  assert.equal(searchGames(GAMES, 'zzz-none').length, 0);
});

test('rights request message is tagged and within the inbox limit', () => {
  const m = rightsMessage('holder', ' https://example.org/x ', 'x'.repeat(5000));
  assert.ok(m.startsWith('[RIGHTS] holder\nhttps://example.org/x\n\n'));
  assert.equal(m.length, 2000);
});
