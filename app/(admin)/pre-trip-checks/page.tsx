'use client';

/**
 * Pre-trip Checks — the drivers' daily check, bus by bus, for one day: every
 * check with its route, and a "Not done" line for each bus that has none.
 *
 * Layout (top to bottom): header banner → colour KPI tiles → date bar → table,
 * matching the Attendance pages. A row's "View" opens the six answers, the
 * driver's note and the odometer photo.
 */

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnFiltersState } from '@tanstack/react-table';
import {
  AlertTriangle, Bus, CalendarDays, ChevronLeft, ChevronRight, CircleSlash, ClipboardCheck, Lock, ShieldCheck,
} from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { ExportMenu } from '@/components/ui/export-menu';
import { exportTable, type ExportFormat } from '@/lib/export/table-export';
import { PRE_TRIP_ITEMS } from '@/lib/tracking/pre-trip-check';
import {
  PRE_TRIP_STATUS_LABEL, type PreTripDayRow, type PreTripDayTotals, type PreTripStatus,
} from '@/lib/tracking/pre-trip-admin';
import {
  ATT_TABLE_CSS, AttendanceBanner, BAR_BUTTON, ControlBar, KpiTile, SectionPanel,
} from '../attendance/attendance-ui';
import { CheckDetailsDialog } from './check-details-dialog';
import { checkTime, getPreTripColumns, statusDetail } from './columns';

interface ListData {
  date: string;
  today: string;
  totals: PreTripDayTotals;
  rows: PreTripDayRow[];
}
type ListResult = { kind: 'ok'; data: ListData } | { kind: 'forbidden' };

async function fetchChecks(date: string): Promise<ListResult> {
  const res = await fetch(`/api/admin/pre-trip-checks?date=${date}`, { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 403) return { kind: 'forbidden' };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { kind: 'ok', data: (await res.json()).data as ListData };
}

function istTodayClient(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

/** The day before / after, as YYYY-MM-DD. */
function stepDay(date: string, by: 1 | -1): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', {
    timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric', weekday: 'long',
  });

/** Plain page for anyone without tms.dashboard.view — never a silent redirect. */
function NoAccess() {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
        <Lock className="h-6 w-6 text-amber-700 dark:text-amber-300" />
      </div>
      <h1 className="text-lg font-semibold text-gray-900 dark:text-white">You don&apos;t have access to pre-trip checks</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        This page is for the transport head. If you need it, please contact the transport office.
      </p>
    </div>
  );
}

const STATUSES: PreTripStatus[] = ['ok', 'issue', 'skipped', 'not_done'];

export default function PreTripChecksPage() {
  const [date, setDate] = useState(istTodayClient);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [filteredRows, setFilteredRows] = useState<PreTripDayRow[] | null>(null);
  const [viewing, setViewing] = useState<PreTripDayRow | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-pre-trip-checks', date],
    queryFn: () => fetchChecks(date),
    refetchInterval: 60_000,
  });

  const list = data?.kind === 'ok' ? data.data : null;
  // Memoised: an inline `?? []` is a new array each render, which loops the
  // DataTable's onFilteredRowsChange while loading.
  const rows = useMemo(() => list?.rows ?? [], [list]);
  const columns = useMemo(() => getPreTripColumns(setViewing), []);
  const onFilteredRowsChange = useCallback((r: PreTripDayRow[], isFiltered: boolean) => {
    setFilteredRows(isFiltered ? r : null);
  }, []);

  if (data?.kind === 'forbidden') return <NoAccess />;

  const statusFilter = columnFilters.find((f) => f.id === 'status')?.value as string | undefined;
  const toggleStatus = (status: PreTripStatus) =>
    setColumnFilters((prev) => {
      const rest = prev.filter((f) => f.id !== 'status');
      return statusFilter === status ? rest : [...rest, { id: 'status', value: status }];
    });

  const today = istTodayClient();
  const t = list?.totals;
  // An error must not fall through to zeros: "0 buses" is a different and false claim.
  const dash = isLoading || isError || !t ? '—' : undefined;

  const onExport = (format: ExportFormat, selected: PreTripDayRow[]) =>
    exportTable(format, {
      rows: selected.length ? selected : filteredRows ?? rows,
      title: `Pre-trip checks ${dayLabel(date)}`,
      filename: `pre-trip-checks-${date}`,
      columns: [
        { header: 'Route No', value: (r) => r.routeNumber, width: 10 },
        { header: 'Route name', value: (r) => r.routeName, width: 30 },
        { header: 'Bus', value: (r) => r.busRegistration, width: 14 },
        { header: 'Driver', value: (r) => r.driverName, width: 22 },
        { header: 'Status', value: (r) => PRE_TRIP_STATUS_LABEL[r.status], width: 10 },
        { header: 'Issue / skip reason', value: (r) => statusDetail(r), width: 26 },
        ...PRE_TRIP_ITEMS.map(({ key, label }) => ({
          header: label,
          value: (r: PreTripDayRow) => {
            const v = r.check?.items[key];
            return v == null ? '' : v ? 'OK' : 'NOT OK';
          },
          width: 11,
        })),
        { header: 'Odometer (km)', value: (r) => r.check?.odometerKm ?? '', width: 13 },
        { header: 'Time', value: (r) => (r.check ? checkTime(r.check.createdAt) : ''), width: 10 },
        { header: 'Note', value: (r) => r.check?.notes ?? '', width: 30 },
      ],
    });

  return (
    <div className="space-y-5">
      <style dangerouslySetInnerHTML={{ __html: ATT_TABLE_CSS }} />

      {/* 1. Header banner */}
      <AttendanceBanner
        title="Pre-trip Checks"
        description="Each driver checks six items and photographs the odometer before the first trip of the day. Buses with no check are listed as Not done."
        chip={{ icon: CalendarDays, label: date === today ? 'Today' : 'Date', value: dayLabel(date) }}
      />

      {/* 2. KPI tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <KpiTile
          tone="blue" icon={Bus} label="Buses to check" value={dash ?? t!.buses}
          sub={dash ? undefined : `${t!.checked} checked · ${t!.buses > 0 ? Math.round((t!.checked / t!.buses) * 100) : 0}%`}
          title="Every active route that has a bus assigned, and how many recorded a check or a skip"
        />
        <KpiTile
          tone="green" icon={ShieldCheck} label="All OK" value={dash ?? t!.ok}
          sub={dash ? undefined : 'all six items fine'}
          active={statusFilter === 'ok'}
          onClick={() => toggleStatus('ok')}
          title="Tap to show only these buses"
        />
        <KpiTile
          tone="red" icon={AlertTriangle} label="Issues found" value={dash ?? t!.issue}
          sub={dash ? undefined : 'an item marked NOT OK'}
          active={statusFilter === 'issue'}
          onClick={() => toggleStatus('issue')}
          title="Checks with at least one item marked NOT OK. Tap to show only them."
        />
        <KpiTile
          tone="violet" icon={ClipboardCheck} label="Skipped" value={dash ?? t!.skipped}
          sub={dash ? undefined : 'driver gave a reason'}
          active={statusFilter === 'skipped'}
          onClick={() => toggleStatus('skipped')}
          title="The driver skipped the check and gave a reason. Tap to show only them."
        />
        <KpiTile
          tone="orange" icon={CircleSlash} label="Not done" value={dash ?? t!.notDone}
          sub={dash ? undefined : 'tap to show them'}
          active={statusFilter === 'not_done'}
          onClick={() => toggleStatus('not_done')}
          title="Buses with no check recorded on this date. Tap to show only them."
        />
      </div>

      {/* 3. Date bar */}
      <ControlBar>
        <CalendarDays className="ml-1 hidden h-5 w-5 text-green-600 sm:block" aria-hidden="true" />
        <div className="flex items-center gap-1.5">
          <button type="button" className={`${BAR_BUTTON} w-10`} aria-label="Previous day" onClick={() => setDate(stepDay(date, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="input block"
            aria-label="Check date"
          />
          <button
            type="button"
            className={`${BAR_BUTTON} w-10`}
            aria-label="Next day"
            disabled={date >= today}
            onClick={() => setDate(stepDay(date, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setDate(today)}
          disabled={date === today}
          className={`${BAR_BUTTON} px-4 text-sm font-medium`}
        >
          Today
        </button>
      </ControlBar>

      {/* 4. Buses */}
      {isError ? (
        <p className="rounded-xl border border-border p-6 text-sm text-foreground">
          Could not load the pre-trip checks. Please refresh or try again shortly. Figures are not shown rather than
          shown as zero.
        </p>
      ) : (
        <SectionPanel
          title="Bus-wise pre-trip check"
          note={`${dayLabel(date)} · “View” opens the answers and the odometer photo`}
          table
        >
          <DataTable
            columns={columns}
            data={rows}
            getRowId={(r) => r.key}
            entityName="buses"
            isLoading={isLoading}
            pageSize={25}
            searchPlaceholder="Search route, bus or driver..."
            emptyMessage="No buses with a route, and no pre-trip checks on this date."
            columnFilters={columnFilters}
            onColumnFiltersChange={setColumnFilters}
            onFilteredRowsChange={onFilteredRowsChange}
            filters={[
              {
                columnId: 'status',
                title: 'Status',
                options: STATUSES.map((s) => ({ label: PRE_TRIP_STATUS_LABEL[s], value: s })),
              },
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

      <CheckDetailsDialog row={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
