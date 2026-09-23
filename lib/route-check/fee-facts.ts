// Per-learner fee facts for Bus Inspection marks and fine rules, in bulk.
// Fail-soft for display: any read error → every learner 'unknown' (never 'paid',
// never 'unpaid'), and the fine rules refuse to fine an 'unknown'.
import type { SupabaseClient } from '@supabase/supabase-js';
import { term1PaidLearnerIds } from '@/lib/fees/term1';
import { feeMark } from './marks';
import type { LearnerFeeFacts } from './fine-rules';
import { chunk } from './admin';

export type LearnerFeeFactsRow = LearnerFeeFacts & { hasBill: boolean };

export async function currentTransportYearId(svc: SupabaseClient): Promise<string | null> {
  const { data, error } = await svc.from('tms_transport_year').select('id').eq('is_current', true).limit(1);
  if (error) throw new Error(`currentTransportYearId: ${error.message}`);
  return (data as Array<{ id: string }> | null)?.[0]?.id ?? null;
}

export async function loadLearnerFeeFacts(
  svc: SupabaseClient, learnerIds: string[],
): Promise<{ yearId: string | null; facts: Map<string, LearnerFeeFactsRow> }> {
  const ids = [...new Set(learnerIds.filter(Boolean))];
  const facts = new Map<string, LearnerFeeFactsRow>();
  const unknownAll = () => {
    for (const id of ids) facts.set(id, { mark: 'unknown', term1DueDate: null, runningNoticeExpiresAt: null, hasBill: false });
  };
  if (ids.length === 0) return { yearId: null, facts };
  let yearId: string | null = null;
  try {
    yearId = await currentTransportYearId(svc);
    if (!yearId) { unknownAll(); return { yearId, facts }; }
    const paid = await term1PaidLearnerIds(svc, yearId, ids);
    const overridden = new Set<string>();
    const bills = new Map<string, { term: number; due: string | null }>();
    const notices = new Map<string, string>();
    for (const part of chunk(ids)) {
      const [ovr, fb, nt] = await Promise.all([
        svc.from('tms_fee_override').select('person_id').eq('transport_year_id', yearId).in('person_id', part),
        svc.from('tms_fee_bill').select('person_id, term_no, due_date, status')
          .eq('transport_year_id', yearId).eq('person_type', 'learner').in('person_id', part),
        svc.from('tms_fee_payment_notice').select('person_id, expires_at')
          .eq('transport_year_id', yearId).eq('status', 'running').in('person_id', part),
      ]);
      if (ovr.error) throw new Error(ovr.error.message);
      if (fb.error) throw new Error(fb.error.message);
      if (nt.error) throw new Error(nt.error.message);
      for (const r of (ovr.data ?? []) as { person_id: string }[]) overridden.add(r.person_id);
      for (const r of (fb.data ?? []) as { person_id: string; term_no: number | null; due_date: string | null; status: string | null }[]) {
        if (r.status !== 'generated') continue;
        const term = r.term_no ?? Number.MAX_SAFE_INTEGER;
        const cur = bills.get(r.person_id);
        // Earliest term wins; on a tie keep the EARLIER due date (fail toward "due").
        if (!cur || term < cur.term || (term === cur.term && (r.due_date ?? '9999') < (cur.due ?? '9999'))) {
          bills.set(r.person_id, { term, due: r.due_date });
        }
      }
      for (const r of (nt.data ?? []) as { person_id: string; expires_at: string }[]) notices.set(r.person_id, r.expires_at);
    }
    for (const id of ids) {
      const bill = bills.get(id);
      facts.set(id, {
        mark: feeMark({ known: true, paid: paid.has(id), overridden: overridden.has(id), hasBill: !!bill }),
        term1DueDate: bill?.due ?? null,
        runningNoticeExpiresAt: notices.get(id) ?? null,
        hasBill: !!bill,
      });
    }
  } catch (e) {
    console.error('[route-check] fee facts failed:', e);
    facts.clear();
    unknownAll();
  }
  return { yearId, facts };
}

/** learnerId → route ids they booked on `date` (one tms_booking row per learner per day). */
export async function loadBookingRoutes(svc: SupabaseClient, learnerIds: string[], date: string): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const part of chunk([...new Set(learnerIds.filter(Boolean))])) {
    const { data, error } = await svc.from('tms_booking').select('learner_id, route_id').eq('travel_date', date).in('learner_id', part);
    if (error) throw new Error(`loadBookingRoutes: ${error.message}`);
    for (const r of (data ?? []) as { learner_id: string; route_id: string }[]) {
      out.set(r.learner_id, [...(out.get(r.learner_id) ?? []), r.route_id]);
    }
  }
  return out;
}
