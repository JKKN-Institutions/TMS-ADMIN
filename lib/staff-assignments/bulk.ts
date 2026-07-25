// lib/staff-assignments/bulk.ts
// Pure helpers for bulk in-charge assignment. No Supabase import — every
// function here is a plain data transform so it can be unit-tested without a
// client, and so the identity rule below lives in exactly one place.

/** Every terminal state a single staffer can reach in a bulk run. */
export type BulkOutcome =
  | 'assigned'
  | 'skipped_already_assigned'
  | 'skipped_not_eligible'
  | 'skipped_no_email'
  | 'skipped_no_route'
  | 'skipped_route_inactive'
  | 'error';

export interface BulkResult {
  staffId: string;
  name: string;
  email: string | null;
  routeId: string | null;
  routeLabel: string | null;
  outcome: BulkOutcome;
  message?: string;
}

export interface BulkSummary {
  assigned: number;
  skipped: number;
  errors: number;
}

/** A picker row: one assignable staffer plus the route they will land on. */
export interface Candidate {
  staffId: string;
  name: string;
  email: string;
  staffCode: string | null;
  routeId: string;
  routeNumber: string;
  routeName: string;
}

/** Raw shape the candidate predicate judges, before it becomes a Candidate. */
export interface CandidateInput {
  staffId: string;
  name: string;
  staffEmail: string | null;
  profileEmail: string | null;
  routeId: string | null;
  routeActive: boolean;
}

export interface RouteGroup {
  routeId: string;
  routeNumber: string;
  routeName: string;
  staff: Candidate[];
}

export function normalizeEmail(v: string | null | undefined): string | null {
  const s = (v ?? '').trim().toLowerCase();
  return s.length ? s : null;
}

/**
 * The address an assignment is WRITTEN under.
 *
 * Must prefer profiles.email: tms_staff_boarding_eligibility resolves identity
 * as lower(profiles.email) and counts existing assignments against it. Writing
 * staff.email for a staffer whose two addresses diverge leaves that guard
 * reading zero, lets them self-assign afterwards, and slips past the
 * (staff_email, route_id) unique index — two active rows for one human.
 */
export function resolveAssignmentEmail(
  staffEmail: string | null | undefined,
  profileEmail: string | null | undefined
): string | null {
  return normalizeEmail(profileEmail) ?? normalizeEmail(staffEmail);
}

/**
 * Whether either of a staffer's two addresses is already an active
 * assignment. `assignedEmails` must hold EVERY active assignment address,
 * lowercased. Both addresses are tested: 28 of 94 live assignments are
 * recorded under the profile address only, so testing staff.email alone
 * would miss them — offering an already-assigned person as a fresh
 * candidate, or letting a POST insert a second active row for one human.
 * The single source of this rule; isBulkCandidate delegates to it.
 */
export function isAlreadyAssigned(
  staffEmail: string | null | undefined,
  profileEmail: string | null | undefined,
  assignedEmails: Set<string>
): boolean {
  const staff = normalizeEmail(staffEmail);
  const profile = normalizeEmail(profileEmail);
  return (!!staff && assignedEmails.has(staff)) || (!!profile && assignedEmails.has(profile));
}

/**
 * Whether a staffer may be offered in the picker.
 */
export function isBulkCandidate(c: CandidateInput, assignedEmails: Set<string>): boolean {
  const staff = normalizeEmail(c.staffEmail);
  const profile = normalizeEmail(c.profileEmail);
  if (!staff && !profile) return false;
  if (isAlreadyAssigned(c.staffEmail, c.profileEmail, assignedEmails)) return false;
  if (!c.routeId || !c.routeActive) return false;
  return true;
}

/** Groups candidates under their master route: biggest group first, then route number. */
export function groupCandidatesByRoute(candidates: Candidate[]): RouteGroup[] {
  const byRoute = new Map<string, RouteGroup>();
  for (const c of candidates) {
    let g = byRoute.get(c.routeId);
    if (!g) {
      g = { routeId: c.routeId, routeNumber: c.routeNumber, routeName: c.routeName, staff: [] };
      byRoute.set(c.routeId, g);
    }
    g.staff.push(c);
  }
  return Array.from(byRoute.values()).sort(
    (a, b) => b.staff.length - a.staff.length || a.routeNumber.localeCompare(b.routeNumber)
  );
}

export function summarizeBulkResults(results: BulkResult[]): BulkSummary {
  let assigned = 0;
  let skipped = 0;
  let errors = 0;
  for (const r of results) {
    if (r.outcome === 'assigned') assigned++;
    else if (r.outcome === 'error') errors++;
    else skipped++;
  }
  return { assigned, skipped, errors };
}
