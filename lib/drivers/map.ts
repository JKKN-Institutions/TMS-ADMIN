import type { DriverListItem, DriverOps, DriverRouteRef } from '@/types';
import { canFullEdit } from './onboarding-constants';

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
  'id, first_name, last_name, designation, phone, email, employment_type, status, is_active, date_of_joining, profile_picture, institution_id, profile_id, gender, date_of_birth, marital_status, blood_group, institution_email, address, state, district, pincode, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, staff_id, biometric_id, biometric_institution_id, category_id, role_key';

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
  gender: string | null;
  date_of_birth: string | null;
  marital_status: string | null;
  blood_group: string | null;
  institution_email: string | null;
  address: string | null;
  state: string | null;
  district: string | null;
  pincode: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_phone: string | null;
  staff_id: string | null;
  biometric_id: string | null;
  biometric_institution_id: string | null;
  category_id: string | null;
  role_key: string | null;
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
    person: {
      firstName: s.first_name ?? '',
      lastName: s.last_name ?? '',
      gender: s.gender ?? '',
      dateOfBirth: s.date_of_birth,
      maritalStatus: s.marital_status ?? '',
      bloodGroup: s.blood_group,
      phone: s.phone ?? '',
      email: s.email ?? '',
      institutionEmail: s.institution_email,
      address: s.address,
      state: s.state,
      district: s.district,
      pincode: s.pincode,
      emergencyContactName: s.emergency_contact_name,
      emergencyContactRelationship: s.emergency_contact_relationship,
      emergencyContactPhone: s.emergency_contact_phone,
      staffCode: s.staff_id,
      dateOfJoining: s.date_of_joining,
      designation: s.designation ?? '',
      biometricId: s.biometric_id,
      biometricInstitutionId: s.biometric_institution_id,
      isActive: s.is_active ?? false,
      photoUrl: s.profile_picture,
    },
    canFullEdit: canFullEdit(s),
    ops: ops ? mapOps(ops) : null,
    routes,
  };
}

const DRIVER_STATUSES = ['active', 'inactive', 'on_leave'] as const;

function textOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/**
 * Only the `tms_driver` columns the onboarding form owns. Never includes rating,
 * total_trips, location_sharing_enabled, address or the emergency contact (those
 * live on `staff` now or are written by the driver app). Audit columns are added
 * by the caller.
 */
export function buildTransportPayload(staffId: string, f: Record<string, unknown>) {
  const status = (DRIVER_STATUSES as readonly unknown[]).includes(f.driverStatus)
    ? (f.driverStatus as (typeof DRIVER_STATUSES)[number])
    : 'active';
  const years = Number(f.experienceYears);
  const experienceYears = Number.isFinite(years) && years >= 0 ? Math.trunc(years) : 0;
  return {
    staff_id: staffId,
    license_number: textOrNull(f.licenseNumber),
    license_expiry: textOrNull(f.licenseExpiry),
    experience_years: experienceYears,
    driver_status: status,
    assigned_route_id: textOrNull(f.assignedRouteId),
    aadhar_number: textOrNull(f.aadharNumber),
    medical_certificate_expiry: textOrNull(f.medicalCertificateExpiry),
    notes: textOrNull(f.notes),
  };
}
