/**
 * Shapes for the Settings > System / Security panels.
 *
 * Every field here must be MEASURED, never invented. The tabs these feed
 * previously displayed fabricated figures (a hardcoded version, "68% memory",
 * "99.9% uptime", "1,234 active sessions"); the whole point of this module is
 * that anything we cannot actually measure is simply absent.
 */

export type LatencyClass = 'good' | 'slow' | 'critical';

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
    last24h: number;
    last7d: number;
    total: number;
  };
  security: {
    distinctActors7d: number;
    distinctIps7d: number;
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
