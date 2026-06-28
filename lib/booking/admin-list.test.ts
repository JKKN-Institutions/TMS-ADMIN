import { describe, it, expect } from 'vitest';
import { toBookingRow, bookingDateStatus, type BookingRefs } from './admin-list';

const refs: BookingRefs = {
  learners: new Map([
    ['L1', { name: 'Asha Rao', roll: '21CS001', profileId: 'P1' }],
    ['L2', { name: '', roll: null, profileId: null }],
  ]),
  routes: new Map([['R1', '05 · Sankari']]),
  stops: new Map([['S1', 'Main Gate']]),
};

describe('toBookingRow', () => {
  it('denormalizes a full row and marks self-booking', () => {
    const row = toBookingRow(
      { learner_id: 'L1', travel_date: '2026-07-01', route_id: 'R1', stop_id: 'S1', booked_at: '2026-06-30T10:00:00Z', booked_by: 'P1' },
      refs
    );
    expect(row.key).toBe('L1:2026-07-01');
    expect(row.learner_name).toBe('Asha Rao');
    expect(row.roll_number).toBe('21CS001');
    expect(row.route_label).toBe('05 · Sankari');
    expect(row.stop_name).toBe('Main Gate');
    expect(row.booked_by_label).toBe('Self');
  });

  it('falls back when labels are missing and flags admin/unknown booker', () => {
    const admin = toBookingRow(
      { learner_id: 'L2', travel_date: '2026-07-02', route_id: 'RX', stop_id: null, booked_at: '2026-07-01T10:00:00Z', booked_by: 'SOMEADMIN' },
      refs
    );
    expect(admin.learner_name).toBe('—');
    expect(admin.route_label).toBe('RX'); // falls back to id
    expect(admin.stop_name).toBeNull();
    expect(admin.booked_by_label).toBe('Admin');

    const none = toBookingRow(
      { learner_id: 'L2', travel_date: '2026-07-02', route_id: 'R1', stop_id: null, booked_at: '2026-07-01T10:00:00Z', booked_by: null },
      refs
    );
    expect(none.booked_by_label).toBe('—');
  });
});

describe('bookingDateStatus', () => {
  it('classifies relative to today', () => {
    expect(bookingDateStatus('2026-06-28', '2026-06-28')).toBe('today');
    expect(bookingDateStatus('2026-06-29', '2026-06-28')).toBe('upcoming');
    expect(bookingDateStatus('2026-06-27', '2026-06-28')).toBe('past');
  });
});
