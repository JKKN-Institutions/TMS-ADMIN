// lib/booking/analytics-filters.ts
/**
 * Filter predicates and facet extraction. Pure — takes plain arrays and Maps.
 *
 * Every non-date filter runs here rather than in SQL: tms_booking carries no
 * academic columns, and pushing an academic filter into SQL would mean `.in()`-ing
 * hundreds of learner UUIDs, which the PostgREST gateway rejects with HTTP 400
 * above ~500 ids. Facets are also computed before filtering (see buildFacets),
 * which requires the unfiltered set to be in memory anyway.
 */
import { bookedByLabel } from './analytics-dims';
import type {
  AnalyticsFilters, AttendanceRow, BookingRow, Facets, LabelMap, Labels, LearnerDim, StopFacetOption,
} from './analytics-types';

/** An empty filter list means "no constraint"; otherwise the value must be in it. */
const inList = (list: string[], value: string | null | undefined): boolean =>
  list.length === 0 || (!!value && list.includes(value));

/**
 * Academic predicate. A learner we could not resolve (no learners_profiles row)
 * passes when no academic filter is active, and fails as soon as one is —
 * including them would silently inflate a filtered cohort.
 */
export function matchesLearner(l: LearnerDim | undefined, f: AnalyticsFilters): boolean {
  const academicActive =
    f.institutionIds.length > 0 || f.departmentIds.length > 0 || f.programIds.length > 0;
  if (!l) return !academicActive;
  return (
    inList(f.institutionIds, l.institutionId) &&
    inList(f.departmentIds, l.departmentId) &&
    inList(f.programIds, l.programId)
  );
}

export function filterBookings(
  rows: BookingRow[],
  learners: Map<string, LearnerDim>,
  f: AnalyticsFilters
): BookingRow[] {
  return rows.filter((b) => {
    if (!inList(f.routeIds, b.route_id)) return false;
    if (!inList(f.stopIds, b.stop_id)) return false;
    const l = learners.get(b.learner_id);
    if (!matchesLearner(l, f)) return false;
    if (f.bookedBy && bookedByLabel(b.booked_by, l?.profileId) !== f.bookedBy) return false;
    return true;
  });
}

export function filterAttendance(
  rows: AttendanceRow[],
  learners: Map<string, LearnerDim>,
  f: AnalyticsFilters
): AttendanceRow[] {
  return rows.filter((a) => {
    if (!inList(f.routeIds, a.route_id)) return false;
    if (!inList(f.stopIds, a.stop_id)) return false;
    if (!matchesLearner(learners.get(a.learner_id), f)) return false;
    if (f.direction && a.direction !== f.direction) return false;
    if (f.attStatus && a.status !== f.attStatus) return false;
    if (f.method && a.method !== f.method) return false;
    return true;
  });
}

const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);

/**
 * Facet options for the filter dropdowns, drawn from the DATE-RANGE-scoped data
 * BEFORE any other filter runs — so selecting one department does not erase the
 * remaining departments from the dropdown.
 *
 * Built here rather than from /api/admin/masters, which is gated on FEES_VIEW and
 * would 403 for a bookings-only user.
 */
export function buildFacets(
  bookings: BookingRow[],
  attendance: AttendanceRow[],
  learners: Map<string, LearnerDim>,
  labels: Labels
): Facets {
  const routeIds = new Set<string>();
  const stopRoute = new Map<string, string | null>();
  const institutionIds = new Set<string>();
  const departmentIds = new Set<string>();
  const programIds = new Set<string>();

  const addLearner = (learnerId: string) => {
    const l = learners.get(learnerId);
    if (l?.institutionId) institutionIds.add(l.institutionId);
    if (l?.departmentId) departmentIds.add(l.departmentId);
    if (l?.programId) programIds.add(l.programId);
  };

  for (const b of bookings) {
    routeIds.add(b.route_id);
    if (b.stop_id) stopRoute.set(b.stop_id, b.route_id);
    addLearner(b.learner_id);
  }
  for (const a of attendance) {
    if (a.route_id) routeIds.add(a.route_id);
    if (a.stop_id && !stopRoute.has(a.stop_id)) stopRoute.set(a.stop_id, a.route_id);
    addLearner(a.learner_id);
  }

  const opts = (ids: Set<string>, m: LabelMap) =>
    [...ids].map((id) => ({ id, label: m.get(id) ?? id })).sort(byLabel);

  const stops: StopFacetOption[] = [...stopRoute.entries()]
    .map(([id, routeId]) => ({ id, label: labels.stops.get(id) ?? id, routeId }))
    .sort(byLabel);

  return {
    routes: opts(routeIds, labels.routes),
    stops,
    institutions: opts(institutionIds, labels.institutions),
    departments: opts(departmentIds, labels.departments),
    programs: opts(programIds, labels.programs),
  };
}
