'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CalendarDays, Ban, Users, Plus, Trash2, RefreshCw, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { formatDate } from '@/lib/format/display';

type Tab = 'calendar' | 'windows' | 'manifest';
const istToday = () => new Date(Date.now() + (5 * 60 + 30) * 60_000).toISOString().slice(0, 10);

interface RouteOpt { id: string; label: string }
async function fetchRoutes(): Promise<RouteOpt[]> {
  const res = await fetch('/api/admin/routes', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) return [];
  const json = await res.json();
  const arr = (json.data ?? json.routes ?? json ?? []) as Array<Record<string, unknown>>;
  return arr.map((r) => ({
    id: String(r.id),
    label: `${(r.route_number ?? r.routeNumber ?? '—') as string} · ${(r.route_name ?? r.routeName ?? '') as string}`.trim(),
  }));
}

export default function SchedulesPage() {
  const [tab, setTab] = useState<Tab>('calendar');
  const { data: routes = [] } = useQuery({ queryKey: ['admin-routes'], queryFn: fetchRoutes });

  return (
    <div className="space-y-6">
      <PageHeader description="Holidays and no-service days, per-route booking windows, and each day's bus load." />

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
        <TabButton active={tab === 'calendar'} onClick={() => setTab('calendar')} icon={<CalendarDays className="h-4 w-4" />} label="Service Calendar" />
        <TabButton active={tab === 'windows'} onClick={() => setTab('windows')} icon={<Ban className="h-4 w-4" />} label="Booking Windows" />
        <TabButton active={tab === 'manifest'} onClick={() => setTab('manifest')} icon={<Users className="h-4 w-4" />} label="Load & Manifest" />
      </div>

      {tab === 'calendar' && <ServiceCalendarTab />}
      {tab === 'windows' && <BookingWindowsTab routes={routes} />}
      {tab === 'manifest' && <ManifestTab />}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${active ? 'border-green-600 text-green-700 dark:text-green-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
      {icon}{label}
    </button>
  );
}

const card = 'rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900';
const input = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800';


/* ---- Shared: dated rows, upcoming first, past collapsed ---- */
// Shared empty list, so a still-loading query hands DatedTable the same array
// every render instead of a fresh `[]`.
const NO_ROWS: never[] = [];

// Both lists used to be plain text lines in date order, so this term's
// upcoming holidays sat under every past one. Upcoming rows now come first in
// a table; past rows fold away. Deletes confirm first.
function DatedTable<T extends { id: string }>({
  rows, dateKey, columns, onDelete, deleting, describe, empty,
}: {
  rows: T[];
  /** The row's YYYY-MM-DD (or ISO timestamp) field. */
  dateKey: keyof T & string;
  columns: { header: string; cell: (r: T) => React.ReactNode }[];
  onDelete: (r: T) => Promise<unknown>;
  deleting: boolean;
  describe: (r: T) => string;
  empty: string;
}) {
  const today = istToday();
  const [pending, setPending] = useState<T | null>(null);
  const dateOf = (r: T) => String(r[dateKey]).slice(0, 10);
  // Pre-sorted: the table has no default sort, so this order is what shows.
  const { upcoming, past } = useMemo(() => {
    const day = (r: T) => String(r[dateKey]);
    return {
      upcoming: rows.filter((r) => day(r).slice(0, 10) >= today).sort((a, b) => day(a).localeCompare(day(b))),
      past: rows.filter((r) => day(r).slice(0, 10) < today).sort((a, b) => day(b).localeCompare(day(a))),
    };
  }, [rows, dateKey, today]);

  // Callers pass `columns` inline, so this rebuilds each render; harmless with
  // no onFilteredRowsChange, and it keeps every caller's cells current.
  const tableColumns: ColumnDef<T>[] = [
    {
      id: 'date',
      accessorFn: dateOf,
      meta: { label: 'Date' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => {
        const d = dateOf(row.original);
        const weekday = new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' });
        return (
          <span className="whitespace-nowrap font-medium text-gray-900 dark:text-gray-100">
            {formatDate(d)} <span className="text-xs font-normal text-gray-500">{weekday}</span>
          </span>
        );
      },
    },
    ...columns.map<ColumnDef<T>>((c) => ({
      id: c.header,
      enableSorting: false,
      meta: { label: c.header },
      header: c.header,
      cell: ({ row }) => c.cell(row.original),
    })),
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      size: 60,
      header: () => <span className="sr-only">Delete</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setPending(row.original)}
            aria-label={`Delete ${describe(row.original)}`}
            title="Delete"
            className="rounded-md p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  const table = (list: T[]) => (
    <DataTable columns={tableColumns} data={list} compact getRowId={(r) => r.id} entityName="dates" />
  );

  return (
    <div className={card}>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">{empty}</p>
      ) : (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Upcoming ({upcoming.length})</h3>
          {upcoming.length ? table(upcoming) : <p className="text-sm text-gray-500">Nothing upcoming.</p>}
          {past.length > 0 && (
            <details className="group/past">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400">
                <ChevronRight className="h-4 w-4 transition-transform group-open/past:rotate-90" /> Past ({past.length})
              </summary>
              <div className="mt-2 opacity-80">{table(past)}</div>
            </details>
          )}
        </div>
      )}
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && !deleting && setPending(null)}
        title={`Delete ${pending ? describe(pending) : ''}?`}
        description="Bookings for that date go back to the normal rules."
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={async () => {
          if (pending) await onDelete(pending).catch(() => undefined);
          setPending(null);
        }}
      />
    </div>
  );
}

function TypeBadge({ tone, children }: { tone: 'red' | 'amber' | 'green' | 'gray'; children: React.ReactNode }) {
  const cls = {
    red: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    green: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
    gray: 'bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300',
  }[tone];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

/* ---- Tab 1: Service Calendar ---- */
interface ServiceCalRow { id: string; exception_date: string; route_id: string | null; kind: 'holiday' | 'no_service'; note: string | null }
function ServiceCalendarTab() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['svc-cal'],
    queryFn: async () => {
      const res = await fetch('/api/admin/schedules/service-calendar', { cache: 'no-store', credentials: 'same-origin' });
      return ((await res.json()).data?.rows ?? []) as ServiceCalRow[];
    },
  });
  const [date, setDate] = useState(istToday());
  const [kind, setKind] = useState<'holiday' | 'no_service'>('holiday');
  const [note, setNote] = useState('');

  const add = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/schedules/service-calendar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ exception_date: date, kind, note: note || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed');
    },
    onSuccess: () => { toast.success('Saved'); setNote(''); qc.invalidateQueries({ queryKey: ['svc-cal'] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/schedules/service-calendar?id=${id}`, { method: 'DELETE', credentials: 'same-origin' });
      if (!res.ok) throw new Error('Failed');
    },
    onSuccess: () => { toast.success('Removed'); qc.invalidateQueries({ queryKey: ['svc-cal'] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to remove'),
  });

  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-wrap items-end gap-3`}>
        <label className="text-sm">Date<input type="date" className={`mt-1 block ${input}`} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="text-sm">Type
          <select className={`mt-1 block ${input}`} value={kind} onChange={(e) => setKind(e.target.value as 'holiday' | 'no_service')}>
            <option value="holiday">Holiday (all routes)</option>
            <option value="no_service">No service</option>
          </select>
        </label>
        <label className="flex-1 text-sm">Note<input className={`mt-1 block w-full ${input}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Pongal" /></label>
        <button type="button" disabled={add.isPending} onClick={() => add.mutate()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-500 disabled:opacity-50">
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>
      <DatedTable
        rows={data ?? NO_ROWS}
        dateKey="exception_date"
        empty="No holidays or no-service days added."
        describe={(r) => `${r.kind === 'holiday' ? 'holiday' : 'no-service day'} on ${formatDate(r.exception_date)}`}
        deleting={del.isPending}
        onDelete={(r) => del.mutateAsync(r.id)}
        columns={[
          { header: 'Type', cell: (r) => (r.kind === 'holiday' ? <TypeBadge tone="red">Holiday</TypeBadge> : <TypeBadge tone="amber">No service</TypeBadge>) },
          { header: 'Applies to', cell: (r) => (r.route_id ? 'One route' : 'All routes') },
          { header: 'Note', cell: (r) => r.note || <span className="text-gray-400">—</span> },
        ]}
      />
    </div>
  );
}

/* ---- Tab 2: Booking Windows ---- */
interface WindowRow { id: string; travel_date: string; booking_enabled: boolean; deadline: string | null; capacity_override: number | null; note: string | null }
function BookingWindowsTab({ routes }: { routes: RouteOpt[] }) {
  const qc = useQueryClient();
  const [routeId, setRouteId] = useState('');
  const [date, setDate] = useState(istToday());
  const [enabled, setEnabled] = useState(true);
  const [deadline, setDeadline] = useState('');
  const [cap, setCap] = useState('');

  const { data } = useQuery({
    queryKey: ['windows', routeId],
    queryFn: async () => {
      if (!routeId) return [] as WindowRow[];
      const res = await fetch(`/api/admin/schedules/booking-window?route_id=${routeId}`, { cache: 'no-store', credentials: 'same-origin' });
      return ((await res.json()).data?.rows ?? []) as WindowRow[];
    },
    enabled: !!routeId,
  });

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/schedules/booking-window', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ route_id: routeId, travel_date: date, booking_enabled: enabled, deadline: deadline ? new Date(deadline).toISOString() : null, capacity_override: cap !== '' ? Number(cap) : null }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed');
    },
    onSuccess: () => { toast.success('Window saved'); qc.invalidateQueries({ queryKey: ['windows', routeId] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/schedules/booking-window?id=${id}`, { method: 'DELETE', credentials: 'same-origin' });
      if (!res.ok) throw new Error('Failed');
    },
    onSuccess: () => { toast.success('Removed'); qc.invalidateQueries({ queryKey: ['windows', routeId] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to remove'),
  });

  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-wrap items-end gap-3`}>
        <label className="text-sm">Route
          <select className={`mt-1 block ${input}`} value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            <option value="">Select route…</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
        <label className="text-sm">Date<input type="date" className={`mt-1 block ${input}`} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Booking enabled</label>
        <label className="text-sm">Deadline<input type="datetime-local" className={`mt-1 block ${input}`} value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
        <label className="text-sm">Cap<input type="number" min={0} className={`mt-1 block w-24 ${input}`} value={cap} onChange={(e) => setCap(e.target.value)} placeholder="auto" /></label>
        <button type="button" disabled={!routeId || save.isPending} onClick={() => save.mutate()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-500 disabled:opacity-50">Save window</button>
      </div>
      {routeId && (
        <DatedTable
          rows={data ?? NO_ROWS}
          dateKey="travel_date"
          empty="No changes for this route — the normal booking deadline applies."
          describe={(w) => `booking window on ${formatDate(w.travel_date)}`}
          deleting={del.isPending}
          onDelete={(w) => del.mutateAsync(w.id)}
          columns={[
            { header: 'Booking', cell: (w) => (w.booking_enabled ? <TypeBadge tone="green">Open</TypeBadge> : <TypeBadge tone="red">Closed</TypeBadge>) },
            { header: 'Deadline', cell: (w) => (w.deadline ? new Date(w.deadline).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : <span className="text-gray-400">Normal</span>) },
            { header: 'Seat limit', cell: (w) => (w.capacity_override != null ? w.capacity_override : <span className="text-gray-400">Bus seats</span>) },
          ]}
        />
      )}
    </div>
  );
}

/* ---- Tab 3: Load & Manifest ---- */
interface SummaryRoute { id: string; label: string; booked: number; capacity: number }
interface Manifest { routeLabel: string; booked: number; capacity: number; learners: Array<{ id: string; name: string; roll: string | null; stop: string | null }> }
function ManifestTab() {
  const [date, setDate] = useState(istToday());
  const [openRoute, setOpenRoute] = useState<string | null>(null);

  const { data: summary, refetch, isFetching } = useQuery({
    queryKey: ['load', date],
    queryFn: async () => {
      const res = await fetch(`/api/admin/bookings/summary?date=${date}`, { cache: 'no-store', credentials: 'same-origin' });
      return ((await res.json()).data?.routes ?? []) as SummaryRoute[];
    },
  });
  const { data: manifest } = useQuery({
    queryKey: ['manifest', openRoute, date],
    queryFn: async () => {
      const res = await fetch(`/api/admin/schedules/manifest?route_id=${openRoute}&date=${date}`, { cache: 'no-store', credentials: 'same-origin' });
      return (await res.json()).data as Manifest;
    },
    enabled: !!openRoute,
  });

  return (
    <div className="space-y-4">
      <div className={`${card} flex items-end gap-3`}>
        <label className="text-sm">Date<input type="date" className={`mt-1 block ${input}`} value={date} onChange={(e) => { setDate(e.target.value); setOpenRoute(null); }} /></label>
        <button type="button" onClick={() => refetch()} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700">
          {isFetching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
        </button>
      </div>
      <div className={card}>
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {(summary ?? []).map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpenRoute(openRoute === r.id ? null : r.id)} className="flex w-full items-center justify-between py-2 text-left text-sm">
                <span className="font-medium">{r.label}</span>
                <span className="tabular-nums text-gray-600 dark:text-gray-300">{r.booked}/{r.capacity} booked</span>
              </button>
              {openRoute === r.id && manifest && (
                <div className="pb-3 pl-2 text-sm">
                  {manifest.learners.length === 0 ? <p className="text-gray-500">No bookings.</p> : (
                    <ol className="list-decimal space-y-0.5 pl-5">
                      {manifest.learners.map((l) => <li key={l.id}>{l.name}{l.roll ? ` (${l.roll})` : ''}{l.stop ? ` — ${l.stop}` : ''}</li>)}
                    </ol>
                  )}
                </div>
              )}
            </li>
          ))}
          {(summary ?? []).length === 0 && <li className="py-2 text-sm text-gray-500">No active routes.</li>}
        </ul>
      </div>
    </div>
  );
}
