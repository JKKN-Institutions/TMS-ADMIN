/**
 * Pure view-model for the admin Bookings list. Turns raw tms_booking rows +
 * pre-fetched label maps into flat display rows. No Supabase client, no Date —
 * fully unit-testable. tms_booking has a composite PK (learner_id, travel_date)
 * and no surrogate id, so `key` is synthesized for the table row id.
 */
export interface RawBooking {
  learner_id: string;
  travel_date: string; // 'YYYY-MM-DD'
  route_id: string;
  stop_id: string | null;
  booked_at: string; // ISO
  booked_by: string | null;
}

export interface LearnerRef {
  name: string;
  roll: string | null;
  profileId: string | null;
}

export interface BookingRefs {
  learners: Map<string, LearnerRef>;
  routes: Map<string, string>; // route_id -> label
  stops: Map<string, string>; // stop_id -> stop_name
}

export interface BookingListRow {
  key: string;
  learner_id: string;
  learner_name: string;
  roll_number: string | null;
  travel_date: string;
  route_id: string;
  route_label: string;
  stop_id: string | null;
  stop_name: string | null;
  booked_at: string;
  booked_by: string | null;
  booked_by_label: 'Self' | 'Admin' | '—';
}

export type BookingDateStatus = 'today' | 'upcoming' | 'past';

export function bookingDateStatus(travelDate: string, today: string): BookingDateStatus {
  if (travelDate === today) return 'today';
  return travelDate > today ? 'upcoming' : 'past';
}

export function toBookingRow(b: RawBooking, refs: BookingRefs): BookingListRow {
  const learner = refs.learners.get(b.learner_id);
  const booked_by_label: BookingListRow['booked_by_label'] = !b.booked_by
    ? '—'
    : learner?.profileId && b.booked_by === learner.profileId
      ? 'Self'
      : 'Admin';
  return {
    key: `${b.learner_id}:${b.travel_date}`,
    learner_id: b.learner_id,
    learner_name: learner?.name || '—',
    roll_number: learner?.roll ?? null,
    travel_date: b.travel_date,
    route_id: b.route_id,
    route_label: refs.routes.get(b.route_id) || b.route_id,
    stop_id: b.stop_id,
    stop_name: b.stop_id ? refs.stops.get(b.stop_id) ?? null : null,
    booked_at: b.booked_at,
    booked_by: b.booked_by,
    booked_by_label,
  };
}
