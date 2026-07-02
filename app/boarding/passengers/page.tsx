'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Users, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { RouteNotice } from '@/components/routes/route-ticket';
import { DataTable, type DataTableFilter } from '@/components/ui/data-table';
import { getPassengerColumns, type PassengerRow } from '@/components/passengers/roster-columns';

type Resp = { totalPassengers: number; passengers: PassengerRow[] };

async function fetchPassengers(): Promise<Resp> {
  const res = await fetch('/api/boarding/passengers', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error('Failed to load passengers');
  return (await res.json()).data as Resp;
}

/** Distinct non-empty labels → filter options. */
function optionsOf(values: (string | null)[]): { label: string; value: string }[] {
  return [...new Set(values.filter((v): v is string => !!v))]
    .sort((a, b) => a.localeCompare(b))
    .map((v) => ({ label: v, value: v }));
}

export default function BoardingPassengersPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['boarding-passengers'],
    queryFn: fetchPassengers,
  });

  const columns = useMemo(() => getPassengerColumns(), []);
  const passengers = useMemo(() => data?.passengers ?? [], [data]);

  const filters = useMemo<DataTableFilter[]>(() => {
    const f: DataTableFilter[] = [];
    // Type filter (Learner / Staff) — only when the roster actually mixes both.
    const hasLearners = passengers.some((p) => p.type === 'learner');
    const hasStaff = passengers.some((p) => p.type === 'staff');
    if (hasLearners && hasStaff) {
      f.push({
        columnId: 'type',
        title: 'Type',
        options: [
          { label: 'Learner', value: 'Learner' },
          { label: 'Staff', value: 'Staff' },
        ],
      });
    }
    const routeOpts = optionsOf(passengers.map((p) => p.routeLabel));
    const stopOpts = optionsOf(passengers.map((p) => p.stopLabel));
    if (routeOpts.length > 1) f.push({ columnId: 'route', title: 'Route', options: routeOpts });
    if (stopOpts.length > 1) f.push({ columnId: 'stop', title: 'Stop', options: stopOpts });
    return f;
  }, [passengers]);

  if (error) {
    return (
      <RouteNotice
        tone="red"
        icon={AlertTriangle}
        title="Couldn't load passengers"
        body="Something went wrong loading your passenger roster. Please refresh or try again shortly."
      />
    );
  }

  const total = data?.totalPassengers ?? passengers.length;
  const learnerCount = passengers.filter((p) => p.type === 'learner').length;
  const staffCount = passengers.filter((p) => p.type === 'staff').length;
  const routeCount = new Set(passengers.map((p) => p.routeLabel).filter(Boolean)).size;

  if (!isLoading && total === 0) {
    return (
      <RouteNotice
        tone="amber"
        icon={Users}
        title="No passengers"
        body="No bus-required learners or staff are allocated to your route(s) yet."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Passengers</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {isLoading
            ? 'Loading your roster…'
            : `${total} ${total === 1 ? 'rider' : 'riders'} (${learnerCount} learner${
                learnerCount === 1 ? '' : 's'
              } · ${staffCount} staff) across ${routeCount} ${routeCount === 1 ? 'route' : 'routes'}.`}
        </p>
      </div>

      <DataTable
        columns={columns}
        data={passengers}
        entityName="passengers"
        isLoading={isLoading}
        enableRowSelection
        // Prefix with type: learner and staff ids come from different tables, so a
        // bare id could (in theory) collide and break row selection.
        getRowId={(p) => `${p.type}:${p.id}`}
        searchPlaceholder="Search name, roll/staff no, stop…"
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
