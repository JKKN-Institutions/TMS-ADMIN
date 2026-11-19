import { describe, it, expect } from 'vitest';
import {
  validatePerson,
  toStaffColumns,
  buildStaffInsert,
  diffStaffPatch,
  canFullEdit,
  normalizeEmail,
  type DriverPersonInput,
} from './staff-fields';
import { DRIVER_CATEGORY_ID, DRIVER_INSTITUTION_ID } from './onboarding-constants';

const TODAY = '2026-11-19';

const valid: DriverPersonInput = {
  firstName: 'Ravi',
  lastName: 'Kumar',
  gender: 'male',
  dateOfBirth: '1980-05-01',
  maritalStatus: 'married',
  bloodGroup: 'O+',
  phone: '9876543210',
  email: '',
  institutionEmailName: 'ravi.k',
  address: '12 Main Road',
  state: 'Tamil Nadu',
  district: 'Namakkal',
  pincode: '638001',
  emergencyContactName: '',
  emergencyContactRelationship: '',
  emergencyContactRelationshipOther: '',
  emergencyContactPhone: '',
  dateOfJoining: '2026-01-10',
  designation: 'Driver',
  biometricId: '',
  biometricInstitutionId: '',
  isActive: true,
};

function errorsFor(patch: Partial<DriverPersonInput>, mode: 'create' | 'edit' = 'create') {
  const r = validatePerson({ ...valid, ...patch }, mode, TODAY);
  return r.ok ? null : r.errors;
}

describe('validatePerson', () => {
  it('accepts a valid minimal create input', () => {
    expect(validatePerson(valid, 'create', TODAY).ok).toBe(true);
  });

  it('rejects a first name shorter than 2 letters', () => {
    expect(errorsFor({ firstName: 'A' })?.firstName).toBeTruthy();
  });

  it('rejects a gender outside the list', () => {
    expect(errorsFor({ gender: 'other' })?.gender).toBeTruthy();
  });

  it('rejects dates of birth and joining in the future', () => {
    expect(errorsFor({ dateOfBirth: '2999-01-01' })?.dateOfBirth).toBeTruthy();
    expect(errorsFor({ dateOfJoining: '2026-11-20' })?.dateOfJoining).toBeTruthy();
  });

  it('needs 10 digits in the phone number but allows spaces', () => {
    expect(errorsFor({ phone: '98765' })?.phone).toBeTruthy();
    expect(validatePerson({ ...valid, phone: '98765 43210' }, 'create', TODAY).ok).toBe(true);
  });

  it('rejects an institution email name that contains the domain', () => {
    expect(errorsFor({ institutionEmailName: 'ravi@jkkn.ac.in' })?.institutionEmailName).toBe(
      'Type only the name part, without @jkkn.ac.in',
    );
  });

  it('ignores the institution email name in edit mode', () => {
    const r = validatePerson({ ...valid, institutionEmailName: '' }, 'edit', TODAY);
    expect(r.ok).toBe(true);
  });

  it('builds the institution email from a trimmed, lowercased name', () => {
    const r = validatePerson({ ...valid, institutionEmailName: '  Ravi.K ' }, 'create', TODAY);
    expect(r.ok).toBe(true);
    if (r.ok) expect(buildStaffInsert(r.value, 'actor-1').institution_email).toBe('ravi.k@jkkn.ac.in');
  });

  it('falls back to the institution email when email is blank, and lowercases a given email', () => {
    const blank = validatePerson(valid, 'create', TODAY);
    const given = validatePerson({ ...valid, email: ' Ravi@Gmail.com ' }, 'create', TODAY);
    if (!blank.ok || !given.ok) throw new Error('expected valid');
    expect(buildStaffInsert(blank.value, 'a').email).toBe('ravi.k@jkkn.ac.in');
    expect(buildStaffInsert(given.value, 'a').email).toBe('ravi@gmail.com');
  });

  it('rejects a malformed email', () => {
    expect(errorsFor({ email: 'not-an-email' })?.email).toBeTruthy();
  });

  it('needs a phone when only the emergency contact name is given', () => {
    expect(errorsFor({ emergencyContactName: 'Meena' })?.emergencyContactPhone).toBeTruthy();
  });

  it('needs the other relationship text when Other is chosen', () => {
    const e = errorsFor({
      emergencyContactName: 'Meena',
      emergencyContactPhone: '9876543210',
      emergencyContactRelationship: 'Other',
      emergencyContactRelationshipOther: '',
    });
    expect(e?.emergencyContactRelationshipOther).toBeTruthy();
  });

  it('needs a biometric machine when a biometric code is given', () => {
    expect(errorsFor({ biometricId: '123' })?.biometricInstitutionId).toBeTruthy();
  });

  it('needs state, district and a designation of 2 letters', () => {
    const e = errorsFor({ state: '', district: ' ', designation: 'D' });
    expect(e?.state).toBeTruthy();
    expect(e?.district).toBeTruthy();
    expect(e?.designation).toBeTruthy();
  });

  it('allows a blank pincode but rejects non-digits', () => {
    expect(validatePerson({ ...valid, pincode: '' }, 'create', TODAY).ok).toBe(true);
    expect(errorsFor({ pincode: '63A001' })?.pincode).toBeTruthy();
  });

  it('drops unknown keys such as staff_id, role_key and profile_id', () => {
    const r = validatePerson({ ...valid, staff_id: 'X', role_key: 'super_admin', profile_id: 'p' }, 'create', TODAY);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const keys = Object.keys(r.value);
      expect(keys).not.toContain('staff_id');
      expect(keys).not.toContain('role_key');
      expect(keys).not.toContain('profile_id');
    }
  });

  it('rejects input that is not an object', () => {
    expect(validatePerson(null, 'create', TODAY).ok).toBe(false);
  });
});

describe('toStaffColumns', () => {
  it('turns blank emergency contact fields into three nulls', () => {
    const c = toStaffColumns({
      ...valid,
      emergencyContactName: '   ',
      emergencyContactRelationship: '   ',
      emergencyContactPhone: '   ',
    });
    expect(c.emergency_contact_name).toBeNull();
    expect(c.emergency_contact_relationship).toBeNull();
    expect(c.emergency_contact_phone).toBeNull();
  });

  it('stores the typed text when the relationship is Other', () => {
    const c = toStaffColumns({
      ...valid,
      emergencyContactName: 'Meena',
      emergencyContactPhone: '9876543210',
      emergencyContactRelationship: 'Other',
      emergencyContactRelationshipOther: 'Uncle',
    });
    expect(c.emergency_contact_relationship).toBe('Uncle');
  });

  it('turns blank blood group and address into null', () => {
    const c = toStaffColumns({ ...valid, bloodGroup: '', address: '  ' });
    expect(c.blood_group).toBeNull();
    expect(c.address).toBeNull();
  });

  it('turns a blank biometric code into two nulls', () => {
    const c = toStaffColumns({ ...valid, biometricId: '  ', biometricInstitutionId: 'm1' });
    expect(c.biometric_id).toBeNull();
    expect(c.biometric_institution_id).toBeNull();
  });
});

describe('buildStaffInsert', () => {
  it('sets the fixed driver values and the actor, and omits server-owned keys', () => {
    const r = validatePerson(valid, 'create', TODAY);
    if (!r.ok) throw new Error('expected valid');
    const row = buildStaffInsert(r.value, 'actor-1') as Record<string, unknown>;
    expect(row.institution_id).toBe(DRIVER_INSTITUTION_ID);
    expect(row.category_id).toBe(DRIVER_CATEGORY_ID);
    expect(row.role_key).toBe('driver');
    expect(row.department_id).toBeNull();
    expect(row.login_enabled).toBe(true);
    expect(row.created_by).toBe('actor-1');
    expect(row.updated_by).toBe('actor-1');
    for (const k of ['staff_id', 'profile_id', 'employment_type', 'status']) {
      expect(Object.keys(row)).not.toContain(k);
    }
  });
});

describe('diffStaffPatch', () => {
  const current = {
    first_name: 'Ravi',
    last_name: 'Kumar',
    gender: 'male',
    date_of_birth: '1980-05-01',
    marital_status: 'married',
    blood_group: 'O+',
    phone: '9876543210',
    email: 'ravi.k@jkkn.ac.in',
    address: '12 Main Road',
    state: 'Tamil Nadu',
    district: 'Namakkal',
    pincode: '638001',
    emergency_contact_name: null,
    emergency_contact_relationship: null,
    emergency_contact_phone: null,
    date_of_joining: '2026-01-10',
    designation: 'Driver',
    biometric_id: null,
    biometric_institution_id: null,
    is_active: true,
  };
  const same = { ...valid, email: 'ravi.k@jkkn.ac.in' };

  it('is empty when nothing changed', () => {
    expect(diffStaffPatch(same, current)).toEqual({});
  });

  it('holds only the changed column', () => {
    expect(diffStaffPatch({ ...same, phone: '9000000000' }, current)).toEqual({ phone: '9000000000' });
  });

  it('treats an empty current value as equal to a blank input', () => {
    expect(diffStaffPatch({ ...same, address: '' }, { ...current, address: '' })).not.toHaveProperty('address');
    expect(diffStaffPatch({ ...same, address: '' }, { ...current, address: undefined })).not.toHaveProperty('address');
  });

  it('compares a date column on its first 10 characters', () => {
    expect(diffStaffPatch(same, { ...current, date_of_birth: '1980-05-01T00:00:00' })).not.toHaveProperty(
      'date_of_birth',
    );
  });

  it('never emits institution_email', () => {
    expect(diffStaffPatch({ ...same, institutionEmailName: 'someone.else' }, current)).not.toHaveProperty(
      'institution_email',
    );
  });

  it('reports a cleared value as null', () => {
    expect(diffStaffPatch({ ...same, address: '' }, current)).toEqual({ address: null });
  });
});

describe('canFullEdit', () => {
  it('is true only for a driver in the Driver category', () => {
    expect(canFullEdit({ role_key: 'driver', category_id: DRIVER_CATEGORY_ID })).toBe(true);
    expect(canFullEdit({ role_key: 'driver', category_id: 'other' })).toBe(false);
    expect(canFullEdit({ role_key: 'faculty', category_id: DRIVER_CATEGORY_ID })).toBe(false);
    expect(canFullEdit({ role_key: null, category_id: DRIVER_CATEGORY_ID })).toBe(false);
    expect(canFullEdit({ role_key: 'driver', category_id: null })).toBe(false);
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Ravi@Gmail.COM ')).toBe('ravi@gmail.com');
  });
});
