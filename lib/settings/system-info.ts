/**
 * Shapes for the Settings > System / Security panels.
 *
 * Every field here must be MEASURED, never invented. The tabs these feed
 * previously displayed fabricated figures (a hardcoded version, "68% memory",
 * "99.9% uptime", "1,234 active sessions"); the whole point of this module is
 * that anything we cannot actually measure is simply absent.
 *
 * That principle extends to query FAILURES, not just missing features: a
 * secondary query (a count, a distinct-actor scan, the recent-activity list)
 * can fail independently of the primary connectivity probe. When it does, the
 * corresponding field is `null` — NEVER `0` or `[]` — so the UI can render
 * "unmeasured" instead of a confident-looking (and wrong) zero. `0`/`[]` are
 * reserved for a query that genuinely ran and found nothing.
 */

export type LatencyClass = 'good' | 'slow' | 'critical';

/**
 * Cap on how many recent rows the distinct-actor/IP scan reads. Shared
 * between the route (which uses it as the query `.limit()`, applied with a
 * deterministic `.order('created_at', desc)` so the same cap always samples
 * the same rows) and the UI (which discloses the cap in the stat label) so
 * the number can never silently drift out of sync between the two.
 */
export const ACTIVITY_SAMPLE_LIMIT = 1000;

export interface SystemInfo {
  app: {
    version: string;        // from package.json
    environment: string;    // NODE_ENV / VERCEL_ENV
    region: string | null;  // VERCEL_REGION when deployed, null locally
    nodeVersion: string;
    nextVersion: string;
  };
  database: {
    connected: boolean;
    latencyMs: number | null; // null when the probe failed
  };
  activity: {
    last24h: number | null; // null when the count query failed (never 0)
    last7d: number | null;
    total: number | null;
  };
  security: {
    distinctActors7d: number | null; // null when the sampling query failed
    distinctIps7d: number | null;
    // false when the recent-activity query itself errored — distinguishes
    // "could not measure" from a genuine empty result (recent: []).
    recentAvailable: boolean;
    recent: Array<{
      actorEmail: string | null;
      actorRole: string | null;
      module: string | null;
      action: string | null;
      description: string | null;
      ipAddress: string | null;
      createdAt: string | null;
    }>;
  };
}

/** Bucket a DB round-trip time. Pure. Thresholds: <200ms good, <1000ms slow, else critical. */
export function classifyLatency(ms: number): LatencyClass {
  if (ms < 200) return 'good';
  if (ms < 1000) return 'slow';
  return 'critical';
}

/**
 * Render a measured count for display. `null` (query failed — could not be
 * measured) renders as an em dash, never as "0", so a failure can never be
 * mistaken for a genuine zero reading. Pure.
 */
export function formatCount(n: number | null): string {
  return n === null ? '—' : String(n);
}
