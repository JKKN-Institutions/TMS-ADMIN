/** Write whitelists for the modernized Schedule Management writers. */
export interface ServiceCalendarInput {
  exception_date: string;
  route_id: string | null;
  kind: 'holiday' | 'no_service';
  note: string | null;
}
export function pickServiceCalendar(body: Record<string, unknown>): ServiceCalendarInput | { error: string } {
  const date = String(body.exception_date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'exception_date must be YYYY-MM-DD' };
  const kind = body.kind === 'no_service' ? 'no_service' : body.kind === 'holiday' ? 'holiday' : null;
  if (!kind) return { error: "kind must be 'holiday' or 'no_service'" };
  const routeId = typeof body.route_id === 'string' && body.route_id.trim() ? body.route_id.trim() : null;
  const note = body.note == null ? null : String(body.note).slice(0, 280);
  return { exception_date: date, route_id: routeId, kind, note };
}

export interface BookingWindowInput {
  route_id: string;
  travel_date: string;
  booking_enabled: boolean;
  deadline: string | null;
  capacity_override: number | null;
  note: string | null;
}
export function pickBookingWindow(body: Record<string, unknown>): BookingWindowInput | { error: string } {
  const routeId = typeof body.route_id === 'string' ? body.route_id.trim() : '';
  const date = String(body.travel_date ?? '');
  if (!routeId) return { error: 'route_id is required' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'travel_date must be YYYY-MM-DD' };
  const enabled = body.booking_enabled !== false; // default true
  const deadline = body.deadline ? String(body.deadline) : null;
  const cap = body.capacity_override == null || body.capacity_override === ''
    ? null : Number(body.capacity_override);
  if (cap != null && (!Number.isFinite(cap) || cap < 0)) return { error: 'capacity_override must be a non-negative number' };
  const note = body.note == null ? null : String(body.note).slice(0, 280);
  return { route_id: routeId, travel_date: date, booking_enabled: enabled, deadline, capacity_override: cap, note };
}
