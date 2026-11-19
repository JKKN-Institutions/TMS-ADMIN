/**
 * Validation and payload builders for a driver's person fields in the `staff`
 * table shared with MyJKKN. Pure: safe to import from server routes and from
 * 'use client' forms.
 */
import {
  BLOOD_GROUPS,
  DRIVER_CATEGORY_ID,
  DRIVER_INSTITUTION_ID,
  DRIVER_ROLE_KEY,
  GENDERS,
  INSTITUTION_EMAIL_SUFFIX,
  MARITAL_STATUSES,
  RELATIONSHIPS,
} from './onboarding-constants';

export { canFullEdit } from './onboarding-constants';

/** Raw camelCase form values; everything is a string except isActive. */
export interface DriverPersonInput {
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  maritalStatus: string;
  bloodGroup: string;
  phone: string;
  email: string;
  institutionEmailName: string; // the part before @jkkn.ac.in (create only)
  address: string;
  state: string;
  district: string;
  pincode: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactRelationshipOther: string;
  emergencyContactPhone: string;
  dateOfJoining: string;
  designation: string;
  biometricId: string;
  biometricInstitutionId: string;
  isActive: boolean;
}

export type FieldErrors = Partial<Record<keyof DriverPersonInput, string>>;

/** Snake_case staff columns TMS is allowed to write. */
export type StaffWritable = {
  first_name: string;
  last_name: string;
  gender: string;
  date_of_birth: string;
  marital_status: string;
  blood_group: string | null;
  phone: string;
  email: string;
  address: string | null;
  state: string;
  district: string;
  pincode: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_phone: string | null;
  date_of_joining: string;
  designation: string;
  biometric_id: string | null;
  biometric_institution_id: string | null;
  is_active: boolean;
};

const STRING_KEYS = [
  'firstName', 'lastName', 'gender', 'dateOfBirth', 'maritalStatus', 'bloodGroup',
  'phone', 'email', 'institutionEmailName', 'address', 'state', 'district', 'pincode',
  'emergencyContactName', 'emergencyContactRelationship', 'emergencyContactRelationshipOther',
  'emergencyContactPhone', 'dateOfJoining', 'designation', 'biometricId', 'biometricInstitutionId',
] as const satisfies readonly (keyof DriverPersonInput)[];

const NAME_PART = /^[a-z0-9._-]+$/;
const EMAIL = /^[^\s@*%,()]+@[^\s@*%,()]+\.[^\s@*%,()]+$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MIN_DATE_OF_BIRTH = '1900-01-01';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Today as YYYY-MM-DD in India, regardless of the server's timezone. */
function todayInIndia(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

function digitCount(s: string): number {
  return s.replace(/\D/g, '').length;
}

function isRealDate(s: string): boolean {
  if (!DATE_ONLY.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function blankToNull(s: string): string | null {
  const t = s.trim();
  return t === '' ? null : t;
}

export function validatePerson(
  input: unknown,
  mode: 'create' | 'edit',
  today: string = todayInIndia(),
): { ok: true; value: DriverPersonInput } | { ok: false; errors: FieldErrors } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: { firstName: 'Fill in the form and try again' } };
  }
  const raw = input as Record<string, unknown>;

  // Whitelist: read only the known keys, trimmed.
  // isActive is never defaulted: a silent default could re-activate a deactivated driver on edit.
  const v = { isActive: raw.isActive === true } as DriverPersonInput;
  for (const k of STRING_KEYS) {
    const x = raw[k];
    v[k] = typeof x === 'string' ? x.trim() : '';
  }
  if (mode === 'create') v.institutionEmailName = v.institutionEmailName.toLowerCase();
  else v.institutionEmailName = '';

  const errors: FieldErrors = {};

  if (typeof raw.isActive !== 'boolean') errors.isActive = 'Choose whether the driver is active';

  if (v.firstName.length < 2) errors.firstName = 'First name needs at least 2 letters';
  if (v.lastName.length < 1) errors.lastName = 'Last name is required';
  if (!(GENDERS as readonly string[]).includes(v.gender)) errors.gender = 'Choose a gender from the list';
  if (!(MARITAL_STATUSES as readonly string[]).includes(v.maritalStatus)) {
    errors.maritalStatus = 'Choose a marital status from the list';
  }
  if (v.bloodGroup !== '' && !(BLOOD_GROUPS as readonly string[]).includes(v.bloodGroup)) {
    errors.bloodGroup = 'Choose a blood group from the list';
  }

  if (!isRealDate(v.dateOfBirth)) errors.dateOfBirth = 'Enter a valid date of birth';
  else if (v.dateOfBirth < MIN_DATE_OF_BIRTH) {
    errors.dateOfBirth = 'Date of birth looks too old — check the year';
  } else if (v.dateOfBirth > today) {
    errors.dateOfBirth = 'Date of birth cannot be in the future';
  }
  if (!isRealDate(v.dateOfJoining)) errors.dateOfJoining = 'Enter a valid joining date';
  else if (v.dateOfJoining > today) errors.dateOfJoining = 'Joining date cannot be in the future';

  if (digitCount(v.phone) < 10) errors.phone = 'Phone number needs at least 10 digits';

  if (mode === 'create') {
    if (v.institutionEmailName === '') {
      errors.institutionEmailName = 'Enter the institution email name';
    } else if (!NAME_PART.test(v.institutionEmailName)) {
      errors.institutionEmailName = `Type only the name part, without ${INSTITUTION_EMAIL_SUFFIX}`;
    }
  }

  if (v.email !== '' && !EMAIL.test(v.email)) errors.email = 'Enter a valid email address';

  if (v.state === '') errors.state = 'State is required';
  if (v.district === '') errors.district = 'District is required';
  if (v.pincode !== '' && !/^\d+$/.test(v.pincode)) errors.pincode = 'Pincode can have digits only';

  if (v.designation.length < 2) errors.designation = 'Designation needs at least 2 letters';

  const anyEmergency =
    v.emergencyContactName !== '' || v.emergencyContactRelationship !== '' || v.emergencyContactPhone !== '';
  if (anyEmergency) {
    if (v.emergencyContactName === '') errors.emergencyContactName = 'Enter the emergency contact name';
    if (digitCount(v.emergencyContactPhone) < 10) {
      errors.emergencyContactPhone = 'Emergency contact phone needs at least 10 digits';
    }
    if (
      v.emergencyContactRelationship !== '' &&
      !(RELATIONSHIPS as readonly string[]).includes(v.emergencyContactRelationship)
    ) {
      errors.emergencyContactRelationship = 'Choose a relationship from the list';
    } else if (v.emergencyContactRelationship === 'Other' && v.emergencyContactRelationshipOther === '') {
      errors.emergencyContactRelationshipOther = 'Type how this person is related';
    }
  }

  if (v.biometricId !== '' && v.biometricInstitutionId === '') {
    errors.biometricInstitutionId = 'Choose the biometric machine';
  } else if (v.biometricId === '' && v.biometricInstitutionId !== '') {
    errors.biometricId = 'Enter the biometric code';
  }
  if (v.biometricInstitutionId !== '' && !UUID.test(v.biometricInstitutionId)) {
    errors.biometricInstitutionId = 'Choose a biometric machine from the list';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: v };
}

/** Normalised snake_case columns; blanks become null where the column allows it. */
export function toStaffColumns(v: DriverPersonInput): StaffWritable {
  const hasEmergency =
    v.emergencyContactName.trim() !== '' ||
    v.emergencyContactRelationship.trim() !== '' ||
    v.emergencyContactPhone.trim() !== '';
  const relationship =
    v.emergencyContactRelationship.trim() === 'Other'
      ? blankToNull(v.emergencyContactRelationshipOther)
      : blankToNull(v.emergencyContactRelationship);
  const hasBiometric = v.biometricId.trim() !== '' && v.biometricInstitutionId.trim() !== '';

  return {
    first_name: v.firstName.trim(),
    last_name: v.lastName.trim(),
    gender: v.gender.trim(),
    date_of_birth: v.dateOfBirth.trim(),
    marital_status: v.maritalStatus.trim(),
    blood_group: blankToNull(v.bloodGroup),
    phone: v.phone.trim(),
    email: normalizeEmail(v.email),
    address: blankToNull(v.address),
    state: v.state.trim(),
    district: v.district.trim(),
    pincode: blankToNull(v.pincode),
    emergency_contact_name: hasEmergency ? blankToNull(v.emergencyContactName) : null,
    emergency_contact_relationship: hasEmergency ? relationship : null,
    emergency_contact_phone: hasEmergency ? blankToNull(v.emergencyContactPhone) : null,
    date_of_joining: v.dateOfJoining.trim(),
    designation: v.designation.trim(),
    biometric_id: hasBiometric ? v.biometricId.trim() : null,
    biometric_institution_id: hasBiometric ? v.biometricInstitutionId.trim() : null,
    is_active: v.isActive,
  };
}

export function buildStaffInsert(
  v: DriverPersonInput,
  actorId: string,
): StaffWritable & {
  institution_email: string;
  institution_id: string;
  category_id: string;
  role_key: string;
  department_id: null;
  login_enabled: true;
  created_by: string;
  updated_by: string;
} {
  const cols = toStaffColumns(v);
  const institutionEmail = `${v.institutionEmailName.trim().toLowerCase()}${INSTITUTION_EMAIL_SUFFIX}`;
  return {
    ...cols,
    email: cols.email === '' ? institutionEmail : cols.email,
    institution_email: institutionEmail,
    institution_id: DRIVER_INSTITUTION_ID,
    category_id: DRIVER_CATEGORY_ID,
    role_key: DRIVER_ROLE_KEY,
    department_id: null,
    login_enabled: true,
    created_by: actorId,
    updated_by: actorId,
  };
}

const DATE_COLUMNS = new Set<string>(['date_of_birth', 'date_of_joining']);

function normalizeCurrent(column: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    if (t === '') return null;
    return DATE_COLUMNS.has(column) ? t.slice(0, 10) : t;
  }
  return value;
}

/** Only the columns whose normalised value differs from the stored row. */
export function diffStaffPatch(v: DriverPersonInput, current: Record<string, unknown>): Partial<StaffWritable> {
  const next = toStaffColumns(v) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(next)) {
    // A blank email never overwrites the stored one.
    if (column === 'email' && value === '') continue;
    const normalizedNext = value === '' ? null : value;
    if (normalizedNext !== normalizeCurrent(column, current[column])) patch[column] = normalizedNext;
  }
  return patch as Partial<StaffWritable>;
}
