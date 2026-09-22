import { describe, it, expect } from 'vitest';
import { defaultLeg, learnerOutcome, inchargeDuty, headcountDelta, countRegistered } from './overview';

describe('defaultLeg', () => {
  it('morning before noon', () => { expect(defaultLeg(7 * 60)).toBe('onward'); expect(defaultLeg(11 * 60 + 59)).toBe('onward'); });
  it('evening from noon', () => { expect(defaultLeg(12 * 60)).toBe('return'); expect(defaultLeg(18 * 60)).toBe('return'); });
});

describe('learnerOutcome (first match wins)', () => {
  const base = { known: true, onThisRoute: true, bookedToday: true, feesOk: true };
  it('ok', () => expect(learnerOutcome(base)).toBe('ok'));
  it('unknown card beats everything', () => expect(learnerOutcome({ ...base, known: false, onThisRoute: false })).toBe('unknown_card'));
  it('wrong bus before not booked', () => expect(learnerOutcome({ ...base, onThisRoute: false, bookedToday: false })).toBe('wrong_bus'));
  it('not booked before fee due', () => expect(learnerOutcome({ ...base, bookedToday: false, feesOk: false })).toBe('not_booked'));
  it('fee due', () => expect(learnerOutcome({ ...base, feesOk: false })).toBe('fee_due'));
});

describe('inchargeDuty', () => {
  const incharges = [
    { staffEmail: 'a@jkkn.ac.in', name: 'Anu', phone: '9', profileIds: ['p1'], emails: ['a@jkkn.ac.in'] },
    { staffEmail: 'b@jkkn.ac.in', name: 'Bala', phone: null, profileIds: [], emails: ['b@jkkn.ac.in', 'bala@gmail.com'] },
    { staffEmail: 'c@jkkn.ac.in', name: 'Chitra', phone: null, profileIds: ['p3'], emails: ['c@jkkn.ac.in'] },
  ];
  const marks = [
    { scannedBy: 'p1', scannedAt: '2026-09-21T02:05:00Z', markerEmail: 'a@jkkn.ac.in' },
    { scannedBy: 'p1', scannedAt: '2026-09-21T02:01:00Z', markerEmail: 'a@jkkn.ac.in' },
    { scannedBy: 'p9', scannedAt: '2026-09-21T02:03:00Z', markerEmail: 'BALA@gmail.com' },
    { scannedBy: 'p7', scannedAt: '2026-09-21T02:04:00Z', markerEmail: 'x@jkkn.ac.in' },
  ];
  const r = inchargeDuty(incharges, marks, [{ staffEmail: 'C@jkkn.ac.in', coveredBy: 'Anu' }]);
  it('attributes marks by profile id and by any email, case-insensitively', () => {
    expect(r.duty[0]).toMatchObject({ name: 'Anu', marks: 2, firstAt: '2026-09-21T02:01:00Z', lastAt: '2026-09-21T02:05:00Z', absent: false });
    expect(r.duty[1]).toMatchObject({ name: 'Bala', marks: 1 });
  });
  it('flags declared absence with cover', () => expect(r.duty[2]).toMatchObject({ name: 'Chitra', marks: 0, absent: true, coveredBy: 'Anu' }));
  it('lists markers who are not assigned', () => expect(r.otherMarkers).toEqual([{ profileId: 'p7', marks: 1 }]));
});

describe('inchargeDuty edge cases', () => {
  it('counts a mark once, for the first in-charge that matches, when two share an email', () => {
    const r = inchargeDuty(
      [
        { staffEmail: 'a@jkkn.ac.in', name: 'First', phone: null, profileIds: [], emails: ['shared@jkkn.ac.in'] },
        { staffEmail: 'b@jkkn.ac.in', name: 'Second', phone: null, profileIds: [], emails: ['Shared@jkkn.ac.in'] },
      ],
      [{ scannedBy: 'p1', scannedAt: '2026-09-21T02:01:00Z', markerEmail: 'shared@jkkn.ac.in' }],
      [],
    );
    expect(r.duty[0].marks).toBe(1);
    expect(r.duty[1].marks).toBe(0);
    expect(r.otherMarkers).toEqual([]);
  });
  it('orders timestamps by time, not by string, across fractional-second formats', () => {
    const r = inchargeDuty(
      [{ staffEmail: 'a@jkkn.ac.in', name: 'A', phone: null, profileIds: ['p1'], emails: [] }],
      [
        { scannedBy: 'p1', scannedAt: '2026-09-21T02:01:00.500Z', markerEmail: null },
        { scannedBy: 'p1', scannedAt: '2026-09-21T02:01:00Z', markerEmail: null },
      ],
      [],
    );
    expect(r.duty[0].firstAt).toBe('2026-09-21T02:01:00Z');
    expect(r.duty[0].lastAt).toBe('2026-09-21T02:01:00.500Z');
  });
});

describe('headcountDelta', () => {
  it('no count yet', () => expect(headcountDelta(null, 10)).toEqual({ diff: null, label: 'Not counted yet' }));
  it('matches', () => expect(headcountDelta(10, 10)).toEqual({ diff: 0, label: 'Matches boarded count' }));
  it('extra people', () => expect(headcountDelta(12, 10)).toEqual({ diff: 2, label: '2 more than boarded' }));
  it('missing people', () => expect(headcountDelta(9, 10)).toEqual({ diff: -1, label: '1 fewer than boarded' }));
});

describe('countRegistered', () => {
  it('totals learners and groups them by stop, counting missing stops separately', () => {
    expect(countRegistered(['s1', 's1', 's2', null])).toEqual({ total: 4, byStop: { s1: 2, s2: 1 }, noStop: 1 });
  });
  it('empty route', () => {
    expect(countRegistered([])).toEqual({ total: 0, byStop: {}, noStop: 0 });
  });
});
