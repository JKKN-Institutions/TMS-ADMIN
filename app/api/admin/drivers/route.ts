import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { DriverListItem, DriverOps } from '@/types';

interface StaffRow {
  id: string; first_name: string | null; last_name: string | null; designation: string | null;
  phone: string | null; email: string | null; employment_type: string | null; status: string | null;
  is_active: boolean | null; date_of_joining: string | null; profile_picture: string | null;
  institution_id: string; profile_id: string | null;
}
interface OpsRow {
  staff_id: string; license_number: string | null; license_expiry: string | null; experience_years: number;
  rating: number; total_trips: number; driver_status: 'active' | 'inactive' | 'on_leave'; address: string | null;
  emergency_contact_name: string | null; emergency_contact_phone: string | null; aadhar_number: string | null;
  medical_certificate_expiry: string | null; location_sharing_enabled: boolean; assigned_route_id: string | null; notes: string | null;
}

function mapOps(o: OpsRow): DriverOps {
  return {
    licenseNumber: o.license_number, licenseExpiry: o.license_expiry, experienceYears: o.experience_years,
    rating: o.rating, totalTrips: o.total_trips, driverStatus: o.driver_status, address: o.address,
    emergencyContactName: o.emergency_contact_name, emergencyContactPhone: o.emergency_contact_phone,
    aadharNumber: o.aadhar_number, medicalCertificateExpiry: o.medical_certificate_expiry,
    locationSharingEnabled: o.location_sharing_enabled, assignedRouteId: o.assigned_route_id, notes: o.notes,
  };
}

function mapStaffToDriver(s: StaffRow, ops: OpsRow | null): DriverListItem {
  const name = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim();
  return {
    id: s.id, name: name || (s.email ?? 'Unknown'), firstName: s.first_name ?? '', lastName: s.last_name ?? '',
    designation: s.designation ?? '', phone: s.phone ?? '', email: s.email ?? '', employmentType: s.employment_type ?? '',
    status: s.status ?? '', isActive: s.is_active ?? false, dateOfJoining: s.date_of_joining,
    avatarUrl: s.profile_picture, institutionId: s.institution_id, profileId: s.profile_id,
    ops: ops ? mapOps(ops) : null,
  };
}

async function getDrivers() {
  try {
    const supabase = createServiceRoleClient();
    const { data: staffRows, error } = await supabase
      .from('staff')
      .select('id, first_name, last_name, designation, phone, email, employment_type, status, is_active, date_of_joining, profile_picture, institution_id, profile_id')
      .eq('role_key', 'driver')
      .order('first_name', { ascending: true });
    if (error) {
      console.error('Drivers (staff) query error:', error);
      return NextResponse.json({ error: 'Failed to fetch drivers' }, { status: 500 });
    }
    const staff = (staffRows ?? []) as StaffRow[];
    const ids = staff.map((s) => s.id);
    const { data: opsRows } = ids.length
      ? await supabase.from('tms_driver').select('*').in('staff_id', ids)
      : { data: [] as OpsRow[] };
    const opsByStaff = new Map<string, OpsRow>(((opsRows ?? []) as OpsRow[]).map((o) => [o.staff_id, o]));
    const drivers = staff.map((s) => mapStaffToDriver(s, opsByStaff.get(s.id) ?? null));
    return NextResponse.json({ success: true, data: drivers, count: drivers.length });
  } catch (e) {
    console.error('Drivers API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function upsertDriverOps(request: NextRequest, auth: AuthContext) {
  try {
    // Authorization: super-admin bypass, else require tms.drivers.manage.
    if (!auth.isSuperAdmin) {
      const { data: canManage } = await auth.supabase.rpc('user_has_permission', { permission_name: 'tms.drivers.manage' });
      if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const staffId: string | undefined = body?.staffId;
    const f = body?.fields ?? {};
    if (!staffId) return NextResponse.json({ error: 'staffId is required' }, { status: 400 });

    const supabase = createServiceRoleClient();
    const payload = {
      staff_id: staffId,
      license_number: f.licenseNumber ?? null,
      license_expiry: f.licenseExpiry || null,
      experience_years: Number(f.experienceYears) || 0,
      rating: Number(f.rating) || 0,
      total_trips: Number(f.totalTrips) || 0,
      driver_status: f.driverStatus ?? 'active',
      address: f.address ?? null,
      emergency_contact_name: f.emergencyContactName ?? null,
      emergency_contact_phone: f.emergencyContactPhone ?? null,
      aadhar_number: f.aadharNumber ?? null,
      medical_certificate_expiry: f.medicalCertificateExpiry || null,
      location_sharing_enabled: !!f.locationSharingEnabled,
      assigned_route_id: f.assignedRouteId || null,
      notes: f.notes ?? null,
      updated_by: auth.userId,
    };
    const { data, error } = await supabase
      .from('tms_driver')
      .upsert(payload, { onConflict: 'staff_id' })
      .select()
      .single();
    if (error) {
      console.error('tms_driver upsert error:', error);
      return NextResponse.json({ error: 'Failed to save driver details' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('Driver upsert error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth(() => getDrivers());
export const PUT = withAuth((request, auth) => upsertDriverOps(request, auth));
