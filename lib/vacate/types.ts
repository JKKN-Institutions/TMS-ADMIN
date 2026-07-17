/**
 * Shared types + PURE helpers for the transport-vacate feature.
 *
 * This file has NO server-only imports (no supabase client) so the client card /
 * columns can import the DTO types safely, and vitest can unit-test the pure
 * functions. I/O lives in lib/vacate/requests.ts.
 */
import { ACTIVE_LIFECYCLE_STATUSES } from '../passengers/types';

export type VacateStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

/** Raw DB row from tms_transport_vacate_request. */
export interface VacateRequestRow {
  id: string;
  learner_id: string;
  profile_id: string | null;
  transport_year_id: string;
  route_id: string | null;
  stop_id: string | null;
  status: VacateStatus;
  reason: string | null;
  decision_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  cancelled_bill_count: number;
  created_at: string;
  updated_at: string;
}

/** One current-year term bill considered for cancellation. */
export interface CancellableTerm {
  ledgerId: string;
  moneyId: string | null;
  termNo: number;
  amount: number;
  moneyStatus: string | null;
  balance: number | null;
}

/** Admin queue row. */
export interface VacateRequestDTO {
  id: string;
  learnerId: string;
  learnerName: string;
  rollNumber: string | null;
  routeLabel: string | null;
  status: VacateStatus;
  reason: string | null;
  decisionNote: string | null;
  amountToCancel: number;
  cancelledBillCount: number;
  createdAt: string;
  decidedAt: string | null;
}

/** Student self-service state (GET /api/student/vacate-request). */
export interface LearnerVacateState {
  eligible: boolean;
  request: {
    status: VacateStatus;
    reason: string | null;
    decisionNote: string | null;
    createdAt: string;
    cancelledBillCount: number;
  } | null;
}

export interface LearnerVacateFacts {
  busRequired: boolean;
  lifecycleStatus: string;
  hasCurrentYearBill: boolean;
}

/**
 * A term is cancellable when it is NOT fully settled: its money-row status is not
 * 'paid' (case-insensitive) AND it still owes money (balance_amount, falling back
 * to final_amount, is > 0).
 */
export function isTermCancellable(t: {
  moneyStatus: string | null;
  balance: number | null;
  amount: number;
}): boolean {
  const settled = (t.moneyStatus ?? '').toLowerCase() === 'paid';
  const owed = (t.balance ?? t.amount) > 0;
  return !settled && owed;
}

/** Eligible = bus-required + an active lifecycle + has a current-year bill. */
export function isVacateEligible(f: LearnerVacateFacts): boolean {
  const active = (ACTIVE_LIFECYCLE_STATUSES as readonly string[]).includes(f.lifecycleStatus);
  return f.busRequired && active && f.hasCurrentYearBill;
}

/** Preview total the approval would cancel. */
export function sumAmountToCancel(terms: CancellableTerm[]): number {
  return terms.reduce((sum, t) => sum + (t.amount || 0), 0);
}
