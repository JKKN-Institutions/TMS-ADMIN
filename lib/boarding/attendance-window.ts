/**
 * Pure IST time-of-day logic for attendance scan windows + a thin DB loader.
 *
 * Onward (morning) and Return (evening) boarding scans are each restricted to an
 * admin-configurable time window. India has no DST, so IST is a fixed +5:30
 * offset and all math is deterministic integer arithmetic — no timezone lib,
 * fully unit-testable. The pure functions never touch the DB; `loadAttendanceWindows`
 * wraps the table and falls back to DEFAULT_WINDOWS if it's absent/empty.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type AttDirection = 'onward' | 'return';

export interface AttendanceWindow {
  direction: AttDirection;
  start: string;   // 'HH:MM' IST
  end: string;     // 'HH:MM' IST
  enabled: boolean; // false ⇒ no time restriction for this direction (always open)
}

export type AttendanceWindows = Record<AttDirection, AttendanceWindow>;

/** Defaults used until an admin customises them (and the fallback if the table is missing). */
export const DEFAULT_WINDOWS: AttendanceWindows = {
  onward: { direction: 'onward', start: '07:00', end: '09:30', enabled: true },
  return: { direction: 'return', start: '16:30', end: '19:00', enabled: true },
};

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
 * Which direction is currently open for scanning — drives the scan page's auto-tab.
 * Null when neither is open. If both are open (overlapping or both unrestricted),
 * pick by time-of-day: before 13:00 IST ⇒ onward, else ⇒ return.
 */
export function activeDirection(windows: AttendanceWindows, now: Date = new Date()): AttDirection | null {
  const onwardOpen = isDirectionOpen(windows.onward, now);
  const returnOpen = isDirectionOpen(windows.return, now);
  if (onwardOpen && !returnOpen) return 'onward';
  if (returnOpen && !onwardOpen) return 'return';
  if (onwardOpen && returnOpen) return istMinutesOfDay(now) < 13 * 60 ? 'onward' : 'return';
  return null;
}

/** Load both windows from the DB; falls back to DEFAULT_WINDOWS on a missing table/row. */
export async function loadAttendanceWindows(svc: SupabaseClient): Promise<AttendanceWindows> {
  const out: AttendanceWindows = {
    onward: { ...DEFAULT_WINDOWS.onward },
    return: { ...DEFAULT_WINDOWS.return },
  };
  const { data, error } = await svc
    .from('tms_attendance_window')
    .select('direction, start_time, end_time, enabled');
  if (error || !data) return out; // missing table / empty ⇒ defaults
  for (const r of data as { direction: string; start_time: string; end_time: string; enabled: boolean }[]) {
    if (r.direction === 'onward' || r.direction === 'return') {
      out[r.direction] = {
        direction: r.direction,
        start: normalizeTime(r.start_time),
        end: normalizeTime(r.end_time),
        enabled: r.enabled,
      };
    }
  }
  return out;
}
