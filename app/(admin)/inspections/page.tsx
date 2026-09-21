'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ScanLine, Printer } from 'lucide-react';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { usePermissions } from '@/hooks/use-permissions';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { fetchDashboard } from './inspection-api';
import type { DashboardBus } from '@/lib/inspections/types';

const DUE_BADGE: Record<DashboardBus['due']['state'], string> = {
  overdue: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  due_soon: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  never: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  ok: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
};
const RESULT_TEXT = { pass: 'Pass', pass_with_issues: 'Pass with issues', fail: 'Fail' } as const;
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

function dueText(b: DashboardBus) {
  if (b.due.state === 'never') return 'Never inspected';
  if (b.due.state === 'overdue') return `Overdue ${-(b.due.daysLeft ?? 0)}d`;
  if (b.due.daysLeft === 0) return 'Due today';
  return `Due in ${b.due.daysLeft}d`;
}

export default function InspectionsDashboardPage() {
  const { can } = usePermissions();
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['inspections', 'dashboard'], queryFn: fetchDashboard });

  const tiles = data ? [
    { label: 'Overdue', value: data.tiles.overdue, tone: 'text-red-600' },
    { label: 'Due in 7 days', value: data.tiles.dueSoon, tone: 'text-amber-600' },
    { label: 'Never inspected', value: data.tiles.never, tone: 'text-gray-700 dark:text-gray-300' },
    { label: 'Grounded', value: data.tiles.grounded, tone: 'text-red-600' },
  ] : [];

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Bus Inspection' }]}
        title="Bus Inspection"
        subtitle={data ? `Every bus is due once every ${data.intervalDays} days` : undefined}
        actions={<>
          {can(TMS_PERMISSIONS.INSPECTION_MANAGE) && (
            <Link href="/inspections/stickers" className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
              <Printer className="h-4 w-4" /> Print stickers
            </Link>
          )}
          {can(TMS_PERMISSIONS.INSPECTION_CONDUCT) && (
            <Link href="/inspections/scan" className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
              <ScanLine className="h-4 w-4" /> Scan bus
            </Link>
          )}
        </>}
      />

      {isError && <p className="text-red-600">{(error as Error).message}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(isLoading ? Array.from({ length: 4 }, () => null) : tiles).map((t, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            {t ? (<><p className="text-sm text-gray-500">{t.label}</p><p className={`text-2xl font-bold ${t.tone}`}>{t.value}</p></>)
               : <div className="h-12 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />}
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {data?.buses.map((b) => (
            <li key={b.vehicleId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-gray-900 dark:text-gray-100">
                  {b.registration}
                  {b.status === 'maintenance' && <span className="ml-2 rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">GROUNDED</span>}
                </p>
                <p className="truncate text-sm text-gray-500">{b.routeLabel ?? 'No active route'} · Last: {fmt(b.lastSubmittedAt)}{b.lastResult ? ` (${RESULT_TEXT[b.lastResult]})` : ''}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${DUE_BADGE[b.due.state]}`}>{dueText(b)}</span>
              {b.draftInspectionId ? (
                <Link href={`/inspections/${b.draftInspectionId}/check`} className="text-sm font-medium text-amber-700 hover:underline">Resume draft</Link>
              ) : b.lastInspectionId ? (
                <Link href={`/inspections/${b.lastInspectionId}`} className="text-sm font-medium text-green-700 hover:underline">View last</Link>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
