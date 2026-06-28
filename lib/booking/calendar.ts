/**
 * Month-grid view model for the learner Schedule page, layered on the pure
 * window logic. Adds the admin service-calendar gate (holiday / no-service).
 * The builder is pure + unit-tested; loadExceptions wraps the DB for the API.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { bookableDates, cutoffFor, dayStatus, isSunday } from './window';

export type CalendarStatus =
  | 'open' | 'booked' | 'locked' | 'closed'
  | 'holiday' | 'no_service' | 'weekly_off' | 'out_of_horizon';

export interface DayCell {
  date: string; // 'YYYY-MM-DD'
  status: CalendarStatus;
  note?: string | null;
}

export interface CalendarException {
  kind: 'holiday' | 'no_service';
  note: string | null;
}

export interface WindowOverride {
  enabled: boolean;
  deadline: string | null;        // ISO; overrides cutoffFor(date)
  capacityOverride: number | null;
}

/** Every 'YYYY-MM-DD' in a 'YYYY-MM' month, ascending. */
export function monthDays(monthStr: string): string[] {
  const [y, m] = monthStr.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month
  const out: string[] = [];
  for (let d = 1; d <= last; d++) out.push(`${monthStr}-${String(d).padStart(2, '0')}`);
  return out;
}

/** Is booking open for a date, honoring an optional window override? */
export function effectiveOpen(
  date: string,
  opts: { window?: WindowOverride; now?: Date }
): boolean {
  const now = opts.now ?? new Date();
  if (isSunday(date)) return false; // weekly holiday — never bookable
  if (opts.window && !opts.window.enabled) return false;
  if (!bookableDates(now).includes(date)) return false;
  const deadlineMs = opts.window?.deadline
    ? new Date(opts.window.deadline).getTime()
    : cutoffFor(date).getTime();
  return now.getTime() < deadlineMs;
}

/** Status for ONE date. A service-calendar exception wins over everything. */
export function cellStatus(
  date: string,
  opts: { hasBooking: boolean; exception?: CalendarException; window?: WindowOverride; now?: Date }
): CalendarStatus {
  if (opts.exception) return opts.exception.kind; // 'holiday' | 'no_service'
  // Sunday is a fixed weekly holiday. A real admin exception (above) still wins
  // so a named holiday can show its note; otherwise every Sunday reads weekly-off.
  // A legacy Sunday booking stays visible as 'locked' (non-actionable here).
  if (isSunday(date)) return opts.hasBooking ? 'locked' : 'weekly_off';
  const now = opts.now ?? new Date();
  if (!bookableDates(now).includes(date)) return opts.hasBooking ? 'locked' : 'out_of_horizon';
  // window-aware open/closed; falls back to the pure dayStatus when no window.
  if (opts.window) {
    const open = effectiveOpen(date, { window: opts.window, now });
    if (opts.hasBooking) return open ? 'booked' : 'locked';
    return open ? 'open' : 'closed';
  }
  const s = dayStatus(opts.hasBooking, date, now);
  return s === 'not_booked' ? 'open' : s;
}

/** Build all cells for a month from the learner's bookings + the gate. */
export function buildMonthCells(
  monthStr: string,
  opts: {
    bookedDates: Set<string>;
    exceptions: Map<string, CalendarException>;
    windows?: Map<string, WindowOverride>;
    now?: Date;
  }
): DayCell[] {
  return monthDays(monthStr).map((date) => {
    const exception = opts.exceptions.get(date);
    return {
      date,
      status: cellStatus(date, {
        hasBooking: opts.bookedDates.has(date),
        exception,
        window: opts.windows?.get(date),
        now: opts.now,
      }),
      note: exception?.note ?? null,
    };
  });
}

function isMissingTable(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '42P01';
}

/** Load service-calendar exceptions for [from,to] affecting a route (or all). */
export async function loadExceptions(
  svc: SupabaseClient,
  routeId: string | null,
  from: string,
  to: string
): Promise<Map<string, CalendarException>> {
  if (routeId && !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(routeId)) {
    throw new Error('loadExceptions: routeId must be a UUID');
  }
  const map = new Map<string, CalendarException>();
  let q = svc
    .from('tms_service_calendar')
    .select('exception_date, route_id, kind, note')
    .gte('exception_date', from)
    .lte('exception_date', to);
  q = routeId ? q.or(`route_id.is.null,route_id.eq.${routeId}`) : q.is('route_id', null);
  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error)) return map;
    throw error;
  }
  type Row = { exception_date: string; route_id: string | null; kind: 'holiday' | 'no_service'; note: string | null };
  for (const row of (data ?? []) as Row[]) {
    const existing = map.get(row.exception_date);
    // a route-specific row wins over an all-routes row for the same date
    if (!existing || row.route_id) map.set(row.exception_date, { kind: row.kind, note: row.note });
  }
  return map;
}

/** Load per-date booking-window overrides for a route over [from,to]. */
export async function loadWindows(
  svc: SupabaseClient,
  routeId: string | null,
  from: string,
  to: string
): Promise<Map<string, WindowOverride>> {
  const map = new Map<string, WindowOverride>();
  if (!routeId) return map;
  const { data, error } = await svc
    .from('tms_booking_window')
    .select('travel_date, booking_enabled, deadline, capacity_override')
    .eq('route_id', routeId)
    .gte('travel_date', from)
    .lte('travel_date', to);
  if (error) {
    if (isMissingTable(error)) return map;
    throw error;
  }
  type Row = { travel_date: string; booking_enabled: boolean; deadline: string | null; capacity_override: number | null };
  for (const r of (data ?? []) as Row[]) {
    map.set(r.travel_date, { enabled: r.booking_enabled, deadline: r.deadline, capacityOverride: r.capacity_override });
  }
  return map;
}
