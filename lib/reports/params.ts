/**
 * Report query parameters: parse once, validate once, pure.
 *
 * Every Reports endpoint takes the same shape, and every value reaches SQL as
 * a typed parameter of a report function -- never as string interpolation.
 * Unknown filter values are REFUSED rather than ignored: a silent "unpaid"
 * typo that returns every learner is a report someone will act on.
 */

export const REPORT_DIRECTIONS = ['onward', 'return'] as const;
export const BOOKED_VALUES = ['yes', 'no'] as const;
export const ATTENDANCE_VALUES = ['present', 'absent', 'unmarked'] as const;
export const FEE_VALUES = ['paid', 'unpaid', 'none'] as const;
export const GROUP_VALUES = ['institution', 'department'] as const;

export type ReportDirection = (typeof REPORT_DIRECTIONS)[number];

export interface ReportParams {
  from: string;
  to: string;
  direction: ReportDirection;
  routeIds: string[] | null;
  institutionIds: string[] | null;
  departmentIds: string[] | null;
  booked: 'yes' | 'no' | null;
  attendance: 'present' | 'absent' | 'unmarked' | null;
  fee: 'paid' | 'unpaid' | 'none' | null;
  group: 'institution' | 'department';
  limit: number;
  offset: number;
  format: 'json' | 'xlsx';
}

export type ParseResult = { ok: true; params: ReportParams } | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rows one page may hold, and the ceiling an export may reach. */
export const MAX_PAGE = 500;
export const MAX_EXPORT_ROWS = 50_000;
/** Longest range a report may span, in days. A year of every learner is ~470k rows. */
export const MAX_RANGE_DAYS = 186;

function idList(raw: string | null, label: string): { ok: true; ids: string[] | null } | { ok: false; error: string } {
  if (!raw) return { ok: true, ids: null };
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return { ok: true, ids: null };
  const bad = ids.find((id) => !UUID_RE.test(id));
  if (bad) return { ok: false, error: `${label} must be a list of ids` };
  // Deduplicated: a repeated id costs SQL work and changes nothing.
  return { ok: true, ids: [...new Set(ids)] };
}

function oneOf<T extends string>(
  raw: string | null, allowed: readonly T[], label: string,
): { ok: true; value: T | null } | { ok: false; error: string } {
  if (!raw) return { ok: true, value: null };
  if ((allowed as readonly string[]).includes(raw)) return { ok: true, value: raw as T };
  return { ok: false, error: `${label} must be one of: ${allowed.join(', ')}` };
}

function intOr(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** Days between two ISO dates, inclusive. Both are already validated. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}

export function parseReportParams(search: URLSearchParams, today: string): ParseResult {
  const from = search.get('from') ?? today;
  const to = search.get('to') ?? from;
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return { ok: false, error: 'from and to must be dates (YYYY-MM-DD)' };
  }
  if (Number.isNaN(Date.parse(`${from}T00:00:00Z`)) || Number.isNaN(Date.parse(`${to}T00:00:00Z`))) {
    return { ok: false, error: 'from and to must be real dates' };
  }
  if (to < from) return { ok: false, error: 'to must not be before from' };
  const span = daysBetween(from, to);
  if (span > MAX_RANGE_DAYS) {
    return { ok: false, error: `Choose a range of ${MAX_RANGE_DAYS} days or fewer (asked for ${span})` };
  }

  const routes = idList(search.get('route_id'), 'route_id');
  if (!routes.ok) return routes;
  const institutions = idList(search.get('institution_id'), 'institution_id');
  if (!institutions.ok) return institutions;
  const departments = idList(search.get('department_id'), 'department_id');
  if (!departments.ok) return departments;

  const direction = oneOf(search.get('direction'), REPORT_DIRECTIONS, 'direction');
  if (!direction.ok) return direction;
  const booked = oneOf(search.get('booked'), BOOKED_VALUES, 'booked');
  if (!booked.ok) return booked;
  const attendance = oneOf(search.get('attendance'), ATTENDANCE_VALUES, 'attendance');
  if (!attendance.ok) return attendance;
  const fee = oneOf(search.get('fee'), FEE_VALUES, 'fee');
  if (!fee.ok) return fee;
  const group = oneOf(search.get('group'), GROUP_VALUES, 'group');
  if (!group.ok) return group;
  const format = oneOf(search.get('format'), ['json', 'xlsx'] as const, 'format');
  if (!format.ok) return format;

  return {
    ok: true,
    params: {
      from,
      to,
      direction: direction.value ?? 'onward',
      routeIds: routes.ids,
      institutionIds: institutions.ids,
      departmentIds: departments.ids,
      booked: booked.value,
      attendance: attendance.value,
      fee: fee.value,
      group: group.value ?? 'institution',
      limit: intOr(search.get('limit'), 100, 1, MAX_PAGE),
      offset: intOr(search.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER),
      format: format.value ?? 'json',
    },
  };
}
