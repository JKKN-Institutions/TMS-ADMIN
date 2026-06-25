/**
 * Route Optimization — apply & rollback (Phase 2).
 *
 * applyConsolidations RE-RUNS the analysis server-side (never trusts a client
 * move-list), keeps only the feasible moves for the admin-selected source
 * routes, and moves each booking (UPDATE tms_booking.route_id/stop_id). Every
 * move is snapshotted into tms_route_optimization_item under one
 * tms_route_optimization run header, so rollbackRun can put each booking back.
 *
 * Safety:
 *  - A move only fires if the booking is STILL on the source route
 *    (`.eq('route_id', fromRouteId)`), so a double-apply or a concurrent change
 *    can't move someone twice or move the wrong row.
 *  - Rollback only restores a booking that is STILL on the route we moved it to,
 *    so it never clobbers a later manual reassignment.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadOptimizationAnalysis } from './data';
import {
  planManualMoves,
  type MoveRequest,
  type RouteCapacity,
  type CurrentAllocation,
} from './allocate';
import { normalizeStopName } from './engine';

const CHUNK = 150;
const DEFAULT_DAILY_BUS_COST = 2500;

export interface ApplyParams {
  date: string;
  threshold: number;
  routeIds: string[];
  actorId: string | null;
}

export interface ApplyResult {
  runId: string;
  date: string;
  totalMoves: number;
  routesCancelled: number;
  estimatedSavings: number;
  skipped: number;
}

export async function applyConsolidations(
  supabase: SupabaseClient,
  { date, threshold, routeIds, actorId }: ApplyParams
): Promise<ApplyResult> {
  const analysis = await loadOptimizationAnalysis(supabase, date, threshold);
  const selectedIds = new Set(routeIds);
  const selected = analysis.suggestions.filter((s) => selectedIds.has(s.routeId));

  const moves = selected.flatMap((s) =>
    s.relocations
      .filter((r) => r.feasible && r.targetRouteId)
      .map((r) => ({
        learnerId: r.learnerId,
        learnerLabel: r.learnerRoll ? `${r.learnerName} (${r.learnerRoll})` : r.learnerName,
        fromRouteId: s.routeId,
        fromRouteLabel: s.routeName,
        fromStopId: r.fromStopId,
        toRouteId: r.targetRouteId as string,
        toRouteLabel: r.targetRouteName,
        toStopId: r.toStopId,
      }))
  );

  // Run header first so items can reference it; counts are patched in at the end.
  const { data: run, error: runErr } = await supabase
    .from('tms_route_optimization')
    .insert({
      travel_date: date,
      threshold_percent: threshold,
      total_moves: 0,
      routes_cancelled: 0,
      estimated_savings: 0,
      summary: analysis.summary,
      status: 'applied',
      created_by: actorId,
    })
    .select('id')
    .single();
  if (runErr || !run) throw new Error(`create run: ${runErr?.message ?? 'no row'}`);
  const runId = run.id as string;

  let applied = 0;
  let skipped = 0;
  const items: Record<string, unknown>[] = [];

  for (const m of moves) {
    const { data: updated, error: updErr } = await supabase
      .from('tms_booking')
      .update({ route_id: m.toRouteId, stop_id: m.toStopId })
      .eq('learner_id', m.learnerId)
      .eq('travel_date', date)
      .eq('route_id', m.fromRouteId) // only if still on the source route
      .select('learner_id');
    if (updErr || !updated || updated.length === 0) {
      skipped++;
      continue;
    }
    applied++;
    items.push({
      optimization_id: runId,
      learner_id: m.learnerId,
      travel_date: date,
      learner_label: m.learnerLabel,
      from_route_id: m.fromRouteId,
      from_route_label: m.fromRouteLabel,
      from_stop_id: m.fromStopId,
      to_route_id: m.toRouteId,
      to_route_label: m.toRouteLabel,
      to_stop_id: m.toStopId,
    });
  }

  if (items.length) {
    const { error: itemErr } = await supabase.from('tms_route_optimization_item').insert(items);
    if (itemErr) throw new Error(`insert items: ${itemErr.message}`);
  }

  // A selected source counts as "cancelled" if it now has zero bookings for the date.
  let routesCancelled = 0;
  let estimatedSavings = 0;
  for (const s of selected) {
    const { count } = await supabase
      .from('tms_booking')
      .select('learner_id', { count: 'exact', head: true })
      .eq('travel_date', date)
      .eq('route_id', s.routeId);
    if ((count ?? 0) === 0) {
      routesCancelled++;
      estimatedSavings += s.estimatedSavings;
    }
  }

  await supabase
    .from('tms_route_optimization')
    .update({
      total_moves: applied,
      routes_cancelled: routesCancelled,
      estimated_savings: estimatedSavings,
    })
    .eq('id', runId);

  return { runId, date, totalMoves: applied, routesCancelled, estimatedSavings, skipped };
}

export type ApplyMode = 'today_booking' | 'permanent';

export interface ManualApplyParams {
  date: string;
  mode: ApplyMode;
  threshold: number;
  moves: MoveRequest[];
  actorId: string | null;
}
export interface ManualApplyResult {
  runId: string;
  mode: ApplyMode;
  date: string;
  applied: number;
  skipped: { learnerId: string; reason: string }[];
  routesCancelled: number;
  estimatedSavings: number;
}

export interface RollbackResult {
  restored: number;
  skipped: number;
  alreadyRolledBack: boolean;
}

export async function rollbackRun(
  supabase: SupabaseClient,
  { runId, actorId }: { runId: string; actorId: string | null }
): Promise<RollbackResult> {
  const { data: run, error: runErr } = await supabase
    .from('tms_route_optimization')
    .select('id, status, mode')
    .eq('id', runId)
    .single();
  if (runErr || !run) throw new Error('Optimization run not found');
  if (run.status === 'rolled_back') {
    return { restored: 0, skipped: 0, alreadyRolledBack: true };
  }
  const mode = (run.mode ?? 'today_booking') as ApplyMode;

  const { data: itemRows, error: itemErr } = await supabase
    .from('tms_route_optimization_item')
    .select('learner_id, travel_date, from_route_id, from_stop_id, to_route_id')
    .eq('optimization_id', runId);
  if (itemErr) throw new Error(`items: ${itemErr.message}`);

  let restored = 0;
  let skipped = 0;
  for (const it of itemRows ?? []) {
    if (!it.from_route_id) { skipped++; continue; }
    let ok = false;
    if (mode === 'today_booking') {
      const { data, error } = await supabase
        .from('tms_booking').update({ route_id: it.from_route_id, stop_id: it.from_stop_id })
        .eq('learner_id', it.learner_id).eq('travel_date', it.travel_date).eq('route_id', it.to_route_id)
        .select('learner_id');
      ok = !error && !!data && data.length > 0;
    } else {
      const { data, error } = await supabase
        .from('learners_profiles').update({ transport_route_id: it.from_route_id, transport_stop_id: it.from_stop_id })
        .eq('id', it.learner_id).eq('transport_route_id', it.to_route_id)
        .select('id');
      ok = !error && !!data && data.length > 0;
    }
    if (!ok) { skipped++; continue; }
    restored++;
  }

  await supabase
    .from('tms_route_optimization')
    .update({ status: 'rolled_back', rolled_back_at: new Date().toISOString(), rolled_back_by: actorId })
    .eq('id', runId);

  return { restored, skipped, alreadyRolledBack: false };
}

export async function applyManualMoves(
  supabase: SupabaseClient,
  { date, mode, threshold, moves, actorId }: ManualApplyParams
): Promise<ManualApplyResult> {
  // 1) Routes + capacity.
  const { data: routeRows, error: routeErr } = await supabase
    .from('tms_route')
    .select('id, route_number, route_name, status, total_capacity, vehicle_id');
  if (routeErr) throw new Error(`routes: ${routeErr.message}`);
  const routeList = routeRows ?? [];

  const vehicleIds = Array.from(new Set(routeList.map((r) => r.vehicle_id).filter((v): v is string => !!v)));
  const vehCap = new Map<string, number | null>();
  for (let i = 0; i < vehicleIds.length; i += CHUNK) {
    const { data: vrows, error } = await supabase
      .from('tms_vehicle').select('id, capacity').in('id', vehicleIds.slice(i, i + CHUNK));
    if (error) throw new Error(`vehicles: ${error.message}`);
    for (const v of vrows ?? []) vehCap.set(v.id, v.capacity);
  }
  const capacityOf = (r: { vehicle_id: string | null; total_capacity: number | null }) => {
    const vc = r.vehicle_id ? vehCap.get(r.vehicle_id) : null;
    if (vc && vc > 0) return vc;
    if (r.total_capacity && r.total_capacity > 0) return r.total_capacity;
    return 60;
  };

  // 2) Occupancy per mode.
  const occupancy = new Map<string, number>();
  if (mode === 'today_booking') {
    const { data, error } = await supabase.from('tms_booking').select('route_id').eq('travel_date', date);
    if (error) throw new Error(`bookings: ${error.message}`);
    for (const b of data ?? []) occupancy.set(b.route_id, (occupancy.get(b.route_id) ?? 0) + 1);
  } else {
    const { data, error } = await supabase
      .from('learners_profiles').select('transport_route_id').not('transport_route_id', 'is', null);
    if (error) throw new Error(`allocations: ${error.message}`);
    for (const l of data ?? []) occupancy.set(l.transport_route_id, (occupancy.get(l.transport_route_id) ?? 0) + 1);
  }

  const routes = new Map<string, RouteCapacity>();
  for (const r of routeList) {
    routes.set(r.id, {
      routeId: r.id,
      active: (r.status ?? 'active') === 'active',
      capacity: capacityOf(r),
      occupancy: occupancy.get(r.id) ?? 0,
    });
  }

  // 3) Stop name → id per route.
  const { data: stopRows, error: stopErr } = await supabase
    .from('tms_route_stop').select('id, route_id, stop_name');
  if (stopErr) throw new Error(`stops: ${stopErr.message}`);
  const stops = stopRows ?? [];
  const stopNameById = new Map<string, string | null>(stops.map((s) => [s.id, s.stop_name]));
  const stopNameToIdByRoute = new Map<string, Map<string, string>>();
  for (const s of stops) {
    const key = normalizeStopName(s.stop_name);
    if (!key) continue;
    let m = stopNameToIdByRoute.get(s.route_id);
    if (!m) { m = new Map(); stopNameToIdByRoute.set(s.route_id, m); }
    if (!m.has(key)) m.set(key, s.id);
  }

  // 4) Current allocation for the requested learners.
  const learnerIds = Array.from(new Set(moves.map((m) => m.learnerId)));
  const current = new Map<string, CurrentAllocation>();
  const nameById = new Map<string, { name: string; roll: string | null }>();
  for (let i = 0; i < learnerIds.length; i += CHUNK) {
    const slice = learnerIds.slice(i, i + CHUNK);
    const { data: prof, error } = await supabase
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number, register_number, transport_route_id, transport_stop_id')
      .in('id', slice);
    if (error) throw new Error(`learners: ${error.message}`);
    for (const l of prof ?? []) {
      const name = [l.first_name, l.last_name].filter(Boolean).join(' ').trim() || 'Unknown learner';
      nameById.set(l.id, { name, roll: l.roll_number || l.register_number || null });
      if (mode === 'permanent') {
        current.set(l.id, {
          routeId: l.transport_route_id,
          stopId: l.transport_stop_id,
          stopName: l.transport_stop_id ? stopNameById.get(l.transport_stop_id) ?? null : null,
          learnerName: name,
          learnerRoll: l.roll_number || l.register_number || null,
        });
      }
    }
  }
  if (mode === 'today_booking') {
    for (let i = 0; i < learnerIds.length; i += CHUNK) {
      const slice = learnerIds.slice(i, i + CHUNK);
      const { data: bk, error } = await supabase
        .from('tms_booking').select('learner_id, route_id, stop_id')
        .eq('travel_date', date).in('learner_id', slice);
      if (error) throw new Error(`current bookings: ${error.message}`);
      for (const b of bk ?? []) {
        const nm = nameById.get(b.learner_id);
        current.set(b.learner_id, {
          routeId: b.route_id,
          stopId: b.stop_id,
          stopName: b.stop_id ? stopNameById.get(b.stop_id) ?? null : null,
          learnerName: nm?.name ?? 'Unknown learner',
          learnerRoll: nm?.roll ?? null,
        });
      }
    }
  }

  // 5) Plan.
  const plan = planManualMoves(moves, routes, current, stopNameToIdByRoute);

  // 6) Run header.
  const { data: run, error: runErr } = await supabase
    .from('tms_route_optimization')
    .insert({
      travel_date: date, mode, threshold_percent: threshold,
      total_moves: 0, routes_cancelled: 0, estimated_savings: 0,
      summary: { mode, requested: moves.length, applied: 0, skipped: plan.skipped.length },
      status: 'applied', created_by: actorId,
    })
    .select('id').single();
  if (runErr || !run) throw new Error(`create run: ${runErr?.message ?? 'no row'}`);
  const runId = run.id as string;

  // 7) Execute guarded moves.
  let applied = 0;
  const extraSkips: { learnerId: string; reason: string }[] = [];
  const items: Record<string, unknown>[] = [];
  const labelOf = (id: string) => {
    const r = routeList.find((x) => x.id === id);
    return r ? (r.route_name?.trim() || (r.route_number ? `Route ${r.route_number}` : id)) : id;
  };
  for (const mv of plan.moves) {
    let ok = false;
    if (mode === 'today_booking') {
      const { data: u, error } = await supabase
        .from('tms_booking').update({ route_id: mv.toRouteId, stop_id: mv.toStopId })
        .eq('learner_id', mv.learnerId).eq('travel_date', date).eq('route_id', mv.fromRouteId)
        .select('learner_id');
      ok = !error && !!u && u.length > 0;
    } else {
      const { data: u, error } = await supabase
        .from('learners_profiles').update({ transport_route_id: mv.toRouteId, transport_stop_id: mv.toStopId })
        .eq('id', mv.learnerId).eq('transport_route_id', mv.fromRouteId)
        .select('id');
      ok = !error && !!u && u.length > 0;
    }
    if (!ok) { extraSkips.push({ learnerId: mv.learnerId, reason: 'Changed during apply' }); continue; }
    applied++;
    items.push({
      optimization_id: runId, learner_id: mv.learnerId, travel_date: date,
      learner_label: mv.learnerLabel,
      from_route_id: mv.fromRouteId, from_route_label: labelOf(mv.fromRouteId), from_stop_id: mv.fromStopId,
      to_route_id: mv.toRouteId, to_route_label: labelOf(mv.toRouteId), to_stop_id: mv.toStopId,
    });
  }
  for (let i = 0; i < items.length; i += CHUNK) {
    const { error: itemErr } = await supabase
      .from('tms_route_optimization_item')
      .insert(items.slice(i, i + CHUNK));
    if (itemErr) throw new Error(`insert items: ${itemErr.message}`);
  }

  // 8) routes_cancelled + savings (today mode only).
  let routesCancelled = 0;
  let estimatedSavings = 0;
  if (mode === 'today_booking') {
    const sourceIds = Array.from(new Set(plan.moves.map((m) => m.fromRouteId)));
    for (const rid of sourceIds) {
      const { count } = await supabase
        .from('tms_booking').select('learner_id', { count: 'exact', head: true })
        .eq('travel_date', date).eq('route_id', rid);
      if ((count ?? 0) === 0) { routesCancelled++; estimatedSavings += DEFAULT_DAILY_BUS_COST; }
    }
  }

  await supabase.from('tms_route_optimization')
    .update({ total_moves: applied, routes_cancelled: routesCancelled, estimated_savings: estimatedSavings,
      summary: { mode, requested: moves.length, applied, skipped: plan.skipped.length + extraSkips.length } })
    .eq('id', runId);

  return { runId, mode, date, applied, skipped: [...plan.skipped, ...extraSkips], routesCancelled, estimatedSavings };
}
