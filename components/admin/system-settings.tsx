'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Cpu, Database, Loader2, RefreshCw, Server } from 'lucide-react';
import toast from 'react-hot-toast';
import { classifyLatency, formatCount, type SystemInfo } from '@/lib/settings/system-info';

/**
 * System tab. Every figure here is MEASURED — package.json version, real
 * process.version / installed Next.js version, a timed database round-trip,
 * and real tms_activity_log counts. The previous tab fabricated a version,
 * uptime, memory usage, active-session count, and a dozen buttons (Purge CDN,
 * Optimize Database, Maintenance Mode, Schedule Restart…) for capabilities a
 * serverless Next.js app does not have. None of that is reimplemented here —
 * it is simply gone. The only action is a real refetch of this endpoint.
 *
 * The activity counts can independently fail to measure even when the probe
 * above succeeds; a failed count renders as "—" (formatCount()), never "0" —
 * a fabricated-looking zero would misinform an operator during an outage.
 */
export function SystemSettings() {
  const [data, setData] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/admin/system-info', { cache: 'no-store', credentials: 'same-origin' });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to load system info');
      setData(json.data as SystemInfo);
      setLoadError(false);
      if (isRefresh) {
        const ms = (json.data as SystemInfo).database.latencyMs;
        toast.success(ms === null ? 'Health check complete — database probe failed' : `Health check complete — ${ms}ms`);
      }
    } catch (e) {
      setLoadError(true);
      if (isRefresh) toast.error(e instanceof Error ? e.message : 'Health check failed');
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">System</h3>
          <p className="mt-1 text-sm text-gray-600">Measured application, database and activity signals — nothing fabricated.</p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Re-run health check
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading system info…
        </div>
      )}

      {!loading && (loadError || !data) && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Could not load system data. Reload the page to try again.
        </div>
      )}

      {!loading && data && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h4 className="mb-3 flex items-center gap-2 font-medium text-gray-900">
              <Server className="h-5 w-5 text-blue-600" />
              Application
            </h4>
            <div className="space-y-2 text-sm">
              <Row label="Version" value={data.app.version} />
              <Row label="Environment" value={data.app.environment} />
              <Row label="Region" value={data.app.region ?? 'unknown'} />
              <Row label="Node.js" value={data.app.nodeVersion} />
              <Row label="Next.js" value={data.app.nextVersion} />
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h4 className="mb-3 flex items-center gap-2 font-medium text-gray-900">
              <Database className="h-5 w-5 text-green-600" />
              Database
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-700">Status</span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    data.database.connected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {data.database.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-700">Latency</span>
                <LatencyBadge latencyMs={data.database.latencyMs} />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 md:col-span-2">
            <h4 className="mb-3 flex items-center gap-2 font-medium text-gray-900">
              <Cpu className="h-5 w-5 text-purple-600" />
              Admin activity
            </h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard label="Last 24h" value={data.activity.last24h} />
              <StatCard label="Last 7d" value={data.activity.last7d} />
              <StatCard label="All time" value={data.activity.total} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-medium text-gray-700">{label}</span>
      <span className="text-gray-900">{value}</span>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900">{formatCount(value)}</div>
    </div>
  );
}

function LatencyBadge({ latencyMs }: { latencyMs: number | null }) {
  if (latencyMs === null) {
    return <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">Probe failed — unknown</span>;
  }
  const cls = classifyLatency(latencyMs);
  const colours: Record<typeof cls, string> = {
    good: 'bg-green-100 text-green-800',
    slow: 'bg-yellow-100 text-yellow-800',
    critical: 'bg-red-100 text-red-800',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colours[cls]}`}>{latencyMs}ms</span>;
}
