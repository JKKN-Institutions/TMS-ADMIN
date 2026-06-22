'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ComponentType } from 'react';
import { AlertTriangle, CalendarCheck2, CheckCircle2, Percent, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DataTable } from '@/components/ui/data-table';
import { getAttendanceColumns, type AttendanceRow } from './columns';

async function fetchAttendance(): Promise<AttendanceRow[]> {
  const res = await fetch('/api/student/attendance', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error('Failed to load attendance');
  return (await res.json()).data as AttendanceRow[];
}

export default function StudentAttendancePage() {
  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ['student-attendance'],
    queryFn: fetchAttendance,
  });

  // No callbacks or permission flags drive these columns, so they never change.
  const columns = useMemo(() => getAttendanceColumns(), []);

  const total = items.length;
  const present = items.filter((a) => a.status === 'present').length;
  const absent = items.filter((a) => a.status === 'absent').length;
  const rate = total > 0 ? Math.round((present / total) * 100) : 0;

  if (error) {
    return (
      <div className="max-w-xl rounded-xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Couldn&apos;t load your attendance</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Something went wrong while loading your boarding history. Please refresh the page or try again shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* heading */}
      <header>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white sm:text-2xl">My Attendance</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Your boarding history across morning and evening trips.
        </p>
      </header>

      {/* summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          icon={CalendarCheck2}
          label="Total trips"
          value={String(total)}
          tone="bg-gradient-to-br from-blue-500 to-indigo-600"
          loading={isLoading}
        />
        <Stat
          icon={CheckCircle2}
          label="Present"
          value={String(present)}
          tone="bg-gradient-to-br from-green-500 to-emerald-600"
          loading={isLoading}
        />
        <Stat
          icon={XCircle}
          label="Absent"
          value={String(absent)}
          tone="bg-gradient-to-br from-red-500 to-rose-600"
          loading={isLoading}
        />
        <Stat
          icon={Percent}
          label="Attendance"
          value={`${rate}%`}
          tone="bg-gradient-to-br from-purple-500 to-violet-600"
          loading={isLoading}
        />
      </div>

      {/* table */}
      <DataTable
        columns={columns}
        data={items}
        entityName="records"
        isLoading={isLoading}
        searchPlaceholder="Search route, stop..."
        filters={[
          {
            columnId: 'status',
            title: 'Status',
            options: [
              { label: 'Present', value: 'present' },
              { label: 'Absent', value: 'absent' },
            ],
          },
          {
            columnId: 'direction',
            title: 'Direction',
            options: [
              { label: 'Onward', value: 'onward' },
              { label: 'Return', value: 'return' },
            ],
          },
        ]}
      />
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
  loading,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-3">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm', tone)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white">{loading ? '—' : value}</p>
        </div>
      </div>
    </div>
  );
}
