import { describe, it, expect } from 'vitest';
import {
  STATUS_LABEL,
  displayStatus,
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

describe('STATUS_LABEL', () => {
  it('has plain labels', () => {
    expect(STATUS_LABEL).toEqual({ active: 'Active', on_leave: 'On leave', inactive: 'Inactive' });
  });
});
