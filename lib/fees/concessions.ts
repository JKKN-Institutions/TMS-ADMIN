// Fee Concession tab: who qualifies, what they should pay, and applying it.
// Prices people with the generator's own resolvePersonTerms (overrides OFF) so
// the tab and the bill cron can never disagree about the full fee.

import type { SupabaseClient } from '@supabase/supabase-js';
import { selectByIds } from '@/lib/supabase/chunked';
import { resolveApplicablePeople } from './applicability';
import { resolvePersonTerms, UNRESOLVED_LABEL } from './resolve-terms';
import { loadResolveContext } from './structure-context';
import type { TermOverride } from './overrides';
import type { FeeStructureRow } from './types';
import {
  classifyConcession, guardTarget, matchRule, rowTargets, targetTerms, targetTotal,
  SCHEME_75_SCHOLARSHIP, FINAL_YEAR_BATCH_CLOSURE_PREFIX,
  type ConcessionKind, type ConcessionRule, type ConcessionStatus, type ExistingOverride, type LedgerState,
} from './concession-math';

export const MAX_APPLY = 200;

export interface ConcessionRow {
  personId: string;
  rollNumber: string | null;
  name: string;
  institutionName: string | null;
  programName: string | null;
  admissionYear: number | null;
  ruleId: string | null;
  ruleLabel: string | null;
  fullTotal: number | null;
  targetTotal: number | null;
  billAmount: number | null;
  paidAmount: number;
  billStatus: string | null;
  status: ConcessionStatus;
  reason: string | null;
  terms: TermOverride[];
  rowTargets: Array<{ fee_bill_id: string; target: number | null }>;
}

export interface ConcessionList {
  rows: ConcessionRow[];
  counts: Record<ConcessionStatus, number>;
  rules: ConcessionRule[];
}

export type ApplyOutcome =
  | 'repriced' | 'ledger_aligned' | 'override_only' | 'unchanged' | 'review' | 'skipped' | 'error';

export interface ApplyResult {
  personId: string;
  name: string;
  outcome: ApplyOutcome;
  message: string | null;
}

const REVIEW_PREFIX = 'CONCESSION_REVIEW:';

export function reviewMessage(message: string): string | null {
  return message.startsWith(REVIEW_PREFIX) ? message.slice(REVIEW_PREFIX.length).trim() : null;
}

export function summariseActions(actions: Array<{ action: string }>): ApplyOutcome {
  if (!actions.length) return 'override_only';
  if (actions.some((a) => a.action === 'repriced' || a.action === 'deleted')) return 'repriced';
  if (actions.some((a) => a.action === 'ledger_aligned')) return 'ledger_aligned';
  return 'unchanged';
}

type LearnerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  roll_number: string | null;
  program_id: string | null;
  scholarship_type: string | null;
  transport_stop_id: string | null;
};

export async function loadConcessionRows(
  svc: SupabaseClient,
  opts: { transportYearId: string; kind: ConcessionKind; personIds?: string[] }
): Promise<ConcessionList> {
  const { transportYearId, kind } = opts;

  const { data: ruleData, error: ruleErr } = await svc
    .from('tms_fee_concession_rule')
    .select('*')
    .eq('transport_year_id', transportYearId)
    .order('created_at', { ascending: true });
  if (ruleErr) throw ruleErr;
  const rules = ((ruleData ?? []) as ConcessionRule[]).map((r) => ({
    ...r,
    percent: r.percent === null ? null : Number(r.percent),
    annual_amount: r.annual_amount === null ? null : Number(r.annual_amount),
  }));
  const kindRules = rules.filter((r) => r.kind === kind);
  const counts: Record<ConcessionStatus, number> = { applied: 0, needs_fix: 0, review: 0, unresolved: 0 };
  if (!kindRules.some((r) => r.is_active)) return { rows: [], counts, rules: kindRules };

  // Active learner structures for the year → who each one bills.
  const { data: fsData, error: fsErr } = await svc
    .from('tms_fee_structure')
    .select('*')
    .eq('transport_year_id', transportYearId)
    .eq('audience', 'student')
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  if (fsErr) throw fsErr;
  const structures = (fsData ?? []) as FeeStructureRow[];

  const structureOf = new Map<string, FeeStructureRow>();
  const person = new Map<string, { institution_id: string | null; admission_year: number | null }>();
  for (const fs of structures) {
    for (const p of await resolveApplicablePeople(svc, fs)) {
      if (structureOf.has(p.person_id)) continue; // first structure wins
      structureOf.set(p.person_id, fs);
      person.set(p.person_id, { institution_id: p.institution_id, admission_year: p.admission_year });
    }
  }

  let ids = [...person.keys()];
  if (opts.personIds) {
    const wanted = new Set(opts.personIds);
    ids = ids.filter((id) => wanted.has(id));
  }

  const learners = await selectByIds<LearnerRow>(
    svc, 'learners_profiles',
    'id, first_name, last_name, roll_number, program_id, scholarship_type, transport_stop_id',
    ids
  );

  // Candidates = learners a rule covers.
  const candidates: Array<{ l: LearnerRow; rule: ConcessionRule }> = [];
  for (const l of learners) {
    const p = person.get(l.id)!;
    const rule = matchRule(kindRules, kind, {
      institution_id: p.institution_id,
      admission_year: p.admission_year,
      program_id: l.program_id,
      scholarship_type: l.scholarship_type,
    });
    if (rule) candidates.push({ l, rule });
  }
  if (!candidates.length) return { rows: [], counts, rules: kindRules };
  const candIds = candidates.map((c) => c.l.id);

  // Names.
  const instIds = [...new Set(candidates.map((c) => person.get(c.l.id)!.institution_id).filter(Boolean) as string[])];
  const progIds = [...new Set(candidates.map((c) => c.l.program_id).filter(Boolean) as string[])];
  const insts = await selectByIds<{ id: string; name: string }>(svc, 'institutions', 'id, name', instIds);
  const progs = await selectByIds<{ id: string; program_name: string }>(svc, 'programs', 'id, program_name', progIds);
  const instName = new Map(insts.map((i) => [i.id, i.name]));
  const progName = new Map(progs.map((p) => [p.id, p.program_name]));

  // Overrides: by year only (few rows; avoids a huge .in()).
  const { data: ovData, error: ovErr } = await svc
    .from('tms_fee_override')
    .select('person_id, term_no, billable, amount, reason, concession_rule_id')
    .eq('transport_year_id', transportYearId);
  if (ovErr) throw ovErr;
  const overridesBy = new Map<string, ExistingOverride[]>();
  for (const o of (ovData ?? []) as Array<{
    person_id: string; term_no: number; billable: boolean; amount: string | number | null;
    reason: string | null; concession_rule_id: string | null;
  }>) {
    const list = overridesBy.get(o.person_id) ?? [];
    list.push({
      term_no: o.term_no, billable: o.billable, amount: o.amount === null ? null : Number(o.amount),
      reason: o.reason, concession_rule_id: o.concession_rule_id,
    });
    overridesBy.set(o.person_id, list);
  }

  // Ledger + money + receipts + pending payments.
  const fbs = await selectByIds<{
    id: string; person_id: string; term_no: number; amount: string | number; status: string; billing_student_bill_id: string | null; transport_year_id: string;
  }>(svc, 'tms_fee_bill', 'id, person_id, term_no, amount, status, billing_student_bill_id, transport_year_id', candIds, 'person_id');
  const yearFbs = fbs.filter((f) => f.transport_year_id === transportYearId);
  const sbIds = yearFbs.map((f) => f.billing_student_bill_id).filter(Boolean) as string[];
  const sbs = await selectByIds<{ id: string; final_amount: string | number; status: string; payment_date: string | null }>(
    svc, 'billing_student_bills', 'id, final_amount, status, payment_date', sbIds);
  const receipts = await selectByIds<{ bill_id: string; amount_paid: string | number }>(
    svc, 'billing_receipt_items', 'bill_id, amount_paid', sbIds, 'bill_id');
  // Only open or settled attempts count: failed/expired attempts moved no money.
  // Same rule as tms_apply_fee_concession (migration 20260917140000).
  const pti = await selectByIds<{ bill_id: string; transaction_id: string }>(
    svc, 'payment_transaction_items', 'bill_id, transaction_id', sbIds, 'bill_id');
  const txns = await selectByIds<{ id: string; status: string | null }>(
    svc, 'payment_transactions', 'id, status', [...new Set(pti.map((x) => x.transaction_id))]);
  const deadTxn = new Set(txns.filter((t) => t.status === 'failed' || t.status === 'expired').map((t) => t.id));
  const pending = pti.filter((x) => !deadTxn.has(x.transaction_id));
  const sbById = new Map(sbs.map((s) => [s.id, s]));
  const paidBy = new Map<string, number>();
  for (const r of receipts) paidBy.set(r.bill_id, (paidBy.get(r.bill_id) ?? 0) + Number(r.amount_paid));
  const pendingSet = new Set(pending.map((p) => p.bill_id));
  const ledgerBy = new Map<string, LedgerState[]>();
  for (const f of yearFbs) {
    const sb = f.billing_student_bill_id ? sbById.get(f.billing_student_bill_id) : undefined;
    const list = ledgerBy.get(f.person_id) ?? [];
    list.push({
      feeBillId: f.id,
      termNo: f.term_no,
      ledgerAmount: Number(f.amount),
      ledgerStatus: f.status,
      moneyBillId: sb?.id ?? null,
      moneyFinal: sb ? Number(sb.final_amount) : null,
      moneyStatus: sb?.status ?? null,
      paid: sb ? paidBy.get(sb.id) ?? 0 : 0,
      // A payment_date with no receipt still means money moved (mirrors the live bill-delete guard).
      pendingPayment: sb ? pendingSet.has(sb.id) || sb.payment_date !== null : false,
    });
    ledgerBy.set(f.person_id, list);
  }

  // One context per structure.
  const ctxBy = new Map<string, Awaited<ReturnType<typeof loadResolveContext>>>();
  for (const fs of new Set(candidates.map((c) => structureOf.get(c.l.id)!))) {
    ctxBy.set(fs.id, await loadResolveContext(svc, fs));
  }

  const rows: ConcessionRow[] = [];
  for (const { l, rule } of candidates) {
    const p = person.get(l.id)!;
    const fs = structureOf.get(l.id)!;
    const ledger = ledgerBy.get(l.id) ?? [];
    const money = ledger.filter((x) => x.moneyFinal !== null);
    const base: ConcessionRow = {
      personId: l.id,
      rollNumber: l.roll_number,
      name: [l.first_name, l.last_name].filter(Boolean).join(' ') || '—',
      institutionName: p.institution_id ? instName.get(p.institution_id) ?? null : null,
      programName: l.program_id ? progName.get(l.program_id) ?? null : null,
      admissionYear: p.admission_year,
      ruleId: rule.id,
      ruleLabel: rule.label,
      fullTotal: null,
      targetTotal: null,
      billAmount: money.length ? money.reduce((s, x) => s + (x.moneyFinal ?? 0), 0) : null,
      paidAmount: ledger.reduce((s, x) => s + x.paid, 0),
      billStatus: money.length === 1 ? money[0].moneyStatus : money.length ? 'multiple' : null,
      status: 'unresolved',
      reason: null,
      terms: [],
      rowTargets: [],
    };

    const loaded = ctxBy.get(fs.id)!;
    if (!loaded.ok) {
      rows.push({ ...base, reason: loaded.error });
      continue;
    }
    const outcome = resolvePersonTerms(
      { admission_year: p.admission_year, transport_stop_id: l.transport_stop_id, overrides: [] },
      loaded.value.ctx
    );
    if (!outcome.ok) {
      rows.push({ ...base, reason: UNRESOLVED_LABEL[outcome.reason] });
      continue;
    }
    const terms = targetTerms(rule, outcome.terms);
    const total = targetTotal(terms);
    const fullTotal = outcome.terms.reduce((s, t) => s + Number(t.amount), 0);
    const guardReason = guardTarget(kind, total, fullTotal);
    if (guardReason) {
      rows.push({ ...base, fullTotal, targetTotal: total, terms, status: 'review', reason: guardReason, rowTargets: [] });
      continue;
    }
    const c = classifyConcession({ kind, terms, total, overrides: overridesBy.get(l.id) ?? [], ledger });
    const targets = rowTargets(kind, total, ledger);
    rows.push({
      ...base, fullTotal, targetTotal: total, terms, status: c.status, reason: c.reason,
      rowTargets: targets ? [...targets].map(([fee_bill_id, target]) => ({ fee_bill_id, target })) : [],
    });
  }

  for (const r of rows) counts[r.status]++;
  rows.sort((a, b) => (a.rollNumber ?? '').localeCompare(b.rollNumber ?? ''));
  return { rows, counts, rules: kindRules };
}

const REASON_PREFIX: Record<ConcessionKind, string> = {
  final_year: FINAL_YEAR_BATCH_CLOSURE_PREFIX,
  scheme_75: SCHEME_75_SCHOLARSHIP,
};

export async function applyConcessions(
  svc: SupabaseClient,
  opts: { transportYearId: string; kind: ConcessionKind; personIds: string[]; actorId: string; today: string }
): Promise<ApplyResult[]> {
  const list = await loadConcessionRows(svc, {
    transportYearId: opts.transportYearId,
    kind: opts.kind,
    personIds: opts.personIds,
  });
  const byId = new Map(list.rows.map((r) => [r.personId, r]));
  const results: ApplyResult[] = [];

  for (const id of opts.personIds) {
    const row = byId.get(id);
    if (!row) {
      results.push({ personId: id, name: id, outcome: 'skipped', message: 'Not covered by any active rule' });
      continue;
    }
    if (row.status !== 'needs_fix' || !row.ruleId || row.targetTotal === null) {
      results.push({ personId: id, name: row.name, outcome: row.status === 'review' ? 'review' : 'skipped', message: row.reason ?? `Status is ${row.status}` });
      continue;
    }
    const reason = `${REASON_PREFIX[opts.kind]} - ${row.ruleLabel} - (${row.name}, ${row.rollNumber ?? 'no roll'}) - ${opts.today}`;
    const { data, error } = await svc.rpc('tms_apply_fee_concession', {
      p_person_id: id,
      p_rule_id: row.ruleId,
      p_terms: row.terms,
      p_row_targets: row.rowTargets,
      p_reason: reason,
      p_actor: opts.actorId,
    });
    if (error) {
      const review = reviewMessage(error.message ?? '');
      results.push({ personId: id, name: row.name, outcome: review ? 'review' : 'error', message: review ?? error.message });
      continue;
    }
    const actions = ((data as { actions?: Array<{ action: string }> } | null)?.actions) ?? [];
    results.push({ personId: id, name: row.name, outcome: summariseActions(actions), message: null });
  }
  return results;
}
