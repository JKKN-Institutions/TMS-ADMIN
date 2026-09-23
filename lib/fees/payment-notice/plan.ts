// Pure decision core of the payment notice sweep. The IO layer (sweep.ts)
// gathers state; this decides what happens to it. Keeping it pure is what lets
// the money-sensitive rules below be tested without a database.
//
// ORDER IS THE CONTRACT: a running notice is checked for "paid" first, then for
// "overridden", then for "already fined", and only then for expiry. A learner
// who paid minutes before the deadline must never be fined in the same run.
//
// "Already fined" = the learner already holds this year's once-only
// maintenance-unpaid fine (idempotency key maintenance-unpaid:<yearId>:<personId>),
// typically raised by a bus inspection. Such a learner is never sent a
// "pay within 48h or be fined" notice, and a running notice is closed against
// the existing fine (closeFined) instead of going through createFines, whose
// duplicate path would insert and then delete a real billing_student_bills row.

import { computeExpiry, type FeeNoticeConfig } from './config';

export interface NoticeRow {
  id: string;
  person_id: string;
  status: 'running' | 'paid' | 'fined' | 'cancelled';
  started_at: string;
  expires_at: string;
  reminder_sent_at: string | null;
  source_bill_id: string | null;
}
export interface UnpaidBill { person_id: string; bill_id: string; created_at: string }
export interface PlanInput {
  now: Date;
  cfg: FeeNoticeConfig & { enabledAt: string };
  paid: Set<string>;
  overridden: Set<string>;
  unpaidBills: UnpaidBill[];
  fineAmount: Map<string, number>;
  notices: NoticeRow[];
  /** personId -> existing maintenance-unpaid fine id for this transport year. */
  alreadyFined: Map<string, string>;
}
export interface OpenAction { person_id: string; source_bill_id: string; started_at: string; expires_at: string; amount: number }
export interface RemindAction { notice_id: string; person_id: string; expires_at: string; amount: number }
export interface FineAction { notice_id: string; person_id: string; source_bill_id: string | null; expires_at: string }
export interface CloseFinedAction { notice_id: string; fine_id: string }
export interface SweepPlan {
  markPaid: string[];
  cancel: string[];
  open: OpenAction[];
  remind: RemindAction[];
  fine: FineAction[];
  closeFined: CloseFinedAction[];
}

const HOUR_MS = 3_600_000;

export function planSweep(input: PlanInput): SweepPlan {
  const { now, cfg, paid, overridden, unpaidBills, fineAmount, notices, alreadyFined } = input;
  const nowMs = now.getTime();
  const plan: SweepPlan = { markPaid: [], cancel: [], open: [], remind: [], fine: [], closeFined: [] };

  for (const n of notices) {
    if (n.status !== 'running') continue;
    if (paid.has(n.person_id)) { plan.markPaid.push(n.id); continue; }
    if (overridden.has(n.person_id)) { plan.cancel.push(n.id); continue; }
    const existingFine = alreadyFined.get(n.person_id);
    if (existingFine) { plan.closeFined.push({ notice_id: n.id, fine_id: existingFine }); continue; }
    const expMs = Date.parse(n.expires_at);
    if (expMs <= nowMs) {
      plan.fine.push({ notice_id: n.id, person_id: n.person_id, source_bill_id: n.source_bill_id, expires_at: n.expires_at });
      continue;
    }
    if (!n.reminder_sent_at && expMs - nowMs <= cfg.reminderHoursBefore * HOUR_MS) {
      const amount = fineAmount.get(n.person_id);
      if (amount && amount > 0) {
        plan.remind.push({
          notice_id: n.id, person_id: n.person_id, expires_at: n.expires_at,
          amount,
        });
      }
    }
  }

  const noticed = new Set(notices.map((n) => n.person_id));
  const seen = new Set<string>();
  for (const b of unpaidBills) {
    const p = b.person_id;
    if (seen.has(p) || noticed.has(p) || paid.has(p) || overridden.has(p) || alreadyFined.has(p)) continue;
    const amount = fineAmount.get(p);
    if (!amount || amount <= 0) continue;
    seen.add(p);
    let expires = computeExpiry(cfg.enabledAt, b.created_at, cfg.windowHours);
    // Nobody is fined without first seeing the timer (spec clarification).
    if (Date.parse(expires) <= nowMs) expires = new Date(nowMs + cfg.windowHours * HOUR_MS).toISOString();
    plan.open.push({ person_id: p, source_bill_id: b.bill_id, started_at: now.toISOString(), expires_at: expires, amount });
  }

  return plan;
}
