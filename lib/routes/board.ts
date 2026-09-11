import { createServiceRoleClient } from '@/lib/supabase/server';
import type { DashboardRouteRow } from '@/lib/dashboard/types';

// Loader for the "Routes today" operations board.
//
// Lives here rather than inside an API route because the board moved out of the
// dashboard into Routes > Analytics, and a second caller (a future date-scoped
// view, or the dashboard again) should not have to copy the tallying rules.
//
// House rule inherited from the dashboard rewrite: a query that FAILS must not
// come back as a zero. Failures are collected by name so the page can say which
// figures are unreliable instead of quietly showing 0.

type Supa = ReturnType<typeof createServiceRoleClient>;

/** Rows per page when walking a table client-side. */
const PAGE = 1000;
/** Backstop against a filter that matches far more than intended. */
const MAX_PAGES = 50;

/** Collects the names of metrics whose query failed. */
export class Degraded {
  readonly keys: string[] = [];
  note(key: string, error: unknown) {
    if (!this.keys.includes(key)) this.keys.push(key);
    console.error(`[routes/board] ${key} failed:`, error);
  }
}

export interface RouteBoardResult {
  routes: DashboardRouteRow[];
  degraded: string[];
}

/**
 * Per-route booked/boarded figures plus the full operating detail, for one day.
 *
 * Deliberately a handful of queries rather than two per route: with 25 active
 * routes, per-route head-counts would be 50 round trips. Today's bookings,
 * attendance and stops are each pulled once as a bare id column and tallied in
 * memory instead.
 *
 * Vehicles and drivers are joined here rather than through a PostgREST embed,
 * because 6 active routes have no vehicle and 3 have no driver — a null
 * capacity has to keep meaning "no denominator" rather than "zero seats".
 */
export async function loadRouteBoard(date: string): Promise<RouteBoardResult> {
  const supabase = createServiceRoleClient();
  const degraded = new Degraded();

  try {
    const [routesRes, vehiclesRes, driversRes, tripsRes, bookingTally, boardedTally, stopTally] =
      await Promise.all([
        supabase
          .from('tms_route')
          .select(
            'id, route_number, route_name, route_code, start_location, end_location, ' +
              'departure_time, arrival_time, duration, driver_id, vehicle_id'
          )
          .eq('status', 'active')
          .order('route_number', { ascending: true }),
        supabase.from('tms_vehicle').select('id, registration_number, capacity'),
        supabase.from('staff').select('id, first_name, last_name').eq('role_key', 'driver'),
        supabase.from('tms_trip').select('route_id, status').eq('travel_date', date),
        tallyBy(supabase, 'tms_booking', 'route_id', ['travel_date', 'learner_id'],
          (q) => q.eq('travel_date', date), degraded, 'booked'),
        // Morning only: a learner can now also have an evening `direction =
        // 'return'` row the same day, and "boarded" here means the morning trip.
        tallyBy(supabase, 'tms_attendance', 'route_id', ['id'],
          (q) => q.eq('trip_date', date).eq('status', 'present').eq('direction', 'onward'),
          degraded, 'boarded'),
        tallyBy(supabase, 'tms_route_stop', 'route_id', ['id'],
          (q) => q.eq('is_active', true), degraded, 'stops'),
      ]);

    if (routesRes.error) {
      degraded.note('routes', routesRes.error);
      return { routes: [], degraded: degraded.keys };
    }
    // A failed lookup degrades one column, not the whole board — a row is still
    // worth showing without its bus registration or driver name.
    if (vehiclesRes.error) degraded.note('vehicles', vehiclesRes.error);
    if (driversRes.error) degraded.note('drivers', driversRes.error);
    if (tripsRes.error) degraded.note('trips', tripsRes.error);

    const vehicles = new Map<string, { registration: string | null; capacity: number | null }>();
    for (const v of asRows(vehiclesRes.data)) {
      vehicles.set(String(v.id), {
        registration: (v.registration_number as string) ?? null,
        capacity: v.capacity == null ? null : Number(v.capacity),
      });
    }

    const drivers = new Map<string, string>();
    for (const d of asRows(driversRes.data)) {
      const name = [d.first_name, d.last_name].filter(Boolean).join(' ').trim();
      if (name) drivers.set(String(d.id), name);
    }

    const trips = new Map<string, string>();
    for (const t of asRows(tripsRes.data)) {
      if (t.route_id) trips.set(String(t.route_id), String(t.status ?? ''));
    }

    const routes = asRows(routesRes.data).map((r): DashboardRouteRow => {
      const id = String(r.id);
      const bus = r.vehicle_id ? vehicles.get(String(r.vehicle_id)) : undefined;
      const driverId = r.driver_id ? String(r.driver_id) : null;
      return {
        id,
        routeNumber: String(r.route_number ?? ''),
        routeName: String(r.route_name ?? ''),
        routeCode: (r.route_code as string) ?? null,
        startLocation: (r.start_location as string) ?? null,
        endLocation: (r.end_location as string) ?? null,
        departureTime: (r.departure_time as string) ?? null,
        arrivalTime: (r.arrival_time as string) ?? null,
        duration: (r.duration as string) ?? null,
        stops: stopTally?.get(id) ?? 0,
        vehicleRegistration: bus?.registration ?? null,
        capacity: bus?.capacity ?? null,
        // A driver_id that resolves to no staff row still counts as assigned —
        // the assignment exists, we just cannot name them.
        hasDriver: driverId != null,
        driverName: driverId ? drivers.get(driverId) ?? null : null,
        tripStatus: trips.get(id) ?? null,
        booked: bookingTally?.get(id) ?? 0,
        boarded: boardedTally?.get(id) ?? 0,
      };
    });

    return { routes, degraded: degraded.keys };
  } catch (e) {
    degraded.note('board', e);
    return { routes: [], degraded: degraded.keys };
  }
}

/**
 * Counts rows grouped by one column.
 *
 * Paged with an explicit order: paging without a total order is undefined in
 * Postgres, so rows could repeat or vanish between pages and silently corrupt
 * the counts. The order key is each table's primary key.
 */
async function tallyBy(
  supabase: Supa,
  table: string,
  groupColumn: string,
  orderKey: string[],
  filter: (q: any) => any,
  degraded: Degraded,
  key: string
): Promise<Map<string, number> | null> {
  try {
    const counts = new Map<string, number>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE;
      let query = supabase.from(table).select(groupColumn).range(from, from + PAGE - 1);
      for (const col of orderKey) query = query.order(col, { ascending: true });
      query = filter(query);

      const { data, error } = await query;
      if (error) {
        degraded.note(key, error);
        return null;
      }
      const rows = (data ?? []) as unknown as Array<Record<string, string | null>>;
      for (const row of rows) {
        const g = row[groupColumn];
        if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
      }
      if (rows.length < PAGE) return counts;
    }
    degraded.note(key, new Error(`exceeded ${MAX_PAGES} pages`));
    return null;
  } catch (e) {
    degraded.note(key, e);
    return null;
  }
}

/** Narrows a PostgREST payload to plain rows without repeating the cast. */
function asRows(data: unknown): Array<Record<string, unknown>> {
  return (data ?? []) as Array<Record<string, unknown>>;
}
