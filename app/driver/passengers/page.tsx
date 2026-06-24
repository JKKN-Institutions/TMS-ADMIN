'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, AlertTriangle, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { NoticeCard, PageHeader } from '@/components/driver/ui';
import { DataTable, type DataTableFilter } from '@/components/ui/data-table';
import { getPassengerColumns, type PassengerRow } from './columns';

interface RouteGroup {
  id: string;
  label: string;
  passengers: PassengerRow[];
}
type Resp = { data?: { totalPassengers: number; routes: RouteGroup[] }; notFound?: boolean };

async function fetchPassengers(): Promise<Resp> {
  const res = await fetch('/api/driver/passengers', { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error('Failed to load passengers');
  return { data: (await res.json()).data as { totalPassengers: number; routes: RouteGroup[] } };
}

/** Distinct non-empty labels → filter options. */
function optionsOf(values: (string | null)[]): { label: string; value: string }[] {
  return [...new Set(values.filter((v): v is string => !!v))]
    .sort((a, b) => a.localeCompare(b))
    .map((v) => ({ label: v, value: v }));
}

export default function DriverPassengersPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['driver-passengers'],
    queryFn: fetchPassengers,
  });

  const columns = useMemo(() => getPassengerColumns(), []);

  const routes = data?.data?.routes ?? [];
  // Flatten the per-route roster into one table; each passenger already carries its
  // routeLabel + stopLabel, so route/stop become sortable, filterable columns.
  const passengers = useMemo(() => routes.flatMap((rt) => rt.passengers), [routes]);

  const filters = useMemo<DataTableFilter[]>(() => {
    const f: DataTableFilter[] = [];
    const routeOpts = optionsOf(passengers.map((p) => p.routeLabel));
    const stopOpts = optionsOf(passengers.map((p) => p.stopLabel));
    if (routeOpts.length > 1) f.push({ columnId: 'route', title: 'Route', options: routeOpts });
    if (stopOpts.length > 1) f.push({ columnId: 'stop', title: 'Stop', options: stopOpts });
    return f;
  }, [passengers]);

  if (error) {
    return (
      <NoticeCard
        tone="red"
        icon={AlertTriangle}
        title="Couldn't load passengers"
        body="Something went wrong loading your passenger roster. Please refresh or try again shortly."
      />
    );
  }
  if (data?.notFound) {
    return (
      <NoticeCard
        tone="amber"
        icon={AlertTriangle}
        title="Driver profile not found"
        body="We couldn't find a driver record linked to your account. Please contact the transport office."
      />
    );
  }

  const total = data?.data?.totalPassengers ?? passengers.length;
  const routeCount = routes.filter((rt) => rt.passengers.length > 0).length;

  if (!isLoading && total === 0) {
    return (
      <NoticeCard
        tone="amber"
        icon={Users}
        title="No passengers"
        body="No bus-required learners are allocated to your route(s) yet."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Passengers"
        subtitle={
          isLoading
            ? 'Loading your roster…'
            : `${total} ${total === 1 ? 'rider' : 'riders'} across ${routeCount} ${routeCount === 1 ? 'route' : 'routes'}.`
        }
      />

      <DataTable
        columns={columns}
        data={passengers}
        entityName="passengers"
        isLoading={isLoading}
        enableRowSelection
        getRowId={(p) => p.id}
        searchPlaceholder="Search name, roll no, stop…"
        filters={filters}
        pageSize={15}
        toolbarActions={({ selectedRows, resetSelection }) => {
          if (selectedRows.length === 0) return null;
          const nums = selectedRows.map((p) => p.mobile).filter((m): m is string => !!m);
          return (
            <button
              type="button"
              onClick={() => {
                if (nums.length === 0) {
                  toast.error('Selected riders have no phone numbers');
                  return;
                }
                navigator.clipboard?.writeText(nums.join(', '));
                toast.success(`Copied ${nums.length} number${nums.length === 1 ? '' : 's'}`);
                resetSelection();
              }}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              <Copy className="h-4 w-4" />
              Copy numbers ({selectedRows.length})
            </button>
          );
        }}
      />
    </div>
  );
}
