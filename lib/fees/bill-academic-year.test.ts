import { describe, it, expect } from 'vitest';
import {
  academicYearByInstitution,
  resolveBillAcademicYear,
  type AcademicYearLite,
} from './bill-academic-year';

const ROWS: AcademicYearLite[] = [
  { id: 'ay-eng-26', institution_id: 'eng', academic_year_name: '2026-2027' },
  { id: 'ay-eng-25', institution_id: 'eng', academic_year_name: '2025-2026' },
  { id: 'ay-pha-26', institution_id: 'pharmacy', academic_year_name: '2026-2027' },
  { id: 'ay-orphan', institution_id: null, academic_year_name: '2026-2027' },
  { id: 'ay-noname', institution_id: 'dental', academic_year_name: null },
];

describe('academicYearByInstitution', () => {
  it('keeps only the rows named after the transport year', () => {
    const m = academicYearByInstitution(ROWS, '2026-2027');
    expect(m.get('eng')).toBe('ay-eng-26');
    expect(m.get('pharmacy')).toBe('ay-pha-26');
  });

  it('skips rows with no institution or no name', () => {
    const m = academicYearByInstitution(ROWS, '2026-2027');
    expect(m.size).toBe(2);
    expect(m.get('dental')).toBeUndefined();
  });

  it('is empty when the transport year has no name', () => {
    expect(academicYearByInstitution(ROWS, null).size).toBe(0);
    expect(academicYearByInstitution(ROWS, '').size).toBe(0);
  });

  it('prefers the first row when an institution has the name twice', () => {
    const dupes: AcademicYearLite[] = [
      { id: 'first', institution_id: 'eng', academic_year_name: '2026-2027' },
      { id: 'second', institution_id: 'eng', academic_year_name: '2026-2027' },
    ];
    expect(academicYearByInstitution(dupes, '2026-2027').get('eng')).toBe('first');
  });
});

describe('resolveBillAcademicYear', () => {
  const byInst = academicYearByInstitution(ROWS, '2026-2027');

  it('uses the transport year, not the learner stale profile year', () => {
    expect(resolveBillAcademicYear(byInst, 'eng', 'ay-eng-25')).toBe('ay-eng-26');
  });

  it('falls back to the profile year when the institution has no row', () => {
    expect(resolveBillAcademicYear(byInst, 'dental', 'ay-dental-25')).toBe('ay-dental-25');
  });

  it('falls back to the profile year when the learner has no institution', () => {
    expect(resolveBillAcademicYear(byInst, null, 'ay-eng-25')).toBe('ay-eng-25');
  });

  it('returns null when neither source resolves', () => {
    expect(resolveBillAcademicYear(byInst, 'dental', null)).toBeNull();
    expect(resolveBillAcademicYear(new Map(), null, undefined)).toBeNull();
  });
});
