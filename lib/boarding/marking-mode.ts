/**
 * Settings → Marking method: which ways boarding staff may record attendance.
 * One setting for both trips, stored in admin_settings ('attendance').
 *
 * The SERVER enforces it (POST /api/boarding/attendance refuses manual marks,
 * POST /api/boarding/scan refuses scans); the pages only hide what would be
 * refused. The transport office (super admin, tms.attendance.override) is never
 * limited — they are the correction path. Undo is never limited.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type MarkingMode = 'scan_only' | 'manual_only' | 'both';

export const MARKING_MODES: readonly MarkingMode[] = ['scan_only', 'manual_only', 'both'];
export const DEFAULT_MARKING_MODE: MarkingMode = 'both';
export const ATTENDANCE_SETTING_TYPE = 'attendance';

export const MARKING_MODE_LABEL: Record<MarkingMode, string> = {
  scan_only: 'Scan only',
  manual_only: 'Manual only',
  both: 'Scan + manual',
};

export const MARKING_MODE_HINT: Record<MarkingMode, string> = {
  scan_only: 'Staff scan ID cards. P / A / B buttons are hidden; students not scanned are marked absent when attendance closes.',
  manual_only: 'Staff tap P / A / B. The Scan button is hidden.',
  both: 'Staff can scan ID cards or tap P / A / B.',
};

export interface AllowedMarking { mode: MarkingMode; manual: boolean; scan: boolean }

/** What a page assumes when it cannot learn the setting: today's behaviour. */
export const ALL_METHODS_ALLOWED: AllowedMarking = { mode: 'both', manual: true, scan: true };

export function isMarkingMode(v: unknown): v is MarkingMode {
  return v === 'scan_only' || v === 'manual_only' || v === 'both';
}

export function parseMarkingMode(raw: unknown): MarkingMode {
  const v = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).markingMode : undefined;
  return isMarkingMode(v) ? v : DEFAULT_MARKING_MODE;
}

export function allowedMethods(mode: MarkingMode, exempt: boolean): { manual: boolean; scan: boolean } {
  if (exempt) return { manual: true, scan: true };
  return { manual: mode !== 'scan_only', scan: mode !== 'manual_only' };
}

/** null on a read error, so a Settings save can refuse instead of guessing. */
export async function readMarkingMode(svc: SupabaseClient): Promise<MarkingMode | null> {
  const { data, error } = await svc
    .from('admin_settings')
    .select('settings_data')
    .eq('setting_type', ATTENDANCE_SETTING_TYPE)
    .maybeSingle();
  if (error) return null;
  return parseMarkingMode((data as { settings_data: unknown } | null)?.settings_data);
}

/**
 * For the enforcement paths. A failed read falls back to 'both' — today's
 * behaviour — rather than locking every staffer out of one method.
 */
export async function loadMarkingMode(svc: SupabaseClient): Promise<MarkingMode> {
  return (await readMarkingMode(svc)) ?? DEFAULT_MARKING_MODE;
}
