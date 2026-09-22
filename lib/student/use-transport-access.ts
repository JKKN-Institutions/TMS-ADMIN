'use client';

import { useQuery } from '@tanstack/react-query';
import type { PaymentNoticePayload } from '@/lib/fees/payment-notice/bar-state';

/** One transport-fee term (instalment) for the current transport year. */
export interface TransportTerm {
  term_no: number;
  amount: number;
  balance: number;
  due_date: string;
  status: string;
  paid: boolean;
  overdue: boolean;
}

/**
 * The signed-in learner's transport-fee status, exactly as returned by the
 * tms_student_transport_access RPC — the single source of truth also consumed
 * by proxy.ts's payment gate.
 */
export interface TransportAccess {
  allowed: boolean;
  reason: string;
  transport_year_id?: string | null;
  transport_year_name?: string | null;
  overdue_count: number;
  total_owed: number;
  terms: TransportTerm[];
  /** True when the learner's FIRST term is fully paid — the precondition for portal access. */
  term1_paid: boolean;
  /** The Term-1 money-row status, or null when Term 1 was never billed. */
  term1_status: string | null;
  term1_due_date: string | null;
  term1_balance: number;
  /** The learner's 48-hour payment notice, when one is running or has fined. */
  payment_notice?: PaymentNoticePayload | null;
  /** Server clock at response time, to correct the countdown for a wrong device clock. */
  server_now?: string;
}

async function fetchTransportAccess(): Promise<TransportAccess> {
  const res = await fetch('/api/student/transport-access', {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load transport fees');
  return json.data as TransportAccess;
}

/**
 * Fetches the signed-in learner's transport-fee check (paid / due / overdue
 * terms). Shares the ['student-transport-access'] query key with the
 * /student/fees page so the dashboard card and the fees page reuse one cache
 * entry instead of hitting the RPC twice.
 */
export function useTransportAccess() {
  return useQuery({
    queryKey: ['student-transport-access'],
    queryFn: fetchTransportAccess,
    refetchOnWindowFocus: true,
    // Poll only while a countdown is running, so a payment clears the bar within a minute.
    refetchInterval: (q) => (q.state.data?.payment_notice?.status === 'running' ? 60_000 : false),
  });
}
