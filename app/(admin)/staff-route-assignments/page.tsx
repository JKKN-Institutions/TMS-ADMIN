'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Users, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { SummaryCard, SummaryCards, useCardFilters } from '@/components/ui/summary-cards';
import { ExportMenu } from '@/components/ui/export-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { exportTable, type ExportColumn } from '@/lib/export/table-export';
import { assignmentPerson, getAssignmentColumns, type AssignmentRow } from './columns';

const EXPORT_COLUMNS: ExportColumn<AssignmentRow>[] = [
  { header: 'Staff', value: (a) => assignmentPerson(a), width: 28 },
  { header: 'Designation', value: (a) => a.staff_designation, width: 24 },
  { header: 'Email', value: (a) => a.staff_email, width: 32 },
  { header: 'Route no.', value: (a) => a.routes?.route_number, width: 10 },
  { header: 'Route', value: (a) => a.routes?.route_name, width: 28 },
  { header: 'Passengers', value: (a) => (a.routes ? `${a.routes.passenger_count ?? 0}${a.routes.capacity ? `/${a.routes.capacity}` : ''}` : '') },
  { header: 'Source', value: (a) => (a.source === 'self' ? 'Self-selected' : 'Admin') },
  { header: 'Assigned on', value: (a) => a.assigned_at?.slice(0, 10) },
];
import { AssignmentDeleteDialog } from './assignment-delete-dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function fetchAssignments(): Promise<AssignmentRow[]> {
  const res = await fetch('/api/admin/staff-route-assignments');
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load assignments');
  return (json.assignments || []) as AssignmentRow[];
}

const StaffRouteAssignmentsPage = () => {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [deleting, setDeleting] = useState<AssignmentRow | null>(null);
  const cf = useCardFilters();
  const [filteredRows, setFilteredRows] = useState<AssignmentRow[] | null>(null);
  const onFilteredRowsChange = useCallback((rows: AssignmentRow[], isFiltered: boolean) => {
    setFilteredRows(isFiltered ? rows : null);
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem('adminUser');
    if (userData) setUser(JSON.parse(userData));
  }, []);

  const {
    data: assignments = [],
    isLoading: loading,
    isError,
    refetch,
  } = useQuery({ queryKey: ['staff-route-assignments'], queryFn: fetchAssignments });

  useEffect(() => {
    if (isError) toast.error('Failed to load assignments');
  }, [isError]);

  const userRole = user?.role;
  const canManage = ['super_admin', 'transport_manager'].includes(userRole);
  const { can } = usePermissions();
  const canSeeBillReview = can(TMS_PERMISSIONS.FEES_VIEW);

  // Remove opens the styled confirm dialog; the dialog performs the DELETE.
  const columns = useMemo(
    () => getAssignmentColumns(setDeleting, canManage),
    [canManage]
  );

  const totalAssignments = assignments.length;
  const assignedRoutes = new Set(assignments.map((a) => a.route_id)).size;
  const selfSelected = assignments.filter((a) => a.source === 'self').length;
  const unmatched = assignments.filter((a) => !a.staff_name).length;

  return (
    <div className="space-y-6">
      <PageHeader
        description="Staff who ride a bus as its in-charge. Each assignment links one staff member to one route."
        actions={
          (canManage || canSeeBillReview) && (
            <>
              {canSeeBillReview && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => router.push('/staff-route-assignments/bill-review')}
                      className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <Receipt className="h-4 w-4" /> In-charge bill review
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Monthly check that cancels an in-charge&apos;s own transport bill when their bus was marked every service day.
                  </TooltipContent>
                </Tooltip>
              )}
              {canManage && (
                <>
                  <button
                    onClick={() => router.push('/staff-route-assignments/bulk-assign')}
                    className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <Users className="h-4 w-4" /> Bulk Assign
                  </button>
                  <button
                    onClick={() => router.push('/staff-route-assignments/assign')}
                    className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
                  >
                    <Plus className="h-4 w-4" /> Assign Route
                  </button>
                </>
              )}
            </>
          )
        }
      />

      <SummaryCards>
        <SummaryCard label="Assignments" value={totalAssignments} {...cf.allCard()} />
        <SummaryCard label="Routes covered" value={assignedRoutes} />
        <SummaryCard label="Self-selected" value={selfSelected} title="Staff who picked their own bus" {...cf.card('source', 'self')} />
        {unmatched > 0 && (
          <SummaryCard label="No staff record" value={unmatched} tone="warn" title="The assigned email matches no staff record" />
        )}
      </SummaryCards>

      <DataTable
        columns={columns}
        data={assignments}
        entityName="assignments"
        isLoading={loading}
        searchPlaceholder="Search staff name, email, route…"
        enableRowSelection={canManage}
        getRowId={(a) => a.id}
        columnFilters={cf.filters}
        onColumnFiltersChange={cf.setFilters}
        onFilteredRowsChange={onFilteredRowsChange}
        initialColumnVisibility={{ trip: false }}
        filters={[
          { columnId: 'source', title: 'Source', options: [{ label: 'Admin', value: 'admin' }, { label: 'Self-selected', value: 'self' }] },
        ]}
        toolbarActions={({ selectedRows }) => (
          <ExportMenu
            selectedCount={selectedRows.length}
            disabled={assignments.length === 0}
            onExport={(format) =>
              exportTable(format, {
                rows: selectedRows.length ? selectedRows : filteredRows ?? assignments,
                columns: EXPORT_COLUMNS,
                title: 'Staff route assignments',
                filename: 'staff-assignments',
              })
            }
          />
        )}
      />

      <AssignmentDeleteDialog
        assignment={deleting}
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        onDeleted={() => refetch()}
      />
    </div>
  );
};

export default StaffRouteAssignmentsPage;
