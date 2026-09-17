'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import type { StaffPassenger } from '@/lib/passengers/types';
import { DataTable } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { getStaffColumns } from './columns';

// "Delete" = remove from transport. The staff row itself lives in MyJKKN's HR
// directory and is never deleted (see lib/passengers/remove-staff.ts).
async function removeFromTransport(ids: string[]) {
  const res = await fetch('/api/admin/passengers/staff', {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error || `Failed to remove staff (HTTP ${res.status})`);
  return json.data as { removed: number; skipped: number; inchargeAssignments: number };
}

const REMOVE_DESCRIPTION =
  'They will be taken off transport: removed from this list and their route, and they lose TMS access. ' +
  'Their MyJKKN staff record is NOT deleted — turn "bus required" back on in MyJKKN to re-add them.';

async function fetchStaff(): Promise<StaffPassenger[]> {
  // `cache: 'no-store'` keeps a brand-new dynamic route from being served a
  // stale/cached response (incl. a service-worker entry from before the route
  // existed). `credentials` is explicit so the session cookie always rides along.
  let res: Response;
  try {
    res = await fetch('/api/admin/passengers/staff', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch (e) {
    // Network-level failure (server down, SW/network interception) — fetch rejects.
    throw new Error(`Could not reach the staff API: ${(e as Error).message}`);
  }

  // If the route threw before returning JSON (e.g. a dev compile error page),
  // res.json() throws — surface the status instead of a blank generic error.
  let json: { success?: boolean; error?: string; data?: StaffPassenger[] };
  try {
    json = await res.json();
  } catch {
    throw new Error(
      `Staff API returned a non-JSON response (HTTP ${res.status}). ` +
        `The dev server may still be compiling — retry in a moment.`
    );
  }

  if (!res.ok || !json.success) {
    // Carry the server's own message + status so the exact boundary is visible
    // (e.g. "Unauthorized (401)", "Forbidden (403)", "Failed to fetch staff (500)").
    throw new Error(`${json.error || 'Failed to fetch staff'} (HTTP ${res.status})`);
  }
  return json.data as StaffPassenger[];
}

function options(values: (string | null)[]): { label: string; value: string }[] {
  return Array.from(new Set(values.filter((v): v is string => !!v)))
    .sort((a, b) => a.localeCompare(b))
    .map((v) => ({ label: v, value: v }));
}

export default function StaffPassengersPage() {
  const router = useRouter();
  const { data: staff = [], isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['passenger-staff'],
    queryFn: fetchStaff,
  });

  const queryClient = useQueryClient();
  const { can, isSuperAdmin } = usePermissions();
  const canRemove = isSuperAdmin || can(TMS_PERMISSIONS.ENROLLMENT_MANAGE);
  const [removeTarget, setRemoveTarget] = useState<{ rows: StaffPassenger[]; reset?: () => void } | null>(null);
  const [removing, setRemoving] = useState(false);

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const r = await removeFromTransport(removeTarget.rows.map((s) => s.id));
      toast.success(`Removed ${r.removed} staff from transport`);
      if (r.inchargeAssignments > 0) {
        toast(`${r.inchargeAssignments} active bus in-charge assignment(s) remain — end them on Staff Route Assignments.`, {
          icon: '⚠️',
          duration: 8000,
        });
      }
      removeTarget.reset?.();
      setRemoveTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['passenger-staff'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove staff');
    } finally {
      setRemoving(false);
    }
  };

  const columns = useMemo(
    () =>
      getStaffColumns(
        (s) => router.push(`/passengers/staff/${s.id}`),
        (s) => setRemoveTarget({ rows: [s] }),
        canRemove
      ),
    [router, canRemove]
  );

  const total = staff.length;
  const assigned = staff.filter((s) => s.assigned).length;
  const unassigned = total - assigned;
  const activeCount = staff.filter((s) => s.isActive).length;
  const stats = [
    { label: 'Bus-Required Staff', value: total },
    { label: 'Route Assigned', value: assigned },
    { label: 'Unassigned', value: unassigned },
    { label: 'Active', value: activeCount },
  ];

  const filters = useMemo(
    () => [
      { columnId: 'institution', title: 'Institution', options: options(staff.map((s) => s.institutionName)) },
      { columnId: 'department', title: 'Department', options: options(staff.map((s) => s.departmentName)) },
      {
        columnId: 'activeStatus',
        title: 'Status',
        options: [
          { label: 'Active', value: 'active' },
          { label: 'Inactive', value: 'inactive' },
        ],
      },
      {
        columnId: 'assigned',
        title: 'Assignment',
        options: [
          { label: 'Assigned', value: 'assigned' },
          { label: 'Unassigned', value: 'unassigned' },
        ],
      },
    ],
    [staff]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff</h1>
          <p className="text-gray-600">Staff who require transport (bus_required), from MyJKKN</p>
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
          <Users className="mx-auto mb-3 h-10 w-10 text-gray-400" />
          <p className="font-medium text-gray-700">Failed to load staff.</p>
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
      ) : !isLoading && total === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-gray-400" />
          <p className="font-medium text-gray-700">No bus-required staff yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Staff will appear here once they are marked as requiring transport in MyJKKN.
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={staff}
          entityName="staff"
          isLoading={isLoading}
          enableRowSelection
          getRowId={(s) => s.id}
          searchPlaceholder="Search name, staff ID, email..."
          filters={filters}
          toolbarActions={({ selectedRows, resetSelection }) =>
            canRemove && selectedRows.length > 0 ? (
              <button
                type="button"
                onClick={() => setRemoveTarget({ rows: selectedRows, reset: resetSelection })}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                <Trash2 className="h-4 w-4" /> Delete Selected ({selectedRows.length})
              </button>
            ) : null
          }
        />
      )}

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => { if (!open && !removing) setRemoveTarget(null); }}
        title={
          removeTarget?.rows.length === 1
            ? `Remove ${removeTarget.rows[0].name} from transport?`
            : `Remove ${removeTarget?.rows.length ?? 0} staff from transport?`
        }
        description={REMOVE_DESCRIPTION}
        confirmLabel={removeTarget && removeTarget.rows.length > 1 ? 'Delete Selected' : 'Delete'}
        onConfirm={confirmRemove}
        loading={removing}
        danger
      />
    </div>
  );
}
