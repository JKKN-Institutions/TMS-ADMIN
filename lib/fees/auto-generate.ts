import type { SupabaseClient } from '@supabase/supabase-js';
import { loadSchedulingConfig } from '@/lib/settings/scheduling';
import { generateForStructure, type GenerateOutcome } from '@/lib/fees/generate';

export interface AutoGenStructureResult {
  id: string;
  name: string;
  outcome:
    | { kind: 'dry_run'; preview: Record<string, unknown> }
    | { kind: 'generated'; summary: Record<string, unknown> }
    | { kind: 'invalid' | 'failed' | 'threw'; message: string };
}
export interface AutoGenSummary {
  dryRun: boolean;
  skipped?: string;             // set when the sweep did nothing, with the reason
  transportYearId?: string;
  structures?: AutoGenStructureResult[];
}

/**
 * The nightly auto-billing sweep. Runs the SAME engine as the manual Generate
 * button over every status='active' fee structure of the CURRENT transport
 * year, with autoPolicy on (cross-structure conflict skip + no empty runs).
 *
 * dryRun bypasses the autoGenerateBills toggle on purpose: a dry run writes
 * nothing, and previewing what WOULD generate is exactly what an admin needs
 * BEFORE enabling the toggle. A live run with the toggle off is a no-op.
 */
export async function runAutoGeneration(
  svc: SupabaseClient,
  opts: { dryRun: boolean }
): Promise<AutoGenSummary> {
  const base: AutoGenSummary = { dryRun: opts.dryRun };

  if (!opts.dryRun) {
    const cfg = await loadSchedulingConfig(svc);
    if (!cfg.autoGenerateBills) return { ...base, skipped: 'autoGenerateBills is off' };
  }

  const { data: year, error: yearErr } = await svc
    .from('tms_transport_year')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();
  if (yearErr) return { ...base, skipped: `transport year lookup failed: ${yearErr.message}` };
  if (!year) return { ...base, skipped: 'no current transport year' };

  const { data: fsRows, error: fsErr } = await svc
    .from('tms_fee_structure')
    .select('*')
    .eq('status', 'active')
    .eq('transport_year_id', year.id);
  if (fsErr) return { ...base, skipped: `fee structure lookup failed: ${fsErr.message}` };
  const structures = fsRows ?? [];
  if (structures.length === 0) return { ...base, skipped: 'no active fee structures for the current year' };

  const results: AutoGenStructureResult[] = [];
  for (const fs of structures) {
    // One bad structure must not abort the others.
    try {
      const outcome: GenerateOutcome = await generateForStructure(svc, fs, {
        mode: opts.dryRun ? 'dry_run' : 'generate',
        triggeredBy: null, // NULL = auto run (manual runs always carry a user id);
                            // tms_fee_generation_run is a backend audit ledger
                            // with no UI today.
        autoPolicy: true,
      });
      if (outcome.kind === 'dry_run') {
        results.push({ id: fs.id, name: fs.name, outcome: { kind: 'dry_run', preview: outcome.preview } });
      } else if (outcome.kind === 'generated') {
        results.push({ id: fs.id, name: fs.name, outcome: { kind: 'generated', summary: outcome.summary as unknown as Record<string, unknown> } });
      } else {
        results.push({ id: fs.id, name: fs.name, outcome: { kind: outcome.kind, message: outcome.message } });
      }
    } catch (e) {
      console.error(`[auto-generate-bills] structure ${fs.id} (${fs.name}) threw:`, e);
      results.push({ id: fs.id, name: fs.name, outcome: { kind: 'threw', message: e instanceof Error ? e.message : 'unknown error' } });
    }
  }
  return { ...base, transportYearId: year.id, structures: results };
}
