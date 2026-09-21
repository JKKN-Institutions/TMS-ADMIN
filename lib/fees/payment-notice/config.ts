// The 48-hour payment notice switch, stored as one admin_settings row
// (setting_type 'fee_payment_notice') in the same way the scheduling settings
// are. "Go-live" is the moment an admin turns it on: enabled_at is stamped then,
// and every notice deadline is measured from it or from a later bill.

import type { SupabaseClient } from '@supabase/supabase-js';

export const FEE_NOTICE_SETTING_TYPE = 'fee_payment_notice';

export interface FeeNoticeConfig {
  enabled: boolean;
  windowHours: number;
  reminderHoursBefore: number;
  fineDueDays: number;
  /** ISO timestamp of the most recent switch-on. Null until first enabled. */
  enabledAt: string | null;
}

export const DEFAULT_FEE_NOTICE_CONFIG: FeeNoticeConfig = {
  enabled: false,
  windowHours: 48,
  reminderHoursBefore: 6,
  fineDueDays: 7,
  enabledAt: null,
};

const HOUR_MS = 3_600_000;

function intIn(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

export function parseFeeNoticeConfig(raw: unknown): FeeNoticeConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_FEE_NOTICE_CONFIG;
  const windowHours = intIn(r.window_hours, 1, 168, d.windowHours);
  const reminder = intIn(r.reminder_hours_before, 0, windowHours - 1, Math.min(d.reminderHoursBefore, windowHours - 1));
  const enabledAt =
    typeof r.enabled_at === 'string' && !Number.isNaN(Date.parse(r.enabled_at)) ? r.enabled_at : null;
  return {
    // A switch that is "on" without a go-live instant has nothing to measure from: treat as off.
    enabled: r.enabled === true && enabledAt !== null,
    windowHours,
    reminderHoursBefore: reminder,
    fineDueDays: intIn(r.fine_due_days, 0, 60, d.fineDueDays),
    enabledAt,
  };
}

export function toStoredFeeNoticeConfig(cfg: FeeNoticeConfig): Record<string, unknown> {
  return {
    enabled: cfg.enabled,
    window_hours: cfg.windowHours,
    reminder_hours_before: cfg.reminderHoursBefore,
    fine_due_days: cfg.fineDueDays,
    enabled_at: cfg.enabledAt,
  };
}

export function validateFeeNoticeInput(input: {
  windowHours: number;
  reminderHoursBefore: number;
  fineDueDays: number;
}): string | null {
  const { windowHours, reminderHoursBefore, fineDueDays } = input;
  if (!Number.isInteger(windowHours) || windowHours < 1 || windowHours > 168) {
    return 'Payment window must be a whole number of hours between 1 and 168';
  }
  if (!Number.isInteger(reminderHoursBefore) || reminderHoursBefore < 0 || reminderHoursBefore >= windowHours) {
    return 'Reminder must be a whole number of hours, less than the payment window';
  }
  if (!Number.isInteger(fineDueDays) || fineDueDays < 0 || fineDueDays > 60) {
    return 'Transport Fee due days must be a whole number between 0 and 60';
  }
  return null;
}

export async function loadFeeNoticeConfig(svc: SupabaseClient): Promise<FeeNoticeConfig> {
  try {
    const { data, error } = await svc
      .from('admin_settings')
      .select('settings_data')
      .eq('setting_type', FEE_NOTICE_SETTING_TYPE)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return { ...DEFAULT_FEE_NOTICE_CONFIG };
    return parseFeeNoticeConfig((data[0] as { settings_data: unknown }).settings_data);
  } catch {
    // Fail OFF: an unreadable switch must never start charging learners.
    return { ...DEFAULT_FEE_NOTICE_CONFIG };
  }
}

/** max(go-live, bill creation) + window, as an ISO timestamp. */
export function computeExpiry(enabledAt: string, billCreatedAt: string, windowHours: number): string {
  const from = Math.max(Date.parse(enabledAt), Date.parse(billCreatedAt));
  return new Date(from + windowHours * HOUR_MS).toISOString();
}

export function istDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
