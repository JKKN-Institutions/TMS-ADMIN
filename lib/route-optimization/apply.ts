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
    .select('id, status')
    .eq('id', runId)
    .single();
  if (runErr || !run) throw new Error('Optimization run not found');
  if (run.status === 'rolled_back') {
    return { restored: 0, skipped: 0, alreadyRolledBack: true };
  }

  const { data: itemRows, error: itemErr } = await supabase
    .from('tms_route_optimization_item')
    .select('learner_id, travel_date, from_route_id, from_stop_id, to_route_id')
    .eq('optimization_id', runId);
  if (itemErr) throw new Error(`items: ${itemErr.message}`);

  let restored = 0;
  let skipped = 0;
  for (const it of itemRows ?? []) {
    if (!it.from_route_id) {
      skipped++;
      continue;
    }
    const { data: updated, error } = await supabase
      .from('tms_booking')
      .update({ route_id: it.from_route_id, stop_id: it.from_stop_id })
      .eq('learner_id', it.learner_id)
      .eq('travel_date', it.travel_date)
      .eq('route_id', it.to_route_id) // only if still where we moved it
      .select('learner_id');
    if (error || !updated || updated.length === 0) {
      skipped++;
      continue;
    }
    restored++;
  }

  await supabase
    .from('tms_route_optimization')
    .update({
      status: 'rolled_back',
      rolled_back_at: new Date().toISOString(),
      rolled_back_by: actorId,
    })
    .eq('id', runId);

  return { restored, skipped, alreadyRolledBack: false };
}
