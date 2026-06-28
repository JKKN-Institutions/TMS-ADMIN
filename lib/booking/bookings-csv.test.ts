import { describe, it, expect } from 'vitest';
import { toBookingsCsv } from './bookings-csv';
import type { BookingListRow } from './admin-list';

const row: BookingListRow = {
  key: 'L1:2026-07-01', learner_id: 'L1', learner_name: 'Rao, Asha', roll_number: '21CS001',
  travel_date: '2026-07-01', route_id: 'R1', route_label: '05 · Sankari', stop_id: 'S1',
  stop_name: 'Main Gate', booked_at: '2026-06-30T10:00:00Z', booked_by: 'P1', booked_by_label: 'Self',
};

describe('toBookingsCsv', () => {
  it('emits a header + one row, quoting fields with commas', () => {
    const csv = toBookingsCsv([row]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Travel Date,Learner,Roll,Route,Stop,Booked At,Booked By');
    // Learner contains a comma => must be quoted
    expect(lines[1]).toContain('"Rao, Asha"');
    expect(lines[1]).toContain('21CS001');
    expect(lines[1]).toContain('05 · Sankari');
  });

  it('returns just the header for no rows', () => {
    expect(toBookingsCsv([]).split('\n')).toHaveLength(1);
  });
});
