'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, UserCheck, Route as RouteIcon, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import UniversalStatCard from '@/components/universal-stat-card';
import { getAssignmentColumns, type AssignmentRow } from './columns';
import { AssignmentDeleteDialog } from './assignment-delete-dialog';

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

  // Remove opens the styled confirm dialog; the dialog performs the DELETE.
  const columns = useMemo(
    () => getAssignmentColumns(setDeleting, canManage),
    [canManage]
  );

  // Stats
  const totalAssignments = assignments.length;
  const assignedRoutes = new Set(assignments.map((a) => a.route_id)).size;
  const staffMembers = new Set(assignments.map((a) => a.staff_email)).size;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Route Assignments</h1>
          <p className="text-gray-600">Assign staff members to routes for monitoring and management</p>
        </div>
        {canManage && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              onClick={() => router.push('/staff-route-assignments/bulk-assign')}
              className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-lg border border-green-600 px-3 text-sm font-medium text-green-700 transition-colors hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-500/10"
            >
              <Users className="h-4 w-4" /> Bulk Assign
            </button>
            <button
              onClick={() => router.push('/staff-route-assignments/assign')}
              className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              <Plus className="h-4 w-4" /> Assign Route
            </button>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <UniversalStatCard
          title="Total Assignments"
          value={totalAssignments}
          subtitle="Active staff ↔ route links"
          icon={UserCheck}
          color="blue"
          loading={loading}
          delay={0}
        />
        <UniversalStatCard
          title="Assigned Routes"
          value={assignedRoutes}
          subtitle="Routes with staff"
          icon={RouteIcon}
          color="green"
          loading={loading}
          delay={1}
        />
        <UniversalStatCard
          title="Staff Members"
          value={staffMembers}
          subtitle="Unique staff emails"
          icon={Users}
          color="purple"
          loading={loading}
          delay={2}
        />
      </div>

      {/* Data table */}
      <DataTable
        columns={columns}
        data={assignments}
        entityName="assignments"
        isLoading={loading}
        searchPlaceholder="Search staff email, route…"
        enableRowSelection={canManage}
        getRowId={(a) => a.id}
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
