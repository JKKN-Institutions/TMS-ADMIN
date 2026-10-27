'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { SummaryCard, SummaryCards, useCardFilters } from '@/components/ui/summary-cards';
import { ACTION_OPTIONS, MODULE_OPTIONS, getActivityColumns, type ActivityRow } from './columns';
import { ActivityDetailsDialog } from './activity-details-dialog';

interface ActivityLogData {
  entries: ActivityRow[];
  stats: { total: number; today: number; week: number };
}

// Module/action filters run on the SERVER. Filtering client-side only searched
// the newest 500 rows — which are all boarding scans — so picking e.g. Drivers
// showed nothing even though older driver entries exist.
async function fetchActivityLog(moduleFilter: string, actionFilter: string): Promise<ActivityLogData> {
  const qs = new URLSearchParams();
  if (moduleFilter) qs.set('module', moduleFilter);
  if (actionFilter) qs.set('action', actionFilter);
  const response = await fetch(`/api/admin/activity-log${qs.size ? `?${qs}` : ''}`);
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Failed to load activity log');
  return { entries: data.data || [], stats: data.stats || { total: 0, today: 0, week: 0 } };
}

const ActivityLogPage = () => {
  const [viewing, setViewing] = useState<ActivityRow | null>(null);

  const cf = useCardFilters();
  const moduleFilter = String(cf.filters.find((f) => f.id === 'module')?.value ?? '');
  const actionFilter = String(cf.filters.find((f) => f.id === 'action')?.value ?? '');
  const { data, isLoading: loading, isFetching, isError } = useQuery({
    queryKey: ['activity-log', moduleFilter, actionFilter],
    queryFn: () => fetchActivityLog(moduleFilter, actionFilter),
    placeholderData: (prev) => prev,
  });
  const entries = data?.entries ?? [];
  const stats = data?.stats ?? { total: 0, today: 0, week: 0 };

  useEffect(() => {
    if (isError) toast.error('Failed to load activity log');
  }, [isError]);

  const columns = useMemo(() => getActivityColumns(setViewing), []);

  return (
    <div className="space-y-6">
      <PageHeader description="Who changed what, and when, across the transport system." />

      <SummaryCards>
        <SummaryCard label="Today" value={stats.today.toLocaleString()} hint="Actions since midnight" />
        <SummaryCard label="Last 7 days" value={stats.week.toLocaleString()} />
        <SummaryCard label="All time" value={stats.total.toLocaleString()} />
      </SummaryCards>

      <DataTable
        columns={columns}
        data={entries}
        entityName="entries"
        isLoading={loading || isFetching}
        columnFilters={cf.filters}
        onColumnFiltersChange={cf.setFilters}
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
