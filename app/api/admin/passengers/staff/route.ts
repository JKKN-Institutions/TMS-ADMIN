import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { STAFF_SELECT, mapStaff, type StaffRow } from '@/lib/passengers/types';
import { loadPassengerRefs } from '@/lib/passengers/refs';
import { parseRemoveStaffIds, REMOVE_FROM_TRANSPORT_PATCH } from '@/lib/passengers/remove-staff';
import { logActivity } from '@/lib/activity/log';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

/**
 * GET bus-required staff for the Passenger module's Staff page.
 *
 * Reads the MyJKKN-owned `staff` directory filtered to `bus_required = true`
 * (a NOT NULL boolean) AND `is_active = true`. `.eq('is_active', true)` is the
 * staff analog of the Learners page's "active pipeline" filter — `is_active` is
 * nullable, so this excludes both inactive (false) and unknown (NULL) staff,
 * matching "IS TRUE". (The `status` column here is draft/published — a record
 * publication state, not the person's active status — so it is intentionally
 * left out of this filter.) Currently zero staff are flagged bus_required, so
 * this returns an empty list until staff start opting in.
 *
 * Permission: tms.enrollment.view (shared with the Learners page).
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getStaffPassengers(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, 'tms.enrollment.view'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('staff')
      .select(STAFF_SELECT)
      .eq('bus_required', true)
      .eq('is_active', true)
      .order('first_name', { ascending: true });

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ success: true, data: [], count: 0 });
      console.error('Staff passengers query error:', error);
      return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as StaffRow[];
    const refs = await loadPassengerRefs(supabase, {
      institutionIds: rows.map((r) => r.institution_id),
      departmentIds: rows.map((r) => r.department_id),
      routeIds: rows.map((r) => r.transport_route_id),
      stopIds: rows.map((r) => r.transport_stop_id),
    });

    const result = rows.map((r) => mapStaff(r, refs));
    return NextResponse.json({ success: true, data: result, count: result.length });
  } catch (e) {
    console.error('Staff passengers API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE — "remove from transport" for one or more staff ({ ids: string[] }).
 * Clears bus_required + route + stop on the MyJKKN staff row; never deletes the
 * row (see lib/passengers/remove-staff.ts). Only rows still bus_required are
 * touched, so a repeat call is a no-op. In-charge assignments are left alone and
 * reported back, so the admin can end them on the assignments page.
 *
 * Permission: tms.enrollment.manage.
 */
async function removeStaffFromTransport(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ENROLLMENT_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const parsed = parseRemoveStaffIds(await request.json().catch(() => null));
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const supabase = createServiceRoleClient();
    const { data: removed, error } = await supabase
      .from('staff')
      .update({ ...REMOVE_FROM_TRANSPORT_PATCH, updated_by: auth.userId })
      .in('id', parsed.ids)
      .eq('bus_required', true)
      .select('id, first_name, last_name, staff_id, email, institution_email');
    if (error) {
      console.error('Remove staff from transport error:', error);
      return NextResponse.json({ error: 'Failed to remove staff from transport' }, { status: 500 });
    }

    const rows = removed ?? [];
    const label = (r: (typeof rows)[number]) =>
      [r.first_name, r.last_name].filter(Boolean).join(' ') || r.staff_id || r.id;

    // Still an active bus in-charge? Assignments store whichever address the
    // admin typed, so match both staff emails case-insensitively.
    const emails = [
      ...new Set(
        rows.flatMap((r) => [r.email, r.institution_email]).filter((e): e is string => !!e).map((e) => e.toLowerCase())
      ),
    ];
    let inchargeCount = 0;
    if (emails.length) {
      const { data: active } = await supabase
        .from('tms_staff_route_assignment')
        .select('staff_email')
        .eq('is_active', true);
      const wanted = new Set(emails);
      inchargeCount = (active ?? []).filter((a) => wanted.has(String(a.staff_email ?? '').toLowerCase())).length;
    }

    for (const r of rows) {
      await logActivity(auth, request, {
        module: 'passengers',
        action: 'unassign',
        entityType: 'staff',
        entityId: r.id,
        entityLabel: label(r),
        description: `Removed staff ${label(r)} from transport (bus_required off, route and stop cleared)`,
      });
    }

    return NextResponse.json({
      success: true,
      data: { removed: rows.length, skipped: parsed.ids.length - rows.length, inchargeAssignments: inchargeCount },
      message: `Removed ${rows.length} staff from transport`,
    });
  } catch (e) {
    console.error('Remove staff from transport API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getStaffPassengers(request, auth));
export const DELETE = withAuth((request, auth) => removeStaffFromTransport(request, auth));
