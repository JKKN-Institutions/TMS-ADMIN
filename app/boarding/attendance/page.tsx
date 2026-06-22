'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle, ListChecks, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable, type DataTableFilter } from '@/components/ui/data-table';
import { getAttendanceColumns, type AttendanceRecord } from './columns';

interface RouteOpt { id: string; route_number: string | null; route_name: string | null }

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function BoardingAttendancePage() {
  const [routes, setRoutes] = useState<RouteOpt[]>([]);
  const [date, setDate] = useState(todayStr());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Route filter options come from the dashboard endpoint (already route-scoped).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/boarding/dashboard', { cache: 'no-store', credentials: 'same-origin' });
        const json = await res.json();
        if (res.ok && json.success) setRoutes((json.data?.routes ?? []) as RouteOpt[]);
      } catch { /* non-fatal — the route filter just stays empty */ }
    })();
  }, []);

  // The DAY is the server query; route/direction/status filtering is client-side
  // (the DataTable), so changing those doesn't re-hit the API.
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/boarding/attendance?date=${date}`, { cache: 'no-store', credentials: 'same-origin' });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load attendance');
        setRecords(json.data.records as AttendanceRecord[]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load attendance');
        setRecords([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [date]);

  const columns = useMemo(() => getAttendanceColumns(), []);

  // Day totals (independent of the client-side table filters).
  const counts = useMemo(() => ({
    total: records.length,
    present: records.filter((r) => r.status === 'present').length,
    absent: records.filter((r) => r.status === 'absent').length,
  }), [records]);

  const routeOptions = useMemo(
    () => routes.map((r) => ({ label: r.route_number || '—', value: r.route_number || '' })).filter((o) => o.value),
    [routes]
  );

  // Download the selected rows as CSV (handy for a quick report of one day).
  const exportCsv = (rows: AttendanceRecord[]) => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Learner', 'Roll No.', 'Route', 'Direction', 'Status', 'Method', 'Marked At'];
    const lines = [header.map(esc).join(',')];
    for (const r of rows) {
      lines.push([r.learner_name, r.roll_number, r.route_number, r.direction, r.status, r.method, r.scanned_at].map(esc).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filters: DataTableFilter[] = [
    ...(routeOptions.length > 1 ? [{ columnId: 'route_number', title: 'Route', options: routeOptions }] : []),
    { columnId: 'direction', title: 'Direction', options: [{ label: 'Onward', value: 'onward' }, { label: 'Return', value: 'return' }] },
    { columnId: 'status', title: 'Status', options: [{ label: 'Present', value: 'present' }, { label: 'Absent', value: 'absent' }] },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
          <p className="text-gray-600 mt-1 text-sm">Boarding records across your routes. Pick a day; filter and search within it.</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Day</label>
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className="h-[38px] rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
      </div>

      {/* Day totals */}
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-gray-700">
          <ListChecks className="h-4 w-4 text-gray-400" /> {counts.total} records
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-green-700 dark:text-green-300">
          <CheckCircle2 className="h-4 w-4" /> {counts.present} present
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-red-700 dark:text-red-300">
          <XCircle className="h-4 w-4" /> {counts.absent} absent
        </span>
      </div>

      <DataTable
        columns={columns}
        data={records}
        entityName="records"
        isLoading={loading}
        searchPlaceholder="Search learner, roll #..."
        pageSize={20}
        filters={filters}
        enableRowSelection
        getRowId={(r) => r.id}
        toolbarActions={({ selectedRows }) =>
          selectedRows.length > 0 ? (
            <button
              type="button"
              onClick={() => exportCsv(selectedRows)}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Download className="h-4 w-4" /> Export Selected ({selectedRows.length})
            </button>
          ) : null
        }
      />
    </div>
  );
}
