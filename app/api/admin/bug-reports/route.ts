import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import {
  isBugReporterConfigured,
  listBugReports,
  getBugReport,
  replyToBugReport,
} from '@/lib/bug-reports/client';
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

function toRow(b: BugReport): BugReportRow {
  return {
    id: b.id,
    title: b.title,
    category: b.category,
    priority: b.priority,
    status: b.status,
    portal: derivePortal(b.page_url),
    pageUrl: b.page_url,
    reporterName: b.reporter_name || b.reporter_email || 'Anonymous',
    reporterEmail: b.reporter_email ?? null,
    createdAt: b.created_at,
  };
}

function toDetail(res: GetBugReportDetailsResponse): BugReportDetail {
  const b = res.bug_report;
  const rawMsgs = (res.messages ?? []) as unknown as RawMessage[];
  return {
    id: b.id,
    title: b.title,
    description: b.description,
    category: b.category,
    priority: b.priority,
    status: b.status,
    portal: derivePortal(b.page_url),
    pageUrl: b.page_url,
    screenshotUrl: b.screenshot_url ?? null,
    consoleLogs: b.console_logs ?? null,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
    reporterName: b.reporter_name || b.reporter_email || 'Anonymous',
    reporterEmail: b.reporter_email ?? null,
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
  try {
    await replyToBugReport(id, message.slice(0, 4000));
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('bug-reports reply error:', e);
    return NextResponse.json({ error: (e as Error).message || 'Failed to send reply' }, { status: 502 });
  }
}

export const GET = withAuth(handleGet);
export const POST = withAuth(handlePost);
