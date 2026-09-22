/**
 * Pure roster filtering + stop grouping for the Route Check screen. No I/O.
 */
import type { CheckLearnerRow } from './types';
import { matchesFilter, type CheckFilter } from './counts';

export type ScreenFilter = CheckFilter | 'checked' | 'unchecked';

export function filterLearners(rows: CheckLearnerRow[], f: ScreenFilter): CheckLearnerRow[] {
  if (f === 'checked') return rows.filter((r) => r.checked);
  if (f === 'unchecked') return rows.filter((r) => !r.checked);
  return rows.filter((r) => matchesFilter({ booked: r.booked, status: r.status, feeState: r.feeState, notOnRoute: r.notOnRoute }, f));
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
