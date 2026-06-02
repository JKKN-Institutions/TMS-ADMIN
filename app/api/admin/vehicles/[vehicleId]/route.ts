import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * GET one vehicle (full tms_vehicle row) by id. Backs the in-module vehicle
 * view/edit pages so they survive deep-link / hard refresh (the list endpoint
 * can't do that). Auth is enforced by proxy.ts (every /api route requires an
 * authenticated TMS user); writes still go through the permission-gated
 * POST/PUT/DELETE handlers on /api/admin/vehicles.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ vehicleId: string }> }
) {
  try {
    const { vehicleId } = await params;
    if (!vehicleId) {
      return NextResponse.json({ error: 'Vehicle id is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: vehicle, error } = await supabase
      .from('tms_vehicle')
      .select('*')
      .eq('id', vehicleId)
      .maybeSingle();

    if (error) {
      // Table absent (42P01) → treat as not found until the migration is applied.
      if (error.code === '42P01') {
        return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
      }
      console.error('Vehicle detail query error:', error);
      return NextResponse.json({ error: 'Failed to fetch vehicle' }, { status: 500 });
    }
    if (!vehicle) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: vehicle });
  } catch (e) {
    console.error('Vehicle detail API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
