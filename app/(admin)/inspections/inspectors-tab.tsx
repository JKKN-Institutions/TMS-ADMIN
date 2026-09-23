'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { UserPlus } from 'lucide-react';
import { fetchInspectors, unassignInspector } from './inspection-api';
import { AssignDialog } from './assign-dialog';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export function InspectorsTab() {
  const qc = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({ queryKey: ['inspectors'], queryFn: fetchInspectors });

  const unassign = useMutation({
    mutationFn: (id: string) => unassignInspector(id),
    onSuccess: () => {
      toast.success('Checker removed from route');
      qc.invalidateQueries({ queryKey: ['inspectors'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">Inspector</th>
              <th className="px-4 py-3">Login</th>
              <th className="px-4 py-3">Route</th>
              <th className="px-4 py-3">Assigned</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading &&
              Array.from({ length: 3 }, (_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3" colSpan={6}>
                    <div className="h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                  </td>
                </tr>
              ))}
            {!isLoading && (data?.length ?? 0) === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400" colSpan={6}>
                  No inspectors assigned yet.
                </td>
              </tr>
            )}
            {data?.map((row) => (
              <tr key={row.id}>
                <td className="min-w-0 px-4 py-3">
                  <p className="truncate font-medium text-gray-900 dark:text-gray-100">{row.checkerName ?? row.checkerEmail}</p>
                  {row.designation && <p className="truncate text-xs text-gray-500 dark:text-gray-400">{row.designation}</p>}
                </td>
                <td className="min-w-0 px-4 py-3">
                  {row.unverifiedLogin ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      No login yet
                    </span>
                  ) : (
                    <span className="truncate text-gray-700 dark:text-gray-300">{row.loginEmail}</span>
                  )}
                </td>
                <td className="min-w-0 px-4 py-3 text-gray-700 dark:text-gray-300">
                  {row.routeNumber ?? '—'}
                  {row.routeName ? ` · ${row.routeName}` : ''}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-500 dark:text-gray-400">{fmtDate(row.assignedAt)}</td>
                <td className="min-w-0 max-w-[220px] truncate px-4 py-3 text-gray-500 dark:text-gray-400">{row.notes ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => unassign.mutate(row.id)}
                    disabled={unassign.isPending}
                    className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                  >
                    Unassign
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AssignDialog open={assignOpen} onOpenChange={setAssignOpen} />
    </div>
  );
}
