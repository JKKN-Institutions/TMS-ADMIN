// Pure query-string scoping for the Bug Reporter same-origin relay
// (app/api/v1/public/[...path]/route.ts). No I/O — unit-testable in node.
//
// WHY THIS EXISTS
// The platform's public API changed: `reporter_email` is now a REQUIRED query
// param on its read endpoints (GET /bug-reports/me and GET /bug-reports/{id}),
// and it selects WHOSE reports come back. SDK v1.3.2 predates that change and
// sends no such param, so every read through the relay 400s with
// "reporter_email is required."
//
// Two consequences, both handled here:
//
//  1. We must supply the param, or reads fail.
//  2. We must supply it OURSELVES rather than trusting the caller. The relay
//     injects an APPLICATION-WIDE API key, so a param that selects the reporter
//     is an access-control decision. Left to the client, any authenticated user
//     could read another person's reports — including screenshots and captured
//     console logs — by passing someone else's address. So the authenticated
//     identity always WINS over anything the caller sent.
//
// The identity comes from the `x-user-email` header that proxy.ts stamps on
// authenticated requests after stripping any inbound copy (proxy.ts step 6), so
// it cannot be spoofed. No identity → fail CLOSED; we never forward an unscoped
// read on an app-wide key.

export type RelayScopeResult =
  | { ok: true; search: string }
  | { ok: false; reason: 'no_identity' };

/**
 * Rewrite a relay GET's query string so `reporter_email` is the authenticated
 * caller — replacing, not merging with, any caller-supplied value.
 *
 * @param search   the incoming query string, with or without a leading '?'
 * @param userEmail the authenticated caller's email (proxy `x-user-email`)
 * @returns the query string to send upstream, always prefixed with '?'
 */
export function scopeRelaySearchToReporter(
  search: string,
  userEmail: string | null | undefined
): RelayScopeResult {
  const email = (userEmail ?? '').trim().toLowerCase();
  if (!email) return { ok: false, reason: 'no_identity' };

  const params = new URLSearchParams(search);
  // set() replaces EVERY existing occurrence, so a caller can't smuggle a second
  // reporter_email past us by repeating the key.
  params.set('reporter_email', email);
  return { ok: true, search: `?${params.toString()}` };
}
