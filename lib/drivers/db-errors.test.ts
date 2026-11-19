import { describe, it, expect } from 'vitest';
import { translateStaffDbError } from './db-errors';

describe('translateStaffDbError', () => {
  it('maps a duplicate personal email to 409 on email', () => {
    expect(
      translateStaffDbError({ code: '23505', message: 'duplicate key value violates unique constraint "staff_email_key"' }),
    ).toEqual({
      status: 409,
      field: 'email',
      error: 'This personal email is already used by another team member.',
    });
  });

  it('maps a duplicate institution email (staff constraint) to 409 on institutionEmailName', () => {
    expect(
      translateStaffDbError({ code: '23505', message: 'violates unique constraint "staff_institution_email_key"' }),
    ).toEqual({
      status: 409,
      field: 'institutionEmailName',
      error: 'This institution email already belongs to someone in MyJKKN.',
    });
  });

  it('maps a duplicate institution email (profiles constraint) to 409 on institutionEmailName', () => {
    const r = translateStaffDbError({ code: '23505', message: 'violates unique constraint "profiles_email_key"' });
    expect(r.status).toBe(409);
    expect(r.field).toBe('institutionEmailName');
  });

  it('maps a duplicate biometric code to 409 on biometricId', () => {
    expect(translateStaffDbError({ code: '23505', message: 'violates unique constraint "staff_biometric_uq"' })).toEqual({
      status: 409,
      field: 'biometricId',
      error: 'This biometric code is already used on that machine.',
    });
  });

  it.each(['P0001', '42501', '55000', '23514'])('passes the database message through as 422 for code %s', (code) => {
    expect(translateStaffDbError({ code, message: 'Human written refusal' })).toEqual({
      status: 422,
      error: 'Human written refusal',
    });
  });

  it('passes through a message that begins "This person is a hire"', () => {
    const msg = 'This person is a hire in progress and cannot be edited here.';
    expect(translateStaffDbError({ message: msg })).toEqual({ status: 422, error: msg });
  });

  it('falls back to a generic 500 for anything else', () => {
    expect(translateStaffDbError({ code: '22P02', message: 'invalid input syntax' })).toEqual({
      status: 500,
      error: 'Failed to save the team member record.',
    });
    expect(translateStaffDbError({})).toEqual({ status: 500, error: 'Failed to save the team member record.' });
  });

  it('does not treat an unknown 23505 as a field error', () => {
    expect(translateStaffDbError({ code: '23505', message: 'violates "something_else"' }).status).toBe(500);
  });
});
