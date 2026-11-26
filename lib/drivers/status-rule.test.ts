import { describe, it, expect } from 'vitest';
import {
  STATUS_LABEL,
  displayStatus,
  driverChoices,
  employeeActiveFor,
  isAssignable,
  normalizeDriverStatus,
} from './status-rule';

const ops = (driverStatus: string) => ({ driverStatus });

describe('normalizeDriverStatus', () => {
  it('keeps the three known statuses', () => {
    expect(normalizeDriverStatus('active')).toBe('active');
    expect(normalizeDriverStatus('on_leave')).toBe('on_leave');
    expect(normalizeDriverStatus('inactive')).toBe('inactive');
  });
  it.each(['x', '', null, undefined, 5, 'INACTIVE'])('treats %j as active', (v) => {
    expect(normalizeDriverStatus(v)).toBe('active');
  });
});

describe('employeeActiveFor', () => {
  it('is false only for inactive', () => {
    expect(employeeActiveFor('active')).toBe(true);
    expect(employeeActiveFor('on_leave')).toBe(true);
    expect(employeeActiveFor('inactive')).toBe(false);
  });
});

describe('displayStatus', () => {
  it('is inactive whenever the employee is inactive, whatever TMS stored', () => {
    expect(displayStatus({ isActive: false, ops: ops('active') })).toBe('inactive');
    expect(displayStatus({ isActive: false, ops: ops('on_leave') })).toBe('inactive');
    expect(displayStatus({ isActive: false, ops: null })).toBe('inactive');
  });
  it('follows the TMS status for an active employee', () => {
    expect(displayStatus({ isActive: true, ops: ops('active') })).toBe('active');
    expect(displayStatus({ isActive: true, ops: ops('on_leave') })).toBe('on_leave');
    expect(displayStatus({ isActive: true, ops: ops('inactive') })).toBe('inactive');
  });
  it('is active for an active employee with no transport details', () => {
    expect(displayStatus({ isActive: true, ops: null })).toBe('active');
  });
});

describe('isAssignable', () => {
  it('is false for either kind of inactive', () => {
    expect(isAssignable({ isActive: false, ops: ops('active') })).toBe(false);
    expect(isAssignable({ isActive: true, ops: ops('inactive') })).toBe(false);
  });
  it('is true for active and on leave', () => {
    expect(isAssignable({ isActive: true, ops: ops('active') })).toBe(true);
    expect(isAssignable({ isActive: true, ops: ops('on_leave') })).toBe(true);
    expect(isAssignable({ isActive: true, ops: null })).toBe(true);
  });
});

describe('driverChoices', () => {
  const A = { id: 'a', name: 'Anbu', isActive: true, ops: ops('active') };
  const L = { id: 'l', name: 'Latha', isActive: true, ops: ops('on_leave') };
  const X = { id: 'x', name: 'Xavier', isActive: false, ops: ops('active') };

  it('offers only drivers who are not inactive', () => {
    expect(driverChoices([A, L, X]).map((d) => d.id)).toEqual(['a', 'l']);
  });
  it('keeps the inactive driver who is already chosen, and says so', () => {
    const out = driverChoices([A, X], 'x');
    expect(out.map((d) => d.label)).toEqual(['Anbu', 'Xavier (inactive)']);
  });
  it('does not keep an inactive driver for an empty or different choice', () => {
    expect(driverChoices([A, X], '').map((d) => d.id)).toEqual(['a']);
    expect(driverChoices([A, X], 'a').map((d) => d.id)).toEqual(['a']);
  });
  it('keeps the other fields of each driver', () => {
    expect(driverChoices([{ ...A, phone: '9' }])[0]).toMatchObject({ id: 'a', phone: '9', label: 'Anbu' });
  });
});

describe('STATUS_LABEL', () => {
  it('has plain labels', () => {
    expect(STATUS_LABEL).toEqual({ active: 'Active', on_leave: 'On leave', inactive: 'Inactive' });
  });
});
