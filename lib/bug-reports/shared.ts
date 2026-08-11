// Pure, isomorphic helpers + types for the Bug Reports admin module. No server
// or client-only code here, so both the API route (server) and the columns/page
// (client) can import from it.

export type BugPortal = 'admin' | 'student' | 'driver' | 'boarding' | 'other';

// One row in the admin bug list (normalized from the platform's BugReport).
export interface BugReportRow {
  id: string;
  title: string;
  category: string; // bug | feature_request | ui_design | performance | security | other
  priority: string; // low | medium | high | critical
  status: string; // open | in_progress | resolved | closed
  portal: BugPortal;
  pageUrl: string;
  reporterName: string;
  reporterEmail: string | null;
  createdAt: string;
}

export interface BugMessage {
  id: string;
  message: string;
  createdAt: string;
  author: string;
}

// Full detail shown in the inline panel.
export interface BugReportDetail {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  portal: BugPortal;
  pageUrl: string;
  screenshotUrl: string | null;
  consoleLogs: unknown;
  createdAt: string;
  updatedAt: string;
  reporterName: string;
  reporterEmail: string | null;
  messages: BugMessage[];
}

// Which of the four portals a report came from, derived from its captured
// page_url. Admin pages live at root paths (no /admin prefix, thanks to the
// (admin) route group), so anything that isn't student/driver/boarding/auth is
// treated as admin.
export function derivePortal(pageUrl: string | null | undefined): BugPortal {
  if (!pageUrl) return 'other';
  try {
    const seg = new URL(pageUrl).pathname.split('/').filter(Boolean)[0] ?? '';
    if (seg === 'student') return 'student';
    if (seg === 'driver') return 'driver';
    if (seg === 'boarding') return 'boarding';
    if (!seg || seg === 'auth') return 'other';
    return 'admin';
  } catch {
    return 'other';
  }
}

export const PORTAL_LABEL: Record<BugPortal, string> = {
  admin: 'Admin',
  student: 'Student',
  driver: 'Driver',
  boarding: 'Boarding',
  other: 'Other',
};

export const CATEGORY_LABEL: Record<string, string> = {
  bug: 'Bug',
  feature_request: 'Feature',
  ui_design: 'UI / Design',
  performance: 'Performance',
  security: 'Security',
  other: 'Other',
};

export const categoryLabel = (c?: string | null) => CATEGORY_LABEL[c ?? ''] ?? c ?? '—';

// ─────────────────────────────────────────────────────────────────────────────
// Platform-shape normalisation.
//
// These live here (not in the admin route) because TWO callers must agree on
// them: the admin console reading a report, and the relay recording a freshly
// submitted one into tms_bug_report_index. If they drifted, an indexed row's
// title/status would disagree with the same report's detail view.
//
// The deployed public API nests the user-entered title and the reporter's
// name/email inside `metadata` — NOT at the top level the SDK's BugReport type
// advertises. Read from there first, fall back to any top-level values (in case
// the API shape changes again), and finally to the description / a generic label
// so a row is never blank.
// ─────────────────────────────────────────────────────────────────────────────

/** The subset of the platform's BugReport these helpers actually touch. */
export interface RawBugReport {
  title?: string | null;
  description?: string | null;
  status?: string | null;
  reporter_name?: string | null;
  reporter_email?: string | null;
  metadata?: {
    title?: string | null;
    reporter_name?: string | null;
    reporter_email?: string | null;
  } | null;
}

export function readMeta(b: RawBugReport): NonNullable<RawBugReport['metadata']> {
  return b.metadata ?? {};
}

export function firstLine(s?: string | null, max = 80): string {
  const line = (s ?? '').split('\n')[0].trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export function pickTitle(b: RawBugReport, meta = readMeta(b)): string {
  return (meta.title || b.title || firstLine(b.description) || 'Untitled report').trim();
}

export function pickReporter(
  b: RawBugReport,
  meta = readMeta(b)
): { name: string; email: string | null } {
  // Lowercased because both identity authorities (profiles.email and the
  // notification targeting) compare lowercase, and the platform now matches
  // reporter_email literally.
  const raw = meta.reporter_email || b.reporter_email || null;
  const email = raw ? raw.trim().toLowerCase() || null : null;
  return { name: meta.reporter_name || b.reporter_name || email || 'Anonymous', email };
}

/**
 * The platform's lifecycle stamps fresh reports `new` (and `reopened` when
 * re-opened); our UI vocabulary is open|in_progress|resolved|closed. Fold those
 * active states into `open` so the "Open" stat, the status filter and the badge
 * all count and label them correctly instead of falling through to a grey
 * "unknown".
 */
export function normalizeStatus(status?: string | null): string {
  const s = (status ?? '').toLowerCase();
  if (s === 'new' || s === 'reopened') return 'open';
  return s;
}
