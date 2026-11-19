/**
 * Translates a Postgres/PostgREST error from a `staff` write into an HTTP status
 * and a message a person can act on. Pure: no server-only imports.
 */
import type { DriverPersonInput } from './staff-fields';

export interface StaffDbError {
  code?: string;
  message?: string;
  details?: string;
}

export interface TranslatedStaffError {
  status: number;
  error: string;
  field?: keyof DriverPersonInput;
}

/** Codes MyJKKN's triggers and policies use for their own human-written refusals. */
const REFUSAL_CODES = new Set(['P0001', '42501', '55000', '23514']);

/** Machine-generated Postgres wording; never shown to a person. */
const MACHINE_TEXT = [
  'violates check constraint',
  'violates row-level security',
  'violates foreign key constraint',
  'violates not-null constraint',
];

export function translateStaffDbError(err: StaffDbError): TranslatedStaffError {
  const code = err.code ?? '';
  const message = err.message ?? '';
  const haystack = `${message} ${err.details ?? ''}`;

  if (code === '23505') {
    if (haystack.includes('staff_email_key')) {
      return { status: 409, field: 'email', error: 'This personal email is already used by another team member.' };
    }
    if (haystack.includes('staff_institution_email_key') || haystack.includes('profiles_email')) {
      return {
        status: 409,
        field: 'institutionEmailName',
        error: 'This institution email already belongs to someone in MyJKKN.',
      };
    }
    if (haystack.includes('staff_biometric_uq')) {
      return { status: 409, field: 'biometricId', error: 'This biometric code is already used on that machine.' };
    }
  }

  if (MACHINE_TEXT.some((t) => message.includes(t))) {
    return { status: 500, error: 'Failed to save the team member record.' };
  }

  if ((REFUSAL_CODES.has(code) || message.startsWith('This person is a hire')) && message !== '') {
    return { status: 422, error: message };
  }

  return { status: 500, error: 'Failed to save the team member record.' };
}
