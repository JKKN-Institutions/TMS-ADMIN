'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, CalendarClock, ListChecks } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import UniversalStatCard from '@/components/universal-stat-card';
import { ACTION_OPTIONS, MODULE_OPTIONS, getActivityColumns, type ActivityRow } from './columns';
import { ActivityDetailsDialog } from './activity-details-dialog';

interface ActivityLogData {
  entries: ActivityRow[];
  stats: { total: number; today: number; week: number };
}

async function fetchActivityLog(): Promise<ActivityLogData> {
  const response = await fetch('/api/admin/activity-log');
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Failed to load activity log');
  return { entries: data.data || [], stats: data.stats || { total: 0, today: 0, week: 0 } };
}

const ActivityLogPage = () => {
  const [viewing, setViewing] = useState<ActivityRow | null>(null);

  const { data, isLoading: loading, isError } = useQuery({
    queryKey: ['activity-log'],
    queryFn: fetchActivityLog,
  });
  const entries = data?.entries ?? [];
  const stats = data?.stats ?? { total: 0, today: 0, week: 0 };

  useEffect(() => {
    if (isError) toast.error('Failed to load activity log');
  }, [isError]);

  const columns = useMemo(() => getActivityColumns(setViewing), []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Activity Log</h1>
        <p className="text-gray-600 dark:text-gray-400">Audit trail of admin actions across all TMS modules</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <UniversalStatCard
          title="Today"
          value={stats.today}
          subtitle="Actions since midnight"
          icon={Activity}
          color="green"
          loading={loading}
          delay={0}
        />
        <UniversalStatCard
          title="Last 7 Days"
          value={stats.week}
          subtitle="Actions this week"
          icon={CalendarClock}
          color="blue"
          loading={loading}
          delay={1}
        />
        <UniversalStatCard
          title="All Time"
          value={stats.total}
          subtitle="Total recorded actions"
          icon={ListChecks}
          color="purple"
          loading={loading}
          delay={2}
        />
      </div>

      <DataTable
        columns={columns}
        data={entries}
        entityName="entries"
        isLoading={loading}
        pageSize={20}
        searchPlaceholder="Search actor, entity, description…"
        filters={[
          { columnId: 'module', title: 'Module', options: MODULE_OPTIONS },
          { columnId: 'action', title: 'Action', options: ACTION_OPTIONS },
        ]}
        getRowId={(e) => e.id}
      />

      <ActivityDetailsDialog
        entry={viewing}
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
      />
    </div>
  );
};

export default ActivityLogPage;
