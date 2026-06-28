import type { BookingListRow } from './admin-list';

const HEADERS = ['Travel Date', 'Learner', 'Roll', 'Route', 'Stop', 'Booked At', 'Booked By'] as const;

function csvCell(value: string): string {
  // Quote if the cell contains a comma, quote, or newline; double interior quotes.
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toBookingsCsv(rows: BookingListRow[]): string {
  const lines = [HEADERS.join(',')];
  for (const r of rows) {
    lines.push([
      r.travel_date,
      r.learner_name,
      r.roll_number ?? '',
      r.route_label,
      r.stop_name ?? '',
      r.booked_at,
      r.booked_by_label,
    ].map((c) => csvCell(String(c))).join(','));
  }
  return lines.join('\n');
}
