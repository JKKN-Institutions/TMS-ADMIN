'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { UserPlus } from 'lucide-react';
import { fetchInspectors, unassignInspector } from './inspection-api';
import { AssignDialog } from './assign-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { getInspectorColumns, inspectorName } from './columns';

export function InspectorsTab() {
  const qc = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; name: string; route: string } | null>(null);

  const { data, isLoading, isError, error } = useQuery({ queryKey: ['inspectors'], queryFn: fetchInspectors });

  const unassign = useMutation({
    mutationFn: (id: string) => unassignInspector(id),
    onSuccess: () => {
      toast.success('Inspector removed from route');
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ['inspectors'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => data ?? [], [data]);
  const columns = useMemo(
    () =>
      getInspectorColumns(
        (row) =>
          setRemoving({
            id: row.id,
            name: inspectorName(row),
            route: `${row.routeNumber ?? '—'}${row.routeName ? ` · ${row.routeName}` : ''}`,
          }),
        unassign.isPending
      ),
    [unassign.isPending]
  );
  const routeOptions = useMemo(() => {
    const nums = new Set<string>();
    for (const r of rows) if (r.routeNumber) nums.add(r.routeNumber);
    return [...nums]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((n) => ({ label: n, value: n }));
  }, [rows]);

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setAssignOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
        >
          <UserPlus className="h-4 w-4" />
          Assign inspector
        </button>
      </div>

      {isError && <p className="text-sm text-red-600 dark:text-red-400">{(error as Error).message}</p>}

      <DataTable
        columns={columns}
        data={rows}
        entityName="inspectors"
        isLoading={isLoading}
        getRowId={(r) => r.id}
        searchPlaceholder="Search inspector, login or route..."
        emptyMessage="No inspectors assigned yet."
        filters={[
          ...(routeOptions.length ? [{ columnId: 'route', title: 'Route', options: routeOptions }] : []),
          { columnId: 'login', title: 'Login', options: [{ label: 'Has login', value: 'has' }, { label: 'No login yet', value: 'none' }] },
        ]}
      />

      <AssignDialog open={assignOpen} onOpenChange={setAssignOpen} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && !unassign.isPending && setRemoving(null)}
        title={`Unassign ${removing?.name ?? ''}?`}
        description={`They will stop inspecting route ${removing?.route ?? ''}. Their past inspections are kept.`}
        confirmLabel="Unassign"
        danger
        loading={unassign.isPending}
        onConfirm={() => removing && unassign.mutate(removing.id)}
      />
    </div>
  );
}
