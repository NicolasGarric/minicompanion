import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeDeck, deckLink, type Deck } from '../../src/paint/hobby/deckCodec.ts';

// deckLink builds an absolute URL from the page location
(globalThis as unknown as { location: { origin: string } }).location = { origin: 'https://example.test' };

test('an army deck survives the share link', async () => {
  const deck: Deck = {
    name: 'Blue Guard',
    colour: '#1d2a5b',
    cards: [
      { name: 'Captain Ren', role: 'leader', count: 1, points: 120, stars: 3, note: 'Never retreats.', painted: 1 },
      { name: 'Spear squad', role: 'troop', count: 10, painted: 6 },
    ],
  };
  const link = await deckLink(deck);
  assert.ok(link.startsWith('https://example.test/#/d/'));
  const back = await decodeDeck(link.split('#/d/')[1]);
  assert.equal(back.name, 'Blue Guard');
  assert.equal(back.cards.length, 2);
  assert.deepEqual(back.cards[0], deck.cards[0]);
  assert.equal(back.cards[1].points, undefined);
});

test('a damaged link is refused', async () => {
  await assert.rejects(() => decodeDeck('xnot-a-deck'));
});
