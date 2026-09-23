// Bus Inspection automatic-fine switch + amounts: one admin_settings row
// (setting_type 'route_check_fines'), the same shape as the 48h fee notice.
// Fail OFF: an unreadable or half-configured switch never charges anyone.
import type { SupabaseClient } from '@supabase/supabase-js';

export const ROUTE_CHECK_FINE_SETTING_TYPE = 'route_check_fines';

export interface RouteCheckFineConfig {
  enabled: boolean;
  unpaidAmount: number;
  noBookingAmount: number;
  fineDueDays: number;
  enabledAt: string | null;
}

export const DEFAULT_ROUTE_CHECK_FINE_CONFIG: RouteCheckFineConfig = {
  enabled: false, unpaidAmount: 0, noBookingAmount: 0, fineDueDays: 7, enabledAt: null,
};

function intIn(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

export function parseRouteCheckFineConfig(raw: unknown): RouteCheckFineConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const unpaidAmount = intIn(r.unpaid_amount, 1, 100000, 0);
  const noBookingAmount = intIn(r.no_booking_amount, 1, 100000, 0);
  const enabledAt = typeof r.enabled_at === 'string' && !Number.isNaN(Date.parse(r.enabled_at)) ? r.enabled_at : null;
  return {
    enabled: r.enabled === true && enabledAt !== null && unpaidAmount > 0 && noBookingAmount > 0,
    unpaidAmount, noBookingAmount,
    fineDueDays: intIn(r.fine_due_days, 0, 60, DEFAULT_ROUTE_CHECK_FINE_CONFIG.fineDueDays),
    enabledAt,
  };
}

export function toStoredRouteCheckFineConfig(cfg: RouteCheckFineConfig): Record<string, unknown> {
  return {
    enabled: cfg.enabled, unpaid_amount: cfg.unpaidAmount, no_booking_amount: cfg.noBookingAmount,
    fine_due_days: cfg.fineDueDays, enabled_at: cfg.enabledAt,
  };
}

const rupees = (n: number) => Number.isInteger(n) && n >= 1 && n <= 100000;

export function validateRouteCheckFineInput(i: { unpaidAmount: number; noBookingAmount: number; fineDueDays: number }): string | null {
  if (!rupees(i.unpaidAmount)) return 'Unpaid-fee fine must be a whole number of rupees between 1 and 100000';
  if (!rupees(i.noBookingAmount)) return 'No-booking fine must be a whole number of rupees between 1 and 100000';
  if (!Number.isInteger(i.fineDueDays) || i.fineDueDays < 0 || i.fineDueDays > 60) return 'Fine due days must be a whole number between 0 and 60';
  return null;
}

export async function loadRouteCheckFineConfig(svc: SupabaseClient): Promise<RouteCheckFineConfig> {
  try {
    const { data, error } = await svc
      .from('admin_settings').select('settings_data')
      .eq('setting_type', ROUTE_CHECK_FINE_SETTING_TYPE)
      .order('updated_at', { ascending: false }).limit(1);
    if (error || !data || data.length === 0) return { ...DEFAULT_ROUTE_CHECK_FINE_CONFIG };
    return parseRouteCheckFineConfig((data[0] as { settings_data: unknown }).settings_data);
  } catch {
    return { ...DEFAULT_ROUTE_CHECK_FINE_CONFIG };
  }
}
