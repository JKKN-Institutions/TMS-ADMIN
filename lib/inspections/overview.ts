/**
 * Pure helpers for the inspection "everything about this bus" view. No I/O.
 */
export type Leg = 'onward' | 'return';

/** Morning trip before 12:00 IST, evening trip from 12:00. */
export function defaultLeg(istMinutes: number): Leg {
  return istMinutes < 12 * 60 ? 'onward' : 'return';
}

export type LearnerOutcome = 'ok' | 'wrong_bus' | 'not_booked' | 'fee_due' | 'unknown_card';

/** First match wins — the order is the spec's (unknown → wrong bus → not booked → fee due). */
export function learnerOutcome(i: { known: boolean; onThisRoute: boolean; bookedToday: boolean; feesOk: boolean }): LearnerOutcome {
  if (!i.known) return 'unknown_card';
  if (!i.onThisRoute) return 'wrong_bus';
  if (!i.bookedToday) return 'not_booked';
  if (!i.feesOk) return 'fee_due';
  return 'ok';
}

export interface InchargeInput { staffEmail: string; name: string; phone: string | null; profileIds: string[]; emails: string[] }
export interface MarkInput { scannedBy: string; scannedAt: string; markerEmail: string | null }
export interface InchargeDuty {
  staffEmail: string; name: string; phone: string | null;
  marks: number; firstAt: string | null; lastAt: string | null;
  absent: boolean; coveredBy: string | null;
}

const lc = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/**
 * Who of the assigned in-charges marked this bus today. Staff have up to three
 * emails and may mark from a profile whose email differs from the assignment,
 * so a mark belongs to an in-charge when its profile id OR its marker email
 * matches any of theirs (case-insensitive). Each mark is claimed by at most one
 * in-charge (the first match in list order). Unmatched markers are returned too.
 */
export function inchargeDuty(
  incharges: InchargeInput[],
  marks: MarkInput[],
  absences: { staffEmail: string; coveredBy: string | null }[],
) {
  const absentBy = new Map(absences.map((a) => [lc(a.staffEmail), a.coveredBy]));
  const claimed = new Set<number>();
  const duty: InchargeDuty[] = incharges.map((ic) => {
    const ids = new Set(ic.profileIds);
    const emails = new Set(ic.emails.map(lc));
    const mine: string[] = [];
    marks.forEach((m, idx) => {
      // A mark belongs to ONE in-charge: the first in list order that matches.
      if (claimed.has(idx)) return;
      if (ids.has(m.scannedBy) || (m.markerEmail && emails.has(lc(m.markerEmail)))) {
        mine.push(m.scannedAt);
        claimed.add(idx);
      }
    });
    // By time, not string: '…:00.500Z' sorts before '…:00Z' as text.
    mine.sort((a, b) => Date.parse(a) - Date.parse(b));
    const key = lc(ic.staffEmail);
    return {
      staffEmail: ic.staffEmail, name: ic.name, phone: ic.phone,
      marks: mine.length, firstAt: mine[0] ?? null, lastAt: mine[mine.length - 1] ?? null,
      absent: absentBy.has(key), coveredBy: absentBy.get(key) ?? null,
    };
  });
  const other = new Map<string, number>();
  marks.forEach((m, idx) => { if (!claimed.has(idx)) other.set(m.scannedBy, (other.get(m.scannedBy) ?? 0) + 1); });
  return { duty, otherMarkers: [...other].map(([profileId, n]) => ({ profileId, marks: n })) };
}

export function headcountDelta(counted: number | null, boarded: number): { diff: number | null; label: string } {
  if (counted == null) return { diff: null, label: 'Not counted yet' };
  const diff = counted - boarded;
  if (diff === 0) return { diff, label: 'Matches boarded count' };
  return diff > 0 ? { diff, label: `${diff} more than boarded` } : { diff, label: `${-diff} fewer than boarded` };
}
