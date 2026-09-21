/**
 * Shared display formatting for the inspection screens. Pure, no I/O.
 */

/** A Postgres TIME ('HH:MM:SS') shown as 'HH:MM'; missing → '—'. */
export function fmtTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : '—';
}

/** An ISO timestamp shown as 24-hour 'HH:MM' in IST, whatever the device's zone. */
export function fmtIST(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
}
