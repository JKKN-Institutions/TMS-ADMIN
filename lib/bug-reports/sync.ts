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
  const { rows, reporters, errors } = await collectReports(emails, fetchFor, concurrency);
  if (!rows.length) {
    return { scanned: emails.length, reporters, found: 0, upserted: 0, errors };
  }

  const writeError = await writeRows(svc, rows);
  if (writeError) {
    return { scanned: emails.length, reporters, found: rows.length, upserted: 0, errors, writeError };
  }

  return { scanned: emails.length, reporters, found: rows.length, upserted: rows.length, errors };
}

export interface StatusRefreshResult extends SyncChunkResult {
  /** Indexed reports whose status differs from what the platform now says. */
  statusChanges: number;
}

/**
 * Pull the platform's CURRENT status for every report already in the index.
 *
 * The index only stores a snapshot of status from submit time, and the platform
 * pushes nothing when a report is triaged — so without this, a report closed on
 * the platform stays "open" here until someone opens its detail page or runs the
 * full 6k-address sweep (found 2026-10-12: 18 of 96 closed on the platform were
 * still open here). The full sweep asks about every profile to DISCOVER reports;
 * this asks only the ~70 addresses that already have one, so it's cheap enough
 * to run every time the console opens.
 */
export async function refreshIndexedStatuses(
  svc: SupabaseClient,
  fetchFor: (email: string) => Promise<unknown>,
  concurrency = 8
): Promise<StatusRefreshResult> {
  const { data, error } = await svc
    .from('tms_bug_report_index')
    .select('id, status, reporter_email');
  if (error) {
    return {
      scanned: 0, reporters: 0, found: 0, upserted: 0, errors: 0, statusChanges: 0,
      writeError: `${error.code ?? ''} ${error.message ?? ''}`.trim(),
    };
  }

  const indexed = (data ?? []) as { id: string; status: string; reporter_email: string }[];
  const before = new Map(indexed.map((r) => [r.id, r.status]));
  const emails = [...new Set(indexed.map((r) => r.reporter_email).filter(Boolean))];

  const { rows, reporters, errors } = await collectReports(emails, fetchFor, concurrency);
  const statusChanges = countStatusChanges(before, rows);
  const base = { scanned: emails.length, reporters, found: rows.length, errors, statusChanges };
  if (!rows.length) return { ...base, upserted: 0 };

  const writeError = await writeRows(svc, rows);
  if (writeError) return { ...base, upserted: 0, statusChanges: 0, writeError };
  return { ...base, upserted: rows.length };
}

/** How many already-indexed reports came back with a different status. New reports don't count. */
export function countStatusChanges(before: Map<string, string>, rows: BugIndexRow[]): number {
  return rows.filter((r) => before.has(r.id) && before.get(r.id) !== r.status).length;
}

/** Ask the platform about each address, `concurrency` at a time. */
async function collectReports(
  emails: string[],
  fetchFor: (email: string) => Promise<unknown>,
  concurrency: number
): Promise<{ rows: BugIndexRow[]; reporters: number; errors: number }> {
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

  return { rows: [...byId.values()], reporters, errors };
}

/** One batched upsert. Returns an error string, or null on success. */
async function writeRows(svc: SupabaseClient, rows: BugIndexRow[]): Promise<string | null> {
  // updated_at only defaults on INSERT, so stamp it here or a refreshed row keeps
  // its original write time and looks like it was never re-synced.
  const now = new Date().toISOString();
  const { error } = await svc
    .from('tms_bug_report_index')
    .upsert(rows.map((r) => ({ ...r, updated_at: now })), { onConflict: 'id' });
  return error ? `${error.code ?? ''} ${error.message ?? ''}`.trim() : null;
}
