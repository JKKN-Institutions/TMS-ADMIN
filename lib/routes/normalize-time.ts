/**
 * Time normalization for the JKKN bus-timing workbook import.
 *
 * The source spreadsheet records stop times in wildly inconsistent formats. Real
 * examples seen across the 23 route sheets:
 *
 *   "7-30 AM"   "7-25AM"   "6-30PM"   "5.50PM"   "07:25"   "18:15"
 *   "7 21 AM"   "7 - 22 AM"   "8-05 MA"(typo→AM)   "5-50 PN"(typo→PM)
 *   "20:52"(→08:52 morning)   "7-250 AM"(extra digit)   "5-71 PM"(bad minute)
 *
 * normalizeTime() converts any of these into a Postgres `time` literal
 * ('HH:MM:SS', 24-hour) and reports what (if anything) it had to correct so the
 * import UI can surface a per-row warnings report.
 *
 * `period` is the column the value came from. It is used ONLY as a sanity hint —
 * to infer a missing AM/PM and to repair an obviously-wrong 24h value (e.g. a
 * morning "20:52" → "08:52"). It never overrides an explicit, valid meridiem.
 */

export type Period = 'morning' | 'evening';

export interface TimeResult {
  /** 'HH:MM:SS' or null when the value could not be parsed at all. */
  value: string | null;
  /** True when the parser had to repair/reinterpret the input. */
  corrected: boolean;
  /** Human-readable description of the correction, for the warnings report. */
  note?: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function normalizeTime(raw: unknown, period: Period = 'morning'): TimeResult {
  const original = String(raw ?? '').trim();
  if (!original) return { value: null, corrected: false, note: 'empty' };

  // Uppercase; turn dots into spaces ("5.50PM" → "5 50PM"); collapse whitespace.
  let s = original.toUpperCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  const notes: string[] = [];

  // ── Extract the meridiem, tolerating typos. ────────────────────────────────
  // Matches AM, PM, and the common typos PN→PM, AN→AM, plus reversed "MA"→AM.
  let meridiem: 'AM' | 'PM' | null = null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/([AP])\s*[MN]\s*$/))) {
    meridiem = m[1] === 'A' ? 'AM' : 'PM';
    if (/N$/.test(m[0])) notes.push(`read "${m[0].trim()}" as ${meridiem}`);
    s = s.slice(0, m.index).trim();
  } else if ((m = s.match(/\bMA\s*$/))) {
    meridiem = 'AM';
    notes.push('read "MA" as AM');
    s = s.slice(0, m.index).trim();
  }

  // ── Pull out hour/minute digits. ───────────────────────────────────────────
  const groups = s.replace(/\D+/g, ' ').trim().split(/\s+/).filter(Boolean);
  let hStr: string;
  let mStr: string;
  if (groups.length >= 2) {
    [hStr, mStr] = groups;
  } else if (groups.length === 1) {
    const d = groups[0];
    if (d.length >= 4) {
      hStr = d.slice(0, d.length - 2);
      mStr = d.slice(-2);
    } else if (d.length === 3) {
      hStr = d.slice(0, 1);
      mStr = d.slice(1);
    } else {
      hStr = d;
      mStr = '00';
    }
  } else {
    return { value: null, corrected: false, note: `no digits in "${original}"` };
  }

  let H = parseInt(hStr, 10);
  let M = parseInt(mStr, 10);
  if (Number.isNaN(H) || Number.isNaN(M)) {
    return { value: null, corrected: false, note: `unparseable "${original}"` };
  }

  // Extra-digit minutes, e.g. "7-250 AM" → minute "250".
  if (mStr.length > 2) {
    M = parseInt(mStr.slice(0, 2), 10);
    notes.push(`trimmed minute "${mStr}" → ${pad(M)}`);
  }

  // Out-of-range minute, e.g. "5-71 PM".
  if (M > 59) {
    notes.push(`minute ${M} out of range, kept ${pad(M % 60)}`);
    M = M % 60;
  }

  // ── Convert to 24-hour. ────────────────────────────────────────────────────
  if (meridiem === 'AM') {
    if (H === 12) H = 0;
  } else if (meridiem === 'PM') {
    if (H < 12) H += 12;
  } else {
    // No meridiem: could be a 24h value ("18:15") or a bare hour ("7", "8").
    if (period === 'morning') {
      // A morning hour in the afternoon range is almost certainly a typo where a
      // "1" was prefixed (e.g. "20:52" → "08:52", "13:30" → "01:30"? unlikely);
      // only repair when subtracting 12 lands in a plausible morning window.
      if (H >= 13 && H <= 23 && H - 12 >= 4 && H - 12 <= 11) {
        notes.push(`reinterpreted ${pad(H)}:${pad(M)} as ${pad(H - 12)}:${pad(M)} (morning)`);
        H -= 12;
      }
    } else {
      // Evening: a bare 1–11 means PM.
      if (H >= 1 && H <= 11) {
        H += 12;
        notes.push('assumed PM (evening column)');
      }
    }
  }

  if (H > 23) {
    return { value: null, corrected: false, note: `hour ${H} out of range in "${original}"` };
  }

  // ── Sanity flag (does not change the value). ───────────────────────────────
  if (period === 'morning' && H >= 12) {
    notes.push(`resolves to afternoon (${pad(H)}:${pad(M)}) — verify`);
  } else if (period === 'evening' && H < 12) {
    notes.push(`resolves to morning (${pad(H)}:${pad(M)}) — verify`);
  }

  return {
    value: `${pad(H)}:${pad(M)}:00`,
    corrected: notes.length > 0,
    note: notes.length ? notes.join('; ') : undefined,
  };
}

/** Minutes since midnight for an 'HH:MM' or 'HH:MM:SS' string. */
function toMinutes(t: string): number {
  const [h, mm] = t.split(':').map((x) => parseInt(x, 10));
  return h * 60 + mm;
}

/**
 * Human-readable trip duration from departure → arrival times (both 'HH:MM:SS').
 * Returns e.g. "1h 25m", or "N/A" when either time is missing or non-positive.
 */
export function computeDuration(departure: string | null, arrival: string | null): string {
  if (!departure || !arrival) return 'N/A';
  const diff = toMinutes(arrival) - toMinutes(departure);
  if (diff <= 0) return 'N/A';
  const h = Math.floor(diff / 60);
  const mm = diff % 60;
  return (h ? `${h}h ` : '') + `${mm}m`;
}
