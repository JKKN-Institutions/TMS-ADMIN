import { describe, it, expect } from 'vitest';
import { makeFakeSupabase } from '@/lib/fees/__testing__/fake-supabase';
import {
  parseRouteCheckFineConfig, validateRouteCheckFineInput, loadRouteCheckFineConfig, DEFAULT_ROUTE_CHECK_FINE_CONFIG,
} from './fine-config';

describe('parseRouteCheckFineConfig', () => {
  it('is OFF by default and for garbage', () => {
    expect(parseRouteCheckFineConfig(null)).toEqual(DEFAULT_ROUTE_CHECK_FINE_CONFIG);
    expect(parseRouteCheckFineConfig({ enabled: 'yes' }).enabled).toBe(false);
  });
  it('is ON only with enabled_at and both amounts', () => {
    const on = { enabled: true, enabled_at: '2026-09-23T00:00:00.000Z', unpaid_amount: 500, no_booking_amount: 200, fine_due_days: 7 };
    expect(parseRouteCheckFineConfig(on).enabled).toBe(true);
    expect(parseRouteCheckFineConfig({ ...on, enabled_at: null }).enabled).toBe(false);
    expect(parseRouteCheckFineConfig({ ...on, unpaid_amount: 0 }).enabled).toBe(false);
  });
});

describe('validateRouteCheckFineInput', () => {
  it('accepts whole rupees 1–100000 and due days 0–60', () => {
    expect(validateRouteCheckFineInput({ unpaidAmount: 500, noBookingAmount: 200, fineDueDays: 7 })).toBeNull();
    expect(validateRouteCheckFineInput({ unpaidAmount: 0, noBookingAmount: 200, fineDueDays: 7 })).toMatch(/Unpaid/);
    expect(validateRouteCheckFineInput({ unpaidAmount: 500, noBookingAmount: 12.5, fineDueDays: 7 })).toMatch(/No-booking/);
    expect(validateRouteCheckFineInput({ unpaidAmount: 500, noBookingAmount: 200, fineDueDays: 61 })).toMatch(/due days/);
  });
});

describe('loadRouteCheckFineConfig', () => {
  it('fails OFF when the row is missing', async () => {
    const svc = makeFakeSupabase({ admin_settings: [] });
    expect((await loadRouteCheckFineConfig(svc as never)).enabled).toBe(false);
  });
});
