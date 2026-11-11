'use client';

/**
 * Learner register — every learner who has bus attendance in a month, with
 * days travelled, morning / evening trips and absences, and how many of them
 * are hostel students or irregular riders (not registered for transport but
 * scanned on a bus). Click a learner for their attendance report.
 *
 * Layout (top to bottom): header banner → colour KPI tiles → month bar →
 * learner table, matching the Daily Report.
 */

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnFiltersState } from '@tanstack/react-table';
import { BedDouble, Bus, CalendarCheck2, CalendarDays, ChevronLeft, ChevronRight, UserRound, Users } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { ExportMenu } from '@/components/ui/export-menu';
import { exportTable, type ExportFormat } from '@/lib/export/table-export';
import { istMonth } from '@/lib/attendance/month-summary';
import { RIDER_KIND_LABEL, type RiderKind } from '@/lib/attendance/rider-kind';
import { AttendanceTabs } from '../attendance-tabs';
import { ATT_TABLE_CSS, AttendanceBanner, BAR_BUTTON, ControlBar, KpiTile, SectionPanel } from '../attendance-ui';
import { getRegisterColumns, type LearnerRegisterRow } from './columns';

async function fetchRegister(month: string): Promise<LearnerRegisterRow[]> {
  const res = await fetch(`/api/admin/attendance/learners?month=${month}`, { cache: 'no-store' });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load the learner register');
  return json.data.rows as LearnerRegisterRow[];
}

const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

/** The month before / after, as YYYY-MM. */
function stepMonth(month: string, by: 1 | -1): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

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
  const morning = travelled.reduce((n, r) => n + r.onwardPresent, 0);
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

  // An error must not fall through to zeros: "0 learners" is a different and false claim.
  const dash = isLoading || isError ? '—' : undefined;
  const thisMonth = istMonth();
  const all = travelled.length;

  return (
    <div className="space-y-5">
      <style dangerouslySetInnerHTML={{ __html: ATT_TABLE_CSS }} />
      <AttendanceTabs />

      {/* 1. Header banner */}
      <AttendanceBanner
        title="Learner register"
        description="Every learner's bus attendance for a month. A day counts once even when the learner rode both trips. Click a learner to open their attendance report."
        chip={{ icon: CalendarDays, label: 'Month', value: monthLabel(month) }}
      />

      {/* 2. KPI tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <KpiTile
          tone="blue" icon={Users} label="Learners travelled" value={dash ?? all}
          sub={dash ? undefined : 'at least one trip this month'}
        />
        <KpiTile
          tone="green" icon={Bus} label="Transport riders" value={dash ?? count('transport')}
          sub={dash ? undefined : `${pct(count('transport'), all)}% of learners`}
          title="Learners registered for transport"
        />
        <KpiTile
          tone="violet" icon={BedDouble} label="Hostel students" value={dash ?? count('hosteller')}
          sub={dash ? undefined : 'on a bus · tap to show them'}
          title="Hostel students recorded when their card was scanned on a bus. Tap to show only them."
          active={riderFilter === 'hosteller'}
          onClick={() => toggleRider('hosteller')}
        />
        <KpiTile
          tone="orange" icon={UserRound} label="Irregular riders" value={dash ?? count('non_transport')}
          sub={dash ? undefined : 'not registered · tap to show them'}
          title="Not registered for transport and not hostel. Tap to show only them."
          active={riderFilter === 'non_transport'}
          onClick={() => toggleRider('non_transport')}
        />
        <KpiTile
          tone="teal" icon={CalendarCheck2} label="Trips this month" value={dash ?? trips.toLocaleString('en-IN')}
          sub={dash ? undefined : `${morning.toLocaleString('en-IN')} morning · ${(trips - morning).toLocaleString('en-IN')} evening`}
        />
      </div>

      {/* 3. Month bar */}
      <ControlBar>
        <CalendarDays className="ml-1 hidden h-5 w-5 text-green-600 sm:block" aria-hidden="true" />
        <div className="flex items-center gap-1.5">
          <button type="button" className={`${BAR_BUTTON} w-10`} aria-label="Previous month" onClick={() => setMonth(stepMonth(month, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="month"
            value={month}
            max={thisMonth}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="input block"
            aria-label="Register month"
          />
          <button
            type="button"
            className={`${BAR_BUTTON} w-10`}
            aria-label="Next month"
            disabled={month >= thisMonth}
            onClick={() => setMonth(stepMonth(month, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setMonth(thisMonth)}
          disabled={month === thisMonth}
          className={`${BAR_BUTTON} px-4 text-sm font-medium`}
        >
          This month
        </button>
      </ControlBar>

      {/* 4. Learners */}
      {isError ? (
        <p className="rounded-xl border border-border p-6 text-sm text-foreground">
          Could not load the learner register{error instanceof Error ? `: ${error.message}` : ''}. Figures are not
          shown rather than shown as zero.
        </p>
      ) : (
        <SectionPanel
          title="Learner-wise attendance"
          note={`${monthLabel(month)} · click a learner for their report`}
          table
        >
          <DataTable
            columns={columns}
            data={rows}
            getRowId={(r) => r.learnerId}
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
        </SectionPanel>
      )}
    </div>
  );
}
