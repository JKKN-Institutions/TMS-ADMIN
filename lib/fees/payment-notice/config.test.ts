import { describe, it, expect } from 'vitest';
import {
  parseFeeNoticeConfig, toStoredFeeNoticeConfig, validateFeeNoticeInput,
  computeExpiry, istDate, addDays, DEFAULT_FEE_NOTICE_CONFIG,
} from './config';

describe('parseFeeNoticeConfig', () => {
  it('defaults to off with 48/6/7 when nothing is stored', () => {
    expect(parseFeeNoticeConfig(null)).toEqual(DEFAULT_FEE_NOTICE_CONFIG);
    expect(DEFAULT_FEE_NOTICE_CONFIG).toEqual({
      enabled: false, windowHours: 48, reminderHoursBefore: 6, fineDueDays: 7, enabledAt: null,
    });
  });

  it('reads snake_case keys', () => {
    expect(parseFeeNoticeConfig({
      enabled: true, window_hours: 24, reminder_hours_before: 3, fine_due_days: 10,
      enabled_at: '2026-09-22T04:30:00.000Z',
    })).toEqual({
      enabled: true, windowHours: 24, reminderHoursBefore: 3, fineDueDays: 10,
      enabledAt: '2026-09-22T04:30:00.000Z',
    });
  });

  it('falls back per field on junk, and treats enabled without enabled_at as off', () => {
    expect(parseFeeNoticeConfig({ enabled: true, window_hours: 'x', fine_due_days: -1 })).toEqual(
      DEFAULT_FEE_NOTICE_CONFIG,
    );
  });

  it('round-trips through the stored shape', () => {
    const cfg = { enabled: true, windowHours: 48, reminderHoursBefore: 6, fineDueDays: 7, enabledAt: '2026-09-22T00:00:00.000Z' };
    expect(parseFeeNoticeConfig(toStoredFeeNoticeConfig(cfg))).toEqual(cfg);
  });
});

describe('validateFeeNoticeInput', () => {
  it('accepts the defaults', () => {
    expect(validateFeeNoticeInput({ windowHours: 48, reminderHoursBefore: 6, fineDueDays: 7 })).toBeNull();
  });
  it('rejects a reminder that is not inside the window', () => {
    expect(validateFeeNoticeInput({ windowHours: 6, reminderHoursBefore: 6, fineDueDays: 7 })).toMatch(/reminder/i);
  });
  it('rejects out-of-range values', () => {
    expect(validateFeeNoticeInput({ windowHours: 0, reminderHoursBefore: 0, fineDueDays: 7 })).toMatch(/window/i);
    expect(validateFeeNoticeInput({ windowHours: 48, reminderHoursBefore: 6, fineDueDays: 61 })).toMatch(/due/i);
  });
});

describe('computeExpiry', () => {
  it('counts from go-live for bills created before it', () => {
    expect(computeExpiry('2026-09-22T04:30:00.000Z', '2026-07-01T00:00:00.000Z', 48))
      .toBe('2026-09-24T04:30:00.000Z');
  });
  it('counts from bill creation for bills created after go-live', () => {
    expect(computeExpiry('2026-09-22T04:30:00.000Z', '2026-09-25T10:00:00.000Z', 48))
      .toBe('2026-09-27T10:00:00.000Z');
  });
});

describe('IST dates', () => {
  it('istDate uses the Asia/Kolkata calendar day', () => {
    expect(istDate('2026-09-23T19:00:00.000Z')).toBe('2026-09-24'); // 00:30 IST next day
    expect(istDate('2026-09-23T18:00:00.000Z')).toBe('2026-09-23'); // 23:30 IST
  });
  it('addDays crosses month ends', () => {
    expect(addDays('2026-09-27', 7)).toBe('2026-10-04');
  });
});
