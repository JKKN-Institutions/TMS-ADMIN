import { describe, it, expect } from 'vitest';
import { classifyRider, parseRiderKind, RIDER_KIND_LABEL } from './rider-kind';

describe('classifyRider', () => {
  it('is transport only when bus_required AND an allocated route', () => {
    expect(classifyRider({ busRequired: true, allocatedRouteId: 'r1', inHostel: false })).toBe('transport');
    expect(classifyRider({ busRequired: true, allocatedRouteId: null, inHostel: false })).toBe('non_transport');
    expect(classifyRider({ busRequired: false, allocatedRouteId: 'r1', inHostel: false })).toBe('non_transport');
  });

  it('a registered hosteller counts as transport', () => {
    expect(classifyRider({ busRequired: true, allocatedRouteId: 'r1', inHostel: true })).toBe('transport');
  });

  it('an unregistered hosteller is a hosteller, not irregular', () => {
    expect(classifyRider({ busRequired: false, allocatedRouteId: null, inHostel: true })).toBe('hosteller');
    expect(classifyRider({ busRequired: null, allocatedRouteId: null, inHostel: true })).toBe('hosteller');
  });

  it('everyone else is non_transport', () => {
    expect(classifyRider({ busRequired: null, allocatedRouteId: null, inHostel: false })).toBe('non_transport');
  });
});

describe('parseRiderKind / labels', () => {
  it('accepts only the three values', () => {
    expect(parseRiderKind('hosteller')).toBe('hosteller');
    expect(parseRiderKind('transport')).toBe('transport');
    expect(parseRiderKind('non_transport')).toBe('non_transport');
    expect(parseRiderKind('HOSTEL')).toBeNull();
    expect(parseRiderKind(null)).toBeNull();
  });

  it('uses the owner-approved labels', () => {
    expect(RIDER_KIND_LABEL).toEqual({ transport: 'Transport', hosteller: 'Hostel', non_transport: 'Irregular' });
  });
});
