/**
 * In-charge bill auto-cancel — the RUN. Loads one month's inputs, writes one
 * review row per candidate, and in Auto mode cancels passing staff bills.
 * The rule itself is pure and lives in ./incharge-bill-review.ts.
 *
 * Failure policy: any READ error aborts the whole run (a failed read must never
 * look like "no marks"). Applying one person is ONE atomic SQL call
 * (tms_incharge_apply_bill_cancel: cancel bills + mark the row applied); applied
 * rows are additionally guarded against rewrites by a DB trigger. A failure while
 * applying one person is recorded on that person's row and the run continues.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { selectByIds } from '@/lib/supabase/chunked';
import { istToday, addDays } from '@/lib/booking/window';
import { notifyProfile } from '@/lib/notifications/notify';
import { logSystemActivity } from '@/lib/activity/log';
import {
  REVIEW_SETTING_TYPE, DEFAULT_REVIEW_CONFIG, parseReviewConfig, isMonth, monthBounds, previousMonth,
  monthLabel, effectiveMode, evaluatePerson, indexRouteDays, staffEmails, matchAssignments,
  personalDatesFor, sumAmounts, type ReviewConfig, type ReviewMode, type ReviewMarks, type ServiceDayInputs,
} from '@/lib/fees/incharge-bill-review';

const OUTSTANDING_STATUSES = ['staff_deferred', 'generated'];

export interface RunOptions {
  month?: string;
  forcePreview?: boolean;
  now?: Date;
}

export interface RunSummary {
  month: string;
  mode: ReviewMode;
  skipped?: 'off' | 'no_days' | 'no_current_year';
  candidates: number;
  noAssignment: number;
  passed: number;
  failed: number;
  notEnoughDays: number;
  alreadyApplied: number;
  cancelledPeople: number;
  cancelledAmount: number;
  errors: Array<{ personId: string; message: string }>;
}

interface StaffRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  institution_email: string | null;
  profile_id: string | null;
}

function fail(what: string, error: { message: string }): never {
  throw new Error(`incharge-bill-review: ${what} failed: ${error.message}`);
}

export async function loadReviewConfig(svc: SupabaseClient): Promise<ReviewConfig> {
  try {
    const { data, error } = await svc
      .from('admin_settings')
      .select('settings_data')
      .eq('setting_type', REVIEW_SETTING_TYPE)
      .maybeSingle();
    if (error || !data) return { ...DEFAULT_REVIEW_CONFIG };
    return parseReviewConfig((data as { settings_data: unknown }).settings_data);
  } catch {
    return { ...DEFAULT_REVIEW_CONFIG }; // fail OFF
  }
}

export async function runInchargeBillReview(svc: SupabaseClient, opts: RunOptions = {}): Promise<RunSummary> {
  const config = await loadReviewConfig(svc);
  const today = istToday(opts.now ?? new Date());
  const month = opts.month ?? previousMonth(today);
  if (!isMonth(month)) throw new Error(`incharge-bill-review: invalid month "${month}"`);
  const { first, last } = monthBounds(month);

  const summary: RunSummary = {
    month, mode: config.mode, candidates: 0, noAssignment: 0, passed: 0, failed: 0,
    notEnoughDays: 0, alreadyApplied: 0, cancelledPeople: 0, cancelledAmount: 0, errors: [],
  };

  let mode = effectiveMode(config.mode, !!opts.forcePreview, last < today);
  if (!mode) return { ...summary, skipped: 'off' };
  summary.mode = mode;

  const to = last < today ? last : addDays(today, -1);
  if (to < first) return { ...summary, skipped: 'no_days' };

  const { data: years, error: yErr } = await svc
    .from('tms_transport_year').select('id, name, start_date, end_date').eq('is_current', true).limit(1);
  if (yErr) fail('transport year', yErr);
  const year = (years ?? [])[0] as { id: string; name: string; start_date: string; end_date: string } | undefined;
  if (!year) return { ...summary, skipped: 'no_current_year' };
  // Never cancel current-year bills on attendance from outside the current transport year.
  if (mode === 'auto' && (first < year.start_date || last > year.end_date)) {
    mode = 'preview';
    summary.mode = 'preview';
  }

  const { data: billData, error: bErr } = await svc
    .from('tms_fee_bill')
    .select('id, person_id, amount')
    .eq('person_type', 'staff')
    .eq('transport_year_id', year.id)
    .in('status', OUTSTANDING_STATUSES)
    .is('paid_at', null);
  if (bErr) fail('outstanding bills', bErr);
  const billsByPerson = new Map<string, Array<{ id: string; amount: unknown }>>();
  for (const b of (billData ?? []) as Array<{ id: string; person_id: string; amount: unknown }>) {
    if (!billsByPerson.has(b.person_id)) billsByPerson.set(b.person_id, []);
    billsByPerson.get(b.person_id)!.push({ id: b.id, amount: b.amount });
  }
  if (billsByPerson.size === 0) return summary;

  const staff = await selectByIds<StaffRow>(
    svc, 'staff', 'id, first_name, last_name, email, institution_email, profile_id', [...billsByPerson.keys()],
  );
  const profileIds = staff.map((s) => s.profile_id).filter((v): v is string => !!v);
  const profiles = await selectByIds<{ id: string; email: string | null }>(svc, 'profiles', 'id, email', profileIds);
  const profileEmail = new Map(profiles.map((p) => [p.id, p.email]));

  const { data: asg, error: aErr } = await svc
    .from('tms_staff_route_assignment')
    .select('staff_email, route_id, assigned_at, created_at')
    .eq('is_active', true);
  if (aErr) fail('assignments', aErr);

  const { data: cal, error: cErr } = await svc
    .from('tms_service_calendar').select('exception_date, route_id').gte('exception_date', first).lte('exception_date', to);
  if (cErr) fail('service calendar', cErr);

  const { data: exc, error: eErr } = await svc
    .from('tms_incharge_excused_day').select('day').gte('day', first).lte('day', to);
  if (eErr) fail('excused days', eErr);

  const { data: marksRaw, error: mErr } = await svc.rpc('tms_incharge_review_marks', { p_from: first, p_to: to });
  if (mErr) fail('marks aggregate', mErr);
  const marks = marksRaw as ReviewMarks;

  const { data: appliedRows, error: apErr } = await svc
    .from('tms_incharge_bill_review').select('person_id').eq('month', first).eq('applied', true);
  if (apErr) fail('applied rows', apErr);
  const appliedSet = new Set(((appliedRows ?? []) as Array<{ person_id: string }>).map((r) => r.person_id));

  const excused = ((exc ?? []) as Array<{ day: string }>).map((e) => e.day);
  const days: ServiceDayInputs = {
    from: first,
    to,
    calendarOff: ((cal ?? []) as Array<{ exception_date: string; route_id: string | null }>)
      .map((c) => ({ date: c.exception_date, routeId: c.route_id })),
    excused,
    fleetDays: marks.fleet_days,
  };
  const routeDates = indexRouteDays(marks);
  const assignmentRows = (asg ?? []) as Array<{ staff_email: string | null; route_id: string; assigned_at: string | null; created_at: string | null }>;

  const rows: Record<string, unknown>[] = [];
  const passes: Array<{ s: StaffRow; bills: Array<{ id: string; amount: unknown }>; reason: string; emails: Set<string> }> = [];

  for (const s of staff) {
    if (appliedSet.has(s.id)) { summary.alreadyApplied++; continue; }
    summary.candidates++;
    const emails = staffEmails(s, s.profile_id ? profileEmail.get(s.profile_id) ?? null : null);
    const assignments = matchAssignments(emails, assignmentRows, last);
    if (assignments.length === 0) { summary.noAssignment++; continue; }

    const v = evaluatePerson({
      assignments,
      personalDates: personalDatesFor(marks, s.profile_id, emails),
      routeDates,
      days,
      config,
    });
    if (v.outcome === 'passed') summary.passed++;
    else if (v.outcome === 'failed') summary.failed++;
    else summary.notEnoughDays++;

    const bills = billsByPerson.get(s.id) ?? [];
    rows.push({
      person_id: s.id,
      month: first,
      transport_year_id: year.id,
      route_ids: assignments.map((a) => a.routeId),
      window_start: first,
      window_end: to,
      required_days: v.requiredDays,
      route_days: v.routeDays,
      personal_days: v.personalDays,
      personal_pct: v.personalPct,
      missed_route_dates: v.missedRouteDates,
      excused_dates: excused,
      outcome: v.outcome,
      reason: v.reason,
      mode,
      applied: false,
      bill_action: 'none',
      bill_ids: bills.map((b) => b.id),
      outstanding_amount: sumAmounts(bills),
      cancelled_amount: 0,
      error: null,
      decided_at: new Date().toISOString(),
    });
    if (v.outcome === 'passed' && mode === 'auto') passes.push({ s, bills, reason: v.reason, emails });
  }

  if (rows.length) {
    const { error: uErr } = await svc.from('tms_incharge_bill_review').upsert(rows, { onConflict: 'person_id,month' });
    if (uErr) fail('write review rows', uErr);
  }

  for (const p of passes) {
    try {
      const { data: res, error: rpcErr } = await svc.rpc('tms_incharge_apply_bill_cancel', {
        p_person_id: p.s.id,
        p_month: first,
        p_transport_year_id: year.id,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      const r = res as { status: string; cancelled: number; amount: unknown; bill_ids: string[] };
      const amount = Number(r.amount);
      if (r.status !== 'applied' || r.cancelled === 0) continue;

      summary.cancelledPeople++;
      summary.cancelledAmount += amount;
      const name = [p.s.first_name, p.s.last_name].filter(Boolean).join(' ') || p.s.email || p.s.id;
      if (p.s.profile_id) {
        await notifyProfile(svc, {
          profileId: p.s.profile_id,
          actorId: '',
          title: 'Transport fee cancelled',
          body: `Your ${year.name} staff transport fee (Rs ${amount.toLocaleString('en-IN')}) has been cancelled because your bus attendance for ${monthLabel(month)} was complete. Thank you.`,
          category: 'payment',
          url: '/boarding/fees',
        });
      }
      await logSystemActivity({
        module: 'fees',
        action: 'cancel',
        entityType: 'staff',
        entityId: p.s.id,
        entityLabel: name,
        description: `In-charge bill auto-cancelled for ${monthLabel(month)}: ${p.reason}`,
        metadata: { month, billIds: r.bill_ids, amount },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      summary.errors.push({ personId: p.s.id, message });
      try {
        await svc.from('tms_incharge_bill_review').update({ error: message }).eq('person_id', p.s.id).eq('month', first);
      } catch { /* already in summary.errors */ }
    }
  }

  return summary;
}
