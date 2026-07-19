import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { isBugReporterConfigured, listBugReports, getBugReport } from '@/lib/bug-reports/client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { dispatchNotification } from '@/lib/notifications/dispatch';
import { buildReplyNotification } from '@/lib/bug-reports/notify';
import { derivePortal, type BugReportRow, type BugReportDetail } from '@/lib/bug-reports/shared';
import type { BugReport, GetBugReportDetailsResponse } from '@boobalan_jkkn/bug-reporter-sdk';

/**
 * Admin cross-portal Bug Reports console. Read + reply only — proxies the JKKN
 * Bug Reporter platform's public API (which has no status/assign endpoint), so
 * there is intentionally no PATCH here.
 *   GET        -> list all reports (across admin/student/driver/boarding)
 *   GET ?id=X  -> one report + message thread
 *   POST {id, message} -> post an admin reply to the reporter
 */

// Gate on the existing system-admin permission (avoids a permission-seeding
// migration). Super admins bypass. Can be split into dedicated tms.bugs.* keys
// later if finer-grained access is wanted.
const PERM = TMS_PERMISSIONS.SETTINGS_MANAGE;

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// The platform's message shape (EnhancedBugReportMessage) isn't pinned down, so
// read it defensively.
interface RawMessage {
  id: string;
  message: string;
  created_at: string;
  user_id?: string | null;
  sender_name?: string | null;
  user?: Array<{ full_name?: string | null; email?: string | null }>;
}

// The deployed public Bug Reporter API nests the user-entered title and the
// reporter's name/email inside `metadata` — NOT at the top level the SDK's
// BugReport type advertises. Read them from there defensively, falling back to
// any top-level values (in case the API shape changes) and finally to the
// description / a generic label so a row is never blank.
interface BugReportMeta {
  title?: string | null;
  reporter_name?: string | null;
  reporter_email?: string | null;
}
function readMeta(b: BugReport): BugReportMeta {
  return (b as unknown as { metadata?: BugReportMeta | null }).metadata ?? {};
}
function firstLine(s?: string | null, max = 80): string {
  const line = (s ?? '').split('\n')[0].trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
function pickTitle(b: BugReport, meta: BugReportMeta): string {
  return (meta.title || b.title || firstLine(b.description) || 'Untitled report').trim();
}
function pickReporter(b: BugReport, meta: BugReportMeta): { name: string; email: string | null } {
  const email = meta.reporter_email || b.reporter_email || null;
  return { name: meta.reporter_name || b.reporter_name || email || 'Anonymous', email };
}
// The platform's lifecycle stamps fresh reports `new` (and `reopened` when
// re-opened); our UI vocabulary is open|in_progress|resolved|closed. Fold those
// active states into `open` so the "Open" stat, the status filter and the badge
// all count and label them correctly instead of falling through to a grey
// "unknown".
function normalizeStatus(status?: string | null): string {
  const s = (status ?? '').toLowerCase();
  if (s === 'new' || s === 'reopened') return 'open';
  return s;
}

function toRow(b: BugReport): BugReportRow {
  const meta = readMeta(b);
  const reporter = pickReporter(b, meta);
  return {
    id: b.id,
    title: pickTitle(b, meta),
    category: b.category,
    priority: b.priority,
    status: normalizeStatus(b.status),
    portal: derivePortal(b.page_url),
    pageUrl: b.page_url,
    reporterName: reporter.name,
    reporterEmail: reporter.email,
    createdAt: b.created_at,
  };
}

function toDetail(res: GetBugReportDetailsResponse): BugReportDetail {
  const b = res.bug_report;
  const meta = readMeta(b);
  const reporter = pickReporter(b, meta);
  const rawMsgs = (res.messages ?? []) as unknown as RawMessage[];
  return {
    id: b.id,
    title: pickTitle(b, meta),
    description: b.description,
    category: b.category,
    priority: b.priority,
    status: normalizeStatus(b.status),
    portal: derivePortal(b.page_url),
    pageUrl: b.page_url,
    screenshotUrl: b.screenshot_url ?? null,
    consoleLogs: b.console_logs ?? null,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
    reporterName: reporter.name,
    reporterEmail: reporter.email,
    messages: rawMsgs.map((m) => ({
      id: m.id,
      message: m.message,
      createdAt: m.created_at,
      author:
        m.sender_name ||
        m.user?.[0]?.full_name ||
        m.user?.[0]?.email ||
        (m.user_id ? 'User' : 'Support'),
    })),
  };
}

async function handleGet(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, PERM))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sp = new URL(request.url).searchParams;
  const id = sp.get('id');

  if (!isBugReporterConfigured()) {
    // Empty-but-OK for the list so the page can render a setup notice; explicit
    // 503 for a detail request (nothing to show).
    return id
      ? NextResponse.json({ error: 'Bug Reporter is not configured' }, { status: 503 })
      : NextResponse.json({ success: true, data: [], configured: false });
  }

  try {
    if (id) {
      const res = await getBugReport(id);
      return NextResponse.json({ success: true, data: toDetail(res) });
    }
    const res = await listBugReports({
      limit: 100,
      status: sp.get('status') || undefined,
      category: sp.get('category') || undefined,
      search: sp.get('search') || undefined,
    });
    const rows = (res.bug_reports ?? []).map(toRow);
    return NextResponse.json({ success: true, data: rows, configured: true, count: rows.length });
  } catch (e) {
    console.error('bug-reports GET error:', e);
    return NextResponse.json({ error: (e as Error).message || 'Failed to load bug reports' }, { status: 502 });
  }
}

async function handlePost(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, PERM))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { id?: string; message?: string };
  const id = String(body.id ?? '').trim();
  const message = String(body.message ?? '').trim();
  if (!id || !message) {
    return NextResponse.json({ error: 'id and message are required' }, { status: 400 });
  }
  if (!isBugReporterConfigured()) {
    return NextResponse.json({ error: 'Bug Reporter is not configured' }, { status: 503 });
  }

  // Resolve the recipient from the AUTHORITATIVE platform record (read works),
  // never from the client — so a reply can't be aimed at another student. The
  // platform's own /messages write is unusable here: it requires a NOT NULL
  // sender_user_id that our API-key auth has no user for. We route the reply to
  // the reporter's TMS notification inbox instead.
  let reporterEmail: string | null;
  let displayId: string | null;
  try {
    const b = (await getBugReport(id)).bug_report;
    reporterEmail = pickReporter(b, readMeta(b)).email?.toLowerCase() ?? null;
    displayId = (b as unknown as { display_id?: string | null }).display_id ?? null;
  } catch (e) {
    console.error('bug-reports reply: load report failed:', e);
    return NextResponse.json(
      { error: "Couldn't load the report to find the reporter." },
      { status: 502 },
    );
  }

  if (!reporterEmail) {
    return NextResponse.json({ success: true, delivered: false, reason: 'no_email' });
  }

  const { title, body: notifBody } = buildReplyNotification(displayId, message);
  try {
    const svc = createServiceRoleClient();
    const { recipientCount } = await dispatchNotification(svc, {
      title,
      body: notifBody,
      category: 'general',
      url: null,
      createdBy: auth.userId,
      targeting: { type: 'emails', emails: [reporterEmail] },
    });
    return recipientCount > 0
      ? NextResponse.json({ success: true, delivered: true, recipientCount })
      : NextResponse.json({ success: true, delivered: false, reason: 'no_profile' });
  } catch (e) {
    console.error('bug-reports reply: notify failed:', e);
    return NextResponse.json(
      { error: (e as Error).message || 'Failed to notify the reporter' },
      { status: 502 },
    );
  }
}

export const GET = withAuth(handleGet);
export const POST = withAuth(handlePost);
