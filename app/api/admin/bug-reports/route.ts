import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { isBugReporterConfigured, getBugReport } from '@/lib/bug-reports/client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { dispatchNotification } from '@/lib/notifications/dispatch';
import { buildReplyNotification } from '@/lib/bug-reports/notify';
import {
  normalizeStatus,
  pickReporter,
  pickTitle,
  readMeta,
  type BugPortal,
  type BugReportRow,
  type BugReportDetail,
} from '@/lib/bug-reports/shared';
import type { GetBugReportDetailsResponse } from '@boobalan_jkkn/bug-reporter-sdk';

/**
 * Admin cross-portal Bug Reports console. Read + reply only — the JKKN Bug
 * Reporter platform's public API has no status/assign endpoint, so there is
 * intentionally no PATCH here.
 *   GET        -> list all indexed reports (across admin/student/driver/boarding)
 *   GET ?id=X  -> one report + message thread (fetched live from the platform)
 *   POST {id, message} -> post an admin reply to the reporter
 *
 * WHERE THE LIST COMES FROM
 * The platform's public API no longer exposes an application-wide read: its only
 * list endpoint requires a `reporter_email` and returns just that reporter's
 * reports, and nothing enumerates reporters. So the list is served from our own
 * tms_bug_report_index, which the same-origin relay populates as each report is
 * submitted (app/api/v1/public/[...path]/route.ts). The platform remains the
 * system of record for descriptions, screenshots, logs and message threads —
 * we fetch those live, per report, using the reporter_email we stored.
 *
 * Consequence: the list can only contain reports submitted after the index was
 * deployed. Historical reports cannot be backfilled — enumerating them is
 * exactly the capability the platform removed. `indexedFrom` in the GET payload
 * lets the page tell the user how far back the list actually reaches.
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

/** A row as stored in tms_bug_report_index. */
interface IndexRow {
  id: string;
  display_id: string | null;
  title: string;
  category: string | null;
  priority: string | null;
  status: string;
  portal: string;
  page_url: string | null;
  reporter_email: string;
  reporter_name: string | null;
  created_at: string | null;
  indexed_at: string;
}

function toRow(r: IndexRow): BugReportRow {
  return {
    id: r.id,
    title: r.title,
    category: r.category ?? 'other',
    priority: r.priority ?? 'medium',
    status: r.status,
    portal: r.portal as BugPortal,
    pageUrl: r.page_url ?? '',
    reporterName: r.reporter_name || r.reporter_email,
    reporterEmail: r.reporter_email,
    createdAt: r.created_at ?? r.indexed_at,
  };
}

function toDetail(res: GetBugReportDetailsResponse, indexed: IndexRow): BugReportDetail {
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
    portal: indexed.portal as BugPortal,
    pageUrl: b.page_url,
    screenshotUrl: b.screenshot_url ?? null,
    consoleLogs: b.console_logs ?? null,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
    reporterName: reporter.name,
    reporterEmail: reporter.email ?? indexed.reporter_email,
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

/** Look up the index row that carries the platform join key (reporter_email). */
async function loadIndexRow(
  svc: ReturnType<typeof createServiceRoleClient>,
  id: string
): Promise<IndexRow | null> {
  const { data, error } = await svc
    .from('tms_bug_report_index')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('bug-reports index read error:', error.code, error.message);
    return null;
  }
  return (data as IndexRow | null) ?? null;
}

async function handleGet(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, PERM))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sp = new URL(request.url).searchParams;
  const id = sp.get('id');
  const svc = createServiceRoleClient();

  // ── Detail: our index supplies the reporter_email the platform now demands ──
  if (id) {
    if (!isBugReporterConfigured()) {
      return NextResponse.json({ error: 'Bug Reporter is not configured' }, { status: 503 });
    }
    const indexed = await loadIndexRow(svc, id);
    if (!indexed) {
      return NextResponse.json(
        {
          error:
            "This report isn't in the local index, so there's no reporter address to look it up with. Only reports submitted since the index was added can be opened.",
        },
        { status: 404 }
      );
    }
    try {
      const res = await getBugReport(id, indexed.reporter_email);
      const detail = toDetail(res, indexed);
      // The platform owns the live status/title; refresh our snapshot so the list
      // converges on the truth as reports get triaged. Best-effort — a stale row
      // must never block showing the report.
      const { error } = await svc
        .from('tms_bug_report_index')
        .update({ status: detail.status, title: detail.title, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) console.error('bug-reports index refresh failed:', error.code, error.message);
      return NextResponse.json({ success: true, data: detail });
    } catch (e) {
      console.error('bug-reports GET detail error:', e);
      return NextResponse.json(
        { error: (e as Error).message || 'Failed to load the report' },
        { status: 502 }
      );
    }
  }

  // ── List: served entirely from our own index, no platform call ──
  let q = svc
    .from('tms_bug_report_index')
    .select('*')
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(500);

  const status = sp.get('status');
  const category = sp.get('category');
  const portal = sp.get('portal');
  const search = sp.get('search')?.trim();
  if (status) q = q.eq('status', status);
  if (category) q = q.eq('category', category);
  if (portal) q = q.eq('portal', portal);
  if (search) q = q.or(`title.ilike.%${search}%,reporter_email.ilike.%${search}%`);

  const { data, error } = await q;
  if (error) {
    // Table not created yet (migration not applied) — render an empty console
    // instead of a 500, matching the tms_ route convention.
    if (error.code === '42P01') {
      return NextResponse.json({ success: true, data: [], configured: isBugReporterConfigured(), indexedFrom: null, count: 0 });
    }
    console.error('bug-reports list error:', error.code, error.message);
    return NextResponse.json({ error: 'Failed to load bug reports' }, { status: 500 });
  }

  const rows = ((data ?? []) as IndexRow[]).map(toRow);
  // Oldest indexed_at = how far back this list can possibly reach, so the page
  // can say so rather than implying it shows everything ever reported.
  const indexedFrom = ((data ?? []) as IndexRow[]).reduce<string | null>(
    (min, r) => (!min || r.indexed_at < min ? r.indexed_at : min),
    null
  );

  return NextResponse.json({
    success: true,
    data: rows,
    configured: isBugReporterConfigured(),
    indexedFrom,
    count: rows.length,
  });
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

  // Resolve the recipient from our OWN index, never from the client — so a reply
  // can't be aimed at another student. The index is authoritative for this because
  // the relay wrote it from the platform's own response at submit time.
  //
  // The platform's /messages write stays unusable here: it requires a NOT NULL
  // sender_user_id that our API-key auth has no user for. We route the reply to
  // the reporter's TMS notification inbox instead.
  const svc = createServiceRoleClient();
  const indexed = await loadIndexRow(svc, id);
  if (!indexed) {
    return NextResponse.json(
      { error: "Couldn't find that report in the local index, so there's no reporter to reply to." },
      { status: 404 }
    );
  }

  const { title, body: notifBody } = buildReplyNotification(indexed.display_id, message);
  try {
    const { recipientCount } = await dispatchNotification(svc, {
      title,
      body: notifBody,
      category: 'general',
      url: null,
      createdBy: auth.userId,
      targeting: { type: 'emails', emails: [indexed.reporter_email] },
    });
    return recipientCount > 0
      ? NextResponse.json({ success: true, delivered: true, recipientCount })
      : NextResponse.json({ success: true, delivered: false, reason: 'no_profile' });
  } catch (e) {
    console.error('bug-reports reply: notify failed:', e);
    return NextResponse.json(
      { error: (e as Error).message || 'Failed to notify the reporter' },
      { status: 502 }
    );
  }
}

export const GET = withAuth(handleGet);
export const POST = withAuth(handlePost);
