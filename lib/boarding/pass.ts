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
