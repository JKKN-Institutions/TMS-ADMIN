import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { isBugReporterConfigured, listBugReportsFor } from '@/lib/bug-reports/client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { syncReporterChunk } from '@/lib/bug-reports/sync';

/**
 * Backfill / re-sync tms_bug_report_index from the Bug Reporter platform.
 *
 *   POST { offset?, limit? } -> one chunk; repeat until nextOffset is null
 *
 * WHY CHUNKED
 * The platform can only answer "reports by THIS one address", so recovering
 * history means asking about every address we know — ~6.4k active profiles.
 * That cannot fit in a single serverless invocation, so the caller walks the
 * list: each request probes `limit` addresses and returns `nextOffset`.
 *
 * Ordering is by email so the walk is stable across requests. Chunks may overlap
 * slightly at the boundaries after case-folding; the upsert is idempotent, so a
 * report seen twice costs nothing.
 *
 * See lib/bug-reports/sync.ts for why this sweep is the only route to history.
 */

const PERM = TMS_PERMISSIONS.SETTINGS_MANAGE;

// Addresses probed per request. Sized so a chunk finishes well inside the
// default serverless budget at the module's concurrency (8).
const DEFAULT_CHUNK = 250;
const MAX_CHUNK = 500;

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function handlePost(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, PERM))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!isBugReporterConfigured()) {
    return NextResponse.json({ error: 'Bug Reporter is not configured' }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as { offset?: number; limit?: number };
  const offset = Math.max(0, Math.floor(Number(body.offset) || 0));
  const limit = Math.min(MAX_CHUNK, Math.max(1, Math.floor(Number(body.limit) || DEFAULT_CHUNK)));

  const svc = createServiceRoleClient();

  // Total candidate count drives the caller's progress display.
  const { count, error: countError } = await svc
    .from('profiles')
    .select('email', { count: 'exact', head: true })
    .eq('is_active', true);
  if (countError) {
    console.error('bug-reports sync: profile count failed:', countError.code, countError.message);
    return NextResponse.json({ error: 'Failed to read the address list' }, { status: 500 });
  }
  const totalCandidates = count ?? 0;

  const { data: rows, error } = await svc
    .from('profiles')
    .select('email')
    .eq('is_active', true)
    .order('email', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) {
    console.error('bug-reports sync: profile page failed:', error.code, error.message);
    return NextResponse.json({ error: 'Failed to read the address list' }, { status: 500 });
  }

  const emails = [
    ...new Set(
      ((rows ?? []) as { email: string | null }[])
        .map((r) => (r.email ?? '').trim().toLowerCase())
        .filter(Boolean)
    ),
  ];

  const result = await syncReporterChunk(svc, emails, (email) => listBugReportsFor(email));

  const nextOffset = offset + limit;
  return NextResponse.json({
    success: true,
    ...result,
    offset,
    limit,
    totalCandidates,
    nextOffset: nextOffset < totalCandidates ? nextOffset : null,
  });
}

export const POST = withAuth(handlePost);
