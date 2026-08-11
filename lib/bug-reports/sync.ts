// Backfill / re-sync of tms_bug_report_index from the Bug Reporter platform.
//
// WHY A SWEEP
// The platform's public API can only answer "reports by THIS one address"
// (GET /api/v1/public/bug-reports/me?reporter_email=…, matched literally — no
// wildcard, no cross-reporter list, no way to enumerate reporters). So the only
// route to historical reports is to ask about each address we already know: our
// own profiles. Measured 2026-08-10 against the live API — 6,410 active
// addresses probed, 0 errors, 30 reporters, 38 reports — so the sweep is
// accurate and cheap enough to re-run.
//
// The relay captures reports as they are submitted from now on
// (lib/bug-reports/index-row.ts); this sweep is what recovers everything filed
// BEFORE that capture existed, and doubles as a repair pass if the relay ever
// misses one.
//
// Chunked by the caller: 6k+ outbound requests cannot fit in one serverless
// invocation, so the route walks the address list in slices.

import type { SupabaseClient } from '@supabase/supabase-js';
import { rowsFromListResponse, type BugIndexRow } from './index-row';

export interface SyncChunkResult {
  /** Addresses probed in this chunk. */
  scanned: number;
  /** Addresses that had at least one report. */
  reporters: number;
  /** Distinct reports discovered. */
  found: number;
  /** Rows successfully written. */
  upserted: number;
  /** Addresses whose lookup failed (counted, not fatal). */
  errors: number;
  /** Set when the database write itself failed. */
  writeError?: string;
}

/**
 * Probe one slice of addresses and upsert whatever they turn up.
 *
 * @param svc       service-role client (the index is RLS-closed)
 * @param emails    the addresses to ask about
 * @param fetchFor  injected lookup — the real one is listBugReportsFor; tests
 *                  pass a stub so this logic needs no network
 * @param concurrency parallel lookups; keep modest, this is someone else's API
 */
export async function syncReporterChunk(
  svc: SupabaseClient,
  emails: string[],
  fetchFor: (email: string) => Promise<unknown>,
  concurrency = 8
): Promise<SyncChunkResult> {
  if (!emails.length) {
    return { scanned: 0, reporters: 0, found: 0, upserted: 0, errors: 0 };
  }

  // Keyed by platform id so a report echoed under two addresses is stored once —
  // otherwise the upsert would fight itself within a single batch.
  const byId = new Map<string, BugIndexRow>();
  let reporters = 0;
  let errors = 0;

  const queue = [...emails];
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      for (let email = queue.pop(); email; email = queue.pop()) {
        try {
          const rows = rowsFromListResponse(await fetchFor(email), email);
          if (rows.length) reporters++;
          for (const r of rows) byId.set(r.id, r);
        } catch {
          // One unreachable reporter must not abort the sweep; count and move on.
          errors++;
        }
      }
    })
  );

  const rows = [...byId.values()];
  if (!rows.length) {
    return { scanned: emails.length, reporters, found: 0, upserted: 0, errors };
  }

  // One batched write per chunk rather than per report.
  const { error } = await svc
    .from('tms_bug_report_index')
    .upsert(rows, { onConflict: 'id' });

  if (error) {
    return {
      scanned: emails.length,
      reporters,
      found: rows.length,
      upserted: 0,
      errors,
      writeError: `${error.code ?? ''} ${error.message ?? ''}`.trim(),
    };
  }

  return { scanned: emails.length, reporters, found: rows.length, upserted: rows.length, errors };
}
