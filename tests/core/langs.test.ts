import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localizedPath, splitLangPath } from '../../src/core/i18n/langs.ts';

test('language prefix is read from the address', () => {
  assert.deepEqual(splitLangPath('/ja/play/t/kanda'), { lang: 'ja', rest: '/play/t/kanda' });
  assert.deepEqual(splitLangPath('/fr'), { lang: 'fr', rest: '/' });
  assert.deepEqual(splitLangPath('/play'), { lang: null, rest: '/play' });
  assert.deepEqual(splitLangPath('/en/play'), { lang: null, rest: '/en/play' });
  assert.deepEqual(splitLangPath('/'), { lang: null, rest: '/' });
});

test('addresses in a language', () => {
  assert.equal(localizedPath('/play', 'ja'), '/ja/play');
  assert.equal(localizedPath('/', 'ko'), '/ko');
  assert.equal(localizedPath('/play', 'en'), '/play');
});
