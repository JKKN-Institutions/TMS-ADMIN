import crypto from 'crypto';

/**
 * Boarding-pass token = `${learnerId}.${sig}` where sig = HMAC-SHA256(learnerId).
 * Server-only signing/verification — the QR is unforgeable without the secret, so
 * no pass table is needed. Identity (learnerId) is the only payload; the scanner
 * re-derives everything (allocation, route) from it server-side.
 */
function secret(): string {
  // Service-role key is always present server-side and never exposed to the client.
  return process.env.BOARDING_PASS_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'tms-dev-secret';
}

function sigFor(learnerId: string): string {
  return crypto.createHmac('sha256', secret()).update(learnerId).digest('hex').slice(0, 32);
}

export function signPass(learnerId: string): string {
  return `${learnerId}.${sigFor(learnerId)}`;
}

/** Returns the learnerId if the token's signature is valid, else null. */
export function verifyPass(token: string): string | null {
  if (!token || typeof token !== 'string') return null;
  const idx = token.lastIndexOf('.');
  if (idx <= 0) return null;
  const learnerId = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sigFor(learnerId);
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return learnerId;
}

/**
 * Daily-rotating 6-digit boarding code = HMAC(`${learnerId}:${dateStr}`) reduced
 * to 6 decimal digits. `dateStr` is an IST 'YYYY-MM-DD', so the code changes each
 * day and a leaked code expires at midnight.
 *
 * This is an identity HINT for manual entry, NOT a standalone credential: unlike
 * the long token it does not carry the learnerId, so the scanner must reverse it
 * (see matchPassCode) and still enforces staff auth, route assignment and the
 * booking gate. The QR token remains the strong, unforgeable path.
 */
export function passCodeFor(learnerId: string, dateStr: string): string {
  const h = crypto.createHmac('sha256', secret()).update(`${learnerId}:${dateStr}`).digest();
  return (h.readUInt32BE(0) % 1_000_000).toString().padStart(6, '0');
}

/**
 * Given a typed 6-digit `code` and a (route-scoped) list of candidate learnerIds,
 * return every candidate whose daily code matches. Pure — the caller supplies the
 * candidate set and interprets the result: zero = unknown, one = resolved, more
 * than one = ambiguous collision (fall back to the QR). Non-digits are stripped so
 * a code displayed as "429 173" still matches when typed with the space.
 */
export function matchPassCode(code: string, candidateIds: string[], dateStr: string): string[] {
  const norm = (code ?? '').replace(/\D/g, '');
  if (norm.length !== 6) return [];
  return candidateIds.filter((id) => passCodeFor(id, dateStr) === norm);
}
