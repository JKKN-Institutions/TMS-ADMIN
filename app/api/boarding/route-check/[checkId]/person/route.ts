import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { UUID_RE } from '@/lib/route-check/admin';
import { checkIdFromUrl, loadCheckForUser } from '@/lib/route-check/check-access';
import { tickCandidate } from '@/lib/route-check/evaluate';
import type { MatchedBy } from '@/lib/route-check/types';

const MATCHED: MatchedBy[] = ['jkkn_id', 'uuid', 'roll_number', 'register_number', 'staff_id'];

/** POST { personKind, id, matchedBy, scannedCode } — tick the candidate the checker picked from an ambiguous barcode. */
async function pick(request: NextRequest, auth: AuthContext) {
  try {
    const checkId = checkIdFromUrl(request.url);
    if (!UUID_RE.test(checkId)) return NextResponse.json({ error: 'Route check not found' }, { status: 404 });
    const b = (await request.json().catch(() => ({}))) as { personKind?: unknown; id?: unknown; matchedBy?: unknown; scannedCode?: unknown };
    const personKind = b.personKind === 'learner' || b.personKind === 'staff' ? b.personKind : null;
    const id = typeof b.id === 'string' && UUID_RE.test(b.id) ? b.id : null;
    const matchedBy = MATCHED.includes(b.matchedBy as MatchedBy) ? (b.matchedBy as MatchedBy) : null;
    const scannedCode = typeof b.scannedCode === 'string' ? b.scannedCode.slice(0, 64) : null;
    if (!personKind || !id || !matchedBy) return NextResponse.json({ error: 'Invalid candidate' }, { status: 400 });

    const svc = createServiceRoleClient();
    const load = await loadCheckForUser(auth, svc, checkId, 'mutate');
    if (!load.ok) return NextResponse.json({ error: load.error }, { status: load.status });
    const data = await tickCandidate(svc, load.check, { personKind, id, matchedBy, scannedCode });
    if (!data) return NextResponse.json({ error: 'That person no longer exists' }, { status: 404 });
    await logActivity(auth, request, {
      module: 'route-checks', action: 'scan', entityType: 'tms_route_check_person', entityId: data.entry.id,
      entityLabel: data.entry.name ?? id, description: `Route check pick ${personKind} ${data.entry.code ?? id}: ${data.entry.outcome}`,
      metadata: { checkId, personKind, id, matchedBy, scannedCode, outcome: data.entry.outcome, alreadyChecked: data.alreadyChecked, picked: true },
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('route-check pick error:', e);
    return NextResponse.json({ error: 'Could not record the person' }, { status: 500 });
  }
}

/** DELETE ?personId= — remove a tick while the check is a draft. */
async function remove(request: NextRequest, auth: AuthContext) {
  try {
    const checkId = checkIdFromUrl(request.url);
    const personId = new URL(request.url).searchParams.get('personId')?.trim() ?? '';
    if (!UUID_RE.test(checkId) || !UUID_RE.test(personId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const svc = createServiceRoleClient();
    const load = await loadCheckForUser(auth, svc, checkId, 'mutate');
    if (!load.ok) return NextResponse.json({ error: load.error }, { status: load.status });
    const { data, error } = await svc.from('tms_route_check_person').delete().eq('id', personId).eq('check_id', checkId).select('id, person_kind, learner_id, staff_id, outcome');
    if (error) { console.error('route-check remove error:', error); return NextResponse.json({ error: 'Failed to remove' }, { status: 500 }); }
    if (!data?.length) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    const row = data[0] as { person_kind: string; learner_id: string | null; staff_id: string | null; outcome: string };
    await logActivity(auth, request, {
      module: 'route-checks', action: 'delete', entityType: 'tms_route_check_person', entityId: personId,
      entityLabel: row.learner_id ?? row.staff_id ?? personId, description: `Removed ${row.person_kind} entry (${row.outcome}) from route check`,
      metadata: { checkId, ...row },
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('route-check remove error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => pick(request, auth));
export const DELETE = withAuth((request, auth) => remove(request, auth));
