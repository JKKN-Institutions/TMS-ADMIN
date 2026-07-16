import { describe, it, expect } from 'vitest';
import { deriveBoardingAccess } from './access-state';

describe('deriveBoardingAccess', () => {
  it('opens the portal when the staffer is assigned and permitted', () => {
    expect(deriveBoardingAccess({
      allowed: true, eligible: true, assignedRouteCount: 1, hasRoute: true,
    })).toBe('allowed');
  });

  it('opens the portal for a super admin (allowed without eligibility)', () => {
    expect(deriveBoardingAccess({
      allowed: true, eligible: false, assignedRouteCount: 0, hasRoute: false,
    })).toBe('allowed');
  });

  it('offers the toggle to an eligible, unassigned staffer with a route', () => {
    expect(deriveBoardingAccess({
      allowed: false, eligible: true, assignedRouteCount: 0, hasRoute: true,
    })).toBe('choose');
  });

  it('denies an eligible staffer whose route is not allocated', () => {
    expect(deriveBoardingAccess({
      allowed: false, eligible: true, assignedRouteCount: 0, hasRoute: false,
    })).toBe('denied');
  });

  it('denies an assigned staffer who lacks the scan permission (failed role grant)', () => {
    // Must NOT be 'choose' — they already have an assignment, so offering the
    // toggle would invite a confirm the server rejects with 409.
    expect(deriveBoardingAccess({
      allowed: false, eligible: true, assignedRouteCount: 1, hasRoute: true,
    })).toBe('denied');
  });

  it('denies a non-eligible user', () => {
    expect(deriveBoardingAccess({
      allowed: false, eligible: false, assignedRouteCount: 0, hasRoute: true,
    })).toBe('denied');
  });
});
