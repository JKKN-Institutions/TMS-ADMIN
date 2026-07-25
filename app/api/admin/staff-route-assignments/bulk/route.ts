import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { grantBoardingRole } from '@/lib/boarding/roles';
import { requireAssign } from '@/lib/staff-assignments/permissions';
import {
  resolveAssignmentEmail,
  isBulkCandidate,
  summarizeBulkResults,
  normalizeEmail,
  type Candidate,
  type BulkResult,
} from '@/lib/staff-assignments/bulk';
import type { SupabaseClient } from '@supabase/supabase-js';

// A few hundred UUIDs in a single .in() overflow the Supabase gateway with HTTP
// 400, which supabase-js surfaces as { data: null, error }. Left unchecked that
// reads as EMPTY — here it would mark every staffer unassigned. Chunk and check.
const IN_CHUNK = 150;
const MAX_BATCH = 100;

type StaffRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  staff_id: string | null;
  profile_id: string | null;
  transport_route_id: string | null;
};

type RouteRow = { id: string; route_number: string | null; route_name: string | null; status: string | null };

const fullName = (s: StaffRow) =>
  `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || (s.email ?? '—');

async function selectIn<T>(
  svc: SupabaseClient,
  table: string,
  columns: string,
  ids: string[],
  idColumn = 'id'
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await svc
      .from(table)
      .select(columns)
      .in(idColumn, ids.slice(i, i + IN_CHUNK));
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

/** Every active assignment address, lowercased. Fails loud — see IN_CHUNK note. */
async function loadAssignedEmails(svc: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await svc
    .from('tms_staff_route_assignment')
    .select('staff_email')
    .eq('is_active', true);
  if (error) throw error;
  const set = new Set<string>();
  for (const r of (data ?? []) as Array<{ staff_email: string | null }>) {
    const e = normalizeEmail(r.staff_email);
    if (e) set.add(e);
  }
  return set;
}

const STAFF_COLS = 'id, first_name, last_name, email, staff_id, profile_id, transport_route_id';

/** Staff rows + their profile email + their route, for a given id filter (or all). */
async function loadStaffContext(svc: SupabaseClient, staffIds?: string[]) {
  // BOTH paths apply the same eligibility filter (bus_required + active), so a
  // submitted id that is not eligible simply never comes back — and the POST
  // loop reports it as skipped_not_eligible when staffById.get(id) is undefined.
  // Never trust the client's ids to be eligible.
  let staff: StaffRow[] = [];
  if (staffIds) {
    for (let i = 0; i < staffIds.length; i += IN_CHUNK) {
      const { data, error } = await svc
        .from('staff')
        .select(STAFF_COLS)
        .eq('bus_required', true)
        .eq('is_active', true)
        .in('id', staffIds.slice(i, i + IN_CHUNK));
      if (error) throw error;
      staff.push(...((data ?? []) as StaffRow[]));
    }
  } else {
    const { data, error } = await svc
      .from('staff')
      .select(STAFF_COLS)
      .eq('bus_required', true)
      .eq('is_active', true);
    if (error) throw error;
    staff = (data ?? []) as StaffRow[];
  }

  const profileIds = [...new Set(staff.map((s) => s.profile_id).filter(Boolean))] as string[];
  const profileEmailById = new Map<string, string | null>();
  if (profileIds.length) {
    const rows = await selectIn<{ id: string; email: string | null }>(
      svc, 'profiles', 'id, email', profileIds
    );
    for (const p of rows) profileEmailById.set(p.id, p.email);
  }

  const routeIds = [...new Set(staff.map((s) => s.transport_route_id).filter(Boolean))] as string[];
  const routeById = new Map<string, RouteRow>();
  if (routeIds.length) {
    const rows = await selectIn<RouteRow>(
      svc, 'tms_route', 'id, route_number, route_name, status', routeIds
    );
    for (const r of rows) routeById.set(r.id, r);
  }

  return { staff, profileEmailById, routeById };
}

// GET: assignable candidates for the picker.
async function getCandidates() {
  try {
    const svc = createServiceRoleClient();
    const [{ staff, profileEmailById, routeById }, assignedEmails] = await Promise.all([
      loadStaffContext(svc),
      loadAssignedEmails(svc),
    ]);

    const candidates: Candidate[] = [];
    for (const s of staff) {
      const profileEmail = s.profile_id ? profileEmailById.get(s.profile_id) ?? null : null;
      const route = s.transport_route_id ? routeById.get(s.transport_route_id) : undefined;
      const ok = isBulkCandidate(
        {
          staffId: s.id,
          name: fullName(s),
          staffEmail: s.email,
          profileEmail,
          routeId: s.transport_route_id,
          routeActive: route?.status === 'active',
        },
        assignedEmails
      );
      if (!ok || !route) continue;
      candidates.push({
        staffId: s.id,
        name: fullName(s),
        email: resolveAssignmentEmail(s.email, profileEmail) as string,
        staffCode: s.staff_id ?? null,
        routeId: route.id,
        routeNumber: route.route_number ?? '—',
        routeName: route.route_name ?? '—',
      });
    }
    return NextResponse.json({ success: true, candidates, count: candidates.length });
  } catch (e) {
    console.error('Bulk candidates error:', e);
    return NextResponse.json({ success: false, error: 'Failed to load candidates' }, { status: 500 });
  }
}

// POST: assign each submitted staffer to their OWN master route.
async function postBulk(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requireAssign(auth))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const staffIds: unknown = body?.staffIds;
    if (!Array.isArray(staffIds) || staffIds.length === 0) {
      return NextResponse.json({ success: false, error: 'staffIds is required' }, { status: 400 });
    }
    if (staffIds.length > MAX_BATCH) {
      return NextResponse.json(
        { success: false, error: `Assign at most ${MAX_BATCH} staff at a time` },
        { status: 400 }
      );
    }
    const ids = [...new Set(staffIds.map(String))];

    const svc = createServiceRoleClient();
    const [{ staff, profileEmailById, routeById }, assignedEmails] = await Promise.all([
      loadStaffContext(svc, ids),
      loadAssignedEmails(svc),
    ]);
    const staffById = new Map(staff.map((s) => [s.id, s]));

    const results: BulkResult[] = [];
    for (const id of ids) {
      const s = staffById.get(id);
      if (!s) {
        results.push({ staffId: id, name: '—', email: null, routeId: null, routeLabel: null,
          outcome: 'skipped_not_eligible', message: 'Not a bus-required active staff member' });
        continue;
      }
      const name = fullName(s);
      const profileEmail = s.profile_id ? profileEmailById.get(s.profile_id) ?? null : null;
      const email = resolveAssignmentEmail(s.email, profileEmail);
      const route = s.transport_route_id ? routeById.get(s.transport_route_id) : undefined;
      const routeLabel = route ? `${route.route_number ?? '—'} - ${route.route_name ?? '—'}` : null;

      if (!email) {
        results.push({ staffId: id, name, email: null, routeId: null, routeLabel: null,
          outcome: 'skipped_no_email', message: 'No email on file' });
        continue;
      }
      if (!s.transport_route_id || !route) {
        results.push({ staffId: id, name, email, routeId: null, routeLabel: null,
          outcome: 'skipped_no_route', message: 'No route on the staff record' });
        continue;
      }
      if (route.status !== 'active') {
        results.push({ staffId: id, name, email, routeId: route.id, routeLabel,
          outcome: 'skipped_route_inactive', message: 'Their route is not active' });
        continue;
      }
      if (assignedEmails.has(email)) {
        results.push({ staffId: id, name, email, routeId: route.id, routeLabel,
          outcome: 'skipped_already_assigned', message: 'Already an active in-charge' });
        continue;
      }

      const { data: created, error } = await svc
        .from('tms_staff_route_assignment')
        .insert({
          staff_email: email,
          route_id: route.id,
          assigned_by: auth.userId,
          source: 'admin',
          is_active: true,
        })
        .select('id')
        .single();

      if (error) {
        // 23505 = the active (staff_email, route_id) unique index. A staffer who
        // self-assigned between GET and POST lands here — a skip, not an error.
        if (error.code === '23505') {
          results.push({ staffId: id, name, email, routeId: route.id, routeLabel,
            outcome: 'skipped_already_assigned', message: 'Already an active in-charge' });
          continue;
        }
        console.error('Bulk assign insert error:', error);
        results.push({ staffId: id, name, email, routeId: route.id, routeLabel,
          outcome: 'error', message: 'Failed to create the assignment' });
        continue;
      }

      assignedEmails.add(email); // guards a duplicate id inside the same batch
      await grantBoardingRole(svc, email, auth.userId);
      await logActivity(auth, request, {
        module: 'staff-route-assignments',
        action: 'assign',
        entityType: 'tms_staff_route_assignment',
        entityId: (created as { id: string } | null)?.id,
        entityLabel: email,
        description: `Bulk-assigned ${email} to route ${routeLabel ?? route.id}`,
        metadata: { staffEmail: email, routeId: route.id, source: 'admin_bulk' },
      });
      results.push({ staffId: id, name, email, routeId: route.id, routeLabel, outcome: 'assigned' });
    }

    return NextResponse.json({ success: true, summary: summarizeBulkResults(results), results });
  } catch (e) {
    console.error('Bulk assign error:', e);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth(() => getCandidates());
export const POST = withAuth((request, auth) => postBulk(request, auth));
