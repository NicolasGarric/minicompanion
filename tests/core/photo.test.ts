import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thumbOf, withThumbs } from '../../src/core/lib/photoPaths.ts';

test('thumbnail path of a new full image', () => {
  assert.equal(thumbOf('cat/abc.w.webp'), 'cat/abc.t.webp');
  assert.equal(thumbOf('u/x.w.jpg'), 'u/x.t.jpg');
  assert.equal(thumbOf('u/x.w.png'), 'u/x.t.png');
});

test('older files have no thumbnail', () => {
  assert.equal(thumbOf('game/123.jpg'), 'game/123.jpg');
  assert.equal(thumbOf('demo/contest-1.jpg'), 'demo/contest-1.jpg');
});

test('paths to sign: each once, thumbnails added', () => {
  assert.deepEqual(withThumbs(['a/1.w.webp', 'b/2.jpg', 'a/1.w.webp']), ['a/1.w.webp', 'a/1.t.webp', 'b/2.jpg']);
});
