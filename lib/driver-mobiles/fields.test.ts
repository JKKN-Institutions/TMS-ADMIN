import { describe, it, expect } from 'vitest';
import { buildDriverMobilePayload } from './fields';

describe('buildDriverMobilePayload', () => {
  it('trims text and drops unknown keys', () => {
    const out = buildDriverMobilePayload({ brand: '  Samsung  ', hacker: 'x' });
    expect(out.brand).toBe('Samsung');
    expect('hacker' in out).toBe(false);
  });

  it('clamps status to the allowed enum, else defaults to "assigned" (NOT NULL column)', () => {
    expect(buildDriverMobilePayload({ status: 'DAMAGED' }).status).toBe('damaged');
    expect(buildDriverMobilePayload({ status: 'bogus' }).status).toBe('assigned');
  });

  it('defaults status to "assigned" on create when the key is present but empty', () => {
    expect(buildDriverMobilePayload({ status: '' }).status).toBe('assigned');
  });

  it('coerces purchase_cost to a number, invalid → null', () => {
    expect(buildDriverMobilePayload({ purchase_cost: '12999.50' }).purchase_cost).toBe(12999.5);
    expect(buildDriverMobilePayload({ purchase_cost: 'abc' }).purchase_cost).toBe(null);
  });

  it('is a partial builder: only present keys are included', () => {
    const out = buildDriverMobilePayload({ color: 'Black' });
    expect(Object.keys(out)).toEqual(['color']);
  });

  it('passes driver_staff_id through as a uuid string, empty → null', () => {
    expect(buildDriverMobilePayload({ driver_staff_id: 'abc-123' }).driver_staff_id).toBe('abc-123');
    expect(buildDriverMobilePayload({ driver_staff_id: '' }).driver_staff_id).toBe(null);
  });

  it('passes route_id through as a uuid string, empty → null', () => {
    expect(buildDriverMobilePayload({ route_id: 'route-9' }).route_id).toBe('route-9');
    expect(buildDriverMobilePayload({ route_id: '' }).route_id).toBe(null);
  });
});
