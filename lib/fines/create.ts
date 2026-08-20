// lib/fines/create.ts
// The fine write engine. Preview and create share ONE candidate loader, so what
// the confirm dialog shows is what gets written — a second resolution path is a
// second place for the amount to be wrong.
//
// Money order matters: billing_student_bills FIRST, tms_fee_fine second, with a
// compensating delete if the ledger insert fails. The reverse order can leave a
// bill MyJKKN charges for that TMS knows nothing about (the orphan race already
// fixed in lib/fees/generate.ts).

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveFine, type FineSkipReason } from './resolve';
import { TRANSPORT_CATEGORY_NAME } from '@/lib/fees/types';
import { notifyLearner } from '@/lib/notifications/notify';

type Svc = SupabaseClient;

const CHUNK = 150; // ~500+ ids in one .in() returns HTTP 400 from the gateway

export interface FineCandidate {
  person_id: string;
  person_name: string;
  code: string | null;
  institution_id: string | null;
  stop_id: string | null;
  stop_name: string | null;
  route_id: string | null;
  route_number: string | null;
  academic_year_id: string | null;
  amount: number | null;
  skip_reason: FineSkipReason | null;
}

export interface CreateFinesInput {
  transportYearId: string;
  personIds: string[];
  dueDate: string;
  reason: string;
  notify: boolean;
  idempotencyKey: string;
  actorId: string | null;
  /** person_id -> the tms_fee_bill row that was ticked, for provenance. */
  sourceBillByPerson?: Record<string, string>;
}

export interface CreateFinesResult {
  created: number;
  totalAmount: number;
  skipped: Array<{ person_id: string; person_name: string; reason: FineSkipReason }>;
  duplicates: number;
  errors: number;
}

interface LearnerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  roll_number: string | null;
  institution_id: string | null;
  transport_stop_id: string | null;
  academic_year_id: string | null;
}

const fullName = (l: LearnerRow) => [l.first_name, l.last_name].filter(Boolean).join(' ').trim();

async function loadCandidates(
  svc: Svc,
  opts: { transportYearId: string; personIds: string[] }
): Promise<FineCandidate[]> {
  const learners: LearnerRow[] = [];
  for (let i = 0; i < opts.personIds.length; i += CHUNK) {
    const { data, error } = await svc
      .from('learners_profiles')
      .select(
        'id, first_name, last_name, roll_number, institution_id, transport_stop_id, academic_year_id'
      )
      .in('id', opts.personIds.slice(i, i + CHUNK));
    if (error) throw new Error(`Failed to load learners: ${error.message}`);
    learners.push(...((data ?? []) as LearnerRow[]));
  }

  const { data: rates, error: rateErr } = await svc
    .from('tms_fine_stop_rate')
    .select('stop_id, fine_amount')
    .eq('transport_year_id', opts.transportYearId);
  // Hard-fail rather than treating a load failure as "no rates": that would
  // report every learner as unfinable and read as a configuration problem.
  if (rateErr) throw new Error(`Failed to load fine rates: ${rateErr.message}`);
  const rateByStop = new Map<string, number>(
    ((rates ?? []) as Array<{ stop_id: string; fine_amount: number }>).map((r) => [
      r.stop_id,
      Number(r.fine_amount),
    ])
  );

  const stopIds = [...new Set(learners.map((l) => l.transport_stop_id).filter(Boolean))] as string[];
  const stopById = new Map<string, { stop_name: string; route_id: string | null }>();
  const routeNumberById = new Map<string, string | null>();
  if (stopIds.length) {
    for (let i = 0; i < stopIds.length; i += CHUNK) {
      const { data, error } = await svc
        .from('tms_route_stop')
        .select('id, stop_name, route_id')
        .in('id', stopIds.slice(i, i + CHUNK));
      if (error) throw new Error(`Failed to load stops: ${error.message}`);
      for (const s of (data ?? []) as Array<{
        id: string;
        stop_name: string;
        route_id: string | null;
      }>) {
        stopById.set(s.id, { stop_name: s.stop_name, route_id: s.route_id });
      }
    }
    const routeIds = [
      ...new Set([...stopById.values()].map((s) => s.route_id).filter(Boolean)),
    ] as string[];
    for (let i = 0; i < routeIds.length; i += CHUNK) {
      const { data, error } = await svc
        .from('tms_route')
        .select('id, route_number')
        .in('id', routeIds.slice(i, i + CHUNK));
      if (error) throw new Error(`Failed to load routes: ${error.message}`);
      for (const r of (data ?? []) as Array<{ id: string; route_number: string | null }>) {
        routeNumberById.set(r.id, r.route_number);
      }
    }
  }

  return learners.map((l) => {
    const res = resolveFine({ transport_stop_id: l.transport_stop_id }, rateByStop);
    const stop = l.transport_stop_id ? stopById.get(l.transport_stop_id) : undefined;
    return {
      person_id: l.id,
      person_name: fullName(l),
      code: l.roll_number,
      institution_id: l.institution_id,
      stop_id: l.transport_stop_id,
      stop_name: stop?.stop_name ?? null,
      route_id: stop?.route_id ?? null,
      route_number: stop?.route_id ? routeNumberById.get(stop.route_id) ?? null : null,
      academic_year_id: l.academic_year_id,
      amount: res.ok ? res.amount : null,
      skip_reason: res.ok ? null : res.reason,
    };
  });
}

export async function previewFines(
  svc: Svc,
  opts: { transportYearId: string; personIds: string[] }
): Promise<{ candidates: FineCandidate[]; totalAmount: number }> {
  const candidates = await loadCandidates(svc, opts);
  const totalAmount = candidates.reduce((s, c) => s + (c.amount ?? 0), 0);
  return { candidates, totalAmount };
}

export async function createFines(svc: Svc, input: CreateFinesInput): Promise<CreateFinesResult> {
  const candidates = await loadCandidates(svc, {
    transportYearId: input.transportYearId,
    personIds: input.personIds,
  });

  const { data: cat } = await svc
    .from('billing_categories')
    .select('id')
    .eq('category_name', TRANSPORT_CATEGORY_NAME.student)
    .maybeSingle();
  const categoryId = (cat as { id: string } | null)?.id ?? null;

  const result: CreateFinesResult = {
    created: 0,
    totalAmount: 0,
    skipped: [],
    duplicates: 0,
    errors: 0,
  };

  for (const c of candidates) {
    if (c.amount === null) {
      result.skipped.push({
        person_id: c.person_id,
        person_name: c.person_name,
        reason: c.skip_reason as FineSkipReason,
      });
      continue;
    }

    const { data: bill, error: billErr } = await svc
      .from('billing_student_bills')
      .insert([
        {
          student_id: c.person_id,
          institution_id: c.institution_id,
          item_category_id: categoryId,
          fee_source: 'ad_hoc',
          bill_description: `Transport Fine — ${input.reason}`,
          due_date: input.dueDate,
          quantity: 1,
          unit_amount: c.amount,
          total_amount: c.amount,
          tax_amount: 0,
          final_amount: c.amount,
          balance_amount: c.amount,
          status: 'unpaid',
          academic_year_id: c.academic_year_id,
          transport_year_id: input.transportYearId,
          created_by: input.actorId,
        },
      ])
      .select('id')
      .single();
    if (billErr || !bill) {
      console.error('[fines] money row insert failed:', billErr?.message);
      result.errors++;
      continue;
    }
    const billId = (bill as { id: string }).id;

    const { error: ledErr } = await svc.from('tms_fee_fine').insert([
      {
        transport_year_id: input.transportYearId,
        person_id: c.person_id,
        person_type: 'learner',
        stop_id: c.stop_id,
        route_id: c.route_id,
        fine_amount: c.amount,
        due_date: input.dueDate,
        reason: input.reason,
        source_bill_id: input.sourceBillByPerson?.[c.person_id] ?? null,
        billing_student_bill_id: billId,
        status: 'generated',
        // Per-person key: one dialog submission fines many people, and a retry of
        // that submission must be a no-op for each of them individually.
        idempotency_key: `${input.idempotencyKey}:${c.person_id}`,
        created_by: input.actorId,
      },
    ]);

    if (ledErr) {
      // Compensate: without this the learner is charged for a fine TMS has no
      // record of, and no screen here can ever cancel it.
      const { error: cleanupErr } = await svc.from('billing_student_bills').delete().eq('id', billId);
      if (cleanupErr) {
        console.error('[fines] ORPHANED BILL: ledger insert failed and cleanup failed', {
          bill_id: billId,
          person_id: c.person_id,
        });
      }
      // 23505 is the idempotency key: this exact fine already exists, which is a
      // successful no-op, NOT an error and NOT a new fine.
      if ((ledErr as { code?: string }).code === '23505') result.duplicates++;
      else result.errors++;
      continue;
    }

    result.created++;
    result.totalAmount += c.amount;

    if (input.notify) {
      // Best-effort by contract — notifyLearner never throws, so a notification
      // failure cannot undo a fine that is already money.
      await notifyLearner(svc as never, {
        learnerId: c.person_id,
        actorId: input.actorId ?? '',
        title: 'Transport fine raised',
        body: `A transport fine of ₹${c.amount.toLocaleString('en-IN')} has been added to your account (${input.reason}). Due ${input.dueDate}.`,
        category: 'fees',
        url: '/student/fees',
      });
    }
  }

  return result;
}
