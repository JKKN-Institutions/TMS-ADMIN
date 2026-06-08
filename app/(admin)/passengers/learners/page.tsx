'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap } from 'lucide-react';
import type { LearnerPassenger } from '@/lib/passengers/types';
import { DataTable } from '@/components/ui/data-table';
import { getLearnerColumns } from './columns';

async function fetchLearners(): Promise<LearnerPassenger[]> {
  // `cache: 'no-store'` keeps a brand-new dynamic route from being served a
  // stale/cached response (incl. a service-worker entry from before the route
  // existed). `credentials` is explicit so the session cookie always rides along.
  let res: Response;
  try {
    res = await fetch('/api/admin/passengers/learners', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch (e) {
    // Network-level failure (server down, SW/network interception) — fetch rejects.
    throw new Error(`Could not reach the learners API: ${(e as Error).message}`);
  }

  // If the route threw before returning JSON (e.g. a dev compile error page),
  // res.json() throws — surface the status instead of a blank generic error.
  let json: { success?: boolean; error?: string; data?: LearnerPassenger[] };
  try {
    json = await res.json();
  } catch {
    throw new Error(
      `Learners API returned a non-JSON response (HTTP ${res.status}). ` +
        `The dev server may still be compiling — retry in a moment.`
    );
  }

  if (!res.ok || !json.success) {
    // Carry the server's own message + status so the exact boundary is visible
    // (e.g. "Unauthorized (401)", "Forbidden (403)", "Failed to fetch learners (500)").
    throw new Error(`${json.error || 'Failed to fetch learners'} (HTTP ${res.status})`);
  }
  return json.data as LearnerPassenger[];
}

// Distinct, sorted option list for a faceted filter built from the live data.
function options(values: (string | null)[]): { label: string; value: string }[] {
  return Array.from(new Set(values.filter((v): v is string => !!v)))
    .sort((a, b) => a.localeCompare(b))
    .map((v) => ({ label: v, value: v }));
}

export default function LearnersPage() {
  const router = useRouter();
  const { data: learners = [], isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['passenger-learners'],
    queryFn: fetchLearners,
  });

  const columns = useMemo(
    () => getLearnerColumns((l) => router.push(`/passengers/learners/${l.id}`)),
    [router]
  );

  const total = learners.length;
  const assigned = learners.filter((l) => l.assigned).length;
  const unassigned = total - assigned;
  const institutions = new Set(learners.map((l) => l.institutionName).filter(Boolean)).size;
  const stats = [
    { label: 'Bus-Required Learners', value: total },
    { label: 'Route Assigned', value: assigned },
    { label: 'Unassigned', value: unassigned },
    { label: 'Institutions', value: institutions },
  ];

  const filters = useMemo(
    () => [
      { columnId: 'institution', title: 'Institution', options: options(learners.map((l) => l.institutionName)) },
      { columnId: 'department', title: 'Department', options: options(learners.map((l) => l.departmentName)) },
      { columnId: 'lifecycle', title: 'Status', options: options(learners.map((l) => l.lifecycleStatus)) },
      {
        columnId: 'assigned',
        title: 'Assignment',
        options: [
          { label: 'Assigned', value: 'assigned' },
          { label: 'Unassigned', value: 'unassigned' },
        ],
      },
    ],
    [learners]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Learners</h1>
          <p className="text-gray-600">Students who require transport (bus_required), from MyJKKN</p>
        </div>
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
          <GraduationCap className="mx-auto mb-3 h-10 w-10 text-gray-400" />
          <p className="font-medium text-gray-700">Failed to load learners.</p>
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
          getRowId={(l) => l.id}
          searchPlaceholder="Search name, roll no, email..."
          filters={filters}
        />
      )}
    </div>
  );
}
