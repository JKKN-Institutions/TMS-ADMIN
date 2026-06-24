import type { DriverListItem, DriverOps, DriverRouteRef } from '@/types';

/**
 * Shared row→DTO mapping for the drivers feature.
 *
 * Drivers originate from the MyJKKN-owned `staff` table (role_key='driver'); TMS
 * owns only the `tms_driver` operational extension. These helpers are used by
 * BOTH the list route (app/api/admin/drivers/route.ts) and the detail route
 * (app/api/admin/drivers/[driverId]/route.ts) so list and detail return the
 * exact same camelCase shape.
 */

export const STAFF_SELECT =
  'id, first_name, last_name, designation, phone, email, employment_type, status, is_active, date_of_joining, profile_picture, institution_id, profile_id';

export interface StaffRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  designation: string | null;
  phone: string | null;
  email: string | null;
  employment_type: string | null;
  status: string | null;
  is_active: boolean | null;
  date_of_joining: string | null;
  profile_picture: string | null;
  institution_id: string;
  profile_id: string | null;
}

export interface OpsRow {
  staff_id: string;
  license_number: string | null;
  license_expiry: string | null;
  experience_years: number;
  rating: number;
  total_trips: number;
  driver_status: 'active' | 'inactive' | 'on_leave';
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  aadhar_number: string | null;
  medical_certificate_expiry: string | null;
  location_sharing_enabled: boolean;
  assigned_route_id: string | null;
  notes: string | null;
}

export function mapOps(o: OpsRow): DriverOps {
  return {
    licenseNumber: o.license_number,
    licenseExpiry: o.license_expiry,
    experienceYears: o.experience_years,
    rating: o.rating,
    totalTrips: o.total_trips,
    driverStatus: o.driver_status,
    address: o.address,
    emergencyContactName: o.emergency_contact_name,
    emergencyContactPhone: o.emergency_contact_phone,
    aadharNumber: o.aadhar_number,
    medicalCertificateExpiry: o.medical_certificate_expiry,
    locationSharingEnabled: o.location_sharing_enabled,
    assignedRouteId: o.assigned_route_id,
    notes: o.notes,
  };
}

export function mapStaffToDriver(
  s: StaffRow,
  ops: OpsRow | null,
  routes: DriverRouteRef[] = []
): DriverListItem {
  const name = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim();
  return {
    id: s.id,
    name: name || (s.email ?? 'Unknown'),
    firstName: s.first_name ?? '',
    lastName: s.last_name ?? '',
    designation: s.designation ?? '',
    phone: s.phone ?? '',
    email: s.email ?? '',
    employmentType: s.employment_type ?? '',
    status: s.status ?? '',
    isActive: s.is_active ?? false,
    dateOfJoining: s.date_of_joining,
    avatarUrl: s.profile_picture,
    institutionId: s.institution_id,
    profileId: s.profile_id,
    ops: ops ? mapOps(ops) : null,
    routes,
  };
}

/**
 * Builds the snake_case `tms_driver` payload from a camelCase form `fields`
 * object. Shared by the create (POST) and update (PUT) handlers. Audit columns
 * (created_by / updated_by) are added by the caller.
 */
export function buildOpsPayload(staffId: string, f: Record<string, unknown>) {
  return {
    staff_id: staffId,
    license_number: (f.licenseNumber as string) ?? null,
    license_expiry: (f.licenseExpiry as string) || null,
    experience_years: Number(f.experienceYears) || 0,
    rating: Number(f.rating) || 0,
    total_trips: Number(f.totalTrips) || 0,
    driver_status: (f.driverStatus as string) ?? 'active',
    address: (f.address as string) ?? null,
    emergency_contact_name: (f.emergencyContactName as string) ?? null,
    emergency_contact_phone: (f.emergencyContactPhone as string) ?? null,
    aadhar_number: (f.aadharNumber as string) ?? null,
    medical_certificate_expiry: (f.medicalCertificateExpiry as string) || null,
    location_sharing_enabled: !!f.locationSharingEnabled,
    assigned_route_id: (f.assignedRouteId as string) || null,
    notes: (f.notes as string) ?? null,
  };
}
