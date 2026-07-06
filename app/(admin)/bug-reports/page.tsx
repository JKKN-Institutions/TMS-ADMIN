'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Bug, AlertCircle, Clock, CheckCircle2, Info } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { type BugReportRow } from '@/lib/bug-reports/shared';
import { getBugColumns } from './columns';

async function fetchList(): Promise<{ rows: BugReportRow[]; configured: boolean }> {
  const res = await fetch('/api/admin/bug-reports', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load');
  const json = await res.json();
  return { rows: (json.data ?? []) as BugReportRow[], configured: json.configured !== false };
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

export default function BugReportsPage() {
  const router = useRouter();
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
      <div>
        <h1 className="text-xl font-semibold">Bug Reports</h1>
        <p className="text-sm text-muted-foreground">
          Reports submitted from every portal (admin, student, driver, boarding) via the in-app reporter, in one place.
        </p>
      </div>

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
