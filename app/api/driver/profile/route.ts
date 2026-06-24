import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getDriverForUser } from '@/lib/driver/identity';
import { getDriverRoutes } from '@/lib/driver/routes';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/** GET /api/driver/profile — the signed-in driver's full profile (read-only): contact +
 *  license + ops stats + emergency contact + assigned route labels. */
async function getProfile(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVER_SELF_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const drv = await getDriverForUser(auth);
    if (!drv) {
      return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });
    }

    const svc = createServiceRoleClient();

    const extraRes = await svc
      .from('tms_driver')
      .select('address, emergency_contact_name, emergency_contact_phone, medical_certificate_expiry')
      .eq('id', drv.id)
      .maybeSingle();
    const ex = (extraRes.data ?? {}) as {
      address: string | null;
      emergency_contact_name: string | null;
      emergency_contact_phone: string | null;
      medical_certificate_expiry: string | null;
    };

    const profRes = await svc
      .from('profiles')
      .select('full_name, email, phone_number')
      .eq('id', auth.userId)
      .maybeSingle();
    const p = (profRes.data ?? {}) as {
      full_name: string | null;
      email: string | null;
      phone_number: string | null;
    };

    const routes = await getDriverRoutes(drv.staff_id, drv.assigned_route_id);

    return NextResponse.json({
      success: true,
      data: {
        name: p.full_name ?? null,
        email: p.email ?? auth.email ?? null,
        phone: p.phone_number ?? null,
        address: ex.address ?? null,
        status: drv.driver_status,
        licenseNumber: drv.license_number,
        licenseExpiry: drv.license_expiry,
        medicalCertificateExpiry: ex.medical_certificate_expiry ?? null,
        experienceYears: drv.experience_years,
        rating: drv.rating,
        totalTrips: drv.total_trips,
        emergencyContactName: ex.emergency_contact_name ?? null,
        emergencyContactPhone: ex.emergency_contact_phone ?? null,
        routes: routes.map((r) => ({ id: r.id, label: r.label })),
      },
    });
  } catch (e) {
    console.error('driver/profile error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getProfile(request, auth));
