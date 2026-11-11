/**
 * In-charge marking report — the RULES, with no I/O.
 *
 * Answers "did this bus in-charge scan their learners on this day?" for every
 * active in-charge assignment and every day of a month, for one leg (morning
 * or evening). The API route gathers the facts; these decide.
 *
 * Only human marks count (the SQL excludes method = 'auto'), and "marked" means
 * the in-charge personally scanned at least one learner, the same test the
 * in-charge bill review uses for its "own marks" days, so the two screens agree.
 * A day is a service day for a bus unless it is a Sunday, a holiday in the
 * service calendar (fleet-wide or for that bus), an admin-excused day, or a day
 * nobody in the fleet marked at all — again the bill review's rule.
 */

import { isExcused, type AbsenceRow } from '@/lib/boarding/share-coverage';
import { normEmail } from '@/lib/fees/incharge-bill-review';

/**
 * Two answers only, on a working day: the in-charge scanned learners
 * themselves (Marked) or did not (Not marked, even if a colleague scanned
 * the bus). Days they were not answerable for are 'off' and are not shown
 * as a status.
 */
export type MarkingStatus =
  | 'marked' // scanned at least one learner themselves
  | 'missed' // did not scan (shown as "Not marked")
  | 'off' // no duty: Sunday, holiday, excused day, fleet-wide no-scan day, or declared leave
  | 'na'; // before the in-charge was assigned, or a future date

export const MARKING_LABEL: Record<MarkingStatus, string> = {
  marked: 'Marked',
  missed: 'Not marked',
  off: 'No duty',
  na: '—',
};

/** Statuses that count as a working day the in-charge was answerable for. */
export const DUTY_STATUSES: ReadonlySet<MarkingStatus> = new Set(['marked', 'missed']);

export interface MarkingCell {
  s: MarkingStatus;
  /** Learners this in-charge marked (present + absent, human marks only). */
  n: number;
  /** Learners anyone marked on this bus. */
  bus: number;
  first: string | null;
  last: string | null;
}

export interface MarkingRow {
  assignmentId: string;
  name: string;
  email: string;
  routeId: string;
  routeNumber: string | null;
  routeName: string | null;
  /** IST date the duty started. */
  startDate: string;
  cells: Record<string, MarkingCell>;
  /** Over the month: working days they were answerable for (marked + not marked). */
  dutyDays: number;
  markedDays: number;
  missedDays: number;
  /** markedDays / dutyDays, rounded; null when there were no duty days. */
  markedPct: number | null;
}

// ── Raw inputs ─────────────────────────────────────────────────────────────

export interface RawMarks {
  person_days: Array<{ profile_id: string; email: string | null; d: string; n: number; first: string | null; last: string | null }>;
  route_days: Array<{ route_id: string; d: string; n: number }>;
  fleet_days: string[];
}

export interface InchargeInput {
  assignmentId: string;
  routeId: string;
  routeNumber: string | null;
  routeName: string | null;
  name: string;
  email: string;
  /** Every address the person is known by (assignment, staff, institution, profile), lower-cased. */
  emails: ReadonlySet<string>;
  /** staff.profile_id, when the staff row is linked to a login. */
  profileId: string | null;
  startDate: string;
}

export interface MarkingInputs {
  days: string[];
  today: string;
  incharges: InchargeInput[];
  marks: RawMarks;
  /** tms_service_calendar exceptions; routeId null = every bus. */
  calendarOff: Array<{ date: string; routeId: string | null }>;
  /** tms_incharge_excused_day. */
  excused: string[];
  absences: AbsenceRow[];
}

// ── Dates ──────────────────────────────────────────────────────────────────

export function monthDays(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

export const isSundayDate = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay() === 0;

// ── Rule ───────────────────────────────────────────────────────────────────

export function classifyCell(args: {
  date: string;
  today: string;
  startDate: string;
  serviceDay: boolean;
  own: number;
  bus: number;
  onLeave: boolean;
}): MarkingStatus {
  // `bus` (a colleague's scans) is carried for display only; it never makes a mark.
  const { date, today, startDate, serviceDay, own, onLeave } = args;
  if (date > today || date < startDate) return 'na';
  // A scan always counts, even on a day that would otherwise be "no service".
  if (own > 0) return 'marked';
  if (!serviceDay || onLeave) return 'off';
  return 'missed';
}

export function buildMarkingReport(inp: MarkingInputs): MarkingRow[] {
  const fleet = new Set(inp.marks.fleet_days);
  const excused = new Set(inp.excused);

  const busCount = new Map<string, number>();
  for (const r of inp.marks.route_days) busCount.set(`${r.route_id}|${r.d}`, r.n);

  // A person's scans are found by profile id OR by any of their addresses
  // (staff are known by up to three emails; see resolveStaffId).
  const byProfile = new Map<string, RawMarks['person_days']>();
  const byEmail = new Map<string, RawMarks['person_days']>();
  for (const p of inp.marks.person_days) {
    (byProfile.get(p.profile_id) ?? byProfile.set(p.profile_id, []).get(p.profile_id)!).push(p);
    const e = normEmail(p.email);
    if (e) (byEmail.get(e) ?? byEmail.set(e, []).get(e)!).push(p);
  }

  const serviceDay = (routeId: string, d: string) => {
    if (isSundayDate(d) || excused.has(d)) return false;
    if (inp.calendarOff.some((c) => c.date === d && (c.routeId === null || c.routeId === routeId))) return false;
    // Today counts as a service day even before anyone scans.
    return fleet.has(d) || d === inp.today;
  };

  return inp.incharges.map((ic) => {
    // Gather this person's per-day marks once, de-duplicated by scanner id.
    const seen = new Set<string>();
    const ownByDay = new Map<string, { n: number; first: string | null; last: string | null }>();
    const add = (p: RawMarks['person_days'][number]) => {
      const key = `${p.profile_id}|${p.d}`;
      if (seen.has(key)) return;
      seen.add(key);
      const cur = ownByDay.get(p.d);
      if (!cur) {
        ownByDay.set(p.d, { n: p.n, first: p.first, last: p.last });
      } else {
        cur.n += p.n;
        if (p.first && (!cur.first || p.first < cur.first)) cur.first = p.first;
        if (p.last && (!cur.last || p.last > cur.last)) cur.last = p.last;
      }
    };
    if (ic.profileId) for (const p of byProfile.get(ic.profileId) ?? []) add(p);
    for (const e of ic.emails) for (const p of byEmail.get(e) ?? []) add(p);

    const cells: Record<string, MarkingCell> = {};
    let markedDays = 0, missedDays = 0;
    for (const d of inp.days) {
      const own = ownByDay.get(d);
      const bus = busCount.get(`${ic.routeId}|${d}`) ?? 0;
      const s = classifyCell({
        date: d,
        today: inp.today,
        startDate: ic.startDate,
        serviceDay: serviceDay(ic.routeId, d),
        own: own?.n ?? 0,
        bus,
        onLeave: isExcused(ic.assignmentId, d, inp.absences),
      });
      cells[d] = { s, n: own?.n ?? 0, bus, first: own?.first ?? null, last: own?.last ?? null };
      if (s === 'marked') markedDays++;
      else if (s === 'missed') missedDays++;
    }
    const dutyDays = markedDays + missedDays;
    return {
      assignmentId: ic.assignmentId,
      name: ic.name,
      email: ic.email,
      routeId: ic.routeId,
      routeNumber: ic.routeNumber,
      routeName: ic.routeName,
      startDate: ic.startDate,
      cells,
      dutyDays,
      markedDays,
      missedDays,
      markedPct: dutyDays > 0 ? Math.round((markedDays / dutyDays) * 100) : null,
    };
  });
}

/** Counts for one day across every in-charge (the KPI tiles). */
export function summarizeDay(rows: MarkingRow[], date: string) {
  const out = { onDuty: 0, marked: 0, missed: 0 };
  for (const r of rows) {
    const s = r.cells[date]?.s;
    if (s !== 'marked' && s !== 'missed') continue;
    out.onDuty++;
    out[s]++;
  }
  return out;
}

// ── Month and year summaries ───────────────────────────────────────────────

export interface PeriodSummary {
  duty: number;
  marked: number;
  missed: number;
  /** marked / duty, rounded; null with no duty days. */
  pct: number | null;
}

export function summarizeCells(cells: MarkingCell[]): PeriodSummary {
  const out: PeriodSummary = { duty: 0, marked: 0, missed: 0, pct: null };
  for (const c of cells) {
    if (c.s === 'marked') out.marked++;
    else if (c.s === 'missed') out.missed++;
  }
  out.duty = out.marked + out.missed;
  out.pct = out.duty > 0 ? Math.round((out.marked / out.duty) * 100) : null;
  return out;
}

/** One in-charge over a year: a summary per month ('YYYY-MM') plus the year. */
export interface YearRow {
  assignmentId: string;
  name: string;
  email: string;
  routeId: string;
  routeNumber: string | null;
  routeName: string | null;
  months: Record<string, PeriodSummary>;
  total: PeriodSummary;
}

export function toYearRows(rows: MarkingRow[], months: string[]): YearRow[] {
  return rows.map((r) => {
    const all = Object.entries(r.cells);
    const byMonth: Record<string, PeriodSummary> = {};
    for (const m of months) byMonth[m] = summarizeCells(all.filter(([d]) => d.startsWith(m)).map(([, c]) => c));
    return {
      assignmentId: r.assignmentId,
      name: r.name,
      email: r.email,
      routeId: r.routeId,
      routeNumber: r.routeNumber,
      routeName: r.routeName,
      months: byMonth,
      total: summarizeCells(all.map(([, c]) => c)),
    };
  });
}

/** Tile counts for a month or a year: how many in-charges fall in each band. */
export function bandCounts(pcts: Array<number | null>) {
  const out = { people: 0, avg: null as number | null, never: 0, low: 0, good: 0 };
  let sum = 0;
  for (const p of pcts) {
    if (p === null) continue;
    out.people++;
    sum += p;
    if (p === 0) out.never++;
    else if (p < 75) out.low++;
    else out.good++;
  }
  out.avg = out.people > 0 ? Math.round(sum / out.people) : null;
  return out;
}
