import { describe, expect, it } from 'vitest';
import { judgeTappedAt, partitionByTap } from './tapped-at';
import type { AttendanceWindows } from './attendance-window';

// Morning 07:00–09:30 IST == 01:30–04:00 UTC. Evening 16:30–19:00 IST == 11:00–13:30 UTC.
const W: AttendanceWindows = {
  onward: { direction: 'onward', start: '07:00', end: '09:30', enabled: true, active: true },
  return: { direction: 'return', start: '16:30', end: '19:00', enabled: true, active: true },
};
const at = (iso: string) => new Date(iso);

describe('judgeTappedAt', () => {
  const now = at('2026-09-11T03:00:00Z'); // 08:30 IST, morning open

  it('treats a missing tap time as tapped now', () => {
    expect(judgeTappedAt(undefined, now, W, undefined)).toEqual({ ok: true, tripDate: '2026-09-11', at: now, direction: 'onward' });
    expect(judgeTappedAt('', now, W, 'onward')).toEqual({ ok: true, tripDate: '2026-09-11', at: now, direction: 'onward' });
  });

  it('refuses an unparseable time', () => {
    expect(judgeTappedAt('garbage', now, W, 'onward')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('clamps a fast phone clock to now when the tap is still today in IST', () => {
    expect(judgeTappedAt('2026-09-11T03:01:30Z', now, W, 'onward')).toEqual({ ok: true, tripDate: '2026-09-11', at: now, direction: 'onward' });
    expect(judgeTappedAt('2026-09-11T03:03:00Z', now, W, 'onward')).toEqual({ ok: true, tripDate: '2026-09-11', at: now, direction: 'onward' });
  });

  it('refuses a tap from an earlier IST day', () => {
    expect(judgeTappedAt('2026-09-10T03:00:00Z', now, W, 'onward')).toEqual({ ok: false, reason: 'stale' });
  });

  it('refuses a tap that arrives after IST midnight', () => {
    const afterMidnight = at('2026-09-11T18:31:00Z'); // 00:01 IST on the 12th
    expect(judgeTappedAt('2026-09-11T03:00:00Z', afterMidnight, W, 'onward')).toEqual({ ok: false, reason: 'stale' });
  });

  it('refuses a tap dated tomorrow in IST even inside the skew', () => {
    const lateNight = at('2026-09-11T18:29:00Z'); // 23:59 IST
    expect(judgeTappedAt('2026-09-11T18:30:30Z', lateNight, W, 'onward', { exemptWindow: true }))
      .toEqual({ ok: false, reason: 'future' });
  });

  it('judges the window at the TAP time, not the arrival time', () => {
    const later = at('2026-09-11T05:00:00Z'); // 10:30 IST, both windows closed
    expect(judgeTappedAt('2026-09-11T03:55:00Z', later, W, 'onward')).toEqual({
      ok: true, tripDate: '2026-09-11', at: at('2026-09-11T03:55:00Z'), direction: 'onward',
    });
    const closed = judgeTappedAt('2026-09-11T04:05:00Z', later, W, 'onward');
    expect(closed).toMatchObject({ ok: false, reason: 'outside_window' });
    expect(closed.ok === false && closed.error).toMatch(/Attendance is open/);
  });

  it('keeps a morning tap a morning mark when it arrives in the evening', () => {
    const evening = at('2026-09-11T12:00:00Z'); // 17:30 IST, evening open
    expect(judgeTappedAt('2026-09-11T03:00:00Z', evening, W, 'onward')).toMatchObject({ ok: true, direction: 'onward' });
    expect(judgeTappedAt('2026-09-11T11:30:00Z', evening, W, 'return')).toMatchObject({ ok: true, direction: 'return' });
  });

  it('refuses a tap whose named trip was not open at the tap time', () => {
    expect(judgeTappedAt('2026-09-11T03:00:00Z', at('2026-09-11T05:00:00Z'), W, 'return'))
      .toMatchObject({ ok: false, reason: 'wrong_trip' });
  });

  it('refuses an evening mark once evening attendance is switched off', () => {
    const off: AttendanceWindows = { ...W, return: { ...W.return, active: false } };
    expect(judgeTappedAt('2026-09-11T11:30:00Z', at('2026-09-11T12:00:00Z'), off, 'return', { exemptWindow: true }))
      .toMatchObject({ ok: false, reason: 'evening_off' });
  });

  it('includes the window start and excludes the window end', () => {
    const later = at('2026-09-11T06:00:00Z');
    expect(judgeTappedAt('2026-09-11T01:30:00Z', later, W, 'onward').ok).toBe(true);
    expect(judgeTappedAt('2026-09-11T04:00:00Z', later, W, 'onward')).toMatchObject({ ok: false, reason: 'outside_window' });
  });

  it('skips the window for exempt callers but keeps the day rules', () => {
    const later = at('2026-09-11T05:00:00Z');
    expect(judgeTappedAt('2026-09-11T04:05:00Z', later, W, 'onward', { exemptWindow: true }))
      .toMatchObject({ ok: true, direction: 'onward' });
    expect(judgeTappedAt('2026-09-10T03:00:00Z', later, W, 'onward', { exemptWindow: true }))
      .toEqual({ ok: false, reason: 'stale' });
  });

  it('treats a morning window without enforced hours as always open', () => {
    const open: AttendanceWindows = { ...W, onward: { ...W.onward, enabled: false } };
    expect(judgeTappedAt('2026-09-11T05:00:00Z', at('2026-09-11T06:00:00Z'), open, 'onward').ok).toBe(true);
  });

  it('refuses an unknown trip name', () => {
    expect(judgeTappedAt('2026-09-11T03:00:00Z', now, W, 'midday')).toMatchObject({ ok: false, reason: 'invalid' });
  });
});

describe('partitionByTap', () => {
  it('splits accepted from rejected and reports the IST trip date and trip', () => {
    const now = at('2026-09-11T03:05:00Z');
    const marks = [
      { clientId: 'a', tappedAt: '2026-09-11T03:00:00Z' },
      { clientId: 'b', tappedAt: 'garbage' },
      { clientId: 'c' },
    ];
    const out = partitionByTap(marks, now, W, 'onward');
    expect(out.tripDate).toBe('2026-09-11');
    expect(out.accepted.map((a) => [a.mark.clientId, a.direction])).toEqual([['a', 'onward'], ['c', 'onward']]);
    expect(out.accepted[0].at).toEqual(at('2026-09-11T03:00:00Z'));
    expect(out.accepted[1].at).toEqual(now);
    expect(out.rejected).toEqual([{ mark: marks[1], reason: 'invalid' }]);
  });
});
