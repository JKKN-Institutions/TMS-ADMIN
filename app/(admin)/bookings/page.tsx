'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Download } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { istToday, addDays } from '@/lib/booking/window';
import { getBookingColumns } from './columns';
import { toBookingsCsv } from '@/lib/booking/bookings-csv';
import type { BookingListRow } from '@/lib/booking/admin-list';

interface RouteOpt { id: string; label: string }
interface BoardResp { from: string; to: string; rows: BookingListRow[] }

async function fetchRoutes(): Promise<RouteOpt[]> {
  const res = await fetch('/api/admin/routes', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) return [];
  const json = await res.json();
  const arr = (json.data ?? json.routes ?? []) as Array<Record<string, unknown>>;
  return arr.map((r) => ({
    id: String(r.id),
    label: `${(r.route_number ?? r.routeNumber ?? '—') as string} · ${(r.route_name ?? r.routeName ?? '') as string}`.trim(),
  }));
}

async function fetchBookings(from: string, to: string, routeId: string): Promise<BoardResp> {
  const qs = new URLSearchParams({ from, to });
  if (routeId) qs.set('route_id', routeId);
  const res = await fetch(`/api/admin/bookings?${qs.toString()}`, { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load bookings');
  return json.data as BoardResp;
}

const input = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800';
const outlineBtn = 'inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50';

function exportCsv(rows: BookingListRow[], dateStamp: string) {
  const blob = new Blob([toBookingsCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bookings_${dateStamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BookingsPage() {
  const today = istToday();
  const [from, setFrom] = useState<string>(today);
  const [to, setTo] = useState<string>(addDays(today, 92));
  const [routeId, setRouteId] = useState('');

  const { data: routes = [] } = useQuery({ queryKey: ['admin-routes'], queryFn: fetchRoutes });
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-bookings', from, to, routeId],
    queryFn: () => fetchBookings(from, to, routeId),
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const columns = useMemo(() => getBookingColumns(today), [today]);

  const stats = useMemo(() => {
    const learners = new Set(rows.map((r) => r.learner_id));
    const routeSet = new Set(rows.map((r) => r.route_id));
    const todayCount = rows.filter((r) => r.travel_date === today).length;
    return [
      { label: 'Bookings (in range)', value: rows.length },
      { label: 'Distinct Learners', value: learners.size },
      { label: 'Routes', value: routeSet.size },
      { label: "Today's Bookings", value: todayCount },
    ];
  }, [rows, today]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bookings</h1>
          <p className="text-gray-600 dark:text-gray-400">Daily bus bookings across all routes — read-only, over the live booking system.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <label className="text-sm">From<input type="date" className={`mt-1 block ${input}`} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm">To<input type="date" className={`mt-1 block ${input}`} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="text-sm">Route
          <select className={`mt-1 block ${input}`} value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            <option value="">All routes</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-sm text-gray-500">{s.label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {isError ? (
        <div className="py-16 text-center">
          <CalendarCheck className="mx-auto mb-3 h-10 w-10 text-gray-400" />
          <p className="text-gray-600 dark:text-gray-400">Failed to load bookings. Please retry.</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          entityName="bookings"
          isLoading={isLoading}
          getRowId={(r) => r.key}
          searchPlaceholder="Search learner, roll, route..."
          filters={[
            { columnId: 'dateStatus', title: 'When', options: [
              { label: 'Today', value: 'today' }, { label: 'Upcoming', value: 'upcoming' }, { label: 'Past', value: 'past' },
            ] },
            { columnId: 'booked_by_label', title: 'Booked By', options: [
              { label: 'Self', value: 'Self' }, { label: 'Admin', value: 'Admin' },
            ] },
          ]}
          toolbarActions={() => (
            <button type="button" className={outlineBtn} onClick={() => exportCsv(rows, today)} disabled={rows.length === 0}>
              <Download className="h-4 w-4" /> Export CSV
            </button>
          )}
        />
      )}
    </div>
  );
}
