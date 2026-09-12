/**
 * Resolve a scan against the roster saved on the phone, for when there is no
 * signal. DISPLAY AND QUEUING ONLY: the server re-resolves every queued scan
 * on sync and rejects retired cards. Nothing here is trusted as proof.
 *
 *  - JKKN ID card: the roster ships an active-card map, so this resolves.
 *  - Anything else (including a typed JKKN ID, or a scan matching neither
 *    shape) is refused or queued unresolved — see below.
 *
 * The transport boarding pass and its six-digit daily code were retired
 * 2026-09-12 (see scan-resolve.ts); `verified` stays on the resolved shape
 * because the sync path and the outbox still read it, but with pass QR gone
 * every resolved scan is a camera-read JKKN ID, so it is always true.
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
  if (d.refusal === 'unrecognised') return { kind: 'refused', message: 'Not a JKKN ID card.' };

  const learnerId = d.shape === 'jkkn_id' ? roster.cards?.[d.code] ?? null : null;
  const row = learnerId ? roster.rows.find((r) => r.learner_id === learnerId) : undefined;

  if (!row) {
    return {
      kind: 'unknown',
      message: 'This card is not on your saved list. It will be checked when you are back online.',
    };
  }

  return {
    kind: 'resolved',
    learnerId: row.learner_id,
    name: row.name,
    booked: row.booked,
    // Always true: with pass QR gone, the only shape that reaches here is a
    // camera-read JKKN ID resolved through the saved roster.
    verified: true,
    alreadyPresent: row.status === 'present',
  };
}
