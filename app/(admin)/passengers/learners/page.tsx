'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap } from 'lucide-react';
import type { LearnerPassenger } from '@/lib/passengers/types';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { SummaryCard, SummaryCards, useCardFilters } from '@/components/ui/summary-cards';
import { ExportMenu } from '@/components/ui/export-menu';
import { AllocateRouteDialog } from '@/components/passengers/allocate-route-dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { exportTable, type ExportColumn } from '@/lib/export/table-export';
import { titleCase } from '@/lib/format/display';
import { getLearnerColumns } from './columns';

const EXPORT_COLUMNS: ExportColumn<LearnerPassenger>[] = [
  { header: 'Name', value: (l) => titleCase(l.name), width: 28 },
  { header: 'Roll / Reg No.', value: (l) => l.rollNumber ?? l.registerNumber },
  { header: 'Email', value: (l) => l.email, width: 32 },
  { header: 'Mobile', value: (l) => l.mobile },
  { header: 'Institution', value: (l) => l.institutionName, width: 32 },
  { header: 'Department', value: (l) => l.departmentName, width: 28 },
  { header: 'Status', value: (l) => l.lifecycleStatus },
  { header: 'Route', value: (l) => l.routeLabel, width: 32 },
  { header: 'Boarding stop', value: (l) => l.stopLabel, width: 24 },
  { header: 'Assignment', value: (l) => (l.assigned ? 'Assigned' : 'Unassigned') },
];

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

function LearnersView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can, isSuperAdmin } = usePermissions();
  const canAssign = isSuperAdmin || can(TMS_PERMISSIONS.ENROLLMENT_MANAGE);
  const { data: learners = [], isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['passenger-learners'],
    queryFn: fetchLearners,
  });

  // The retired Enrollments page redirects here with ?assignment=unassigned.
  const initialAssignment = searchParams?.get('assignment');
  const cf = useCardFilters(
    initialAssignment === 'unassigned' || initialAssignment === 'assigned'
      ? [{ id: 'assigned', value: initialAssignment }]
      : []
  );
  const [assigning, setAssigning] = useState<LearnerPassenger | null>(null);
  const [filteredRows, setFilteredRows] = useState<LearnerPassenger[] | null>(null);
  const onFilteredRowsChange = useCallback((rows: LearnerPassenger[], isFiltered: boolean) => {
    setFilteredRows(isFiltered ? rows : null);
  }, []);

  const columns = useMemo(
    () => getLearnerColumns((l) => router.push(`/passengers/learners/${l.id}`), canAssign ? setAssigning : undefined),
    [router, canAssign]
  );

  const total = learners.length;
  const assigned = learners.filter((l) => l.assigned).length;
  const unassigned = total - assigned;
  const institutions = new Set(learners.map((l) => l.institutionName).filter(Boolean)).size;

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
      <PageHeader description="Learners who need the college bus, with their route and boarding stop. Assign a route from any row." />

      <SummaryCards>
        <SummaryCard label="All learners" value={total.toLocaleString()} {...cf.allCard()} />
        <SummaryCard label="Route assigned" value={assigned.toLocaleString()} tone="good" {...cf.card('assigned', 'assigned')} />
        <SummaryCard
          label="Unassigned"
          value={unassigned.toLocaleString()}
          tone={unassigned ? 'warn' : 'neutral'}
          title="Need a route and boarding stop"
          {...cf.card('assigned', 'unassigned')}
        />
        <SummaryCard label="Institutions" value={institutions} />
      </SummaryCards>

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
          enableRowSelection
          getRowId={(l) => l.id}
          searchPlaceholder="Search name, roll no, email..."
          filters={filters}
          columnFilters={cf.filters}
          onColumnFiltersChange={cf.setFilters}
          onFilteredRowsChange={onFilteredRowsChange}
          initialColumnVisibility={{ department: false, lifecycle: false }}
          toolbarActions={({ selectedRows }) => (
            <ExportMenu
              selectedCount={selectedRows.length}
              disabled={learners.length === 0}
              onExport={(format) => {
                const rows = selectedRows.length ? selectedRows : filteredRows ?? learners;
                return exportTable(format, {
                  rows,
                  columns: EXPORT_COLUMNS,
                  title: 'Learners — Transport',
                  filename: 'learners',
                  summary: `${rows.filter((l) => l.assigned).length} assigned · ${rows.filter((l) => !l.assigned).length} unassigned`,
                });
              }}
            />
          )}
        />
      )}

      <AllocateRouteDialog learner={assigning} onOpenChange={(o) => !o && setAssigning(null)} />
    </div>
  );
}

// useSearchParams() needs a Suspense boundary for the build's prerender pass.
export default function LearnersPage() {
  return (
    <Suspense fallback={null}>
      <LearnersView />
    </Suspense>
  );
}
