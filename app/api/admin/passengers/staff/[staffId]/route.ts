import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { STAFF_SELECT, mapStaff, type StaffRow } from '@/lib/passengers/types';
import { loadPassengerRefs } from '@/lib/passengers/refs';

/**
 * GET one bus-required staff member by id. Backs the in-module detail page.
 * Auth enforced by proxy.ts (see the learners detail route for rationale).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
) {
  try {
    const { staffId } = await params;
    if (!staffId) {
      return NextResponse.json({ error: 'Staff id is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: row, error } = await supabase
      .from('staff')
      .select(STAFF_SELECT)
      .eq('id', staffId)
      .maybeSingle();

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ error: 'Staff not found' }, { status: 404 });
      console.error('Staff detail query error:', error);
      return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: 'Staff not found' }, { status: 404 });
    }

    const staffRow = row as unknown as StaffRow;
    const refs = await loadPassengerRefs(supabase, {
      institutionIds: [staffRow.institution_id],
      departmentIds: [staffRow.department_id],
      routeIds: [staffRow.transport_route_id],
      stopIds: [staffRow.transport_stop_id],
    });

    return NextResponse.json({ success: true, data: mapStaff(staffRow, refs) });
  } catch (e) {
    console.error('Staff detail API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
