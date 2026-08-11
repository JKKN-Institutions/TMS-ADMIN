// lib/fees/auto-generate.ts
// The scheduled sweep that removes the manual "click Generate" treadmill.
//
// It is CONVERGENT, not event-driven: learners_profiles.bus_required is flipped
// by MyJKKN, not by this application, so there is no event to hook. Instead this
// re-runs the idempotent engine and bills whoever is applicable and not yet
// billed. A missed run costs latency, never correctness — tms_fee_bill_idem_unique
// makes double-billing impossible at the database level.

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateBills, type GenerateOutcome } from './generate';
import { loadSchedulingConfig } from '@/lib/settings/scheduling';
import { logSystemActivity } from '@/lib/activity/log';

export interface AutoStructureResult {
  id: string;
  name: string;
  billed: number;
  skipped: number;
  unresolved: number;
  conflictsSkipped: number;
  bornOverdue: number;
  errors: number;
  error?: string;
}

export interface AutoRunSummary {
  skipped?: 'disabled' | 'no_current_transport_year';
  dryRun: boolean;
  structures: AutoStructureResult[];
  totalBilled: number;
  totalBornOverdue: number;
}

const EMPTY = (dryRun: boolean): AutoRunSummary => ({
  dryRun, structures: [], totalBilled: 0, totalBornOverdue: 0,
});

export async function autoGenerateBills(
  svc: SupabaseClient,
  opts: { dryRun?: boolean } = {}
): Promise<AutoRunSummary> {
  const dryRun = opts.dryRun === true;

  // Rail 1: the master switch. Absent from the stored blob means false, so
  // automation stays off until someone deliberately turns it on.
  const cfg = await loadSchedulingConfig(svc);
  if (!cfg.autoGenerateBills) {
    return { ...EMPTY(dryRun), skipped: 'disabled' };
  }

  // Rail 2: bills belong to a transport year. If no year is current there is
  // nothing sensible to bill INTO, and guessing would attach money to the
  // wrong year.
  const { data: ty } = await svc
    .from('tms_transport_year')
    .select('id')
    .eq('is_current', true)
    .limit(1);
  const yearId = (ty as Array<{ id: string }> | null)?.[0]?.id ?? null;
  if (!yearId) {
    return { ...EMPTY(dryRun), skipped: 'no_current_transport_year' };
  }

  // Rail 3: per-structure opt-in. This flag is the ONLY exclusion mechanism —
  // no hardcoded id or name blocklist, because ids change when a structure is
  // recreated and names change when they are edited.
  const { data: rows, error } = await svc
    .from('tms_fee_structure')
    .select('id, name')
    .eq('status', 'active')
    .eq('auto_generate', true)
    .eq('transport_year_id', yearId);
  if (error) {
    console.error('[auto-generate] failed to load fee structures', error);
    return EMPTY(dryRun);
  }

  const structures = (rows ?? []) as Array<{ id: string; name: string }>;
  const results: AutoStructureResult[] = [];

  for (const s of structures) {
    // One structure's failure must not stop the others: they are different
    // institutions, and an unpriced stop in one is no reason to stop billing
    // another.
    try {
      const res = await generateBills(svc, {
        feeStructureId: s.id,
        mode: dryRun ? 'dry_run' : 'generate',
        actorId: null,          // marks the run automated
        skipConflicts: true,    // never double-charge unattended
        skipEmptyRun: true,     // no run row when nothing was billed
      });

      if (!res.ok) {
        results.push({
          id: s.id, name: s.name, billed: 0, skipped: 0, unresolved: 0,
          conflictsSkipped: 0, bornOverdue: 0, errors: 0, error: res.error,
        });
        continue;
      }

      if (dryRun) {
        const p = res.data as Record<string, number>;
        results.push({
          id: s.id, name: s.name,
          billed: p.toGeneratePairs ?? 0,
          skipped: p.alreadyBilledPairs ?? 0,
          unresolved: p.unresolved ?? 0,
          conflictsSkipped: p.conflictsSkipped ?? 0,
          bornOverdue: p.bornOverdue ?? 0,
          errors: 0,
        });
        continue;
      }

      const out = res.data as GenerateOutcome;
      results.push({
        id: s.id, name: s.name,
        billed: out.learnerBilled + out.staffDeferred,
        skipped: out.skipped,
        unresolved: out.unresolved,
        conflictsSkipped: out.conflictsSkipped,
        bornOverdue: out.bornOverdue,
        errors: out.errors,
      });

      // Visible in the existing Activity Log page. Only when something actually
      // happened — at 96 runs a day, logging every no-op would bury real events.
      if (out.learnerBilled + out.staffDeferred > 0) {
        await logSystemActivity({
          module: 'fees',
          action: 'generate',
          entityType: 'tms_fee_structure',
          entityId: s.id,
          entityLabel: s.name,
          description:
            `Automatic run billed ${out.learnerBilled} learner bill(s), ` +
            `${out.staffDeferred} staff bill(s)` +
            (out.bornOverdue ? `; ${out.bornOverdue} created already overdue` : '') +
            (out.conflictsSkipped ? `; ${out.conflictsSkipped} skipped (billed by another structure)` : ''),
          metadata: {
            runId: out.runId,
            automated: true,
            learnerBilled: out.learnerBilled,
            staffDeferred: out.staffDeferred,
            skipped: out.skipped,
            unresolved: out.unresolved,
            bornOverdue: out.bornOverdue,
            conflictsSkipped: out.conflictsSkipped,
            errors: out.errors,
            feeMode: out.feeMode,
          },
        });
      }
    } catch (e) {
      results.push({
        id: s.id, name: s.name, billed: 0, skipped: 0, unresolved: 0,
        conflictsSkipped: 0, bornOverdue: 0, errors: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    dryRun,
    structures: results,
    totalBilled: results.reduce((n, r) => n + r.billed, 0),
    totalBornOverdue: results.reduce((n, r) => n + r.bornOverdue, 0),
  };
}
