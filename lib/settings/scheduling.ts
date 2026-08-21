import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * How hard the in-charge attendance enforcement cron acts on its own findings.
 * `shadow` evaluates and persists strikes but notifies nobody and removes
 * nobody, so the admin dashboard accumulates real data before anyone is
 * punished. Distinct from the route's `dryRun` flag, which persists nothing.
 */
export type InchargeEnforcementMode = 'off' | 'shadow' | 'enforce';

const ENFORCEMENT_MODES: readonly InchargeEnforcementMode[] = ['off', 'shadow', 'enforce'];

/** Effective, normalized scheduling config consumed by the booking gate + reminders. */
export interface SchedulingConfig {
  enableBookingTimeWindow: boolean;
  cutoffHour: number;         // 0..23 IST (from stored bookingWindowEndHour)
  daysAhead: number;          // 1..10 WORKING days (from stored bookingDaysAhead)
  /**
   * Opt-in: also let learners book TODAY. Ships OFF so the live window is
   * unchanged until an admin turns it on.
   */
  allowSameDayBooking: boolean;
  /** Deadline hour (IST) on the travel date itself for same-day bookings. */
  sameDayCutoffHour: number;  // 0..23 IST (from stored sameDayBookingCutoffHour)
  autoNotifyPassengers: boolean;
  /** Master switch for the automatic bill generation sweep. Opt-in. */
  autoGenerateBills: boolean;
  /** Master switch for in-charge attendance enforcement. Ships in shadow. */
  inchargeEnforcementMode: InchargeEnforcementMode;
  /**
   * Score in-charge attendance against each staffer's OWN share rather than
   * the route as a whole. Ships OFF: per-share scoring is strictly stricter
   * than the route-level rule, so enabling it while inchargeEnforcementMode is
   * 'enforce' bills more people, not fewer. Two independent flags must both be
   * on before any money moves.
   */
  inchargeShareScoringEnabled: boolean;
}

export const DEFAULT_SCHEDULING_CONFIG: SchedulingConfig = {
  enableBookingTimeWindow: true,
  cutoffHour: 20,
  daysAhead: 1,
  allowSameDayBooking: false,
  sameDayCutoffHour: 6,
  autoNotifyPassengers: true,
  autoGenerateBills: false,
  inchargeEnforcementMode: 'shadow',
  inchargeShareScoringEnabled: false,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

// An unrecognised value must never read as 'enforce' — punitive action is
// opt-in, so anything unexpected falls back to the safe shadow default.
function enforcementModeOr(value: unknown, fallback: InchargeEnforcementMode): InchargeEnforcementMode {
  return ENFORCEMENT_MODES.includes(value as InchargeEnforcementMode)
    ? (value as InchargeEnforcementMode)
    : fallback;
}

/** Pure: normalize a stored settings_data blob into a SchedulingConfig (defaults + clamps). */
export function parseSchedulingConfig(raw: unknown): SchedulingConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SCHEDULING_CONFIG };
  const b = raw as Record<string, unknown>;
  return {
    enableBookingTimeWindow: boolOr(b.enableBookingTimeWindow, DEFAULT_SCHEDULING_CONFIG.enableBookingTimeWindow),
    cutoffHour: clampInt(b.bookingWindowEndHour, 0, 23, DEFAULT_SCHEDULING_CONFIG.cutoffHour),
    daysAhead: clampInt(b.bookingDaysAhead, 1, 10, DEFAULT_SCHEDULING_CONFIG.daysAhead),
    allowSameDayBooking: boolOr(b.allowSameDayBooking, DEFAULT_SCHEDULING_CONFIG.allowSameDayBooking),
    sameDayCutoffHour: clampInt(b.sameDayBookingCutoffHour, 0, 23, DEFAULT_SCHEDULING_CONFIG.sameDayCutoffHour),
    autoNotifyPassengers: boolOr(b.autoNotifyPassengers, DEFAULT_SCHEDULING_CONFIG.autoNotifyPassengers),
    autoGenerateBills: boolOr(b.autoGenerateBills, DEFAULT_SCHEDULING_CONFIG.autoGenerateBills),
    inchargeEnforcementMode: enforcementModeOr(
      b.inchargeEnforcementMode,
      DEFAULT_SCHEDULING_CONFIG.inchargeEnforcementMode,
    ),
    inchargeShareScoringEnabled: boolOr(
      b.inchargeShareScoringEnabled,
      DEFAULT_SCHEDULING_CONFIG.inchargeShareScoringEnabled,
    ),
  };
}

/**
 * Map an effective SchedulingConfig to the WindowOpts the booking libraries take.
 * When the daily time-window is disabled we pass hour 24 — a deliberate sentinel that
 * makes cutoffFor() land on 00:00 IST of the travel date, i.e. booking stays open
 * through the whole prior day. The horizon / Sunday / service-calendar gates are
 * unaffected: daysAhead — now a count of WORKING days — is always passed through
 * unchanged.
 *
 * The same 24 sentinel applies to the same-day deadline: with the daily time window
 * off, today stays bookable through the end of the day rather than being clipped at
 * an hour the admin has explicitly disabled.
 */
export function toWindowOpts(cfg: SchedulingConfig): {
  cutoffHour: number;
  daysAhead: number;
  allowSameDay: boolean;
  sameDayCutoffHour: number;
} {
  return {
    cutoffHour: cfg.enableBookingTimeWindow ? cfg.cutoffHour : 24,
    daysAhead: cfg.daysAhead,
    allowSameDay: cfg.allowSameDayBooking,
    sameDayCutoffHour: cfg.enableBookingTimeWindow ? cfg.sameDayCutoffHour : 24,
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
