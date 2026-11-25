import test from 'node:test';
import assert from 'node:assert/strict';
import { fileBatches } from '../../src/core/auth/fileBatches.ts';

test('files are removed bucket by bucket, 100 at a time, none lost', () => {
  const files = [
    ...Array.from({ length: 250 }, (_, i) => ({ bucket: 'pile', name: `p${i}` })),
    { bucket: 'gallery', name: 'g0' },
  ];
  const out = fileBatches(files);
  assert.deepEqual(out.map((b) => [b.bucket, b.names.length]), [['pile', 100], ['pile', 100], ['pile', 50], ['gallery', 1]]);
  assert.equal(new Set(out.flatMap((b) => b.names)).size, 251);
  assert.deepEqual(fileBatches([]), []);
});
