// lib/fines/copy-rates.ts
// Seeding the year's FINE sheet from a stop_wise FEE structure.
//
// The two sheets are deliberately separate tables: `tms_fee_structure_stop_rate`
// is keyed to a fee structure, `tms_fine_stop_rate` to a transport YEAR (so one
// fine sheet prices flat, tiered and stop_wise learners alike — see
// docs/superpowers/specs/2026-08-20-transport-fine-design.md). This module does
// a one-way COPY between them; it never makes the fine sheet a live view of the
// fee sheet, so revising a transport fee can't silently move fine amounts.

/** A row of the source fee structure's stop sheet. */
export interface SourceStopRate {
  stop_id: string;
  annual_amount: number;
}

export interface CopyPlanRow {
  stop_id: string;
  fine_amount: number;
  /** The fine currently configured for this stop, or null when unpriced. */
  previous: number | null;
}

export interface FineRateCopyPlan {
  /** Stops with no fine configured yet. */
  insert: CopyPlanRow[];
  /** Stops already priced at a DIFFERENT amount. */
  overwrite: CopyPlanRow[];
  /** Stops already priced at exactly the source amount — nothing to write. */
  unchanged: number;
  /** Source rows at or below zero, which are never written (see below). */
  skippedZero: number;
  /** Exactly what to upsert, honouring `overwrite`. */
  rows: Array<{ stop_id: string; fine_amount: number }>;
}

/** Rupee comparison tolerance — numeric columns arrive as strings. */
const MONEY_EPSILON = 0.005;

/**
 * Plan a copy from a fee structure's stop sheet into the year's fine sheet.
 *
 * Two rules are load-bearing:
 *  - A source amount of 0 (or negative) is SKIPPED, never written. `resolveFine`
 *    treats 0 as unpriced, so a 0 rate would look configured in the sheet yet
 *    still refuse to raise a fine — a dead end the operator can't diagnose.
 *  - With `overwrite: false`, stops that already carry a fine are left alone,
 *    so re-running the copy after a partial manual pricing can't quietly undo
 *    an amount someone chose by hand.
 */
export function planFineRateCopy(
  source: SourceStopRate[],
  existing: Map<string, number>,
  opts: { overwrite: boolean }
): FineRateCopyPlan {
  const insert: CopyPlanRow[] = [];
  const overwrite: CopyPlanRow[] = [];
  let unchanged = 0;
  let skippedZero = 0;

  const seen = new Set<string>();
  for (const s of source) {
    if (!s.stop_id || seen.has(s.stop_id)) continue;
    seen.add(s.stop_id);

    const amount = Number(s.annual_amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      skippedZero++;
      continue;
    }

    const current = existing.has(s.stop_id) ? Number(existing.get(s.stop_id)) : null;
    if (current === null) {
      insert.push({ stop_id: s.stop_id, fine_amount: amount, previous: null });
    } else if (Math.abs(current - amount) <= MONEY_EPSILON) {
      unchanged++;
    } else {
      overwrite.push({ stop_id: s.stop_id, fine_amount: amount, previous: current });
    }
  }

  const applied = opts.overwrite ? [...insert, ...overwrite] : insert;
  return {
    insert,
    overwrite,
    unchanged,
    skippedZero,
    rows: applied.map((r) => ({ stop_id: r.stop_id, fine_amount: r.fine_amount })),
  };
}
