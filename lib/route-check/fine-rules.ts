// When a Bus Inspection check may fine a learner. Pure, no I/O; the IO layer
// (fines.ts) gathers the facts and runs these at SUBMIT, never at scan time.
import { isSunday } from '@/lib/booking/window';
import type { BookingMark, FeeMark } from './marks';

export type FineNote =
  | 'fines_off' | 'no_current_year' | 'not_unpaid' | 'override' | 'fee_unknown'
  | 'deadline_not_passed' | 'within_notice_window' | 'booked' | 'booked_other_bus'
  | 'not_service_day' | 'already_fined' | 'raised' | 'error';

export type FineDecision = { raise: true } | { raise: false; note: FineNote };

export interface LearnerFeeFacts {
  mark: FeeMark;
  /** due_date of the learner's earliest-term tms_fee_bill row this year. */
  term1DueDate: string | null;
  /** expires_at of a RUNNING 48h payment notice, if any. */
  runningNoticeExpiresAt: string | null;
}

export function decideFeeFine(f: LearnerFeeFacts, ctx: { checkDate: string; now: Date }): FineDecision {
  if (f.mark === 'unknown') return { raise: false, note: 'fee_unknown' };
  if (f.mark === 'override') return { raise: false, note: 'override' };
  if (f.mark !== 'unpaid') return { raise: false, note: 'not_unpaid' };
  if (!f.term1DueDate || f.term1DueDate >= ctx.checkDate) return { raise: false, note: 'deadline_not_passed' };
  if (f.runningNoticeExpiresAt && Date.parse(f.runningNoticeExpiresAt) > ctx.now.getTime()) {
    return { raise: false, note: 'within_notice_window' };
  }
  return { raise: true };
}

export function decideBookingFine(b: BookingMark, ctx: { serviceDay: boolean }): FineDecision {
  if (b === 'this_route') return { raise: false, note: 'booked' };
  if (b === 'other_route') return { raise: false, note: 'booked_other_bus' };
  if (!ctx.serviceDay) return { raise: false, note: 'not_service_day' };
  return { raise: true };
}

export function isServiceDay(date: string, exceptionDates: Set<string>): boolean {
  return !isSunday(date) && !exceptionDates.has(date);
}

export const FINE_NOTE_LABEL: Record<FineNote, string> = {
  fines_off: 'Automatic fines are off',
  no_current_year: 'No current transport year',
  not_unpaid: 'Fee paid / no bill',
  override: 'Fee override',
  fee_unknown: 'Fee status could not be read',
  deadline_not_passed: 'Fee not yet due',
  within_notice_window: 'Inside the 48-hour payment window',
  booked: 'Booked this bus',
  booked_other_bus: 'Booked another bus',
  not_service_day: 'Not a service day',
  already_fined: 'Already fined',
  raised: 'Fine raised',
  error: 'Fine failed — see logs',
};
