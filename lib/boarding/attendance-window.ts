/**
 * Pure IST time-of-day logic for attendance scan windows + a thin DB loader.
 *
 * Two trips: the morning (onward) trip is always on; the evening (return) trip
 * is switched on from Settings via `tms_attendance_window.is_active`. The server
 * clock picks which trip a mark belongs to (activeDirection). India has no DST,
 * so IST is a fixed +5:30 offset and all math is deterministic integer
 * arithmetic — no timezone lib, fully unit-testable. The pure functions never
 * touch the DB; `loadAttendanceWindows` wraps the table and falls back to
 * DEFAULT_WINDOWS if it's absent/empty.
 *
 * `enabled` means "apply the time limit": a window with enabled=false is open
 * ALL DAY. It is NOT an on/off switch — `active` (the is_active column) is.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type AttDirection = 'onward' | 'return';

export interface AttendanceWindow {
  direction: AttDirection;
  start: string;   // 'HH:MM' IST
  end: string;     // 'HH:MM' IST
  enabled: boolean; // false ⇒ no time restriction (always open). NOT an on/off switch.
  /** Is this trip's attendance switched on at all? Morning always; evening from Settings. */
  active: boolean;
}

export type AttendanceWindows = { onward: AttendanceWindow; return: AttendanceWindow };

/** Defaults used until an admin customises them (and the fallback if the table is missing). */
export const DEFAULT_WINDOWS: AttendanceWindows = {
  onward: { direction: 'onward', start: '07:00', end: '09:30', enabled: true, active: true },
  return: { direction: 'return', start: '16:30', end: '19:00', enabled: true, active: false },
};

/** The words staff see for each trip. */
export const LEG_NAME: Record<AttDirection, string> = { onward: 'Morning', return: 'Evening' };

/**
 * Private Realtime topic a Settings save signals on. Shared by the sender
 * (lib/boarding/attendance-broadcast.ts), the listener
 * (hooks/use-attendance-settings-live.ts) and the receive policy on
 * realtime.messages, which matches this exact string.
 */
export const ATTENDANCE_SETTINGS_TOPIC = 'tms_attendance_settings';

const IST_OFFSET_MIN = 5 * 60 + 30; // +05:30

/** Minutes since IST midnight for the given instant (0..1439). */
export function istMinutesOfDay(now: Date = new Date()): number {
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

/** 'HH:MM' (or 'HH:MM:SS') → minutes since midnight. */
export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** A DB `time` value ('HH:MM:SS') → 'HH:MM'. */
export function normalizeTime(t: string): string {
  return t.slice(0, 5);
}

/** 'HH:MM' → human '7:00 AM' / '4:30 PM'. */
export function formatHM(hm: string): string {
  const mins = hmToMinutes(hm);
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Is scanning open for this window right now? A disabled window ⇒ no restriction ⇒ always open. */
export function isDirectionOpen(win: AttendanceWindow, now: Date = new Date()): boolean {
  if (!win.enabled) return true;
  const mins = istMinutesOfDay(now);
  return mins >= hmToMinutes(win.start) && mins < hmToMinutes(win.end);
}

/**
 * Which trip a mark made right now belongs to, by the clock: morning while its
 * window is open; otherwise evening, if switched on and its window is open;
 * otherwise null. Settings refuse overlapping windows, but if stored data ever
 * overlaps (a direct SQL edit), morning wins so the answer stays deterministic.
 */
export function activeDirection(windows: AttendanceWindows, now: Date = new Date()): AttDirection | null {
  if (isDirectionOpen(windows.onward, now)) return 'onward';
  if (windows.return.active && isDirectionOpen(windows.return, now)) return 'return';
  return null;
}

/**
 * Settings validation, shared by the admin API and the Settings screen.
 * Returns the message to show, or null when the windows are acceptable.
 *
 * With evening switched on, the clock can only pick the trip if both windows
 * have set hours and do not overlap. Intervals are half-open [start, end), so a
 * morning ending at 16:30 and an evening starting at 16:30 do not overlap.
 */
export function validateWindows(w: AttendanceWindows): string | null {
  if (hmToMinutes(w.onward.start) >= hmToMinutes(w.onward.end)) {
    return `${LEG_NAME.onward}: start time must be before end time`;
  }
  if (!w.return.active) return null;
  if (hmToMinutes(w.return.start) >= hmToMinutes(w.return.end)) {
    return `${LEG_NAME.return}: start time must be before end time`;
  }
  if (!w.onward.enabled || !w.return.enabled) {
    return 'To switch on evening attendance, both trips need set hours. Turn Enforce on for both.';
  }
  const overlap =
    hmToMinutes(w.onward.start) < hmToMinutes(w.return.end) &&
    hmToMinutes(w.return.start) < hmToMinutes(w.onward.end);
  if (overlap) {
    return `End the morning window at or before ${formatHM(w.return.start)} to switch on evening attendance.`;
  }
  return null;
}

/**
 * Load both trips' windows from the DB; each falls back to DEFAULT_WINDOWS when
 * its row is absent, and both do on a read error. The morning row's is_active is
 * ignored: morning attendance is always on.
 */
export async function loadAttendanceWindows(svc: SupabaseClient): Promise<AttendanceWindows> {
  const out: AttendanceWindows = {
    onward: { ...DEFAULT_WINDOWS.onward },
    return: { ...DEFAULT_WINDOWS.return },
  };
  const { data, error } = await svc
    .from('tms_attendance_window')
    .select('direction, start_time, end_time, enabled, is_active');
  if (error || !data) return out; // missing table / empty ⇒ defaults
  for (const r of data as {
    direction: string; start_time: string; end_time: string; enabled: boolean; is_active: boolean | null;
  }[]) {
    if (r.direction !== 'onward' && r.direction !== 'return') continue;
    out[r.direction] = {
      direction: r.direction,
      start: normalizeTime(r.start_time),
      end: normalizeTime(r.end_time),
      enabled: r.enabled,
      active: r.direction === 'onward' ? true : r.is_active === true,
    };
  }
  return out;
}
