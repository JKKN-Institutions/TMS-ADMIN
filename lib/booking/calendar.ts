/**
 * Month-grid view model for the learner Schedule page, layered on the pure
 * window logic. Adds the admin service-calendar gate (holiday / no-service).
 * The builder is pure + unit-tested; loadExceptions wraps the DB for the API.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { bookableDates, horizonDates, isSunday, type WindowOpts } from './window';

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

/**
 * Is booking open for a date, honoring an optional per-date window override plus
 * the injected config? The horizon walk already applies Sunday, the service
 * calendar and the standard cutoff.
 *
 * KNOWN GAP (pre-existing, out of scope): a per-date `deadline` set LATER than
 * the standard cutoff cannot rescue a date the walk has already dropped. The
 * override can only tighten the window, not widen it.
 *
 * `opts` EXTENDS WindowOpts and is forwarded to the walk wholesale rather than
 * destructured field by field. A new window option (allowSameDay, …) then reaches
 * the walk automatically instead of being silently dropped here — the failure mode
 * that hid the booking-cutoff disconnect before.
 */
export function effectiveOpen(
  date: string,
  opts: WindowOpts & { window?: WindowOverride; now?: Date }
): boolean {
  const now = opts.now ?? new Date();
  if (opts.window && !opts.window.enabled) return false;
  const inWindow = bookableDates(now, opts).includes(date);
  if (!inWindow) return false;
  if (opts.window?.deadline) return now.getTime() < new Date(opts.window.deadline).getTime();
  return true;
}

/** Status for ONE date. A service-calendar exception wins over everything. */
export function cellStatus(
  date: string,
  opts: WindowOpts & {
    hasBooking: boolean;
    exception?: CalendarException;
    window?: WindowOverride;
    now?: Date;
  }
): CalendarStatus {
  if (opts.exception) return opts.exception.kind; // 'holiday' | 'no_service'
  if (isSunday(date)) return opts.hasBooking ? 'locked' : 'weekly_off';

  const now = opts.now ?? new Date();

  if (effectiveOpen(date, { ...opts, now })) {
    return opts.hasBooking ? 'booked' : 'open';
  }
  // Inside the labelled horizon but not open => the cutoff passed (or an admin
  // disabled the date). Distinct from a day that was never in range at all.
  if (horizonDates(now, opts).includes(date)) {
    return opts.hasBooking ? 'locked' : 'closed';
  }
  return opts.hasBooking ? 'locked' : 'out_of_horizon';
}

/** Build all cells for a month from the learner's bookings + the gate. */
export function buildMonthCells(
  monthStr: string,
  opts: WindowOpts & {
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
        ...opts,
        hasBooking: opts.bookedDates.has(date),
        exception,
        window: opts.windows?.get(date),
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
