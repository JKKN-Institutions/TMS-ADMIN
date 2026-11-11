'use client';

/**
 * Learner register — every learner who has bus attendance in a month, with
 * days travelled, morning / evening trips and absences, and how many of them
 * are hostel students or irregular riders (not registered for transport but
 * scanned on a bus). Click a learner for their attendance report.
 */

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnFiltersState } from '@tanstack/react-table';
import { BedDouble, Bus, CalendarCheck2, UserRound, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { SummaryCard, SummaryCards } from '@/components/ui/summary-cards';
import { DataTable } from '@/components/ui/data-table';
import { ExportMenu } from '@/components/ui/export-menu';
import { exportTable, type ExportFormat } from '@/lib/export/table-export';
import { istMonth } from '@/lib/attendance/month-summary';
import { RIDER_KIND_LABEL, type RiderKind } from '@/lib/attendance/rider-kind';
import { AttendanceTabs } from '../attendance-tabs';
import { getRegisterColumns, type LearnerRegisterRow } from './columns';

async function fetchRegister(month: string): Promise<LearnerRegisterRow[]> {
  const res = await fetch(`/api/admin/attendance/learners?month=${month}`, { cache: 'no-store' });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load the learner register');
  return json.data.rows as LearnerRegisterRow[];
}

const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

export default function LearnerRegisterPage() {
  const [month, setMonth] = useState(istMonth());
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [filteredRows, setFilteredRows] = useState<LearnerRegisterRow[] | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['attendance-learner-register', month],
    queryFn: () => fetchRegister(month),
  });
  // Memoised: an inline `?? []` is a new array each render, which loops the
  // DataTable's onFilteredRowsChange while loading.
  const rows = useMemo(() => data ?? [], [data]);
  const columns = useMemo(() => getRegisterColumns(month), [month]);

  const onFilteredRowsChange = useCallback((r: LearnerRegisterRow[], isFiltered: boolean) => {
    setFilteredRows(isFiltered ? r : null);
  }, []);

  const travelled = rows.filter((r) => r.daysTravelled > 0);
  const count = (kind: RiderKind) => travelled.filter((r) => r.riderKind === kind).length;
  const trips = travelled.reduce((n, r) => n + r.onwardPresent + r.returnPresent, 0);
  const riderFilter = columnFilters.find((f) => f.id === 'rider')?.value as string | undefined;
  const toggleRider = (kind: RiderKind) =>
    setColumnFilters((prev) => {
      const rest = prev.filter((f) => f.id !== 'rider');
      return riderFilter === kind ? rest : [...rest, { id: 'rider', value: kind }];
    });

  const routeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (r.routeId && r.routeLabel) seen.set(r.routeId, r.routeLabel);
    return [...seen.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }))
      .map(([value, label]) => ({ value, label }));
  }, [rows]);

  const onExport = (format: ExportFormat, selected: LearnerRegisterRow[]) =>
    exportTable(format, {
      rows: selected.length ? selected : filteredRows ?? rows,
      title: `Learner register ${monthLabel(month)}`,
      filename: `learner-register-${month}`,
      columns: [
        { header: 'Learner', value: (r) => r.name, width: 28 },
        { header: 'Roll no', value: (r) => r.rollNumber },
        { header: 'Institution', value: (r) => r.institution, width: 30 },
        { header: 'Rider', value: (r) => RIDER_KIND_LABEL[r.riderKind], width: 12 },
        { header: 'Bus', value: (r) => r.routeLabel, width: 28 },
        { header: 'Days travelled', value: (r) => r.daysTravelled, width: 14 },
        { header: 'Morning', value: (r) => r.onwardPresent, width: 10 },
        { header: 'Evening', value: (r) => r.returnPresent, width: 10 },
        { header: 'Both trips', value: (r) => r.bothTripDays, width: 10 },
        { header: 'Absent', value: (r) => r.staffAbsent, width: 10 },
        { header: 'Auto-absent', value: (r) => r.autoAbsent, width: 12 },
        { header: 'No booking', value: (r) => r.withoutBooking, width: 12 },
        { header: 'Last travel', value: (r) => r.lastTravel, width: 12 },
      ],
    });

  const dash = isLoading ? '—' : undefined;

  return (
    <div className="space-y-4">
      <AttendanceTabs />
      <PageHeader description="Every learner's bus attendance for a month. A day counts once even when the learner rode both trips. Hostel and Irregular riders are not registered for transport and were recorded when their card was scanned." />

      <label className="block w-fit text-xs text-muted-foreground">
        Month
        <input
          type="month"
          value={month}
          max={istMonth()}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          className="input mt-1 block"
        />
      </label>

      <SummaryCards>
        <SummaryCard icon={Users} label="Learners travelled" value={dash ?? travelled.length} tone="info" />
        <SummaryCard
          icon={BedDouble}
          label="Hostel students on bus"
          value={dash ?? count('hosteller')}
          tone="info"
          hint="click to show only them"
          active={riderFilter === 'hosteller'}
          onClick={() => toggleRider('hosteller')}
        />
        <SummaryCard
          icon={UserRound}
          label="Irregular riders"
          value={dash ?? count('non_transport')}
          hint="not registered, not hostel"
          active={riderFilter === 'non_transport'}
          onClick={() => toggleRider('non_transport')}
        />
        <SummaryCard icon={Bus} label="Transport riders" value={dash ?? count('transport')} />
        <SummaryCard icon={CalendarCheck2} label="Trips this month" value={dash ?? trips} tone="good" />
      </SummaryCards>

      {isError ? (
        <p className="rounded-lg border border-border p-6 text-sm text-foreground">
          Could not load the learner register{error instanceof Error ? `: ${error.message}` : ''}.
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          entityName="learners"
          isLoading={isLoading}
          searchPlaceholder="Search name or roll no..."
          emptyMessage={`No bus attendance recorded in ${monthLabel(month)}.`}
          columnFilters={columnFilters}
          onColumnFiltersChange={setColumnFilters}
          onFilteredRowsChange={onFilteredRowsChange}
          filters={[
            {
              columnId: 'rider',
              title: 'Rider',
              options: (['transport', 'hosteller', 'non_transport'] as RiderKind[]).map((k) => ({
                label: RIDER_KIND_LABEL[k],
                value: k,
              })),
            },
            { columnId: 'route', title: 'Bus', options: routeOptions },
          ]}
          toolbarActions={({ selectedRows }) => (
            <ExportMenu
              onExport={(format) => onExport(format, selectedRows)}
              selectedCount={selectedRows.length}
              disabled={rows.length === 0}
            />
          )}
        />
      )}
    </div>
  );
}
