/**
 * Pure roster filtering + stop grouping for the Route Check screen. No I/O.
 */
import type { CheckLearnerRow } from './types';
import { checkCounts, matchesFilter, type CheckFilter, type CheckRowLite } from './counts';

export type ScreenFilter = CheckFilter | 'checked' | 'unchecked';

/**
 * The counters/filter view of a learner row. "Booked" means booked on ANY bus
 * today (bookingMark !== 'none'): an amber learner booked on another bus is not
 * "without booking" — the same rule the no-booking fine uses.
 */
function lite(r: CheckLearnerRow): CheckRowLite {
  return { booked: r.bookingMark !== 'none', status: r.status, feeState: r.feeState, notOnRoute: r.notOnRoute };
}

export function filterLearners(rows: CheckLearnerRow[], f: ScreenFilter): CheckLearnerRow[] {
  if (f === 'checked') return rows.filter((r) => r.checked);
  if (f === 'unchecked') return rows.filter((r) => !r.checked);
  return rows.filter((r) => matchesFilter(lite(r), f));
}

/** Screen/snapshot counters for learner rows (see `lite` for what "booked" means). */
export function learnerCounts(rows: CheckLearnerRow[]): ReturnType<typeof checkCounts> {
  return checkCounts(rows.map(lite));
}

/** Group by stop, keeping roster order (rows arrive stop-ordered). Adjacent
 *  rows sharing a stop name are merged into one group; a stop name that
 *  reappears later (not adjacent) starts a new group rather than being merged. */
export function groupByStop(rows: CheckLearnerRow[]): { stopName: string; stopTime: string | null; rows: CheckLearnerRow[] }[] {
  const out: { stopName: string; stopTime: string | null; rows: CheckLearnerRow[] }[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.stopName === r.stopName) last.rows.push(r);
    else out.push({ stopName: r.stopName, stopTime: r.stopTime, rows: [r] });
  }
  return out;
}
