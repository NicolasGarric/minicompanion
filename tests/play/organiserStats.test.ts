import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrationCurve, summarise, toCsv } from '../../src/play/lib/organiserStats.ts';

const reg = (user_id: string, created_at: string, status: 'registered' | 'waitlist' | 'withdrawn' | 'dropped' = 'registered', checked = false) => ({
  user_id,
  status,
  created_at,
  checked_in_at: checked ? created_at : null,
});

test('curve: one point per day, cumulative, empty days included', () => {
  const c = registrationCurve(
    [reg('a', '2026-10-01T10:00:00'), reg('b', '2026-10-01T18:00:00'), reg('c', '2026-10-03T09:00:00'), reg('d', '2026-10-02T09:00:00', 'withdrawn')],
    Date.parse('2026-10-04T12:00:00'),
  );
  assert.deepEqual(c, [
    { day: '2026-10-01', added: 2, total: 2 },
    { day: '2026-10-02', added: 0, total: 2 },
    { day: '2026-10-03', added: 1, total: 3 },
    { day: '2026-10-04', added: 0, total: 3 },
  ]);
});

test('curve: no registrations', () => {
  assert.deepEqual(registrationCurve([], Date.now()), []);
});

test('summary: lists, check-ins and the active round', () => {
  const s = summarise(
    [
      { ...reg('a', '2026-10-01', 'registered', true), list: { status: 'approved' } },
      { ...reg('b', '2026-10-01'), list: { status: 'submitted' } },
      { ...reg('c', '2026-10-01'), list: null },
      { ...reg('d', '2026-10-01', 'waitlist'), list: null },
      { ...reg('e', '2026-10-01', 'dropped'), list: { status: 'approved' } },
    ],
    [{ id: 'r1', status: 'finished' }, { id: 'r2', status: 'active' }],
    [
      { round_id: 'r2', player_b_id: 'b', status: 'reported' },
      { round_id: 'r2', player_b_id: 'd', status: 'disputed' },
      { round_id: 'r2', player_b_id: null, status: 'confirmed' },
      { round_id: 'r1', player_b_id: 'c', status: 'scheduled' },
    ],
  );
  assert.equal(s.registered, 3);
  assert.equal(s.waitlist, 1);
  assert.equal(s.dropped, 1);
  assert.equal(s.checkedIn, 1);
  assert.deepEqual(s.lists, { approved: 1, submitted: 1, rejected: 0, missing: 1 });
  assert.deepEqual(s.noList, ['b', 'c']);
  assert.deepEqual(s.notCheckedIn, ['b', 'c']);
  assert.equal(s.roundsDone, 1);
  assert.deepEqual(s.pending, { toPlay: 0, toConfirm: 1, disputed: 1 });
});

test('csv: quotes, line breaks and formula-looking cells', () => {
  assert.equal(toCsv([['a,b', 'say "hi"', 3], ['=SUM(A1)', null, 'line\nbreak']]), '"a,b","say ""hi""","3"\r\n"\'=SUM(A1)","","line\nbreak"\r\n');
});
