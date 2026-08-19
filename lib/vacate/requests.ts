import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  isTermCancellable,
  sumAmountToCancel,
  type CancellableTerm,
  type LearnerVacateState,
  type VacateRequestDTO,
  type VacateRequestRow,
  type VacateStatus,
} from './types';

type Svc = ReturnType<typeof createServiceRoleClient>;

const IN_CHUNK = 150; // keep .in() lists under the API-gateway limit (see lib/fees/bills.ts)
function chunk<T>(arr: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function getCurrentTransportYearId(svc: Svc): Promise<string | null> {
  const { data } = await svc.from('tms_transport_year').select('id').eq('is_current', true).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function resolveLearnerByProfile(
  svc: Svc,
  profileId: string,
): Promise<{ id: string; busRequired: boolean; lifecycleStatus: string; routeId: string | null; stopId: string | null } | null> {
  // profile_id is NOT unique in learners_profiles: a stub row (an 'approved'
  // enquiry with no bus) can shadow the real, bus-carrying one. A bare
  // .maybeSingle() ERRORS on that duplicate (PGRST116) rather than picking a
  // row, and the swallowed error read as "no transport account" — which made
  // the student vacate card render NOTHING for the affected learner while the
  // fees page beside it worked fine.
  //
  // Resolve with the SAME bias tms_student_transport_access uses, so the fees
  // page and this endpoint can never disagree about WHICH row is the learner:
  // prefer the row carrying the obligation, then one with a route, then by id
  // for determinism.
  const { data, error } = await svc
    .from('learners_profiles')
    .select('id, bus_required, lifecycle_status, transport_route_id, transport_stop_id')
    .eq('profile_id', profileId)
    .order('bus_required', { ascending: false, nullsFirst: false })
    .order('transport_route_id', { ascending: false, nullsFirst: false })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  // Fail LOUD: a read error here is not the same as "this learner has no
  // transport account", and conflating the two is what hid this bug.
  if (error) {
    throw new Error(`resolveLearnerByProfile failed for ${profileId}: ${error.message}`);
  }
  if (!data) return null;
  const r = data as {
    id: string; bus_required: boolean | null; lifecycle_status: string;
    transport_route_id: string | null; transport_stop_id: string | null;
  };
  return {
    id: r.id,
    busRequired: !!r.bus_required,
    lifecycleStatus: r.lifecycle_status,
    routeId: r.transport_route_id,
    stopId: r.transport_stop_id,
  };
}

export async function hasCurrentYearBill(svc: Svc, learnerId: string, yearId: string): Promise<boolean> {
  const { count } = await svc
    .from('tms_fee_bill')
    .select('id', { count: 'exact', head: true })
    .eq('person_id', learnerId)
    .eq('person_type', 'learner')
    .eq('transport_year_id', yearId)
    .neq('status', 'cancelled');
  return (count ?? 0) > 0;
}

/** The learner's not-fully-paid current-year term bills (ledger + money joined). */
export async function loadCancellableTerms(svc: Svc, learnerId: string, yearId: string): Promise<CancellableTerm[]> {
  const { data, error } = await svc
    .from('tms_fee_bill')
    .select('id, term_no, amount, billing_student_bill_id, billing_student_bills(id, status, balance_amount, final_amount)')
    .eq('person_id', learnerId)
    .eq('person_type', 'learner')
    .eq('transport_year_id', yearId)
    .neq('status', 'cancelled');
  if (error || !data) return [];
  const rows = data as unknown as Array<{
    id: string; term_no: number; amount: number; billing_student_bill_id: string | null;
    billing_student_bills: { id: string; status: string | null; balance_amount: number | null; final_amount: number } | null;
  }>;
  return rows
    .map((r) => ({
      ledgerId: r.id,
      moneyId: r.billing_student_bill_id,
      termNo: r.term_no,
      amount: Number(r.billing_student_bills?.final_amount ?? r.amount ?? 0),
      moneyStatus: r.billing_student_bills?.status ?? null,
      balance: r.billing_student_bills?.balance_amount ?? null,
    }))
    .filter((t) => isTermCancellable(t));
}

export async function getLearnerVacateState(svc: Svc, learnerId: string, yearId: string): Promise<LearnerVacateState> {
  const eligible = await hasCurrentYearBill(svc, learnerId, yearId);
  const { data } = await svc
    .from('tms_transport_vacate_request')
    .select('status, reason, decision_note, created_at, cancelled_bill_count')
    .eq('learner_id', learnerId)
    .eq('transport_year_id', yearId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const req = data as
    | { status: VacateStatus; reason: string | null; decision_note: string | null; created_at: string; cancelled_bill_count: number }
    | null;
  return {
    eligible,
    request: req
      ? {
          status: req.status,
          reason: req.reason,
          decisionNote: req.decision_note,
          createdAt: req.created_at,
          cancelledBillCount: req.cancelled_bill_count,
        }
      : null,
  };
}

/** Admin queue: every request with learner name/roll, vacated-route label, and a live amount-to-cancel. */
export async function loadVacateRequests(svc: Svc): Promise<VacateRequestDTO[]> {
  const { data: reqData, error } = await svc
    .from('tms_transport_vacate_request')
    .select('id, learner_id, transport_year_id, route_id, status, reason, decision_note, cancelled_bill_count, created_at, decided_at')
    .order('created_at', { ascending: false });
  if (error || !reqData) return [];
  const reqs = reqData as Array<Pick<VacateRequestRow,
    'id' | 'learner_id' | 'transport_year_id' | 'route_id' | 'status' | 'reason' | 'decision_note' | 'cancelled_bill_count' | 'created_at' | 'decided_at'>>;
  if (reqs.length === 0) return [];

  // Learner names/rolls.
  const learnerIds = [...new Set(reqs.map((r) => r.learner_id))];
  const nameById = new Map<string, { name: string; roll: string | null }>();
  for (const c of chunk(learnerIds)) {
    const { data, error: learnerErr } = await svc.from('learners_profiles').select('id, first_name, last_name, roll_number').in('id', c);
    if (learnerErr) throw new Error(`loadVacateRequests: resolve learner names failed: ${learnerErr.message}`);
    for (const l of (data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; roll_number: string | null }>) {
      nameById.set(l.id, { name: `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Unknown', roll: l.roll_number });
    }
  }

  // Route labels (from the vacated-route snapshot).
  const routeIds = [...new Set(reqs.map((r) => r.route_id).filter((x): x is string => !!x))];
  const routeById = new Map<string, string>();
  for (const c of chunk(routeIds)) {
    if (c.length === 0) continue;
    const { data, error: routeErr } = await svc.from('tms_route').select('id, route_number, route_name').in('id', c);
    if (routeErr) throw new Error(`loadVacateRequests: resolve route labels failed: ${routeErr.message}`);
    for (const r of (data ?? []) as Array<{ id: string; route_number: string; route_name: string }>) {
      routeById.set(r.id, `${r.route_number} · ${r.route_name}`);
    }
  }

  // Live amount-to-cancel per request (small N of requests → per-request query is fine).
  const out: VacateRequestDTO[] = [];
  for (const r of reqs) {
    const terms = await loadCancellableTerms(svc, r.learner_id, r.transport_year_id);
    const nm = nameById.get(r.learner_id);
    out.push({
      id: r.id,
      learnerId: r.learner_id,
      learnerName: nm?.name ?? 'Unknown',
      rollNumber: nm?.roll ?? null,
      routeLabel: r.route_id ? routeById.get(r.route_id) ?? null : null,
      status: r.status,
      reason: r.reason,
      decisionNote: r.decision_note,
      amountToCancel: sumAmountToCancel(terms),
      cancelledBillCount: r.cancelled_bill_count,
      createdAt: r.created_at,
      decidedAt: r.decided_at,
    });
  }
  return out;
}

/** Reject a pending request. Returns a status token the route maps to HTTP. */
export async function rejectVacateRequest(
  svc: Svc,
  args: { id: string; approverId: string; note: string },
): Promise<'ok' | 'not_found' | 'not_pending'> {
  const { data: cur } = await svc
    .from('tms_transport_vacate_request')
    .select('status')
    .eq('id', args.id)
    .maybeSingle();
  if (!cur) return 'not_found';
  if ((cur as { status: string }).status !== 'pending') return 'not_pending';
  const { error } = await svc
    .from('tms_transport_vacate_request')
    .update({ status: 'rejected', decision_note: args.note, decided_by: args.approverId, decided_at: new Date().toISOString() })
    .eq('id', args.id)
    .eq('status', 'pending');
  return error ? 'not_found' : 'ok';
}
