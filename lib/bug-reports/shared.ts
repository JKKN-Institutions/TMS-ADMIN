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
