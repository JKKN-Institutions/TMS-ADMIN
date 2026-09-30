/**
 * In-charge bill auto-cancel — the RULE, with no I/O.
 *
 * A bus in-charge who owes a staff transport bill has it cancelled once one
 * calendar month is "perfect": their bus's morning trip was scanned on every
 * service day they were on duty, AND they personally marked on at least
 * minPersonalPct of those days. Spec:
 * docs/superpowers/specs/2026-09-30-incharge-bill-auto-cancel-design.md
 *
 * Kept pure so every edge (holidays nobody entered, excused outages, a start
 * mid-month, a person known by three emails) is pinned by a unit test. The
 * repo (incharge-bill-review-repo.ts) only loads inputs and applies verdicts.
 */

export type ReviewMode = 'off' | 'preview' | 'auto';

export interface ReviewConfig {
  mode: ReviewMode;
  minPersonalPct: number;
  minRequiredDays: number;
}

/** Its OWN admin_settings row — never the `scheduling` blob, whose save drops unknown keys. */
export const REVIEW_SETTING_TYPE = 'incharge_bill_cancel';

export const DEFAULT_REVIEW_CONFIG: ReviewConfig = { mode: 'off', minPersonalPct: 75, minRequiredDays: 10 };

const MODES: readonly ReviewMode[] = ['off', 'preview', 'auto'];

function intIn(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
}

/** Fails OFF: an unreadable switch must never start cancelling bills. */
export function parseReviewConfig(raw: unknown): ReviewConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_REVIEW_CONFIG };
  const r = raw as Record<string, unknown>;
  return {
    mode: MODES.includes(r.mode as ReviewMode) ? (r.mode as ReviewMode) : 'off',
    minPersonalPct: intIn(r.min_personal_pct, 1, 100, DEFAULT_REVIEW_CONFIG.minPersonalPct),
    minRequiredDays: intIn(r.min_required_days, 1, 26, DEFAULT_REVIEW_CONFIG.minRequiredDays),
  };
}

export function toStoredReviewConfig(c: ReviewConfig): Record<string, unknown> {
  return { mode: c.mode, min_personal_pct: c.minPersonalPct, min_required_days: c.minRequiredDays };
}

export function validateReviewConfig(c: { mode: unknown; minPersonalPct: unknown; minRequiredDays: unknown }): string | null {
  if (!MODES.includes(c.mode as ReviewMode)) return 'Mode must be off, preview or auto';
  if (intIn(c.minPersonalPct, 1, 100, -1) === -1) return 'Own-marking share must be a whole number between 1 and 100';
  if (intIn(c.minRequiredDays, 1, 26, -1) === -1) return 'Minimum days must be a whole number between 1 and 26';
  return null;
}

// ── Months (IST calendar months, as 'YYYY-MM') ──────────────────────────────

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonth(s: string): boolean {
  return MONTH_RE.test(s);
}

export function monthBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/** The month before the one containing `todayIst` (YYYY-MM-DD). */
export function previousMonth(todayIst: string): string {
  const [y, m] = todayIst.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * What a run may do. null = skip. A month that has not ended is preview-only:
 * a half month must never cancel anyone's bill.
 */
export function effectiveMode(mode: ReviewMode, forcePreview: boolean, monthComplete: boolean): 'preview' | 'auto' | null {
  if (mode === 'off' && !forcePreview) return null;
  if (mode === 'auto' && !forcePreview && monthComplete) return 'auto';
  return 'preview';
}

// ── Days ────────────────────────────────────────────────────────────────────

export interface ServiceDayInputs {
  from: string;
  to: string;
  /** tms_service_calendar rows; routeId null = every route. */
  calendarOff: Array<{ date: string; routeId: string | null }>;
  /** Admin-excused dates (tms_incharge_excused_day). */
  excused: string[];
  /** Dates with >= 1 human mark anywhere in the fleet. A day nobody marked is not a service day. */
  fleetDays: string[];
}

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`).getTime();
  while (d.getTime() <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function isSunday(date: string): boolean {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
}

export function serviceDaysForRoute(inp: ServiceDayInputs, routeId: string): string[] {
  const fleet = new Set(inp.fleetDays);
  const excused = new Set(inp.excused);
  const off = new Set(inp.calendarOff.filter((c) => c.routeId === null || c.routeId === routeId).map((c) => c.date));
  return datesBetween(inp.from, inp.to).filter((d) => !isSunday(d) && fleet.has(d) && !excused.has(d) && !off.has(d));
}

// ── Verdict ─────────────────────────────────────────────────────────────────

export interface PersonAssignment {
  routeId: string;
  /** IST date the duty started. */
  startDate: string;
}

export interface Verdict {
  outcome: 'passed' | 'failed' | 'not_enough_days';
  requiredDays: number;
  routeDays: number;
  personalDays: number;
  personalPct: number;
  missedRouteDates: string[];
  reason: string;
}

export function evaluatePerson(args: {
  assignments: PersonAssignment[];
  personalDates: ReadonlySet<string>;
  routeDates: ReadonlyMap<string, ReadonlySet<string>>;
  days: ServiceDayInputs;
  config: Pick<ReviewConfig, 'minPersonalPct' | 'minRequiredDays'>;
}): Verdict {
  const required = new Set<string>();
  const missed = new Set<string>();
  for (const a of args.assignments) {
    const marked = args.routeDates.get(a.routeId);
    for (const d of serviceDaysForRoute(args.days, a.routeId)) {
      if (d < a.startDate) continue;
      required.add(d);
      if (!marked?.has(d)) missed.add(d);
    }
  }
  const n = required.size;
  const personal = [...required].filter((d) => args.personalDates.has(d)).length;
  const pct = n === 0 ? 0 : Math.round((personal * 1000) / n) / 10;
  const missedRouteDates = [...missed].sort();
  const base = { requiredDays: n, routeDays: n - missed.size, personalDays: personal, personalPct: pct, missedRouteDates };

  if (n < args.config.minRequiredDays) {
    return { ...base, outcome: 'not_enough_days', reason: `Only ${n} service days on duty this month (needs ${args.config.minRequiredDays}).` };
  }
  const shareOk = personal * 100 >= args.config.minPersonalPct * n;
  if (missed.size === 0 && shareOk) {
    return { ...base, outcome: 'passed', reason: `Bus marked on all ${n} days; own marks on ${personal} of ${n} days (${pct}%).` };
  }
  const parts: string[] = [];
  if (missed.size > 0) parts.push(`Bus not marked on ${missed.size} day(s): ${missedRouteDates.join(', ')}`);
  if (!shareOk) parts.push(`own marks on ${personal} of ${n} days (${pct}%), needs ${args.config.minPersonalPct}%`);
  return { ...base, outcome: 'failed', reason: parts.join('; ') + '.' };
}

// ── Inputs from tms_incharge_review_marks ───────────────────────────────────

export interface ReviewMarks {
  route_days: Array<{ route_id: string; d: string }>;
  person_days: Array<{ profile_id: string; email: string | null; d: string }>;
  fleet_days: string[];
}

export function indexRouteDays(m: ReviewMarks): Map<string, Set<string>> {
  const idx = new Map<string, Set<string>>();
  for (const r of m.route_days) {
    if (!idx.has(r.route_id)) idx.set(r.route_id, new Set());
    idx.get(r.route_id)!.add(r.d);
  }
  return idx;
}

// ── Identity: a person is known by up to three addresses ────────────────────

export function normEmail(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase();
  return s.length ? s : null;
}

export function staffEmails(s: { email: string | null; institution_email: string | null }, profileEmail: string | null): Set<string> {
  const out = new Set<string>();
  for (const e of [s.email, s.institution_email, profileEmail]) {
    const n = normEmail(e);
    if (n) out.add(n);
  }
  return out;
}

export function istDateOf(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** Active assignments for this person that began on or before the month's last day; earliest start per route. */
export function matchAssignments(
  emails: ReadonlySet<string>,
  rows: Array<{ staff_email: string | null; route_id: string; assigned_at: string | null; created_at: string | null }>,
  monthLast: string,
): PersonAssignment[] {
  const byRoute = new Map<string, string>();
  for (const r of rows) {
    const e = normEmail(r.staff_email);
    const stamp = r.assigned_at ?? r.created_at;
    if (!e || !emails.has(e) || !stamp) continue;
    const start = istDateOf(stamp);
    if (start > monthLast) continue;
    const prev = byRoute.get(r.route_id);
    if (!prev || start < prev) byRoute.set(r.route_id, start);
  }
  return [...byRoute.entries()].map(([routeId, startDate]) => ({ routeId, startDate }));
}

export function personalDatesFor(m: ReviewMarks, profileId: string | null, emails: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const p of m.person_days) {
    const e = normEmail(p.email);
    if ((profileId && p.profile_id === profileId) || (e && emails.has(e))) out.add(p.d);
  }
  return out;
}

/** Postgres numeric arrives as a string — Number() it, or the sum concatenates. */
export function sumAmounts(rows: Array<{ amount: unknown }>): number {
  return rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
}
