'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bus } from 'lucide-react';
import type { LearnerPassenger } from '@/lib/passengers/types';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { getEnrollmentColumns } from './columns';

interface RouteOpt {
  id: string;
  label: string;
  stops: { id: string; name: string }[];
}
interface Data {
  learners: LearnerPassenger[];
  routes: RouteOpt[];
}

async function fetchData(): Promise<Data> {
  const res = await fetch('/api/admin/enrollment-requests', {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Failed to load (HTTP ${res.status})`);
  return json.data as Data;
}

// Distinct, sorted option list for a faceted filter, built from the live rows.
function options(values: (string | null)[]): { label: string; value: string }[] {
  return Array.from(new Set(values.filter((v): v is string => !!v)))
    .sort((a, b) => a.localeCompare(b))
    .map((v) => ({ label: v, value: v }));
}

export default function EnrollmentRequestsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-enrollment'],
    queryFn: fetchData,
  });

  const [editing, setEditing] = useState<LearnerPassenger | null>(null);
  const [routeId, setRouteId] = useState('');
  const [stopId, setStopId] = useState('');

  const allocate = useMutation({
    mutationFn: async (payload: { learnerId: string; routeId: string | null; stopId: string | null }) => {
      const res = await fetch('/api/admin/enrollment-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
    },
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['admin-enrollment'] });
    },
  });

  const learners = data?.learners ?? [];
  const routes = data?.routes ?? [];

  const openEdit = (l: LearnerPassenger) => {
    setEditing(l);
    setRouteId('');
    setStopId('');
  };
  const clearAllocation = (l: LearnerPassenger) =>
    allocate.mutate({ learnerId: l.id, routeId: null, stopId: null });

  // Callbacks close over stable refs (setState + mutation.mutate), so memoizing
  // the columns once is safe even though the closures are recreated each render.
  const columns = useMemo(
    () =>
      getEnrollmentColumns(
        openEdit,
        (l) => router.push(`/passengers/learners/${l.id}`),
        clearAllocation
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router]
  );

  const total = learners.length;
  const allocated = learners.filter((l) => l.assigned).length;
  const stats = [
    { label: 'Active Bus-Required', value: total },
    { label: 'Allocated', value: allocated },
    { label: 'Unallocated', value: total - allocated },
    { label: 'Institutions', value: new Set(learners.map((l) => l.institutionName).filter(Boolean)).size },
  ];

  const filters = useMemo(
    () => [
      { columnId: 'institution', title: 'Institution', options: options(learners.map((l) => l.institutionName)) },
      { columnId: 'department', title: 'Department', options: options(learners.map((l) => l.departmentName)) },
      {
        columnId: 'assigned',
        title: 'Allocation',
        options: [
          { label: 'Allocated', value: 'assigned' },
          { label: 'Unallocated', value: 'unassigned' },
        ],
      },
    ],
    [learners]
  );

  const selectedRoute = routes.find((r) => r.id === routeId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Transport Enrollment</h1>
        <p className="text-gray-600">
          Allocate a bus route and boarding stop to active, bus-required learners.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-500">{s.label}</p>
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      {isError ? (
        <div className="py-16 text-center">
          <Bus className="mx-auto mb-3 h-10 w-10 text-gray-400" />
          <p className="font-medium text-gray-700">Failed to load enrollment data.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            {(error as Error)?.message ?? 'Please retry.'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-60"
          >
            {isFetching ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={learners}
          entityName="learners"
          isLoading={isLoading}
          searchPlaceholder="Search name, roll no, email..."
          filters={filters}
        />
      )}

      <Dialog
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Allocate transport — {editing?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {editing?.assigned && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-800/50">
                Current: <span className="font-medium">{editing.routeLabel}</span> · {editing.stopLabel}
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-gray-600">Route</label>
              <select
                className="mt-1 w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm dark:border-gray-600"
                value={routeId}
                onChange={(e) => {
                  setRouteId(e.target.value);
                  setStopId('');
                }}
              >
                <option value="">Select a route…</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Boarding stop</label>
              <select
                className="mt-1 w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm disabled:opacity-50 dark:border-gray-600"
                value={stopId}
                onChange={(e) => setStopId(e.target.value)}
                disabled={!selectedRoute}
              >
                <option value="">Select a stop…</option>
                {selectedRoute?.stops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            {allocate.isError && (
              <p className="text-destructive text-xs">{(allocate.error as Error).message}</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            {editing?.assigned && (
              <Button
                variant="outline"
                onClick={() => editing && allocate.mutate({ learnerId: editing.id, routeId: null, stopId: null })}
                disabled={allocate.isPending}
              >
                Clear allocation
              </Button>
            )}
            <Button
              onClick={() => editing && allocate.mutate({ learnerId: editing.id, routeId, stopId })}
              disabled={!routeId || !stopId || allocate.isPending}
            >
              {allocate.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
