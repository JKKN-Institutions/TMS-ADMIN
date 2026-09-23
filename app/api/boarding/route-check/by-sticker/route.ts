import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { vehicleByReg, routeForVehicle } from '@/lib/route-check/vehicle-route';
import { canCheckRoute } from '@/lib/route-check/access';

async function bySticker(request: NextRequest, auth: AuthContext) {
  try {
    const reg = new URL(request.url).searchParams.get('reg') ?? '';
    const svc = createServiceRoleClient();
    const vehicle = await vehicleByReg(svc, reg);
    if (!vehicle) return NextResponse.json({ error: 'This sticker does not match any bus' }, { status: 404 });
    const route = await routeForVehicle(svc, vehicle.id);
    if (!route) return NextResponse.json({ error: `Bus ${vehicle.registration_number} is not on an active route` }, { status: 404 });
    if (!(await canCheckRoute(auth, svc, route.id))) return NextResponse.json({ error: 'You are not assigned to this bus' }, { status: 403 });
    return NextResponse.json({ success: true, data: { routeId: route.id, routeNumber: route.route_number, vehicleReg: vehicle.registration_number } });
  } catch (e) {
    console.error('route-check by-sticker error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => bySticker(request, auth));
