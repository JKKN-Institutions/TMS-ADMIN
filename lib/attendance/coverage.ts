/**
 * Pure attendance-coverage logic for the admin grid.
 *
 * The SQL function tms_attendance_coverage returns one row per route with its
 * days folded into a jsonb array; everything here turns that into cells a grid
 * can paint, and nothing here touches the database.
 *
 * The governing rule: a mark counts only when a PERSON made it. The auto-absent
 * cron (method='auto') closes trips nobody marked, so counting its rows as
 * coverage would make an unstaffed route read as fully covered -- which is the
 * precise failure this grid was built to surface.
 */

export type CoverageState = 'marked' | 'partial' | 'auto_only' | 'not_marked' | 'holiday';

/**
 * Share of the allocated roster that must carry a human mark before a route-day
 * reads 'marked'.
 *
 * 0.6, chosen from live data rather than taste. Staff mark 120-180% of BOOKINGS
 * (they also mark allocated riders who never booked), so bookings are the wrong
 * denominator and produce rates above 100%. Against the allocated roster,
 * route-days cluster in the 60-100% band. At 0.9 the September grid painted 252
 * of 400 cells 'partial' and communicated nothing; at 0.6 it reads 236 marked /
 * 49 partial / 40 not marked. The grid exposes this as a control, so it is a
 * default rather than a law.
 */
export const DEFAULT_COVERAGE_THRESHOLD = 0.6;

export interface CoverageCellInput {
  human: number;
  auto: number;
  roster: number;
  isHoliday: boolean;
  threshold: number;
}

/** One day of one route, as the SQL function emits it. */
export interface RawDay {
  /** trip_date, YYYY-MM-DD */
  d: string;
  /** human marks (method <> 'auto') */
  h: number;
  /** auto marks */
  a: number;
  /** service-calendar exception applies */
  x: boolean;
}

export interface RawRouteCoverage {
  route_id: string;
  route_number: string | null;
  route_name: string | null;
  roster: number;
  days: RawDay[];
}

export interface CoverageCell {
  date: string;
  state: CoverageState;
  human: number;
  auto: number;
}

export interface CoverageRouteRow {
  routeId: string;
  routeNumber: string | null;
  routeName: string | null;
  /** Allocated bus_required learners. 0 means the row renders muted, not red. */
  roster: number;
  cells: CoverageCell[];
  /** Service days carrying at least one human mark. */
  humanDays: number;
  /** Service days in range, holidays excluded -- the denominator for humanDays. */
  serviceDays: number;
}

export interface CoverageSummary {
  /** Routes with zero human marks across the whole range. */
  neverMarkedRoutes: CoverageRouteRow[];
  /** Learners allocated to those routes -- the human cost of the gap. */
  neverMarkedLearners: number;
  unmarkedRouteDays: number;
  autoOnlyRouteDays: number;
}

/**
 * Which state one route-day is in. Order matters and is not arbitrary:
 *
 *  1. A holiday is a holiday whatever the counts say -- a mark made on a
 *     declared no-service day is odd, but it is never a coverage failure.
 *  2. Nothing at all outranks everything below it.
 *  3. auto_only is checked BEFORE the threshold, so a fully auto-closed trip can
 *     never reach 'marked' no matter how many rows it has.
 *  4. A zero roster cannot be divided by. Any human mark on such a route counts
 *     as marked; the grid mutes the whole row so an empty bus is not read as a
 *     staffing failure.
 */
export function classifyCell(input: CoverageCellInput): CoverageState {
  if (input.isHoliday) return 'holiday';
  if (input.human === 0 && input.auto === 0) return 'not_marked';
  if (input.human === 0) return 'auto_only';
  if (input.roster <= 0) return 'marked';
  return input.human >= input.roster * input.threshold ? 'marked' : 'partial';
}

/**
 * Shape the SQL rows into grid rows plus the shared column dates.
 *
 * Every route carries the same day series (the function cross-joins the series
 * against routes), so the columns are read from the first row. An empty result
 * yields empty columns rather than throwing.
 */
export function buildCoverage(
  rows: RawRouteCoverage[],
  threshold: number,
): { routes: CoverageRouteRow[]; dates: string[] } {
  if (rows.length === 0) return { routes: [], dates: [] };

  const dates = (rows[0].days ?? []).map((d) => d.d);

  const routes = rows.map((r) => {
    const cells: CoverageCell[] = (r.days ?? []).map((d) => ({
      date: d.d,
      state: classifyCell({
        human: d.h,
        auto: d.a,
        roster: r.roster,
        isHoliday: d.x,
        threshold,
      }),
      human: d.h,
      auto: d.a,
    }));
    return {
      routeId: r.route_id,
      routeNumber: r.route_number,
      routeName: r.route_name,
      roster: r.roster,
      cells,
      humanDays: cells.filter((c) => c.human > 0).length,
      serviceDays: cells.filter((c) => c.state !== 'holiday').length,
    };
  });

  return { routes, dates };
}

/**
 * The headline failures, for the strip above the grid.
 *
 * `neverMarkedLearners` is the number that makes the gap concrete: "2 routes
 * never marked" is a statistic, "131 learners have no attendance record at all"
 * is the problem.
 */
export function summarizeCoverage(routes: CoverageRouteRow[]): CoverageSummary {
  const neverMarkedRoutes = routes.filter((r) => r.humanDays === 0 && r.serviceDays > 0);
  let unmarkedRouteDays = 0;
  let autoOnlyRouteDays = 0;
  for (const r of routes) {
    for (const c of r.cells) {
      if (c.state === 'not_marked') unmarkedRouteDays += 1;
      else if (c.state === 'auto_only') autoOnlyRouteDays += 1;
    }
  }
  return {
    neverMarkedRoutes,
    neverMarkedLearners: neverMarkedRoutes.reduce((n, r) => n + r.roster, 0),
    unmarkedRouteDays,
    autoOnlyRouteDays,
  };
}
