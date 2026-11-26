import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { canFullEdit } from '@/lib/drivers/onboarding-constants';

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

    // Whether each person is an active employee, and whether TMS owns their record. The
    // sheet can never make an employee inactive: that is done from the Drivers page,
    // where it also takes them off their route.
    const idOf = (r: ImportRow) => r.staffId || (r.email ? emailToId.get(r.email.trim().toLowerCase()) : undefined);
    const allIds = [...new Set(rows.map(idOf).filter((x): x is string => !!x))];
    const employee = new Map<string, { active: boolean; owned: boolean }>();
    for (let i = 0; i < allIds.length; i += 150) {
      const { data: staffRows, error: staffErr } = await supabase
        .from('staff')
        .select('id, is_active, role_key, category_id')
        .in('id', allIds.slice(i, i + 150));
      if (staffErr) {
        console.error('Driver import: staff lookup failed:', staffErr);
        return NextResponse.json({ error: 'Failed to look up the drivers' }, { status: 500 });
      }
      for (const s of (staffRows ?? []) as { id: string; is_active: boolean | null; role_key: string | null; category_id: string | null }[]) {
        employee.set(s.id, { active: s.is_active !== false, owned: canFullEdit(s) });
      }
    }

    const results: RowResult[] = [];
    let updated = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const staffId = idOf(r);
      if (!staffId) {
        results.push({ row: i + 1, status: 'error', message: 'No matching driver for staffId/email' });
        continue;
      }

      let status = r.driverStatus && DRIVER_STATUSES.includes(r.driverStatus) ? r.driverStatus : 'active';
      const person = employee.get(staffId);
      if (person?.owned) {
        if (person.active && status === 'inactive') {
          results.push({ row: i + 1, staffId, status: 'error', message: 'Mark a driver inactive from the Drivers page' });
          continue;
        }
        // An inactive employee is always stored as inactive, whatever the sheet says.
        if (!person.active) status = 'inactive';
      }
      const inactive = person?.owned === true && !person.active;
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
        location_sharing_enabled: inactive ? false : toBool(r.locationSharingEnabled),
        assigned_route_id: inactive ? null : r.assignedRouteId || null,
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
