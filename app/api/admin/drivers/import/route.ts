import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';

interface ImportRow {
  staffId?: string;
  email?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
  experienceYears?: number | string;
  rating?: number | string;
  totalTrips?: number | string;
  driverStatus?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  aadharNumber?: string;
  medicalCertificateExpiry?: string;
  locationSharingEnabled?: boolean | string;
  assignedRouteId?: string;
  notes?: string;
}

interface RowResult {
  row: number;
  staffId?: string;
  status: 'updated' | 'error';
  message?: string;
}

const DRIVER_STATUSES = ['active', 'inactive', 'on_leave'];

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return ['true', 'yes', '1', 'enabled', 'y'].includes(v.trim().toLowerCase());
  return false;
}

async function importDriverOps(request: NextRequest, auth: AuthContext) {
  try {
    if (!auth.isSuperAdmin) {
      const { data: canManage } = await auth.supabase.rpc('user_has_permission', { permission_name: 'tms.drivers.manage' });
      if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const rows: ImportRow[] = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) return NextResponse.json({ error: 'rows is required' }, { status: 400 });

    const supabase = createServiceRoleClient();

    // Resolve staffIds for rows that only supplied an email (must be an existing driver).
    const emailsToResolve = rows.filter((r) => !r.staffId && r.email).map((r) => r.email!.trim().toLowerCase());
    const emailToId = new Map<string, string>();
    if (emailsToResolve.length) {
      const { data: staffRows } = await supabase
        .from('staff')
        .select('id, email')
        .in('email', emailsToResolve)
        .eq('role_key', 'driver');
      for (const s of (staffRows ?? []) as { id: string; email: string | null }[]) {
        if (s.email) emailToId.set(s.email.toLowerCase(), s.id);
      }
    }

    const results: RowResult[] = [];
    let updated = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const staffId = r.staffId || (r.email ? emailToId.get(r.email.trim().toLowerCase()) : undefined);
      if (!staffId) {
        results.push({ row: i + 1, status: 'error', message: 'No matching driver for staffId/email' });
        continue;
      }

      const status = r.driverStatus && DRIVER_STATUSES.includes(r.driverStatus) ? r.driverStatus : 'active';
      const payload = {
        staff_id: staffId,
        license_number: r.licenseNumber ?? null,
        license_expiry: r.licenseExpiry || null,
        experience_years: Number(r.experienceYears) || 0,
        rating: Number(r.rating) || 0,
        total_trips: Number(r.totalTrips) || 0,
        driver_status: status,
        address: r.address ?? null,
        emergency_contact_name: r.emergencyContactName ?? null,
        emergency_contact_phone: r.emergencyContactPhone ?? null,
        aadhar_number: r.aadharNumber ?? null,
        medical_certificate_expiry: r.medicalCertificateExpiry || null,
        location_sharing_enabled: toBool(r.locationSharingEnabled),
        assigned_route_id: r.assignedRouteId || null,
        notes: r.notes ?? null,
        updated_by: auth.userId,
      };

      const { error } = await supabase.from('tms_driver').upsert(payload, { onConflict: 'staff_id' });
      if (error) {
        results.push({ row: i + 1, staffId, status: 'error', message: error.message });
      } else {
        updated++;
        results.push({ row: i + 1, staffId, status: 'updated' });
      }
    }

    const failed = rows.length - updated;
    await logActivity(auth, request, {
      module: 'drivers',
      action: 'import',
      entityType: 'tms_driver',
      description: `Imported ${updated} driver(s), ${failed} failed`,
      metadata: { imported: updated, failed },
    });
    return NextResponse.json({ success: true, updated, failed, results });
  } catch (e) {
    console.error('Driver import error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => importDriverOps(request, auth));
