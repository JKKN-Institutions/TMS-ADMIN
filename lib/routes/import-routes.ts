import type { SupabaseClient } from '@supabase/supabase-js';
import type { ParsedRoute } from './parse-route-workbook';

/**
 * Shared route-import write path. Used by BOTH the HTTP endpoint
 * (app/api/admin/routes/import) and the one-time data loader, so the upsert
 * behaviour is identical in production and in scripted backfills.
 *
 * Per route:
 *   1. Upsert tms_route, matched on the unique route_number (insert if new,
 *      update otherwise — preserving created_by on existing rows).
 *   2. Replace tms_route_stop: delete the route's existing stops, then insert the
 *      parsed set. Delete-then-insert keeps re-imports idempotent and respects
 *      the FK (on delete cascade) + the "application owns ordering" note on
 *      sequence_order in the schema.
 *
 * A failure on one route is recorded and does not abort the rest (best-effort).
 */

export interface RouteImportRowResult {
  routeNumber: string;
  routeName: string;
  status: 'created' | 'updated' | 'error';
  stops?: number;
  message?: string;
}

export interface RouteImportResult {
  success: true;
  created: number;
  updated: number;
  failed: number;
  totalStops: number;
  results: RouteImportRowResult[];
}

interface ApplyOptions {
  userId?: string | null;
}

// Loosely typed: accepts either the service-role client or any compatible client.
type Db = SupabaseClient<any, any, any>;

export async function applyRouteImport(
  db: Db,
  routes: ParsedRoute[],
  opts: ApplyOptions = {}
): Promise<RouteImportResult> {
  const userId = opts.userId ?? null;
  const results: RouteImportRowResult[] = [];
  let created = 0;
  let updated = 0;
  let failed = 0;
  let totalStops = 0;

  // Preload existing route ids so we can distinguish insert vs update.
  const numbers = routes.map((r) => r.route_number).filter(Boolean);
  const existing = new Map<string, string>();
  if (numbers.length) {
    const { data } = await db.from('tms_route').select('id, route_number').in('route_number', numbers);
    for (const row of (data ?? []) as { id: string; route_number: string }[]) {
      existing.set(String(row.route_number), row.id);
    }
  }

  for (const route of routes) {
    const header = {
      route_number: route.route_number,
      route_name: route.route_name,
      route_code: route.route_code,
      start_location: route.start_location,
      end_location: route.end_location,
      departure_time: route.departure_time,
      arrival_time: route.arrival_time,
      distance: route.distance,
      duration: route.duration,
      total_capacity: route.total_capacity,
      fare: route.fare,
      status: route.status,
      updated_by: userId,
    };

    try {
      const wasExisting = existing.has(route.route_number);
      let routeId = existing.get(route.route_number);

      if (wasExisting && routeId) {
        const { error } = await db.from('tms_route').update(header).eq('id', routeId);
        if (error) throw error;
      } else {
        const { data, error } = await db
          .from('tms_route')
          .insert({ ...header, created_by: userId })
          .select('id')
          .single();
        if (error) throw error;
        routeId = (data as { id: string }).id;
        existing.set(route.route_number, routeId);
      }

      // Replace stops.
      const del = await db.from('tms_route_stop').delete().eq('route_id', routeId);
      if (del.error) throw del.error;

      if (route.stops.length) {
        const stopRows = route.stops.map((s) => ({
          route_id: routeId,
          stop_name: s.stop_name,
          stop_time: s.stop_time,
          evening_time: s.evening_time,
          sequence_order: s.sequence_order,
          is_major_stop: s.is_major_stop,
        }));
        const ins = await db.from('tms_route_stop').insert(stopRows);
        if (ins.error) throw ins.error;
      }

      totalStops += route.stops.length;
      if (wasExisting) updated += 1;
      else created += 1;
      results.push({
        routeNumber: route.route_number,
        routeName: route.route_name,
        status: wasExisting ? 'updated' : 'created',
        stops: route.stops.length,
      });
    } catch (e) {
      failed += 1;
      results.push({
        routeNumber: route.route_number,
        routeName: route.route_name,
        status: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { success: true, created, updated, failed, totalStops, results };
}
