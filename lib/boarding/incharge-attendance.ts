/**
 * Pure decision logic for the bus in-charge attendance enforcement loop.
 *
 * An in-charge holds a transport fee exemption in exchange for marking their
 * route's booked riders each travel day. Miss two CONSECUTIVE travel days and
 * the assignment is revoked and a staff fee bill is generated.
 *
 * No I/O here on purpose — the cron route gathers the facts, this decides.
 */

/**
 * Consecutive missed travel days that trigger removal. Misses 1 and 2 warn
 * (the second is the final warning); the third removes and bills.
 */
export const REMOVAL_THRESHOLD = 3;

/**
 * Enforcement runs Monday-Friday only.
 *
 * Saturdays carry bookings on every route but have never produced a single
 * attendance mark, and tms_service_calendar is too sparse (3 rows, all time)
 * to be an authority on off-days. Parsing the 'YYYY-MM-DD' parts by hand
 * rather than via Date() keeps the answer independent of the host timezone —
 * the cron already hands us an IST date string.
 */
export function isServiceWeekday(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay(); // 0 = Sunday
  return dow >= 1 && dow <= 5;
}

export type StrikeState = {
  consecutiveMisses: number;
  missedDates: string[];
  lastEvaluatedDate: string | null;
};

export type DayFacts = {
  /** 'YYYY-MM-DD' in IST. */
  date: string;
  /** The route had at least one booked rider — i.e. it was a real travel day. */
  hasBookedRiders: boolean;
  /** At least one tms_attendance row exists for the route on this date, either leg. */
  attendanceMarked: boolean;
  /** The assignment was created on this date — one-day grace. */
  assignedOnDate: boolean;
  /** The date is a Monday-Friday service day. Weekends are never enforced. */
  isServiceWeekday: boolean;
};

export type StrikeOutcome =
  | { action: 'skip'; reason: 'already_evaluated' | 'grace_day' | 'no_travel_day' | 'not_a_service_day' }
  | { action: 'reset'; state: StrikeState }
  | { action: 'warn'; state: StrikeState }
  | { action: 'remove'; state: StrikeState };

export function evaluateDay(prev: StrikeState, facts: DayFacts): StrikeOutcome {
  // Idempotency first: a re-fired cron must change nothing.
  if (prev.lastEvaluatedDate === facts.date) {
    return { action: 'skip', reason: 'already_evaluated' };
  }
  if (facts.assignedOnDate) return { action: 'skip', reason: 'grace_day' };
  // Weekends are not service days: like a holiday they neither punish nor forgive.
  if (!facts.isServiceWeekday) return { action: 'skip', reason: 'not_a_service_day' };
  // Holidays, Sundays and empty rosters are not travel days: no strike, and
  // deliberately no reset either (they neither punish nor forgive).
  if (!facts.hasBookedRiders) return { action: 'skip', reason: 'no_travel_day' };

  if (facts.attendanceMarked) {
    return {
      action: 'reset',
      state: { consecutiveMisses: 0, missedDates: [], lastEvaluatedDate: facts.date },
    };
  }

  const state: StrikeState = {
    consecutiveMisses: prev.consecutiveMisses + 1,
    missedDates: [...prev.missedDates, facts.date],
    lastEvaluatedDate: facts.date,
  };
  return state.consecutiveMisses >= REMOVAL_THRESHOLD
    ? { action: 'remove', state }
    : { action: 'warn', state };
}

export function warningCopy(
  missedDates: string[],
  isFinalWarning: boolean,
): { title: string; body: string } {
  const last = missedDates[missedDates.length - 1] ?? '';
  if (isFinalWarning) {
    return {
      title: 'Final warning — attendance not marked',
      body:
        `You did not mark attendance for your bus on ${last}, and this is now ${missedDates.length} ` +
        `travel days in a row. This is your final warning: if attendance is not marked on your next ` +
        `travel day, your bus in-charge role will be removed and a transport fee bill will be generated for you.`,
    };
  }
  return {
    title: 'Attendance not marked',
    body:
      `You did not mark attendance for your bus on ${last}. ` +
      `Mark attendance on your next travel day — if you miss ${REMOVAL_THRESHOLD} travel days in a row, ` +
      `your bus in-charge role will be removed and transport fees will apply to you.`,
  };
}

export function removalCopy(missedDates: string[], billed: boolean): { title: string; body: string } {
  return {
    title: 'Bus in-charge role removed',
    body:
      `Attendance was not marked on ${missedDates.join(' and ')}. ` +
      `Your bus in-charge role has been removed and your transport fee exemption no longer applies. ` +
      (billed
        ? 'A transport fee bill has been generated for you.'
        : 'Please contact the transport office regarding your transport fees.'),
  };
}

export type BillingStatus = 'billed' | 'no_structure' | 'error';

/**
 * Runs the removal in the ONE order that is safe: revoke first, bill second.
 *
 * Billing depends on a fee structure that may not exist and on a shared billing
 * schema we do not own, so it is the failure-prone half. If it throws, the
 * revoke must still stand — the staffer has lost the in-charge role either way
 * and the transport office can bill manually. A revoke failure, by contrast,
 * propagates: nothing happened, so the caller must not record a removal.
 *
 * Injecting the two steps keeps this orderable guarantee unit-testable without
 * stubbing a Supabase client.
 */
export async function performRemoval(steps: {
  revoke: () => Promise<void>;
  bill: () => Promise<BillingStatus>;
}): Promise<{ revoked: boolean; billingStatus: BillingStatus }> {
  await steps.revoke();
  try {
    return { revoked: true, billingStatus: await steps.bill() };
  } catch {
    return { revoked: true, billingStatus: 'error' };
  }
}
