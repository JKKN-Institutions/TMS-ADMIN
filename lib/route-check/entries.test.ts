import { describe, it, expect } from 'vitest';
import { personEntryFromRow, tickIndex, notOnRouteOf, registeredCount, entryFeeState, type PersonDbRow } from './entries';
import type { CheckPersonEntry } from './types';

const row = (over: Partial<PersonDbRow>): PersonDbRow => ({
  id: 'p1', check_id: 'c1', person_kind: 'learner', learner_id: 'L1', staff_id: null,
  manual_type: null, manual_name: null, matched_by: 'jkkn_id', scanned_code: '123456-7',
  outcome: 'ok', on_route: true, booked: true, fee_state: 'paid', notes: null, created_at: '2026-09-22T01:00:00Z',
  booking_state: null, fee_fine_id: null, booking_fine_id: null, fine_note: null,
  ...over,
});
const names = {
  learners: new Map([['L1', { name: 'Anu', code: 'ES24031' }]]),
  staff: new Map([['S1', { name: 'Kumar', code: 'JKKN123' }]]),
};

describe('personEntryFromRow', () => {
  it('learner row takes name/code from the name book', () => {
    const e = personEntryFromRow(row({}), names);
    expect(e).toMatchObject({ id: 'p1', kind: 'learner', learnerId: 'L1', name: 'Anu', code: 'ES24031', outcome: 'ok', feeState: 'paid' });
  });
  it('staff row uses the staff book', () => {
    const e = personEntryFromRow(row({ person_kind: 'staff', learner_id: null, staff_id: 'S1', matched_by: 'staff_id' }), names);
    expect(e.name).toBe('Kumar'); expect(e.code).toBe('JKKN123'); expect(e.staffId).toBe('S1');
  });
  it('manual row uses manual_name; unknown row has no name and keeps the scanned code', () => {
    expect(personEntryFromRow(row({ person_kind: 'manual', learner_id: null, manual_type: 'outside', manual_name: 'Visitor', outcome: 'manual' }), names).name).toBe('Visitor');
    const u = personEntryFromRow(row({ person_kind: 'unknown', learner_id: null, outcome: 'unknown_card', scanned_code: 'ZZZ' }), names);
    expect(u.name).toBeNull(); expect(u.scannedCode).toBe('ZZZ');
  });
  it('a learner missing from the book still yields an entry with null name', () => {
    expect(personEntryFromRow(row({ learner_id: 'L9' }), names).name).toBeNull();
  });
});

describe('tickIndex', () => {
  const e = (over: Partial<CheckPersonEntry>): CheckPersonEntry => ({
    id: 'x', kind: 'learner', learnerId: null, staffId: null, name: null, code: null, outcome: 'ok',
    onRoute: null, booked: null, feeState: null, matchedBy: null, scannedCode: null, notes: null, createdAt: '',
    bookingState: null, feeFineId: null, bookingFineId: null, fineNote: null, ...over,
  });
  it('maps learner and staff ids to their outcome; unknown/manual are skipped', () => {
    const t = tickIndex([e({ learnerId: 'L1', outcome: 'ok' }), e({ kind: 'staff', staffId: 'S1', outcome: 'fee_unpaid' }), e({ kind: 'unknown', outcome: 'unknown_card' })]);
    expect(t.learners.get('L1')).toBe('ok'); expect(t.staff.get('S1')).toBe('fee_unpaid'); expect(t.learners.size).toBe(1);
  });
});

describe('notOnRouteOf / registeredCount', () => {
  it('only a "from another bus" marker is not-on-route', () => {
    expect(notOnRouteOf({ other_bus: { kind: 'from' } })).toBe(true);
    expect(notOnRouteOf({ other_bus: { kind: 'booked' } })).toBe(false);
    expect(notOnRouteOf({})).toBe(false);
  });
  it('registered excludes "from" rows', () => {
    expect(registeredCount([{}, { other_bus: { kind: 'from' } }, { other_bus: null }])).toBe(2);
  });
});

describe('personEntryFromRow — booking state and fine links', () => {
  it('maps booking state and fine links', () => {
    const e = personEntryFromRow({
      id: 'x', check_id: 'c', person_kind: 'learner', learner_id: 'L', staff_id: null, manual_type: null, manual_name: null,
      matched_by: 'jkkn_id', scanned_code: '1', outcome: 'ok', on_route: true, booked: true, fee_state: 'override',
      notes: null, created_at: '2026-09-23T00:00:00Z', booking_state: 'other_route', fee_fine_id: null, booking_fine_id: 'F', fine_note: 'raised',
    }, { learners: new Map([['L', { name: 'A', code: 'R1' }]]), staff: new Map() });
    expect(e).toMatchObject({ bookingState: 'other_route', bookingFineId: 'F', fineNote: 'raised', feeState: 'override' });
  });
});

describe('entryFeeState', () => {
  it('in-charge is exempt regardless of bills', () => {
    expect(entryFeeState({ isIncharge: true, hasBill: true, hasOutstanding: true })).toBe('exempt');
  });
  it('no bill → none; outstanding → unpaid; else paid', () => {
    expect(entryFeeState({ isIncharge: false, hasBill: false, hasOutstanding: false })).toBe('none');
    expect(entryFeeState({ isIncharge: false, hasBill: true, hasOutstanding: true })).toBe('unpaid');
    expect(entryFeeState({ isIncharge: false, hasBill: true, hasOutstanding: false })).toBe('paid');
  });
});
