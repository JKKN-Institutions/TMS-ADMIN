'use client';

/**
 * Daily report — one day, one trip, every bus: how many learners, how many
 * were marked, present and absent, and which buses need attention tomorrow.
 *
 * Layout (top to bottom): header banner → colour KPI tiles → date / trip bar →
 * action cards → charts → every-bus table. The month-wide grid lives on the
 * "Bus coverage" tab; a row here opens the learner list for that bus and day.
 */

import React, { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, Clock, Info, Moon, Sun,
  UserCheck, UserX, Users,
} from 'lucide-react';
import { useCardFilters } from '@/components/ui/summary-cards';
import { DataTable } from '@/components/ui/data-table';
import { ExportMenu } from '@/components/ui/export-menu';
import { exportTable, type ExportFormat } from '@/lib/export/table-export';
import { formatHM } from '@/lib/boarding/attendance-window';
import {
  DAILY_STATUS_LABEL, shiftDate, summarizeRows,
  type DailyRouteRow, type DailyStatus, type DailyTotals,
} from '@/lib/attendance/daily-report';
import type { DailyReportResponse } from '@/app/api/admin/attendance/daily/route';
import { VIZ_CSS } from '../_viz/kit';
import { AttendanceTabs } from './attendance-tabs';
import { getDailyColumns } from './daily-columns';
import { ActionCards } from './action-cards';
import { BAR_BUTTON, KpiTile } from './attendance-ui';

// The charts pull in recharts (~390KB): load them as a separate lazy chunk, as
// Analytics does, so the tiles and table paint without waiting for it.
const chartSkeleton = () => <div className="h-[22rem] animate-pulse rounded-xl bg-gray-100" />;
const TrendAndSummary = dynamic(() => import('./daily-charts').then((m) => m.TrendAndSummary), {
  ssr: false,
  loading: chartSkeleton,
});
const BusAndWeekday = dynamic(() => import('./daily-charts').then((m) => m.BusAndWeekday), {
  ssr: false,
  loading: chartSkeleton,
});

type Direction = 'onward' | 'return';

function todayStr(): string {
  // IST, matching the date attendance is filed under.
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

const isSunday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay() === 0;

/** The next day in that direction on which buses run (Sundays are skipped). */
function stepDay(date: string, by: 1 | -1): string {
  const next = shiftDate(date, by);
  return isSunday(next) ? shiftDate(next, by) : next;
}

const longDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

const routeLabel = (r: DailyRouteRow) => `${r.routeNumber ?? '—'} ${r.routeName ?? ''}`.trim();

async function fetchDaily(date: string, direction: Direction): Promise<DailyReportResponse> {
  const params = new URLSearchParams({ date, direction });
  const res = await fetch(`/api/admin/attendance/daily?${params}`, { cache: 'no-store', credentials: 'same-origin' });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.error || 'Failed to load the daily report');
  return result.data as DailyReportResponse;
}

// The every-bus table in the reference dashboard's format: tinted header row,
// centred figures, roomier rows. Scoped to this page so the shared DataTable
// (and every other admin list) keeps the MyJKKN format.
const DAILY_TABLE_CSS = `
.daily-table thead th{background:#f0fdf4;color:#166534;font-size:.72rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;height:2.75rem}
.dark .daily-table thead th{background:#12261a;color:#bbf7d0}
.daily-table thead th button{font-size:inherit;font-weight:inherit;letter-spacing:inherit;text-transform:inherit;color:inherit}
.daily-table tbody td{padding-top:.7rem;padding-bottom:.7rem}
.daily-table th:nth-child(n+3),.daily-table td:nth-child(n+3){text-align:center}
.daily-table th:nth-child(n+3) button{margin-left:0}
`;

const STATUS_OPTIONS = (['marked', 'low', 'not_marked', 'no_service'] as DailyStatus[]).map((s) => ({
  label: DAILY_STATUS_LABEL[s],
  value: s,
}));

export default function AttendanceDailyReportPage() {
  const [date, setDate] = useState(todayStr());
  const [direction, setDirection] = useState<Direction>('onward');
  const [filteredRows, setFilteredRows] = useState<DailyRouteRow[] | null>(null);
  const cf = useCardFilters();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['attendance-daily', date, direction],
    queryFn: () => fetchDaily(date, direction),
  });

  // Memoised: an inline `?? []` is a new array each render, which loops the
  // DataTable's onFilteredRowsChange while loading.
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const columns = useMemo(() => getDailyColumns(date, direction), [date, direction]);
  const onFilteredRowsChange = useCallback((r: DailyRouteRow[], isFiltered: boolean) => {
    setFilteredRows(isFiltered ? r : null);
  }, []);

  const today = todayStr();
  const tripName = direction === 'return' ? 'Evening' : 'Morning';
  const t: DailyTotals | undefined = data?.totals;
  const dash = isLoading || !t ? '—' : undefined;
  const showFigures = !!data && !isError && !data.noData && !data.holiday;

  const presentHint = (() => {
    if (!t || t.presentPct === null) return 'no bus marked yet';
    const base = `${t.presentPct}% of marked`;
    if (!data?.previous) return base;
    const diff = t.present - data.previous.present;
    return `${base} · ${diff >= 0 ? '+' : ''}${diff} vs ${shortDate(data.previous.date)}`;
  })();

  const onExport = (format: ExportFormat) => {
    const out = filteredRows ?? rows;
    const total = summarizeRows(out);
    // The Overall line travels with the export as a last row.
    const overall: DailyRouteRow = {
      routeId: 'overall', routeNumber: 'Overall', routeName: '', hasBus: true,
      roster: total.learners, incharges: 0, status: 'marked', marked: total.marked,
      present: total.present, absent: total.absent, autoAbsent: total.autoAbsent,
      notMarked: total.notMarked, presentPct: total.presentPct, markers: 0,
      firstScan: null, lastScan: null, offRoster: total.offRoster, unmarkedDays: 0, lastMarked: null,
    };
    const isOverall = (r: DailyRouteRow) => r.routeId === 'overall';
    const marked = (r: DailyRouteRow) => r.status === 'marked' || r.status === 'low' || isOverall(r);
    return exportTable(format, {
      rows: [...out, overall],
      title: `Attendance ${shortDate(date)} ${tripName}`,
      filename: `attendance-daily-${date}-${direction === 'return' ? 'evening' : 'morning'}`,
      summary: `${longDate(date)} · ${tripName} trip · ${total.busesMarked} of ${total.buses} buses marked`,
      columns: [
        { header: 'Route', value: (r) => (isOverall(r) ? 'Overall' : routeLabel(r)), width: 32 },
        { header: 'Status', value: (r) => (isOverall(r) ? '' : DAILY_STATUS_LABEL[r.status]), width: 14 },
        { header: 'Total learners', value: (r) => r.roster, width: 14 },
        { header: 'Marked', value: (r) => (marked(r) ? r.marked : ''), width: 10 },
        { header: 'Present', value: (r) => (marked(r) ? r.present : ''), width: 10 },
        { header: 'Absent', value: (r) => (marked(r) ? r.absent : ''), width: 10 },
        { header: 'Of which automatic', value: (r) => (marked(r) ? r.autoAbsent : ''), width: 18 },
        { header: 'Not marked', value: (r) => r.notMarked, width: 12 },
        { header: 'Present %', value: (r) => (r.presentPct === null ? '' : `${r.presentPct}%`), width: 10 },
        { header: 'Scanned by', value: (r) => (isOverall(r) ? '' : `${r.markers} of ${r.incharges}`), width: 12 },
        { header: 'First scan', value: (r) => r.firstScan, width: 10 },
        { header: 'Last scan', value: (r) => r.lastScan, width: 10 },
      ],
    });
  };

  const notMarkedCard = cf.card('status', 'not_marked');

  return (
    <div className="viz-scope space-y-5">
      <style dangerouslySetInnerHTML={{ __html: VIZ_CSS + DAILY_TABLE_CSS }} />
      <AttendanceTabs />

      {/* 1. Header banner */}
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-green-700 via-green-600 to-green-500 px-5 py-5 text-white shadow-[0_14px_32px_-18px_rgba(21,128,61,0.8)] sm:px-7">
        <span aria-hidden="true" className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10" />
        <span aria-hidden="true" className="absolute -bottom-20 right-40 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Daily attendance report</h1>
            <p className="mt-1 text-sm text-white/90">
              For every bus: learners marked, present and absent. Absent means not scanned on a bus that was
              scanned. Click a bus to see its learners.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-white/15 px-4 py-2.5 ring-1 ring-white/25">
            {direction === 'return' ? <Moon className="h-5 w-5" aria-hidden="true" /> : <Sun className="h-5 w-5" aria-hidden="true" />}
            <div className="text-right">
              <p className="text-xs text-white/85">{tripName} trip</p>
              <p className="text-sm font-semibold">{longDate(date)}</p>
            </div>
          </div>
        </div>
      </header>

      {/* 2. KPI tiles */}
      {!isError && (isLoading || showFigures) && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          <KpiTile
            tone="blue" icon={Users} label="Total learners" value={dash ?? t!.learners}
            sub={t ? `on ${t.buses} buses` : undefined}
          />
          <KpiTile
            tone="violet" icon={ClipboardCheck} label="Marked" value={dash ?? t!.marked}
            sub={t ? `${pct(t.marked, t.learners)}% · ${t.busesMarked} of ${t.buses} buses` : undefined}
            title="Learners with a record for this trip: present plus absent"
          />
          <KpiTile
            tone="green" icon={UserCheck} label="Present" value={dash ?? t!.present}
            sub={t ? presentHint : undefined} title={t ? presentHint : undefined}
          />
          <KpiTile
            tone="red" icon={UserX} label="Absent" value={dash ?? t!.absent}
            sub={
              t
                ? t.absent > 0 && t.autoAbsent === t.absent
                  ? `${pct(t.absent, t.marked)}% · all automatic`
                  : `${pct(t.absent, t.marked)}% · ${t.autoAbsent} automatic`
                : undefined
            }
            title="Not scanned on a bus that was scanned. Staff scan cards; absences are written when marking closes."
          />
          <KpiTile
            tone="orange" icon={AlertTriangle} label="Not marked" value={dash ?? t!.notMarked}
            sub={t ? `${t.buses - t.busesMarked} buses · tap to show them` : undefined}
            title="Learners with no record at all for this trip. Tap to show those buses in the table."
            active={notMarkedCard.active}
            onClick={notMarkedCard.onClick}
          />
        </div>
      )}

      {/* 3. Date / trip bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
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
            aria-label="Report date"
          />
          <button
            type="button"
            className={`${BAR_BUTTON} w-10`}
            aria-label="Next day"
            disabled={stepDay(date, 1) > today}
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
        <div className="inline-flex rounded-xl bg-gray-100 p-1" role="group" aria-label="Trip">
          {(['onward', 'return'] as Direction[]).map((d) => {
            const on = direction === d;
            const Icon = d === 'return' ? Moon : Sun;
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => setDirection(d)}
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
          <ExportMenu onExport={onExport} disabled={rows.length === 0} />
        </div>
      </div>

      {/* An error must NOT fall through to zeros: "0 present" is a different and false claim. */}
      {isError && (
        <p className="rounded-xl border border-border p-6 text-sm text-foreground">
          Could not load the daily report{error instanceof Error ? `: ${error.message}` : ''}. Figures are
          not shown rather than shown as zero.
        </p>
      )}

      {data && !isError && data.noData && (
        <Note icon={Info} tone="info">
          {isSunday(date) ? 'Buses do not run on Sundays.' : 'There is no attendance to show for this day.'} Choose
          another day.
        </Note>
      )}

      {data && !isError && data.holiday && (
        <Note icon={Info} tone="info">This day is a holiday in the service calendar. No bus was expected to run.</Note>
      )}

      {showFigures && data.windowOpen && (
        <Note icon={Clock} tone="info">
          {tripName} marking is still open{data.windowEnd ? ` until ${formatHM(data.windowEnd)}` : ''}. Absences are
          filled in when it closes, so these figures will change.
        </Note>
      )}

      {showFigures && data.nothingMarked && !data.windowOpen && (
        <Note icon={AlertTriangle} tone="warn">
          <strong>No bus was marked on this day.</strong> If it was a holiday, add it to the service calendar so it is
          not counted against the buses.
        </Note>
      )}

      {/* 4. What to do next */}
      {showFigures && !data.nothingMarked && <ActionCards data={data} />}

      {/* 5. Charts */}
      {data && !isError && !data.noData && (
        <TrendAndSummary data={data} date={date} onPickDate={setDate} />
      )}
      {showFigures && !data.nothingMarked && <BusAndWeekday data={data} />}

      {/* 6. Every bus */}
      {showFigures && (
        <section
          aria-label="Bus-wise attendance"
          className="daily-table space-y-4 rounded-2xl border border-border bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_28px_-18px_rgba(15,23,42,0.35)] sm:p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Bus-wise attendance</h2>
            <p className="text-xs text-muted-foreground">
              {shortDate(date)} · {tripName} trip · click a route number for its learners
            </p>
          </div>
          <DataTable
            columns={columns}
            data={rows}
            getRowId={(r) => r.routeId}
            entityName="buses"
            isLoading={isLoading}
            searchPlaceholder="Search route…"
            emptyMessage="No buses to show for this day."
            columnFilters={cf.filters}
            onColumnFiltersChange={cf.setFilters}
            onFilteredRowsChange={onFilteredRowsChange}
            filters={[{ columnId: 'status', title: 'Status', options: STATUS_OPTIONS }]}
          />
          {t && <OverallLine totals={filteredRows ? summarizeRows(filteredRows) : t} filtered={!!filteredRows} />}
        </section>
      )}
    </div>
  );
}

// ── Notes and the Overall line ──────────────────────────────────────────────

const NOTE_TONE = {
  info: 'border-sky-500/40 bg-sky-500/10',
  warn: 'border-amber-500/40 bg-amber-500/10',
} as const;
const NOTE_ICON = { info: 'text-sky-500', warn: 'text-amber-500' } as const;

function Note({
  icon: Icon, tone, children,
}: { icon: React.ComponentType<{ className?: string }>; tone: keyof typeof NOTE_TONE; children: React.ReactNode }) {
  return (
    <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${NOTE_TONE[tone]}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${NOTE_ICON[tone]}`} aria-hidden="true" />
      <p className="min-w-0 text-foreground">{children}</p>
    </div>
  );
}

/** The totals of the rows on screen, as the table's "Overall" line. */
function OverallLine({ totals: t, filtered }: { totals: DailyTotals; filtered: boolean }) {
  const item = (label: string, value: React.ReactNode, tone = 'text-foreground') => (
    <span className="whitespace-nowrap">
      <span className="text-muted-foreground">{label}</span>{' '}
      <span className={`font-semibold tabular-nums ${tone}`}>{value}</span>
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-xl border border-border bg-gray-50 px-4 py-3 text-sm">
      <span className="font-semibold text-foreground">{filtered ? 'Overall (buses shown)' : 'Overall'}</span>
      {item('Total learners', t.learners)}
      {item('Marked', t.marked)}
      {item('Present', t.present, 'text-green-700 dark:text-green-400')}
      {item('Absent', t.absent, 'text-red-600 dark:text-red-400')}
      {item('Not marked', t.notMarked, 'text-orange-700 dark:text-orange-300')}
      {item('Present %', t.presentPct === null ? '—' : `${t.presentPct}%`)}
      {t.offRoster > 0 && item('Hostel / irregular riders', t.offRoster)}
    </div>
  );
}
