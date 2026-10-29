import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripeLink } from '../../src/core/support/stripeLink.ts';

test('only Stripe pages are used as donation links', () => {
  assert.equal(stripeLink(' https://buy.stripe.com/test_abc123 '), 'https://buy.stripe.com/test_abc123');
  assert.equal(stripeLink('https://donate.stripe.com/abc'), 'https://donate.stripe.com/abc');
  assert.equal(stripeLink('https://billing.stripe.com/p/login/abc'), 'https://billing.stripe.com/p/login/abc');
  assert.equal(stripeLink('http://buy.stripe.com/abc'), null, 'https only');
  assert.equal(stripeLink('https://buy.stripe.com.evil.example/abc'), null);
  assert.equal(stripeLink('https://evil.example/?https://buy.stripe.com'), null);
  assert.equal(stripeLink('javascript:alert(1)'), null);
  assert.equal(stripeLink(''), null);
  assert.equal(stripeLink(undefined), null);
});
