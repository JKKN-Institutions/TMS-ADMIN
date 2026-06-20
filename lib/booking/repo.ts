/**
 * Server-only booking + capacity queries. Pass in the caller's service-role
 * client (createServiceRoleClient). These power the three enforcement layers
 * (pass, scan, roster) and the admin counts. The 42P01 guard lets these return
 * a safe default if the table is somehow absent (un-migrated env => passes stay
 * locked rather than throwing).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

function isMissingTable(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '42P01';
}

/** True if the learner has an active ('booked') booking for the given date. */
export async function hasBookingForDate(
  svc: SupabaseClient,
  learnerId: string,
  date: string
): Promise<boolean> {
  const { data, error } = await svc
    .from('tms_booking')
    .select('id')
    .eq('learner_id', learnerId)
    .eq('travel_date', date)
    .eq('status', 'booked')
    .maybeSingle();
  if (error && !isMissingTable(error)) throw error;
  return !!data;
}

/** Count of active bookings for a route on a date. */
export async function bookedCount(svc: SupabaseClient, routeId: string, date: string): Promise<number> {
  const { count, error } = await svc
    .from('tms_booking')
    .select('id', { count: 'exact', head: true })
    .eq('route_id', routeId)
    .eq('travel_date', date)
    .eq('status', 'booked');
  if (error && !isMissingTable(error)) throw error;
  return count ?? 0;
}

/** Count of onward walk-up attendance rows for a route on a date (seat accounting). */
export async function walkUpCount(svc: SupabaseClient, routeId: string, date: string): Promise<number> {
  const { count, error } = await svc
    .from('tms_attendance')
    .select('id', { count: 'exact', head: true })
    .eq('route_id', routeId)
    .eq('trip_date', date)
    .eq('is_walk_up', true)
    .eq('direction', 'onward');
  if (error && !isMissingTable(error)) throw error;
  return count ?? 0;
}

/** Seat capacity: the assigned vehicle's capacity, falling back to the route's. */
export async function routeCapacity(svc: SupabaseClient, routeId: string): Promise<number> {
  const { data: route } = await svc
    .from('tms_route')
    .select('total_capacity, vehicle_id')
    .eq('id', routeId)
    .maybeSingle();
  if (!route) return 0;
  if (route.vehicle_id) {
    const { data: v } = await svc
      .from('tms_vehicle')
      .select('capacity')
      .eq('id', route.vehicle_id)
      .maybeSingle();
    if (v && typeof v.capacity === 'number' && v.capacity > 0) return v.capacity;
  }
  return typeof route.total_capacity === 'number' ? route.total_capacity : 0;
}

/** Remaining seats = capacity − active bookings − onward walk-ups already added. */
export async function seatsRemaining(svc: SupabaseClient, routeId: string, date: string): Promise<number> {
  const [capacity, booked, walkUps] = await Promise.all([
    routeCapacity(svc, routeId),
    bookedCount(svc, routeId, date),
    walkUpCount(svc, routeId, date),
  ]);
  return capacity - booked - walkUps;
}
