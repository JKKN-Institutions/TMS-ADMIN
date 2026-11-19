/**
 * Pure helpers behind the driver onboarding form: blank values for a new driver,
 * and the form values for an existing one. Kept out of the .tsx so they are tested.
 */
import type { DriverListItem } from '@/types';
import type { DriverPersonInput } from './staff-fields';
import { RELATIONSHIPS } from './onboarding-constants';

export function emptyPerson(): DriverPersonInput {
  return {
    firstName: '',
    lastName: '',
    gender: 'male',
    dateOfBirth: '',
    maritalStatus: 'single',
    bloodGroup: '',
    phone: '',
    email: '',
    institutionEmailName: '',
    address: '',
    state: '',
    district: '',
    pincode: '',
    emergencyContactName: '',
    emergencyContactRelationship: '',
    emergencyContactRelationshipOther: '',
    emergencyContactPhone: '',
    dateOfJoining: '',
    designation: 'Bus Driver',
    biometricId: '',
    biometricInstitutionId: '',
    isActive: true,
  };
}

/** A stored timestamp or date becomes the YYYY-MM-DD a date input needs. */
export function toDateInput(v: string | null | undefined): string {
  return v ? v.slice(0, 10) : '';
}

function firstFilled(...values: (string | null | undefined)[]): string {
  for (const v of values) if (v && v.trim() !== '') return v;
  return '';
}

export function personFromDriver(d: DriverListItem): DriverPersonInput {
  const p = d.person;
  const storedRelationship = (p.emergencyContactRelationship ?? '').trim();
  const known = (RELATIONSHIPS as readonly string[]).includes(storedRelationship);

  return {
    firstName: p.firstName ?? '',
    lastName: p.lastName ?? '',
    gender: p.gender ?? '',
    dateOfBirth: toDateInput(p.dateOfBirth),
    maritalStatus: p.maritalStatus ?? '',
    bloodGroup: p.bloodGroup ?? '',
    phone: p.phone ?? '',
    email: p.email ?? '',
    institutionEmailName: '',
    address: firstFilled(p.address, d.ops?.address),
    state: p.state ?? '',
    district: p.district ?? '',
    pincode: p.pincode ?? '',
    emergencyContactName: firstFilled(p.emergencyContactName, d.ops?.emergencyContactName),
    emergencyContactRelationship: storedRelationship === '' ? '' : known ? storedRelationship : 'Other',
    emergencyContactRelationshipOther: storedRelationship !== '' && !known ? storedRelationship : '',
    emergencyContactPhone: firstFilled(p.emergencyContactPhone, d.ops?.emergencyContactPhone),
    dateOfJoining: toDateInput(p.dateOfJoining),
    designation: p.designation ?? '',
    biometricId: p.biometricId ?? '',
    biometricInstitutionId: p.biometricInstitutionId ?? '',
    isActive: p.isActive,
  };
}
