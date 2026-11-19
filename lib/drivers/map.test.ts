import { describe, it, expect } from 'vitest';
import { mapStaffToDriver, buildTransportPayload, type StaffRow } from './map';
import { DRIVER_CATEGORY_ID } from './onboarding-constants';

const base: StaffRow = {
  id: 's1',
  first_name: 'Ravi',
  last_name: 'Kumar',
  designation: 'Driver',
  phone: '9876543210',
  email: 'ravi@example.com',
  employment_type: 'full_time',
  status: 'active',
  is_active: true,
  date_of_joining: '2024-01-01',
  profile_picture: 'https://x/y.png',
  institution_id: 'inst',
  profile_id: 'p1',
  gender: 'male',
  date_of_birth: '1990-05-05',
  marital_status: 'married',
  blood_group: 'O+',
  institution_email: 'ravi@jkkn.ac.in',
  address: '1 Main St',
  state: 'Tamil Nadu',
  district: 'Namakkal',
  pincode: '638183',
  emergency_contact_name: null,
  emergency_contact_relationship: null,
  emergency_contact_phone: null,
  staff_id: 'NOTJMO001',
  biometric_id: null,
  biometric_institution_id: null,
  category_id: DRIVER_CATEGORY_ID,
  role_key: 'driver',
};

describe('mapStaffToDriver', () => {
  it('maps person fields and allows full edit for a Driver-category driver', () => {
    const d = mapStaffToDriver(base, null);
    expect(d.canFullEdit).toBe(true);
    expect(d.person.staffCode).toBe('NOTJMO001');
    expect(d.person.institutionEmail).toBe('ravi@jkkn.ac.in');
    expect(d.person.emergencyContactName).toBeNull();
    expect(d.person.photoUrl).toBe('https://x/y.png');
  });

  it('is not fully editable in another category', () => {
    expect(mapStaffToDriver({ ...base, category_id: 'other' }, null).canFullEdit).toBe(false);
  });

  it('is not fully editable when role_key is not driver', () => {
    expect(mapStaffToDriver({ ...base, role_key: 'faculty' }, null).canFullEdit).toBe(false);
  });
});

describe('buildTransportPayload', () => {
  const form = {
    licenseNumber: 'TN123',
    licenseExpiry: '2030-01-01',
    experienceYears: '7',
    driverStatus: 'on_leave',
    assignedRouteId: 'r1',
    aadharNumber: '1234',
    medicalCertificateExpiry: '2027-01-01',
    notes: 'n',
    rating: 5,
    totalTrips: 99,
    locationSharingEnabled: true,
    address: 'x',
    emergencyContactName: 'y',
    emergencyContactPhone: 'z',
  };

  it('has exactly the nine transport keys', () => {
    expect(Object.keys(buildTransportPayload('s1', form)).sort()).toEqual(
      [
        'staff_id', 'license_number', 'license_expiry', 'experience_years', 'driver_status',
        'assigned_route_id', 'aadhar_number', 'medical_certificate_expiry', 'notes',
      ].sort(),
    );
  });

  it('maps the values', () => {
    expect(buildTransportPayload('s1', form)).toMatchObject({
      staff_id: 's1',
      license_number: 'TN123',
      experience_years: 7,
      driver_status: 'on_leave',
      assigned_route_id: 'r1',
    });
  });

  it('falls back to active for an invalid status and 0 for non-numeric experience', () => {
    const p = buildTransportPayload('s1', { driverStatus: 'banana', experienceYears: 'abc' });
    expect(p.driver_status).toBe('active');
    expect(p.experience_years).toBe(0);
  });
});
