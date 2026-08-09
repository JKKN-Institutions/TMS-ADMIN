import type { SupabaseClient } from '@supabase/supabase-js';

/** Effective, normalized scheduling config consumed by the booking gate + reminders. */
export interface SchedulingConfig {
  enableBookingTimeWindow: boolean;
  cutoffHour: number;         // 0..23 IST (from stored bookingWindowEndHour)
  daysAhead: number;          // 1..14 (from stored bookingDaysAhead)
  autoNotifyPassengers: boolean;
  autoGenerateBills: boolean;
}

export const DEFAULT_SCHEDULING_CONFIG: SchedulingConfig = {
  enableBookingTimeWindow: true,
  cutoffHour: 20,
  daysAhead: 6,
  autoNotifyPassengers: true,
  autoGenerateBills: false,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Pure: normalize a stored settings_data blob into a SchedulingConfig (defaults + clamps). */
export function parseSchedulingConfig(raw: unknown): SchedulingConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SCHEDULING_CONFIG };
  const b = raw as Record<string, unknown>;
  return {
    enableBookingTimeWindow: boolOr(b.enableBookingTimeWindow, DEFAULT_SCHEDULING_CONFIG.enableBookingTimeWindow),
    cutoffHour: clampInt(b.bookingWindowEndHour, 0, 23, DEFAULT_SCHEDULING_CONFIG.cutoffHour),
    daysAhead: clampInt(b.bookingDaysAhead, 1, 14, DEFAULT_SCHEDULING_CONFIG.daysAhead),
    autoNotifyPassengers: boolOr(b.autoNotifyPassengers, DEFAULT_SCHEDULING_CONFIG.autoNotifyPassengers),
    autoGenerateBills: boolOr(b.autoGenerateBills, DEFAULT_SCHEDULING_CONFIG.autoGenerateBills),
  };
}

/**
 * Map an effective SchedulingConfig to the WindowOpts the booking libraries take.
 * When the daily time-window is disabled we pass hour 24 — a deliberate sentinel that
 * makes cutoffFor() land on 00:00 IST of the travel date, i.e. booking stays open
 * through the whole prior day. The horizon / Sunday / service-calendar gates are
 * unaffected: daysAhead is always passed through unchanged.
 */
export function toWindowOpts(cfg: SchedulingConfig): { cutoffHour: number; daysAhead: number } {
  return {
    cutoffHour: cfg.enableBookingTimeWindow ? cfg.cutoffHour : 24,
    daysAhead: cfg.daysAhead,
  };
}

/**
 * Load the effective scheduling config from admin_settings (setting_type='scheduling').
 * Service-role only; falls back to defaults if the row/table is missing or malformed.
 */
export async function loadSchedulingConfig(svc: SupabaseClient): Promise<SchedulingConfig> {
  try {
    const { data, error } = await svc
      .from('admin_settings')
      .select('settings_data')
      .eq('setting_type', 'scheduling')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return { ...DEFAULT_SCHEDULING_CONFIG };
    return parseSchedulingConfig((data[0] as { settings_data: unknown }).settings_data);
  } catch {
    return { ...DEFAULT_SCHEDULING_CONFIG };
  }
}
