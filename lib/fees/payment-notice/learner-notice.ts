// The signed-in learner's current notice. Resolves learner rows the way
// tms_student_transport_access does — profile_id first, then college/student
// email — because 206 of ~450 owing learners are linked only by email.

import type { SupabaseClient } from '@supabase/supabase-js';
import { emailIlikePattern } from '@/lib/identity/email-match';
import { loadFeeNoticeConfig } from './config';
import type { PaymentNoticePayload } from './bar-state';

const FINED_VISIBLE_DAYS = 7;

export async function loadLearnerNotice(
  svc: SupabaseClient,
  opts: { profileId: string; email: string | null; transportYearId: string },
): Promise<PaymentNoticePayload | null> {
  let { data: learners } = await svc.from('learners_profiles').select('id, transport_stop_id').eq('profile_id', opts.profileId);
  if ((!learners || learners.length === 0) && opts.email) {
    const pat = emailIlikePattern(opts.email);
    ({ data: learners } = await svc
      .from('learners_profiles')
      .select('id, transport_stop_id')
      .or(`college_email.ilike.${pat},student_email.ilike.${pat}`));
  }
  const rows = (learners ?? []) as Array<{ id: string; transport_stop_id: string | null }>;
  if (!rows.length) return null;

  const { data: notices, error } = await svc
    .from('tms_fee_payment_notice')
    .select('person_id, status, expires_at, fine_id')
    .eq('transport_year_id', opts.transportYearId)
    .in('person_id', rows.map((r) => r.id))
    .in('status', ['running', 'fined']);
  if (error || !notices || notices.length === 0) return null;
  // Prefer a running notice (it needs action) over a fined one.
  const n = (notices as Array<{ person_id: string; status: 'running' | 'fined'; expires_at: string; fine_id: string | null }>)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'running' ? -1 : 1))[0];

  // A fined notice stays visible for a week so the learner sees why the fee
  // appeared, then drops off the bar (the fine itself remains on /student/fees).
  if (n.status === 'fined' && Date.parse(n.expires_at) < Date.now() - FINED_VISIBLE_DAYS * 86_400_000) return null;

  const cfg = await loadFeeNoticeConfig(svc);
  let amount = 0;
  if (n.status === 'fined' && n.fine_id) {
    const { data: f } = await svc.from('tms_fee_fine').select('fine_amount').eq('id', n.fine_id).maybeSingle();
    amount = Number((f as { fine_amount: number } | null)?.fine_amount ?? 0);
  } else {
    // Same lookup the sweep uses, so the bar promises exactly what will be charged.
    const stopId = rows.find((r) => r.id === n.person_id)?.transport_stop_id;
    if (stopId) {
      const { data: rate } = await svc
        .from('tms_fine_stop_rate')
        .select('fine_amount')
        .eq('transport_year_id', opts.transportYearId)
        .eq('stop_id', stopId)
        .maybeSingle();
      amount = Number((rate as { fine_amount: number } | null)?.fine_amount ?? 0);
    }
  }
  return { status: n.status, expires_at: n.expires_at, amount, urgent_hours: cfg.reminderHoursBefore };
}
