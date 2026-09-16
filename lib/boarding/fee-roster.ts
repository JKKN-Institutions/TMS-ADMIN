/**
 * Transport fee status for a whole bus, for the boarding Attendance roster.
 *
 * Display only: it never decides whether attendance is marked or a scan is
 * accepted (see lib/boarding/fee-badge.ts for the same rule at the scanner).
 * It FAILS CLOSED — a missing or failed read reads as 'unknown', never as
 * 'paid', because on a money column a wrong "paid" looks exactly like a right one.
 *
 * The figures come from tms_transport_fee_status_bulk, the set-based twin of
 * tms_transport_access_for_learner (the portal gate). Going through one call
 * for the whole roster is what makes this affordable: the per-learner function
 * expands each bill's instalments, so ~1,800 separate calls would take minutes,
 * while the bulk form answers the entire fleet in about 60ms.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface BulkFeeRow {
  learner_id: string;
  allowed: boolean;
  reason: string | null;
  overdue_count: number;
  total_owed: number;
  unpaid_amount: number;
  term1_paid: boolean;
  has_bills: boolean;
}

export type FeeState = 'paid' | 'unpaid' | 'none' | 'unknown';

export interface RosterFee {
  state: FeeState;
  /** Unpaid balance in rupees; null when there is nothing to say. */
  owed: number | null;
}

export const FEE_STATE_LABEL: Record<FeeState, string> = {
  paid: 'Paid',
  unpaid: 'Unpaid',
  none: 'No bill',
  unknown: '—',
};

export const UNKNOWN_FEE: RosterFee = { state: 'unknown', owed: null };

/**
 * Ids per RPC call. An array argument has no PostgREST `.in()` limit, but a
 * 1,800-id payload is still worth splitting.
 */
const FEE_CHUNK = 500;

/**
 * Pure: one learner's row → the badge the roster shows.
 *
 * An UNBILLED learner is "No bill", never "Unpaid": they owe nothing yet, and
 * calling that unpaid would accuse ~8 riders a day of a debt that does not exist.
 */
export function rosterFeeBadge(row: BulkFeeRow | undefined | null): RosterFee {
  if (!row) return { ...UNKNOWN_FEE };
  if (!row.has_bills) return { state: 'none', owed: null };
  const owed = Number.isFinite(Number(row.unpaid_amount)) ? Number(row.unpaid_amount) : null;
  if (!row.term1_paid || row.overdue_count > 0 || (owed ?? 0) > 0) {
    return { state: 'unpaid', owed };
  }
  return { state: 'paid', owed: 0 };
}

export async function loadRosterFees(
  svc: SupabaseClient,
  learnerIds: string[],
): Promise<Map<string, RosterFee>> {
  const out = new Map<string, RosterFee>();
  for (let i = 0; i < learnerIds.length; i += FEE_CHUNK) {
    const chunk = learnerIds.slice(i, i + FEE_CHUNK);
    const { data, error } = await svc.rpc('tms_transport_fee_status_bulk', { p_learner_ids: chunk });
    if (error) {
      // Non-fatal by design: the roster is what staff mark from, and a fee
      // lookup must never empty it or fail the request. Missing rows render '—'.
      console.error('[boarding/fee-roster] bulk fee read failed:', error.code, error.message);
      continue;
    }
    for (const r of (data ?? []) as BulkFeeRow[]) out.set(r.learner_id, rosterFeeBadge(r));
  }
  return out;
}
