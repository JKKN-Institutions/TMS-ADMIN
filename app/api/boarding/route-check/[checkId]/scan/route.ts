import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { UUID_RE } from '@/lib/route-check/admin';
import { checkIdFromUrl, loadCheckForUser } from '@/lib/route-check/check-access';
import { resolveCard } from '@/lib/route-check/resolve';
import { recordEntry, tickCandidate } from '@/lib/route-check/evaluate';
import { personEntryFromRow } from '@/lib/route-check/entries';
import type { ScanResponse } from '@/lib/route-check/types';

/**
 * POST { code, source } — VERIFY ONLY. Resolves a QR (JKKN ID / UUID) or a
 * Code 39 barcode (roll / register / staff code) to a person, evaluates them
 * for this route today and records the tick. Several candidates → returned
 * for the checker to pick (nothing recorded). No candidate → an
 * 'unknown' row so the finding is kept. Never writes attendance.
 */
async function scan(request: NextRequest, auth: AuthContext) {
  try {
    const id = checkIdFromUrl(request.url);
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Route check not found' }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as { code?: unknown; source?: unknown };
    // Fail-closed: only an explicit 'camera' counts as a camera read.
    if (body.source !== 'camera') return NextResponse.json({ error: 'Point the camera at the ID card to scan it.' }, { status: 400 });
    const raw = typeof body.code === 'string' ? body.code : '';
    if (!raw.trim()) return NextResponse.json({ error: 'Nothing was scanned' }, { status: 400 });

    const svc = createServiceRoleClient();
    const load = await loadCheckForUser(auth, svc, id, 'mutate');
    if (!load.ok) return NextResponse.json({ error: load.error }, { status: load.status });
    const check = load.check;

    const resolved = await resolveCard(svc, raw, check.route_id);
    if (resolved.shape === 'unknown') return NextResponse.json({ error: 'That code is not a JKKN ID card or ID barcode' }, { status: 400 });

    let data: ScanResponse;
    if (resolved.candidates.length === 0) {
      const { row } = await recordEntry(svc, check.id, { kind: 'unknown', scannedCode: resolved.code });
      data = { kind: 'recorded', entry: personEntryFromRow(row, { learners: new Map(), staff: new Map() }), alreadyChecked: false, feeOwed: null };
    } else if (resolved.candidates.length > 1) {
      data = { kind: 'candidates', code: resolved.code, candidates: resolved.candidates };
    } else {
      const c = resolved.candidates[0];
      const t = await tickCandidate(svc, check, { personKind: c.personKind, id: c.id, matchedBy: c.matchedBy, scannedCode: resolved.code });
      if (!t) return NextResponse.json({ error: 'That person no longer exists' }, { status: 404 });
      data = t;
    }

    if (data.kind === 'recorded') {
      await logActivity(auth, request, {
        module: 'route-checks', action: 'scan', entityType: 'tms_route_check_person', entityId: data.entry.id,
        entityLabel: data.entry.name ?? resolved.code,
        description: `Route check scan ${resolved.code}${data.entry.name ? ` (${data.entry.name})` : ''}: ${data.entry.outcome}${data.alreadyChecked ? ' (already checked)' : ''}`,
        metadata: { checkId: check.id, routeId: check.route_id, shape: resolved.shape, outcome: data.entry.outcome, alreadyChecked: data.alreadyChecked, retired: resolved.retired ?? false },
      });
    }
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('route-check scan error:', e);
    return NextResponse.json({ error: 'Could not check the card' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => scan(request, auth));
