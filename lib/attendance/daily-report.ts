/**
 * Daily attendance report — pure logic, no I/O.
 *
 * The SQL function tms_attendance_daily_report returns one row per route with a
 * few weeks of days folded into jsonb. Everything here turns that into: the
 * bus-by-bus table for ONE chosen day, the fleet totals, the "last 7 days"
 * strip, and the short list of things the transport head should act on.
 *
 * Two facts shape every rule below:
 *  - Staff only scan cards. Nobody marks "absent" by hand; the auto-close job
 *    writes the absences when the window ends, and only on buses that got at
 *    least one staff mark. So "absent" really means "not scanned on a bus that
 *    somebody scanned", and a bus nobody scanned has no rows at all.
 *  - A day on which NO bus was marked is almost always a holiday nobody entered
 *    in the service calendar. It is treated as "no marks that day", never as 25
 *    separate failures, and it does not lengthen a bus's unmarked streak.
 */

/** One day of one route, as the SQL function emits it. */
export interface RawDailyDay {
  d: string;
  /** present */
  p: number;
  /** absent, marked by staff */
  s: number;
  /** absent, written by the auto-close job */
  a: number;
  /** hostel / irregular riders scanned present */
  o: number;
  /** different people who marked */
  m: number;
  /** first / last staff mark, 'HH:MM' IST */
  f: string | null;
  l: string | null;
  /** service-calendar exception */
  x: boolean;
}

export interface RawDailyRoute {
  route_id: string;
  route_number: string | null;
  route_name: string | null;
  has_bus: boolean;
  roster: number;
  incharges: number;
  days: RawDailyDay[] | null;
}

export type DailyStatus = 'marked' | 'low' | 'not_marked' | 'no_service';

export const DAILY_STATUS_LABEL: Record<DailyStatus, string> = {
  marked: 'Marked',
  low: 'Low scanning',
  not_marked: 'Not marked',
  no_service: 'No service',
};

/**
 * A marked bus reads "Low scanning" when fewer than this share of its learners
 * were scanned present. 0.2 from live data (11 Nov 2026): buses ranged 11%-61%
 * with a fleet average of 32%, and under 20% picked out the five buses where
 * only one or two of several in-charges had scanned.
 */
export const LOW_SCANNING_SHARE = 0.2;

export interface DailyRouteRow {
  routeId: string;
  routeNumber: string | null;
  routeName: string | null;
  hasBus: boolean;
  /** Learners allocated to the bus. */
  roster: number;
  incharges: number;
  status: DailyStatus;
  /** present + absent: learners with a record for the day. */
  marked: number;
  present: number;
  /** Staff-marked and automatic absences together. */
  absent: number;
  /** Of `absent`, the ones the auto-close job wrote. */
  autoAbsent: number;
  /** Learners on the bus with no record at all. */
  notMarked: number;
  /** present / marked, 0-100. null when nothing was marked. */
  presentPct: number | null;
  /** Different staff who marked. */
  markers: number;
  firstScan: string | null;
  lastScan: string | null;
  /** Hostel / irregular riders scanned on this bus (not counted above). */
  offRoster: number;
  /** For a not-marked bus: service days in a row without a staff mark, this day included. */
  unmarkedDays: number;
  /** For a not-marked bus: the last day it was marked, null if never in the look-back. */
  lastMarked: string | null;
}

export interface DailyTotals {
  buses: number;
  busesMarked: number;
  learners: number;
  marked: number;
  present: number;
  absent: number;
  autoAbsent: number;
  notMarked: number;
  presentPct: number | null;
  offRoster: number;
}

export interface DailyTrendDay {
  date: string;
  present: number;
  absent: number;
  busesMarked: number;
  buses: number;
  /** A fleet-wide holiday in the service calendar. */
  holiday: boolean;
  /** Not a declared holiday, yet no bus was marked. */
  nothingMarked: boolean;
}

export interface DailyActions {
  /** Not marked, and no in-charge is assigned to the bus. */
  noIncharge: DailyRouteRow[];
  /** Not marked although in-charges are assigned. */
  notScanned: DailyRouteRow[];
  /** Marked, but too few learners scanned for the absences to be trusted. */
  low: DailyRouteRow[];
}

export interface DailyReport {
  date: string;
  /** The chosen date is a Sunday or outside the data: nothing to show. */
  noData: boolean;
  /** Every bus is on a declared holiday. */
  holiday: boolean;
  /** Not a holiday, yet no bus has a staff mark. */
  nothingMarked: boolean;
  rows: DailyRouteRow[];
  totals: DailyTotals;
  trend: DailyTrendDay[];
  /** The previous day with marks, for the "vs last day" hint. */
  previous: { date: string; present: number } | null;
  actions: DailyActions;
}

const human = (d: RawDailyDay) => d.p + d.s;

export function classifyDay(input: {
  present: number;
  staffAbsent: number;
  roster: number;
  isHoliday: boolean;
}): DailyStatus {
  if (input.isHoliday) return 'no_service';
  // Auto rows alone never make a bus "marked": nobody was there.
  if (input.present + input.staffAbsent === 0) return 'not_marked';
  if (input.roster > 0 && input.present < input.roster * LOW_SCANNING_SHARE) return 'low';
  return 'marked';
}

const pct = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;

const EMPTY_TOTALS: DailyTotals = {
  buses: 0, busesMarked: 0, learners: 0, marked: 0, present: 0, absent: 0,
  autoAbsent: 0, notMarked: 0, presentPct: null, offRoster: 0,
};

/**
 * Dates on which at least one bus carries a staff mark. A date missing from
 * this set and not a holiday is a "nothing marked" day.
 */
function datesWithMarks(routes: RawDailyRoute[]): Set<string> {
  const out = new Set<string>();
  for (const r of routes) for (const d of r.days ?? []) if (human(d) > 0) out.add(d.d);
  return out;
}

/** Shape the SQL rows into the report for `date` (the last day of the look-back). */
export function buildDailyReport(routes: RawDailyRoute[], date: string): DailyReport {
  const empty: DailyReport = {
    date, noData: true, holiday: false, nothingMarked: false, rows: [],
    totals: { ...EMPTY_TOTALS }, trend: [], previous: null,
    actions: { noIncharge: [], notScanned: [], low: [] },
  };
  if (routes.length === 0) return empty;

  const active = datesWithMarks(routes);
  const hasDate = routes.some((r) => (r.days ?? []).some((d) => d.d === date));
  const trend = buildTrend(routes, active);
  if (!hasDate) return { ...empty, trend };

  const rows: DailyRouteRow[] = routes.map((r) => {
    const days = r.days ?? [];
    const day = days.find((d) => d.d === date);
    const present = day?.p ?? 0;
    const staffAbsent = day?.s ?? 0;
    const autoAbsent = day?.a ?? 0;
    const status = classifyDay({ present, staffAbsent, roster: r.roster, isHoliday: day?.x ?? false });
    const isMarked = status === 'marked' || status === 'low';
    // A not-marked bus shows no counts: stray auto rows (a learner who booked
    // this bus) would otherwise read as "the bus was marked, everyone absent".
    const absent = isMarked ? staffAbsent + autoAbsent : 0;
    const marked = isMarked ? present + absent : 0;
    const notMarked =
      status === 'no_service' ? 0 : isMarked ? Math.max(r.roster - marked, 0) : r.roster;

    let unmarkedDays = 0;
    let lastMarked: string | null = null;
    if (status === 'not_marked') {
      for (let i = days.length - 1; i >= 0; i -= 1) {
        const d = days[i];
        if (d.d > date) continue;
        if (human(d) > 0) { lastMarked = d.d; break; }
        // Holidays and days nobody marked anywhere do not count against the bus.
        if (!d.x && (d.d === date || active.has(d.d))) unmarkedDays += 1;
      }
    }

    return {
      routeId: r.route_id,
      routeNumber: r.route_number,
      routeName: r.route_name,
      hasBus: r.has_bus,
      roster: r.roster,
      incharges: r.incharges,
      status,
      marked,
      present: isMarked ? present : 0,
      absent,
      autoAbsent: isMarked ? autoAbsent : 0,
      notMarked,
      presentPct: pct(isMarked ? present : 0, marked),
      markers: day?.m ?? 0,
      firstScan: day?.f ?? null,
      lastScan: day?.l ?? null,
      offRoster: day?.o ?? 0,
      unmarkedDays,
      lastMarked,
    };
  });

  const totals = summarizeRows(rows);
  const inService = rows.filter((r) => r.status !== 'no_service');
  const holiday = inService.length === 0;
  const nothingMarked = !holiday && totals.busesMarked === 0;

  // An empty bus is not a staffing failure, and on a day nobody marked there is
  // one thing to say (see nothingMarked), not twenty-five.
  const failing = nothingMarked ? [] : rows.filter((r) => r.roster > 0);
  const actions: DailyActions = {
    noIncharge: failing.filter((r) => r.status === 'not_marked' && r.incharges === 0),
    notScanned: failing
      .filter((r) => r.status === 'not_marked' && r.incharges > 0)
      .sort((a, b) => b.unmarkedDays - a.unmarkedDays),
    low: failing
      .filter((r) => r.status === 'low')
      .sort((a, b) => (a.presentPct ?? 0) - (b.presentPct ?? 0)),
  };

  const before = trend.filter((t) => t.date < date && !t.holiday && !t.nothingMarked);
  const prev = before[before.length - 1];

  return {
    date, noData: false, holiday, nothingMarked, rows, totals,
    trend: trend.filter((t) => t.date <= date).slice(-7),
    previous: prev ? { date: prev.date, present: prev.present } : null,
    actions,
  };
}

/** Fleet totals over the given rows (all rows, or the rows left by a filter). */
export function summarizeRows(rows: DailyRouteRow[]): DailyTotals {
  const t = { ...EMPTY_TOTALS };
  for (const r of rows) {
    if (r.status === 'no_service') continue;
    t.buses += 1;
    if (r.status === 'marked' || r.status === 'low') t.busesMarked += 1;
    t.learners += r.roster;
    t.marked += r.marked;
    t.present += r.present;
    t.absent += r.absent;
    t.autoAbsent += r.autoAbsent;
    t.notMarked += r.notMarked;
    t.offRoster += r.offRoster;
  }
  t.presentPct = pct(t.present, t.marked);
  return t;
}

/** One entry per day in the look-back, oldest first. */
function buildTrend(routes: RawDailyRoute[], active: Set<string>): DailyTrendDay[] {
  const byDate = new Map<string, DailyTrendDay & { holidays: number; routes: number }>();
  for (const r of routes) {
    for (const d of r.days ?? []) {
      const t = byDate.get(d.d) ?? {
        date: d.d, present: 0, absent: 0, busesMarked: 0, buses: 0,
        holiday: false, nothingMarked: false, holidays: 0, routes: 0,
      };
      t.routes += 1;
      if (d.x) t.holidays += 1;
      else {
        t.buses += 1;
        if (human(d) > 0) {
          t.busesMarked += 1;
          t.present += d.p;
          t.absent += d.s + d.a;
        }
      }
      byDate.set(d.d, t);
    }
  }
  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ holidays, routes: n, ...t }) => ({
      ...t,
      holiday: holidays === n,
      nothingMarked: holidays < n && !active.has(t.date),
    }));
}

/** 'YYYY-MM-DD' shifted by whole days. Integer UTC math; no timezone can move it. */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

/** How far back the report reads, to find streaks and the last 7 service days. */
export const DAILY_LOOKBACK_DAYS = 35;
