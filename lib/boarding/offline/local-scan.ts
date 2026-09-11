/**
 * Resolve a scan against the roster saved on the phone, for when there is no
 * signal. DISPLAY AND QUEUING ONLY: the server re-resolves every queued scan
 * on sync, verifies pass signatures, and rejects retired cards. Nothing here
 * is trusted as proof.
 *
 *  - JKKN ID card: the roster ships an active-card map, so this resolves.
 *  - Pass QR: the token is `${learnerId}.${hmac}`. The id is readable; the
 *    HMAC needs a server secret, so the result is marked unverified.
 *  - 6-digit pass code: needs an HMAC per candidate learner. Refused offline.
 */
import { classifyScan, type ScanSource } from '@/lib/boarding/scan-resolve';

export type LocalScan =
  | { kind: 'refused'; message: string }
  | { kind: 'resolved'; learnerId: string; name: string; booked: boolean; verified: boolean; alreadyPresent: boolean }
  | { kind: 'unknown'; message: string };

interface SavedRoster {
  rows: Array<{ learner_id: string; name: string; booked: boolean; status: string }>;
  cards?: Record<string, string>;
}

export function resolveScanOffline(raw: string, source: ScanSource, roster: SavedRoster): LocalScan {
  const d = classifyScan(raw, source);
  if (d.refusal === 'typed_jkkn_id') return { kind: 'refused', message: 'Point the camera at the card to use a JKKN ID.' };
  if (d.shape === 'pass_code') {
    return { kind: 'refused', message: '6-digit codes need signal. Scan the QR or the ID card instead.' };
  }
  if (d.refusal === 'unrecognised') return { kind: 'refused', message: 'Not a boarding pass or a JKKN ID card.' };

  const learnerId =
    d.shape === 'jkkn_id' ? roster.cards?.[d.code] ?? null
    : d.shape === 'pass' ? d.code.split('.')[0].toLowerCase()
    : null;
  const row = learnerId ? roster.rows.find((r) => r.learner_id === learnerId) : undefined;

  if (!row) {
    return {
      kind: 'unknown',
      message: d.shape === 'jkkn_id'
        ? 'This card is not on your saved list. It will be checked when you are back online.'
        : 'This pass is not on your saved list. It will be checked when you are back online.',
    };
  }

  return {
    kind: 'resolved',
    learnerId: row.learner_id,
    name: row.name,
    booked: row.booked,
    verified: d.shape === 'jkkn_id',
    alreadyPresent: row.status === 'present',
  };
}
