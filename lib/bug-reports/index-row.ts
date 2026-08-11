// Pure extraction of a tms_bug_report_index row from the Bug Reporter platform's
// submit response. No I/O — unit-testable in node.
//
// WHY THIS EXISTS
// The platform's public API no longer offers an application-wide read: its only
// list endpoint (/bug-reports/me) now REQUIRES a reporter_email and returns just
// that one person's reports, and there is no way to enumerate reporters. So the
// admin console can no longer ask "show me everything".
//
// Our same-origin relay (app/api/v1/public/[...path]/route.ts) is the one place
// EVERY submission from all four portals passes through, so it can record each
// new report as it is created. The console then lists from our own index and
// fetches each detail from the platform using the reporter_email we stored.
//
// Consequence to be honest about: this can only ever contain reports submitted
// AFTER it was deployed. Backfilling history is impossible — enumerating past
// reports is precisely the capability the platform removed.

import { derivePortal, normalizeStatus, pickReporter, pickTitle, readMeta, type BugPortal, type RawBugReport } from './shared';

export interface BugIndexRow {
  id: string;
  display_id: string | null;
  title: string;
  category: string | null;
  priority: string | null;
  status: string;
  portal: BugPortal;
  page_url: string | null;
  reporter_email: string;
  reporter_name: string | null;
  created_at: string | null;
}

/** The platform wraps payloads as {success, data:{bug_report}} — read it defensively. */
function unwrap(body: unknown): (RawBugReport & Record<string, unknown>) | null {
  if (!body || typeof body !== 'object') return null;
  const env = body as { success?: boolean; data?: unknown };
  if (env.success === false) return null;
  const data = env.data;
  if (!data || typeof data !== 'object') return null;
  const nested = (data as { bug_report?: unknown }).bug_report;
  const report = nested && typeof nested === 'object' ? nested : data;
  return report as RawBugReport & Record<string, unknown>;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

/**
 * Build the index row for ONE platform report.
 *
 * @param report   a single report object from the platform
 * @param fallback identity to fall back on when the platform omits the reporter
 *                 (the authenticated submitter, or the address we queried by)
 * @returns the row to store, or null if it can't be indexed usefully
 */
export function rowFromReport(
  report: (RawBugReport & Record<string, unknown>) | null | undefined,
  fallback: { email: string | null | undefined; name: string | null | undefined }
): BugIndexRow | null {
  if (!report || typeof report !== 'object') return null;

  const id = str(report.id);
  if (!id) return null;

  const meta = readMeta(report);
  const reporter = pickReporter(report, meta);

  // reporter_email is this index's join key back to the platform's detail
  // endpoint (which now requires it). A row we could never re-fetch is not worth
  // storing, so require one from either the platform or the signed-in user.
  const email = reporter.email ?? ((fallback.email ?? '').trim().toLowerCase() || null);
  if (!email) return null;

  const page_url = str(report.page_url);

  return {
    id,
    display_id: str(report.display_id),
    title: pickTitle(report, meta),
    category: str(report.category),
    priority: str(report.priority),
    status: normalizeStatus(report.status) || 'open',
    portal: derivePortal(page_url),
    page_url,
    reporter_email: email,
    reporter_name: reporter.email === email ? reporter.name : str(fallback.name) ?? reporter.name,
    created_at: str(report.created_at),
  };
}

/**
 * Build the index row for a freshly SUBMITTED report (relay capture path).
 *
 * @param body     the platform's parsed submit response envelope
 * @param fallback the authenticated submitter (proxy `x-user-email`)
 */
export function buildIndexRow(
  body: unknown,
  fallback: { email: string | null | undefined; name: string | null | undefined }
): BugIndexRow | null {
  return rowFromReport(unwrap(body), fallback);
}

/**
 * Build index rows from a per-reporter LIST response (backfill / sync path).
 *
 * `reporterEmail` is the address the list was queried by, so it is the correct
 * fallback for any record whose metadata omits the reporter. A record we can't
 * use is skipped rather than failing the whole batch — one malformed report
 * must not cost us the other 37.
 */
export function rowsFromListResponse(body: unknown, reporterEmail: string): BugIndexRow[] {
  if (!body || typeof body !== 'object') return [];
  const env = body as { success?: boolean; data?: { bug_reports?: unknown } };
  if (env.success === false) return [];
  const list = env.data?.bug_reports;
  if (!Array.isArray(list)) return [];
  return list
    .map((r) => rowFromReport(r as RawBugReport & Record<string, unknown>, { email: reporterEmail, name: null }))
    .filter((r): r is BugIndexRow => r !== null);
}
