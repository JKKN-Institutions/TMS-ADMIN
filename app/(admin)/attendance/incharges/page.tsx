'use client';

/**
 * In-charge marking — did each bus in-charge scan their learners?
 *
 * One view at a time, chosen in the top bar: Day (one row per in-charge for a
 * date), Month (in-charge × working day grid) or Year (in-charge × month %).
 * Each has its own calendar picker. Day and Month share one API call per month
 * and trip; Year is its own call that returns only monthly summaries.
 */

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, BarChart3, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Info, Moon, Percent, Plane, Sun,
  UserCheck, Users, UserX, type LucideIcon,
} from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { ExportMenu } from '@/components/ui/export-menu';
import { useCardFilters } from '@/components/ui/summary-cards';
import { exportTable, type ExportFormat } from '@/lib/export/table-export';
import {
  DUTY_STATUSES, MARKING_LABEL, bandCounts, isSundayDate, summarizeDay, type MarkingRow, type MarkingStatus,
} from '@/lib/attendance/incharge-marking';
import type { InchargeMarkingResponse, InchargeYearResponse } from '@/app/api/admin/attendance/incharges/route';
import { AttendanceTabs } from '../attendance-tabs';
import { ATT_TABLE_CSS, AttendanceBanner, BAR_BUTTON, ControlBar, KpiTile, SectionPanel } from '../attendance-ui';
import { getInchargeColumns, type DayRow } from './incharge-columns';
import { MonthGrid } from './month-grid';
import { YearGrid } from './year-grid';

type Direction = 'onward' | 'return';
type Mode = 'day' | 'month' | 'year';

const FIRST_YEAR = 2025;

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

function stepMonth(m: string, by: number): string {
  const [y, mo] = m.split('-').map(Number);
  const x = new Date(Date.UTC(y, mo - 1 + by, 1));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
}

const longDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const monthName = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

async function getJson<T>(params: Record<string, string>): Promise<T> {
  const res = await fetch(`/api/admin/attendance/incharges?${new URLSearchParams(params)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load the in-charge report');
  return json.data as T;
}

const STATUS_OPTIONS = (['marked', 'others', 'missed', 'leave', 'pending', 'off'] as MarkingStatus[]).map((s) => ({
  label: MARKING_LABEL[s],
  value: s,
}));

const MODES: Array<{ k: Mode; label: string; icon: LucideIcon }> = [
  { k: 'day', label: 'Day', icon: CalendarDays },
  { k: 'month', label: 'Month', icon: CalendarRange },
  { k: 'year', label: 'Year', icon: BarChart3 },
];

const cellText = (r: MarkingRow, d: string) => {
  const c = r.cells[d];
  if (!c || c.s === 'na' || c.s === 'off') return '';
  return c.s === 'marked' ? `Marked (${c.n})` : MARKING_LABEL[c.s];
};

export default function InchargeMarkingPage() {
  const today = todayStr();
  const thisMonth = today.slice(0, 7);
  const thisYear = today.slice(0, 4);
  const [mode, setMode] = useState<Mode>('day');
  const [date, setDate] = useState(today);
  const [direction, setDirection] = useState<Direction>('onward');
  const [filteredRows, setFilteredRows] = useState<DayRow[] | null>(null);
  const cf = useCardFilters();
  const month = date.slice(0, 7);
  const year = date.slice(0, 4);
  const tripName = direction === 'return' ? 'Evening' : 'Morning';

  const monthQ = useQuery({
    queryKey: ['attendance-incharges', month, direction],
    queryFn: () => getJson<InchargeMarkingResponse>({ month, direction }),
    enabled: mode !== 'year',
  });
  const yearQ = useQuery({
    queryKey: ['attendance-incharges-year', year, direction],
    queryFn: () => getJson<InchargeYearResponse>({ year, direction }),
    enabled: mode === 'year',
  });
  const active = mode === 'year' ? yearQ : monthQ;
  const { isLoading, isError, error } = active;
  const data = monthQ.data;

  // Memoised: an inline `?? []` loops the DataTable's onFilteredRowsChange while loading.
  const dayRows = useMemo<DayRow[]>(
    () => (data?.rows ?? []).filter((r) => r.cells[date] && r.cells[date].s !== 'na').map((r) => ({ ...r, cell: r.cells[date] })),
    [data, date],
  );
  const columns = useMemo(() => getInchargeColumns(date, direction), [date, direction]);
  const onFilteredRowsChange = useCallback((r: DayRow[], isFiltered: boolean) => {
    setFilteredRows(isFiltered ? r : null);
  }, []);

  // ── Picking a period ──────────────────────────────────────────────────────
  const pickMonth = (m: string) => setDate(m === thisMonth ? today : `${m}-01`);
  const pickYear = (y: string) => setDate(y === thisYear ? today : `${y}-12-01`);
  const openDay = (d: string) => {
    setDate(d);
    setMode('day');
  };
  const openMonth = (m: string) => {
    pickMonth(m);
    setMode('month');
  };
  const years = Array.from({ length: Number(thisYear) - FIRST_YEAR + 1 }, (_, i) => String(Number(thisYear) - i));

  const periodLabel = mode === 'day' ? longDate(date) : mode === 'month' ? monthName(month) : year;

  // ── Tiles ─────────────────────────────────────────────────────────────────
  const k = mode === 'day' && data ? summarizeDay(data.rows, date) : null;
  const bands =
    mode === 'month' && data
      ? bandCounts(data.rows.map((r) => r.markedPct))
      : mode === 'year' && yearQ.data
        ? bandCounts(yearQ.data.rows.map((r) => r.total.pct))
        : null;
  const dash = isLoading || (mode === 'day' ? !k : !bands) ? '—' : undefined;
  const pct = (n: number) => (k && k.onDuty > 0 ? `${Math.round((n / k.onDuty) * 100)}% of on duty` : undefined);
  const ofPeople = (n: number) => (bands && bands.people > 0 ? `${Math.round((n / bands.people) * 100)}% of in-charges` : undefined);
  const noService = mode === 'day' && !!k && k.onDuty === 0 && k.leave === 0;

  // ── Export ────────────────────────────────────────────────────────────────
  const trip = direction === 'return' ? 'evening' : 'morning';
  const onExport = (format: ExportFormat) => {
    if (mode === 'year' && yearQ.data) {
      const y = yearQ.data;
      return exportTable(format, {
        rows: y.rows,
        title: `In-charge ${y.year} ${tripName}`,
        filename: `incharge-marking-${y.year}-${trip}`,
        summary: `${y.year} · ${tripName} trip · % of working days each in-charge scanned learners themselves`,
        columns: [
          { header: 'In-charge', value: (r) => r.name, width: 26 },
          { header: 'Email', value: (r) => r.email, width: 30 },
          { header: 'Bus', value: (r) => `${r.routeNumber ?? ''} ${r.routeName ?? ''}`.trim(), width: 28 },
          ...y.months.map((m) => ({
            header: monthName(m),
            value: (r: (typeof y.rows)[number]) => {
              const s = r.months[m];
              return s.pct === null ? '' : `${s.pct}% (${s.marked}/${s.duty})`;
            },
            width: 16,
          })),
          { header: 'Year %', value: (r) => (r.total.pct === null ? '' : `${r.total.pct}%`), width: 10 },
          { header: 'Year days', value: (r) => `${r.total.marked}/${r.total.duty}`, width: 12 },
        ],
      });
    }
    if (mode === 'month' && data) {
      const work = data.days.filter((d) => data.rows.some((r) => DUTY_STATUSES.has(r.cells[d].s) || r.cells[d].s === 'pending'));
      return exportTable(format, {
        rows: data.rows,
        title: `In-charge ${month} ${tripName}`,
        filename: `incharge-marking-${month}-${trip}`,
        summary: `${monthName(month)} · ${tripName} trip · ${work.length} working days`,
        columns: [
          { header: 'In-charge', value: (r) => r.name, width: 26 },
          { header: 'Email', value: (r) => r.email, width: 30 },
          { header: 'Bus', value: (r) => `${r.routeNumber ?? ''} ${r.routeName ?? ''}`.trim(), width: 28 },
          { header: 'Scanned days', value: (r) => r.markedDays, width: 12 },
          { header: 'By others', value: (r) => r.othersDays, width: 10 },
          { header: 'Not marked', value: (r) => r.missedDays, width: 11 },
          { header: 'Leave', value: (r) => r.leaveDays, width: 8 },
          { header: 'Working days', value: (r) => r.dutyDays, width: 12 },
          { header: 'Scanned %', value: (r) => (r.markedPct === null ? '' : `${r.markedPct}%`), width: 10 },
          ...work.map((d) => ({ header: d.slice(5), value: (r: MarkingRow) => cellText(r, d), width: 14 })),
        ],
      });
    }
    const out = filteredRows ?? dayRows;
    return exportTable(format, {
      rows: out,
      title: `In-charge ${date} ${tripName}`.slice(0, 31),
      filename: `incharge-marking-${date}-${trip}`,
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
  const canExport = mode === 'year' ? !!yearQ.data?.rows.length : mode === 'month' ? !!data?.rows.length : dayRows.length > 0;

  const missedCard = cf.card('status', 'missed');
  const othersCard = cf.card('status', 'others');
  const markedCard = cf.card('status', 'marked');

  // ── Picker for the chosen view ────────────────────────────────────────────
  const prev = () => (mode === 'day' ? setDate(stepDay(date, -1)) : mode === 'month' ? pickMonth(stepMonth(month, -1)) : pickYear(String(Number(year) - 1)));
  const next = () => (mode === 'day' ? setDate(stepDay(date, 1)) : mode === 'month' ? pickMonth(stepMonth(month, 1)) : pickYear(String(Number(year) + 1)));
  const nextDisabled =
    mode === 'day' ? stepDay(date, 1) > today : mode === 'month' ? stepMonth(month, 1) > thisMonth : Number(year) + 1 > Number(thisYear);
  const prevDisabled = mode === 'year' && Number(year) - 1 < FIRST_YEAR;
  const atNow = mode === 'day' ? date === today : mode === 'month' ? month === thisMonth : year === thisYear;
  const unit = mode === 'day' ? 'day' : mode === 'month' ? 'month' : 'year';

  return (
    <div className="space-y-5">
      <style dangerouslySetInnerHTML={{ __html: ATT_TABLE_CSS }} />
      <AttendanceTabs />

      {/* 1. Banner */}
      <AttendanceBanner
        title="In-charge marking"
        description="Did each bus in-charge scan their learners? Only real scans count; automatic absences written at closing time are not anyone's work."
        chip={{ icon: direction === 'return' ? Moon : Sun, label: `${tripName} trip`, value: periodLabel }}
      />

      {/* 2. Filter bar: view + calendar + trip */}
      <ControlBar>
        <div className="inline-flex rounded-xl bg-gray-100 p-1" role="group" aria-label="View">
          {MODES.map(({ k: m, label, icon: Icon }) => (
            <button
              key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                mode === m ? 'bg-green-600 text-white shadow-[0_2px_6px_-2px_rgba(22,163,74,0.6)]' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button type="button" className={`${BAR_BUTTON} w-10`} aria-label={`Previous ${unit}`} disabled={prevDisabled} onClick={prev}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          {mode === 'day' && (
            <input
              type="date" value={date} max={today} aria-label="Date" className="input block"
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          )}
          {mode === 'month' && (
            <input
              type="month" value={month} max={thisMonth} aria-label="Month" className="input block"
              onChange={(e) => e.target.value && pickMonth(e.target.value)}
            />
          )}
          {mode === 'year' && (
            <select
              value={year} onChange={(e) => pickYear(e.target.value)} aria-label="Year"
              className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          )}
          <button type="button" className={`${BAR_BUTTON} w-10`} aria-label={`Next ${unit}`} disabled={nextDisabled} onClick={next}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button" disabled={atNow} className={`${BAR_BUTTON} px-4 text-sm font-medium`}
          onClick={() => (mode === 'day' ? setDate(today) : mode === 'month' ? pickMonth(thisMonth) : pickYear(thisYear))}
        >
          {mode === 'day' ? 'Today' : mode === 'month' ? 'This month' : 'This year'}
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
          <ExportMenu onExport={onExport} disabled={!canExport} />
        </div>
      </ControlBar>

      {/* 3. KPI tiles for the chosen period */}
      {!isError && mode === 'day' && (
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
            tone="red" icon={UserX} label="Not marked" value={dash ?? k!.missed + k!.pending}
            sub={k ? (k.pending > 0 ? `${k.pending} not yet today` : 'nobody scanned the bus') : undefined}
            title="Nobody scanned their bus at all. Tap to show them." {...missedCard}
          />
          <KpiTile tone="violet" icon={Plane} label="On leave" value={dash ?? k!.leave} sub="declared absence" />
        </div>
      )}
      {!isError && mode !== 'day' && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          <KpiTile tone="blue" icon={Users} label="In-charges" value={dash ?? bands!.people} sub={`with working days in ${mode === 'month' ? 'the month' : 'the year'}`} />
          <KpiTile
            tone="green" icon={Percent} label="Average scanned" value={dash ?? (bands!.avg === null ? '—' : `${bands!.avg}%`)}
            sub="of working days, per in-charge"
          />
          <KpiTile tone="red" icon={UserX} label="Never scanned" value={dash ?? bands!.never} sub={ofPeople(bands?.never ?? 0)} title="Did not scan a single learner themselves in this period" />
          <KpiTile tone="orange" icon={AlertTriangle} label="Below 75%" value={dash ?? bands!.low} sub={ofPeople(bands?.low ?? 0)} />
          <KpiTile tone="teal" icon={UserCheck} label="75% and above" value={dash ?? bands!.good} sub={ofPeople(bands?.good ?? 0)} />
        </div>
      )}

      {isError && (
        <p className="rounded-xl border border-border p-6 text-sm text-foreground">
          Could not load the in-charge report{error instanceof Error ? `: ${error.message}` : ''}. Nothing is shown
          rather than shown as zero.
        </p>
      )}

      {noService && (
        <p className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
          {isSundayDate(date) ? 'Buses do not run on Sundays.' : 'No bus ran on this day (holiday, excused, or nobody scanned anywhere).'} Choose another day.
        </p>
      )}

      {/* 4. The chosen view */}
      {!isError && mode === 'day' && (
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

      {!isError && mode === 'month' && (
        <SectionPanel title={`Month view · ${monthName(month)}`} note={`${tripName} trip · click a date to open that day`}>
          {data ? (
            <MonthGrid rows={data.rows} days={data.days} selected="" today={data.today} onPickDate={openDay} />
          ) : (
            <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
          )}
        </SectionPanel>
      )}

      {!isError && mode === 'year' && (
        <SectionPanel title={`Year view · ${year}`} note={`${tripName} trip · % of working days scanned · click a month to open it`}>
          {yearQ.data ? (
            <YearGrid rows={yearQ.data.rows} months={yearQ.data.months} onPickMonth={openMonth} />
          ) : (
            <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
          )}
        </SectionPanel>
      )}
    </div>
  );
}
