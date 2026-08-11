'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bug, AlertCircle, Clock, CheckCircle2, Info, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { type BugReportRow } from '@/lib/bug-reports/shared';
import { getBugColumns } from './columns';

async function fetchList(): Promise<{
  rows: BugReportRow[];
  configured: boolean;
  indexedFrom: string | null;
}> {
  const res = await fetch('/api/admin/bug-reports', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load');
  const json = await res.json();
  return {
    rows: (json.data ?? []) as BugReportRow[],
    configured: json.configured !== false,
    indexedFrom: (json.indexedFrom as string | null) ?? null,
  };
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: typeof Bug;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-2xl font-semibold leading-none text-gray-900 dark:text-gray-100">{value}</div>
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{label}</div>
      </div>
    </div>
  );
}

/**
 * Walk the sync endpoint chunk by chunk.
 *
 * The reporter platform only answers "reports by THIS one address", so recovering
 * history means asking about every address we know (~6.4k profiles). That can't
 * fit in one serverless request, so the server hands back a `nextOffset` and we
 * keep going until it's null — reporting progress as we do, because this takes
 * minutes rather than seconds.
 */
// Annotated explicitly: `offset` is reassigned from the response, so without this
// TypeScript can't infer the response type without referring to itself (TS7022).
interface SyncChunkResponse {
  scanned?: number;
  upserted?: number;
  errors?: number;
  totalCandidates?: number;
  nextOffset?: number | null;
  writeError?: string;
  error?: string;
}

async function runSync(onProgress: (scanned: number, total: number, found: number) => void) {
  let offset: number | null = 0;
  let scanned = 0;
  let found = 0;
  let errors = 0;

  while (offset !== null) {
    const res: Response = await fetch('/api/admin/bug-reports/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ offset }),
    });
    const json: SyncChunkResponse = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Sync failed');
    if (json.writeError) throw new Error(`Couldn't save results: ${json.writeError}`);

    scanned += json.scanned ?? 0;
    found += json.upserted ?? 0;
    errors += json.errors ?? 0;
    onProgress(scanned, json.totalCandidates ?? 0, found);
    offset = json.nextOffset ?? null;
  }
  return { scanned, found, errors };
}

export default function BugReportsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<{ scanned: number; total: number; found: number } | null>(null);

  const onSync = async () => {
    setSyncing(true);
    setProgress({ scanned: 0, total: 0, found: 0 });
    try {
      const { scanned, found, errors } = await runSync((s, total, f) =>
        setProgress({ scanned: s, total, found: f })
      );
      await qc.invalidateQueries({ queryKey: ['admin-bug-reports'] });
      toast.success(
        `Synced ${found} report${found === 1 ? '' : 's'} from ${scanned.toLocaleString()} addresses` +
          (errors ? ` (${errors} lookups failed)` : '')
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(false);
      setProgress(null);
    }
  };

  const { data, isLoading, error } = useQuery({ queryKey: ['admin-bug-reports'], queryFn: fetchList });
  const list = useMemo(() => data?.rows ?? [], [data]);
  const configured = data?.configured ?? true;

  // Row / "View" action opens the dedicated detail page.
  const columns = useMemo(() => getBugColumns((b) => router.push(`/bug-reports/${b.id}`)), [router]);

  const stats = useMemo(
    () => ({
      total: list.length,
      open: list.filter((b) => b.status === 'open').length,
      inProgress: list.filter((b) => b.status === 'in_progress').length,
      resolved: list.filter((b) => b.status === 'resolved').length,
    }),
    [list]
  );

  if (error) return <div className="p-4 text-destructive">{(error as Error).message}</div>;

  return (
    <div className="space-y-5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Bug Reports</h1>
          <p className="text-sm text-muted-foreground">
            Reports submitted from every portal (admin, student, driver, boarding) via the in-app reporter, in one place.
          </p>
        </div>
        {configured && (
          <Button onClick={onSync} disabled={syncing} variant="outline" className="shrink-0">
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing
              ? progress && progress.total
                ? `Syncing ${progress.scanned.toLocaleString()}/${progress.total.toLocaleString()} — ${progress.found} found`
                : 'Syncing…'
              : 'Sync from platform'}
          </Button>
        )}
      </div>

      {/* The reporter platform can only answer "reports by ONE address", so this
          list is assembled locally: new reports are captured as they're submitted
          (app/api/v1/public/[...path]/route.ts) and older ones are recovered by
          Sync, which asks the platform about every address we know. Only show the
          prompt when the list is actually empty — once synced it's just noise. */}
      {configured && list.length === 0 && !isLoading && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
          <Info className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">No reports here yet.</p>
            <p className="mt-0.5">
              The reporter platform returns bugs one reporter at a time, so this console builds its own list.
              New reports land here automatically as they&apos;re submitted — press{' '}
              <span className="font-medium">Sync from platform</span> to pull in everything reported earlier.
            </p>
          </div>
        </div>
      )}

      {!configured && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <Info className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Bug Reporter isn&apos;t configured yet.</p>
            <p className="mt-0.5">
              Set <code className="rounded bg-amber-100 px-1 dark:bg-amber-500/20">NEXT_PUBLIC_BUG_REPORTER_API_URL</code> to
              your real platform URL in <code className="rounded bg-amber-100 px-1 dark:bg-amber-500/20">.env</code> (it&apos;s
              still the placeholder), then restart the server. Reports will appear here once it&apos;s set.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total" value={stats.total} icon={Bug} accent="bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300" />
        <StatCard label="Open" value={stats.open} icon={AlertCircle} accent="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" />
        <StatCard label="In progress" value={stats.inProgress} icon={Clock} accent="bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" />
        <StatCard label="Resolved" value={stats.resolved} icon={CheckCircle2} accent="bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" />
      </div>

      <DataTable
        columns={columns}
        data={list}
        entityName="bug reports"
        isLoading={isLoading}
        searchPlaceholder="Search title, reporter…"
        filters={[
          {
            columnId: 'portal',
            title: 'Portal',
            options: [
              { label: 'Admin', value: 'admin' },
              { label: 'Student', value: 'student' },
              { label: 'Driver', value: 'driver' },
              { label: 'Boarding', value: 'boarding' },
              { label: 'Other', value: 'other' },
            ],
          },
          {
            columnId: 'status',
            title: 'Status',
            options: [
              { label: 'Open', value: 'open' },
              { label: 'In progress', value: 'in_progress' },
              { label: 'Resolved', value: 'resolved' },
              { label: 'Closed', value: 'closed' },
            ],
          },
          {
            columnId: 'category',
            title: 'Category',
            options: [
              { label: 'Bug', value: 'bug' },
              { label: 'Feature', value: 'feature_request' },
              { label: 'UI / Design', value: 'ui_design' },
              { label: 'Performance', value: 'performance' },
              { label: 'Security', value: 'security' },
              { label: 'Other', value: 'other' },
            ],
          },
          {
            columnId: 'priority',
            title: 'Priority',
            options: [
              { label: 'Critical', value: 'critical' },
              { label: 'High', value: 'high' },
              { label: 'Medium', value: 'medium' },
              { label: 'Low', value: 'low' },
            ],
          },
        ]}
      />
    </div>
  );
}
