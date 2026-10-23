import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeHref } from '../../src/core/lib/url.ts';

test('web addresses are kept', () => {
  assert.equal(safeHref('https://example.com/shop'), 'https://example.com/shop');
  assert.equal(safeHref(' http://example.com '), 'http://example.com/');
});

test('scripts and other schemes never become links', () => {
  for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', 'file:///etc/passwd', '//evil.example', 'not a url', '', null, undefined]) {
    assert.equal(safeHref(bad), undefined, String(bad));
  }
});

test('in-app routes only when allowed', () => {
  assert.equal(safeHref('/play/t/abc', { allowApp: true }), '/play/t/abc');
  assert.equal(safeHref('/play/t/abc'), undefined);
  assert.equal(safeHref('//evil.example/x', { allowApp: true }), undefined);
  assert.equal(safeHref('/x" onclick="y', { allowApp: true }), undefined);
});
