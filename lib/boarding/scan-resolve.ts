/**
 * scan-resolve — decides WHAT a boarding scan string is, and whether the
 * source it arrived from is allowed to send it. Pure: no database, no React.
 *
 * The rules for normalising a JKKN ID are DELIBERATELY COPIED from MyJKKN's
 * lib/identity/scan-normalize.ts rather than imported. The two apps are
 * separate deployments, and a change over there must never silently alter who
 * a bus door refuses. MyJKKN's own mess-door resolver keeps a local copy for
 * exactly this reason.
 *
 * This module never decides authority. The endpoint keeps every gate it has:
 * the tms.attendance.scan permission, the route-assignment check, the scan
 * window, and the booking rule.
 */

export type ScannedShape = 'pass' | 'jkkn_id' | 'pass_code' | 'unknown';

/** Where the string came from. A camera read implies physical possession. */
export type ScanSource = 'camera' | 'typed';

export type ScanRefusal = 'typed_jkkn_id' | 'unrecognised';

export interface ScanDecision {
  shape: ScannedShape;
  /** The cleaned value the server should look up. */
  code: string;
  /** When set, the scan is refused before any database read. */
  refusal: ScanRefusal | null;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PASS_RE = new RegExp(`^${UUID}\\.[0-9a-f]{32}$`, 'i');
const JKKN_ID_RE = /^[0-9]{6}-[0-9]$/;

export function classifyScan(raw: string, source: ScanSource): ScanDecision {
  const code = (raw ?? '').replace(/[\r\n]/g, '').trim();

  if (PASS_RE.test(code)) return { shape: 'pass', code, refusal: null };

  const compact = code.replace(/[\s-]/g, '');

  // Seven bare digits is a JKKN ID with the dash dropped. Classify it as one
  // so a typed card number is refused as "typed", not as "unrecognised".
  let jkknId: string | null = null;
  if (/^[0-9]{7}$/.test(compact)) jkknId = `${compact.slice(0, 6)}-${compact.slice(6)}`;
  else if (JKKN_ID_RE.test(code)) jkknId = code;

  if (jkknId !== null) {
    return {
      shape: 'jkkn_id',
      code: jkknId,
      // A JKKN ID is printed publicly and downloadable as a PNG from MyJKKN,
      // so it is only trusted as evidence of physical possession.
      refusal: source === 'typed' ? 'typed_jkkn_id' : null,
    };
  }

  if (/^[0-9]{6}$/.test(compact)) return { shape: 'pass_code', code: compact, refusal: null };

  return { shape: 'unknown', code, refusal: 'unrecognised' };
}
