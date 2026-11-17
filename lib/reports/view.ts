/**
 * Pure helpers for the Reports screen: the filter state, the query string it
 * becomes, and the totals shown in the tiles. Kept out of the page so the
 * arithmetic and the URL are tested without rendering anything.
 */
import { MAX_RANGE_DAYS, daysBetween } from './params';
import type { RouteSummaryRow } from './types';

export type ReportTab = 'buses' | 'institutions' | 'departments' | 'learners';

export interface ReportFilters {
  from: string;
  to: string;
  direction: 'onward' | 'return';
  /** One bus, or null for every bus. */
  routeId: string | null;
  booked: 'yes' | 'no' | null;
  attendance: 'present' | 'absent' | 'unmarked' | null;
  fee: 'paid' | 'unpaid' | 'none' | null;
}

/** Today in IST: the date attendance and bookings are filed under. */
export function istDate(nowMs: number = Date.now()): string {
  return new Date(nowMs + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export function shiftDays(date: string, by: number): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + by);
  return t.toISOString().slice(0, 10);
}

/** The screen opens on the last seven days, today included. */
export function defaultFilters(today: string): ReportFilters {
  return {
    from: shiftDays(today, -6), to: today, direction: 'onward',
    routeId: null, booked: null, attendance: null, fee: null,
  };
}

/** Why a range cannot be asked for, or null when it can. Mirrors the API's own checks. */
export function rangeProblem(from: string, to: string): string | null {
  if (!from || !to) return 'Choose both dates.';
  if (to < from) return 'The end date is before the start date.';
  const span = daysBetween(from, to);
  if (span > MAX_RANGE_DAYS) return `Choose ${MAX_RANGE_DAYS} days or fewer (this is ${span}).`;
  return null;
}

const ENDPOINT: Record<ReportTab, string> = {
  buses: '/api/admin/reports/routes',
  institutions: '/api/admin/reports/institutions',
  departments: '/api/admin/reports/institutions',
  learners: '/api/admin/reports/learners',
};

/**
 * The API address for one tab. The booked / attendance / fee filters only
 * exist on the learner list, so they are left off the summaries rather than
 * sent and ignored.
 */
export function reportUrl(
  tab: ReportTab,
  f: ReportFilters,
  extra: { limit?: number; offset?: number; format?: 'xlsx'; allBuses?: boolean } = {},
): string {
  const q = new URLSearchParams({ from: f.from, to: f.to, direction: f.direction });
  if (f.routeId && !extra.allBuses) q.set('route_id', f.routeId);
  if (tab === 'institutions' || tab === 'departments') {
    q.set('group', tab === 'departments' ? 'department' : 'institution');
  }
  if (tab === 'learners') {
    if (f.booked) q.set('booked', f.booked);
    if (f.attendance) q.set('attendance', f.attendance);
    if (f.fee) q.set('fee', f.fee);
    if (extra.limit !== undefined) q.set('limit', String(extra.limit));
    if (extra.offset !== undefined) q.set('offset', String(extra.offset));
  }
  if (extra.format) q.set('format', extra.format);
  return `${ENDPOINT[tab]}?${q}`;
}

export interface ReportTotals {
  buses: number;
  learners: number;
  booked: number;
  boarded: number;
  noShow: number;
  withoutBooking: number;
  /** Booked AND boarded over booked. Null when nothing was booked. */
  attendancePct: number | null;
  feesUnpaid: number;
  amountOwed: number;
}

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === 'string' ? Number(v) : v ?? 0;
  return Number.isFinite(n) ? (n as number) : 0;
};

/** Totals across the buses shown. The percentage is recomputed, never averaged. */
export function totalsOf(rows: RouteSummaryRow[]): ReportTotals {
  const t: ReportTotals = {
    buses: rows.length, learners: 0, booked: 0, boarded: 0, noShow: 0, withoutBooking: 0,
    attendancePct: null, feesUnpaid: 0, amountOwed: 0,
  };
  for (const r of rows) {
    t.learners += num(r.learners);
    t.booked += num(r.booked);
    t.boarded += num(r.boarded);
    t.noShow += num(r.no_show);
    t.withoutBooking += num(r.without_booking);
    t.feesUnpaid += num(r.fees_unpaid);
    t.amountOwed += num(r.amount_owed);
  }
  t.attendancePct = t.booked > 0 ? Math.round((t.boarded / t.booked) * 1000) / 10 : null;
  return t;
}

export const rupees = (v: number | string | null | undefined): string =>
  `₹${Math.round(num(v)).toLocaleString('en-IN')}`;

/** Which page of the learner list a row offset is on, and how many there are. */
export function pageInfo(total: number, limit: number, offset: number) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(pages, Math.floor(offset / limit) + 1);
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(total, offset + limit);
  return { page, pages, first, last, hasPrev: offset > 0, hasNext: offset + limit < total };
}
