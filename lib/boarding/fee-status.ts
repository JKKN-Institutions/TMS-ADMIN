import type { SupabaseClient } from '@supabase/supabase-js';

/** One visible fee line: an instalment where the bill has them, else the bill. */
export interface FeeTerm {
  termNo: number | null;
  amount: number | null;
  balance: number | null;
  dueDate: string | null;
  status: string | null;
  paid: boolean;
  overdue: boolean;
}

export interface LearnerFeeStatus {
  /** False when the learner is behind. Mirrors the portal gate's decision. */
  allowed: boolean;
  reason: string | null;
  overdueCount: number;
  totalOwed: number;
  terms: FeeTerm[];
}

/**
 * The scanned learner's transport fee position, straight from the same
 * function the portal gate uses (tms_transport_access_for_learner, the
 * learner-keyed core of tms_student_transport_access). Going through the
 * function rather than re-querying the bills is what keeps the scan panel and
 * the portal from ever disagreeing about who owes what.
 *
 * FAIL-SOFT, AND NULL RATHER THAN ZERO. A failed read returns null so the
 * caller can say "fee status unavailable". Returning a zeroed object would
 * render as "nothing owed" on a money panel, which is the one wrong answer
 * that looks exactly like a right one.
 */
export async function loadLearnerFeeStatus(
  svc: SupabaseClient,
  learnerId: string,
): Promise<LearnerFeeStatus | null> {
  const { data, error } = await svc.rpc('tms_transport_access_for_learner', {
    p_learner_id: learnerId,
  });
  if (error) {
    console.error('[boarding/fee-status] lookup failed for %s: %s %s', learnerId, error.code, error.message);
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  const row = data as {
    allowed?: boolean;
    reason?: string | null;
    overdue_count?: number;
    total_owed?: number | string;
    terms?: unknown;
  };

  const rawTerms = Array.isArray(row.terms) ? row.terms : [];
  const terms: FeeTerm[] = rawTerms.map((t) => {
    const term = (t ?? {}) as Record<string, unknown>;
    const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
    return {
      termNo: num(term.term_no),
      amount: num(term.amount),
      balance: num(term.balance),
      dueDate: (term.due_date as string | null) ?? null,
      status: (term.status as string | null) ?? null,
      paid: term.paid === true,
      overdue: term.overdue === true,
    };
  });

  return {
    allowed: row.allowed === true,
    reason: row.reason ?? null,
    overdueCount: Number(row.overdue_count ?? 0),
    totalOwed: Number(row.total_owed ?? 0),
    terms,
  };
}
