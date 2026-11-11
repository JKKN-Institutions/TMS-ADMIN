'use client';

/**
 * In-charge marking — did each bus in-charge scan their learners?
 *
 * Layout (top to bottom): banner → KPI tiles for the chosen day → date / trip
 * bar → one row per in-charge for that day → the month grid (every in-charge ×
 * every day). One API call per month and trip feeds both views; changing the
 * day inside the same month does not refetch.
 */

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Info, Moon, Plane, Sun, UserCheck, Users, UserX,
} from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { ExportMenu } from '@/components/ui/export-menu';
import { useCardFilters } from '@/components/ui/summary-cards';
import { exportTable, type ExportFormat } from '@/lib/export/table-export';
import { MARKING_LABEL, isSundayDate, summarizeDay, type MarkingStatus } from '@/lib/attendance/incharge-marking';
import type { InchargeMarkingResponse } from '@/app/api/admin/attendance/incharges/route';
import { AttendanceTabs } from '../attendance-tabs';
import { ATT_TABLE_CSS, AttendanceBanner, BAR_BUTTON, ControlBar, KpiTile, SectionPanel } from '../attendance-ui';
import { getInchargeColumns, type DayRow } from './incharge-columns';
import { MonthGrid } from './month-grid';

type Direction = 'onward' | 'return';

function todayStr(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

function shift(d: string, by: number): string {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + by);
  return x.toISOString().slice(0, 10);
}

/** The next day in that direction on which buses run (Sundays are skipped). */
const stepDay = (d: string, by: 1 | -1) => {
  const n = shift(d, by);
  return isSundayDate(n) ? shift(n, by) : n;
};

const longDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const monthName = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

async function fetchMarking(month: string, direction: Direction): Promise<InchargeMarkingResponse> {
  const res = await fetch(`/api/admin/attendance/incharges?${new URLSearchParams({ month, direction })}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load the in-charge report');
  return json.data as InchargeMarkingResponse;
}

const STATUS_OPTIONS = (['marked', 'others', 'missed', 'leave', 'pending', 'off'] as MarkingStatus[]).map((s) => ({
  label: MARKING_LABEL[s],
  value: s,
}));

export default function InchargeMarkingPage() {
  const today = todayStr();
  const [date, setDate] = useState(today);
  const [direction, setDirection] = useState<Direction>('onward');
  const [filteredRows, setFilteredRows] = useState<DayRow[] | null>(null);
  const cf = useCardFilters();
  const month = date.slice(0, 7);
  const tripName = direction === 'return' ? 'Evening' : 'Morning';

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['attendance-incharges', month, direction],
    queryFn: () => fetchMarking(month, direction),
  });

  // Memoised: an inline `?? []` loops the DataTable's onFilteredRowsChange while loading.
  const dayRows = useMemo<DayRow[]>(
    () => (data?.rows ?? []).filter((r) => r.cells[date] && r.cells[date].s !== 'na').map((r) => ({ ...r, cell: r.cells[date] })),
    [data, date],
  );
  const columns = useMemo(() => getInchargeColumns(date, direction), [date, direction]);
  const onFilteredRowsChange = useCallback((r: DayRow[], isFiltered: boolean) => {
    setFilteredRows(isFiltered ? r : null);
  }, []);

  const k = data ? summarizeDay(data.rows, date) : null;
  const dash = isLoading || !k ? '—' : undefined;
  const pct = (n: number) => (k && k.onDuty > 0 ? `${Math.round((n / k.onDuty) * 100)}% of on duty` : undefined);
  const noService = !!k && k.onDuty === 0 && k.leave === 0;

  const onExport = (format: ExportFormat) => {
    const out = filteredRows ?? dayRows;
    return exportTable(format, {
      rows: out,
      title: `In-charge ${date} ${tripName}`.slice(0, 31),
      filename: `incharge-marking-${date}-${direction === 'return' ? 'evening' : 'morning'}`,
      summary: k
        ? `${longDate(date)} · ${tripName} trip · ${k.marked} of ${k.onDuty} in-charges scanned · ${k.others} bus marked by others · ${k.missed} not marked · ${k.leave} on leave`
        : longDate(date),
      columns: [
        { header: 'In-charge', value: (r) => r.name, width: 26 },
        { header: 'Email', value: (r) => r.email, width: 30 },
        { header: 'Bus', value: (r) => `${r.routeNumber ?? ''} ${r.routeName ?? ''}`.trim(), width: 28 },
        { header: 'Status', value: (r) => MARKING_LABEL[r.cell.s], width: 16 },
        { header: 'Scanned', value: (r) => r.cell.n, width: 10 },
        { header: 'Bus total', value: (r) => r.cell.bus, width: 10 },
        { header: 'First scan', value: (r) => r.cell.first ?? '', width: 10 },
        { header: 'Last scan', value: (r) => r.cell.last ?? '', width: 10 },
        { header: 'Month marked %', value: (r) => (r.markedPct === null ? '' : `${r.markedPct}%`), width: 14 },
        { header: 'Month days', value: (r) => `${r.markedDays}/${r.dutyDays}`, width: 12 },
      ],
    });
  };

  const missedCard = cf.card('status', 'missed');
  const othersCard = cf.card('status', 'others');
  const markedCard = cf.card('status', 'marked');

  return (
    <div className="space-y-5">
      <style dangerouslySetInnerHTML={{ __html: ATT_TABLE_CSS }} />
      <AttendanceTabs />

      {/* 1. Banner */}
      <AttendanceBanner
        title="In-charge marking"
        description="Did each bus in-charge scan their learners? Only real scans count; automatic absences written at closing time are not anyone's work."
        chip={{ icon: direction === 'return' ? Moon : Sun, label: `${tripName} trip`, value: longDate(date) }}
      />

      {/* 2. KPI tiles */}
      {!isError && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          <KpiTile tone="blue" icon={Users} label="On duty" value={dash ?? k!.onDuty} sub={k ? `${k.off} with no service` : undefined} />
          <KpiTile
            tone="green" icon={UserCheck} label="Scanned" value={dash ?? k!.marked} sub={pct(k?.marked ?? 0)}
            title="Scanned at least one learner themselves. Tap to show them." {...markedCard}
          />
          <KpiTile
            tone="orange" icon={AlertTriangle} label="By others" value={dash ?? k!.others} sub={pct(k?.others ?? 0)}
            title="Did not scan, but someone else scanned their bus. Tap to show them." {...othersCard}
          />
          <KpiTile
            tone="red" icon={UserX} label="Not marked" value={dash ?? (k!.missed + k!.pending)}
            sub={k ? (k.pending > 0 ? `${k.pending} not yet today` : 'nobody scanned the bus') : undefined}
            title="Nobody scanned their bus at all. Tap to show them." {...missedCard}
          />
          <KpiTile tone="violet" icon={Plane} label="On leave" value={dash ?? k!.leave} sub="declared absence" />
        </div>
      )}

      {/* 3. Date / trip bar */}
      <ControlBar>
        <CalendarDays className="ml-1 hidden h-5 w-5 text-green-600 sm:block" aria-hidden="true" />
        <div className="flex items-center gap-1.5">
          <button type="button" className={`${BAR_BUTTON} w-10`} aria-label="Previous day" onClick={() => setDate(stepDay(date, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date" value={date} max={today} aria-label="Report date" className="input block"
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
          <button
            type="button" className={`${BAR_BUTTON} w-10`} aria-label="Next day"
            disabled={stepDay(date, 1) > today} onClick={() => setDate(stepDay(date, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button type="button" onClick={() => setDate(today)} disabled={date === today} className={`${BAR_BUTTON} px-4 text-sm font-medium`}>
          Today
        </button>
        <div className="inline-flex rounded-xl bg-gray-100 p-1" role="group" aria-label="Trip">
          {(['onward', 'return'] as Direction[]).map((d) => {
            const on = direction === d;
            const Icon = d === 'return' ? Moon : Sun;
            return (
              <button
                key={d} type="button" aria-pressed={on} onClick={() => setDirection(d)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  on ? 'bg-green-600 text-white shadow-[0_2px_6px_-2px_rgba(22,163,74,0.6)]' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {d === 'return' ? 'Evening' : 'Morning'}
              </button>
            );
          })}
        </div>
        <div className="ml-auto">
          <ExportMenu onExport={onExport} disabled={dayRows.length === 0} />
        </div>
      </ControlBar>

      {isError && (
        <p className="rounded-xl border border-border p-6 text-sm text-foreground">
          Could not load the in-charge report{error instanceof Error ? `: ${error.message}` : ''}. Nothing is shown
          rather than shown as zero.
        </p>
      )}

      {!isError && noService && (
        <p className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
          {isSundayDate(date) ? 'Buses do not run on Sundays.' : 'No bus ran on this day (holiday, excused, or nobody scanned anywhere).'} Choose another day.
        </p>
      )}

      {/* 4. The chosen day, one row per in-charge */}
      {!isError && (
        <SectionPanel title="In-charges on this day" note={`${longDate(date)} · ${tripName} trip · click a bus for its learners`} table>
          <DataTable
            columns={columns}
            data={dayRows}
            getRowId={(r) => r.assignmentId}
            entityName="in-charges"
            isLoading={isLoading}
            searchPlaceholder="Search in-charge, email, bus..."
            emptyMessage="No in-charge was assigned on this day."
            onFilteredRowsChange={onFilteredRowsChange}
            columnFilters={cf.filters}
            onColumnFiltersChange={cf.setFilters}
            filters={[{ columnId: 'status', title: 'Status', options: STATUS_OPTIONS }]}
          />
        </SectionPanel>
      )}

      {/* 5. Month grid */}
      {!isError && data && (
        <SectionPanel
          title={`Month view · ${monthName(month)}`}
          note={`${tripName} trip · each square is one day · the % is days they scanned out of working days`}
        >
          <MonthGrid rows={data.rows} days={data.days} selected={date} today={data.today} onPickDate={setDate} />
        </SectionPanel>
      )}
    </div>
  );
}
