/**
 * Presentation status for one in-charge attendance strike row.
 *
 * Derived server-side and sent to the client so the admin table holds no
 * policy: if REMOVAL_THRESHOLD moves again, the UI does not need to know.
 */
import { REMOVAL_THRESHOLD } from './incharge-attendance';

export type StrikeStatus = 'ok' | 'warned' | 'final_warning' | 'pending_removal' | 'removed';

export function deriveStrikeStatus(row: {
  consecutive_misses: number;
  removed_at: string | null;
}): StrikeStatus {
  if (row.removed_at) return 'removed';
  const n = row.consecutive_misses ?? 0;
  // At or past the threshold with no removal recorded means the cron WANTED to
  // remove and could not — shadow mode, or no billable fee structure.
  if (n >= REMOVAL_THRESHOLD) return 'pending_removal';
  if (n === REMOVAL_THRESHOLD - 1) return 'final_warning';
  if (n >= 1) return 'warned';
  return 'ok';
}
