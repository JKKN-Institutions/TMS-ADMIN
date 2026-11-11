'use client';

/**
 * Daily report — one day, one trip, every bus: how many learners, how many
 * were marked, present and absent, and which buses need attention tomorrow.
 *
 * The simple front page of Attendance. The month-wide grid lives on the
 * "Bus coverage" tab; a row here opens the learner list for that bus and day.
 */

import React, { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Clock, Info,
  UserCheck, UserX, Users,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { SummaryCard, SummaryCards, useCardFilters } from '@/components/ui/summary-cards';
import { DataTable } from '@/components/ui/data-table';
import { ExportMenu } from '@/components/ui/export-menu';
import { exportTable, type ExportFormat } from '@/lib/export/table-export';
import { formatHM } from '@/lib/boarding/attendance-window';
import {
  DAILY_STATUS_LABEL, shiftDate, summarizeRows,
  type DailyRouteRow, type DailyStatus, type DailyTotals,
} from '@/lib/attendance/daily-report';
import type { DailyReportResponse } from '@/app/api/admin/attendance/daily/route';
import { AttendanceTabs } from './attendance-tabs';
import { getDailyColumns } from './daily-columns';

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
const weekday = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' });

const routeLabel = (r: DailyRouteRow) => `${r.routeNumber ?? '—'} ${r.routeName ?? ''}`.trim();

async function fetchDaily(date: string, direction: Direction): Promise<DailyReportResponse> {
  const params = new URLSearchParams({ date, direction });
  const res = await fetch(`/api/admin/attendance/daily?${params}`, { cache: 'no-store', credentials: 'same-origin' });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.error || 'Failed to load the daily report');
  return result.data as DailyReportResponse;
}

const NAV_BUTTON =
  'inline-flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40';

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

  return (
    <div className="space-y-4">
      <AttendanceTabs />
      <PageHeader description="One day at a time: for every bus, how many learners were marked, present and absent. Absent means the learner was not scanned on a bus that was scanned. Click a bus to see its learners." />

      <div className="flex flex-wrap items-end gap-3">
        <div className="text-xs text-muted-foreground">
          Date
          <div className="mt-1 flex items-center gap-1">
            <button type="button" className={NAV_BUTTON} aria-label="Previous day" onClick={() => setDate(stepDay(date, -1))}>
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
              className={NAV_BUTTON}
              aria-label="Next day"
              disabled={stepDay(date, 1) > today}
              onClick={() => setDate(stepDay(date, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDate(today)}
          disabled={date === today}
          className="inline-flex h-[38px] items-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40"
        >
          Today
        </button>
        <label className="text-xs text-muted-foreground">
          Trip
          <select value={direction} onChange={(e) => setDirection(e.target.value as Direction)} className="input mt-1 block">
            <option value="onward">Morning</option>
            <option value="return">Evening</option>
          </select>
        </label>
        <p className="pb-2 text-sm font-medium text-foreground">{longDate(date)}</p>
      </div>

      {/* An error must NOT fall through to zeros: "0 present" is a different and false claim. */}
      {isError && (
        <p className="rounded-lg border border-border p-6 text-sm text-foreground">
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

      {!isError && (isLoading || showFigures) && (
        <SummaryCards>
          <SummaryCard icon={Users} label="Total learners" value={dash ?? t!.learners} hint={t ? `on ${t.buses} buses` : undefined} />
          <SummaryCard
            icon={ClipboardCheck}
            label="Marked"
            value={dash ?? t!.marked}
            tone="info"
            hint={t ? `${t.busesMarked} of ${t.buses} buses` : undefined}
            title="Learners with a record for this trip: present plus absent"
          />
          <SummaryCard icon={UserCheck} label="Present" value={dash ?? t!.present} tone="good" hint={t ? presentHint : undefined} title={t ? presentHint : undefined} />
          <SummaryCard
            icon={UserX}
            label="Absent"
            value={dash ?? t!.absent}
            tone="danger"
            hint={
              t
                ? t.absent > 0 && t.autoAbsent === t.absent
                  ? 'all filled in automatically'
                  : `${t.autoAbsent} filled in automatically`
                : undefined
            }
            title="Not scanned on a bus that was scanned. Staff scan cards; absences are written when marking closes."
          />
          <SummaryCard
            icon={AlertTriangle}
            label="Not marked"
            value={dash ?? t!.notMarked}
            tone={t && t.notMarked > 0 ? 'warn' : 'good'}
            hint={t ? `${t.buses - t.busesMarked} buses · click to show them` : undefined}
            title="Learners with no record at all for this trip"
            {...cf.card('status', 'not_marked')}
          />
        </SummaryCards>
      )}

      {showFigures && !data.nothingMarked && <ActionPanel data={data} />}

      {showFigures && (
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
          toolbarActions={() => <ExportMenu onExport={onExport} disabled={rows.length === 0} />}
        />
      )}

      {showFigures && t && <OverallLine totals={filteredRows ? summarizeRows(filteredRows) : t} filtered={!!filteredRows} />}

      {data && !isError && data.trend.length > 0 && (
        <section aria-label="Last service days">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Day by day</h2>
          <div className="flex flex-wrap gap-2">
            {data.trend.map((d) => {
              const active = d.date === date;
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => setDate(d.date)}
                  aria-pressed={active}
                  className={`min-w-[7.5rem] rounded-lg border bg-white px-3 py-2 text-left transition-colors hover:bg-gray-50 ${
                    active ? 'border-green-600 ring-1 ring-green-600' : 'border-gray-200'
                  }`}
                >
                  <span className="block text-xs text-muted-foreground">{weekday(d.date)}, {shortDate(d.date)}</span>
                  {d.holiday ? (
                    <span className="block text-sm text-muted-foreground">Holiday</span>
                  ) : d.nothingMarked ? (
                    <span className="block text-sm text-amber-700 dark:text-amber-300">No marks</span>
                  ) : (
                    <>
                      <span className="block text-sm font-semibold tabular-nums text-foreground">
                        {d.present} present
                      </span>
                      <span className="block text-xs tabular-nums text-muted-foreground">
                        {d.absent} absent · {d.busesMarked}/{d.buses} buses
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

const NOTE_TONE = {
  info: 'border-sky-500/40 bg-sky-500/10',
  warn: 'border-amber-500/40 bg-amber-500/10',
} as const;
const NOTE_ICON = { info: 'text-sky-500', warn: 'text-amber-500' } as const;

function Note({
  icon: Icon, tone, children,
}: { icon: React.ComponentType<{ className?: string }>; tone: keyof typeof NOTE_TONE; children: React.ReactNode }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${NOTE_TONE[tone]}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${NOTE_ICON[tone]}`} aria-hidden="true" />
      <p className="min-w-0 text-foreground">{children}</p>
    </div>
  );
}

/** The totals of the rows on screen, as the table's "Overall" line. */
function OverallLine({ totals: t, filtered }: { totals: DailyTotals; filtered: boolean }) {
  const item = (label: string, value: React.ReactNode) => (
    <span className="whitespace-nowrap">
      <span className="text-muted-foreground">{label}</span>{' '}
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-border px-4 py-3 text-sm">
      <span className="font-semibold text-foreground">{filtered ? 'Overall (buses shown)' : 'Overall'}</span>
      {item('Total learners', t.learners)}
      {item('Marked', t.marked)}
      {item('Present', t.present)}
      {item('Absent', t.absent)}
      {item('Not marked', t.notMarked)}
      {item('Present %', t.presentPct === null ? '—' : `${t.presentPct}%`)}
      {t.offRoster > 0 && item('Hostel / irregular riders', t.offRoster)}
    </div>
  );
}

/** What the transport head should do before the next trip, worst first. */
function ActionPanel({ data }: { data: DailyReportResponse }) {
  const { noIncharge, notScanned, low } = data.actions;
  const link = (r: DailyRouteRow) => (
    <Link
      href={`/attendance/${r.routeId}/${data.date}?direction=${data.direction}`}
      className="font-medium text-foreground underline-offset-2 hover:underline"
    >
      {routeLabel(r)}
    </Link>
  );

  if (noIncharge.length + notScanned.length + low.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
        <p className="text-foreground">
          {data.windowOpen ? 'Nothing to act on so far.' : 'Every bus was scanned. Nothing to act on for tomorrow.'}
        </p>
      </div>
    );
  }

  const sinceText = (r: DailyRouteRow) =>
    r.lastMarked
      ? `last marked ${shortDate(r.lastMarked)}`
      : 'not marked in the last 5 weeks';

  return (
    <section className="rounded-xl border-2 border-amber-200 bg-white p-4 dark:border-amber-500/30" aria-label="Action for tomorrow">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
        {data.windowOpen ? 'To check before marking closes' : 'Action for tomorrow'}
      </h2>
      <div className="mt-3 space-y-4 text-sm">
        {noIncharge.length > 0 && (
          <div>
            <p className="font-medium text-foreground">
              {noIncharge.length} bus{noIncharge.length === 1 ? ' has' : 'es have'} no in-charge, so nobody can mark{' '}
              {noIncharge.reduce((n, r) => n + r.roster, 0)} learners.{' '}
              <Link href="/staff-route-assignments" className="text-green-700 underline-offset-2 hover:underline dark:text-green-400">
                Assign an in-charge
              </Link>
            </p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {noIncharge.map((r) => (
                <li key={r.routeId}>{link(r)} · {r.roster} learners · {sinceText(r)}</li>
              ))}
            </ul>
          </div>
        )}
        {notScanned.length > 0 && (
          <div>
            <p className="font-medium text-foreground">
              {notScanned.length} bus{notScanned.length === 1 ? ' was' : 'es were'} not scanned by{' '}
              {notScanned.length === 1 ? 'its' : 'their'} in-charges ({notScanned.reduce((n, r) => n + r.roster, 0)} learners).
              Speak to them before the next trip.
            </p>
            <ul className="mt-1 space-y-1 text-muted-foreground">
              {notScanned.map((r) => {
                const names = data.inchargeNames[r.routeId] ?? [];
                return (
                  <li key={r.routeId}>
                    {link(r)} · {r.roster} learners · {sinceText(r)}
                    {!r.hasBus && ' · no bus assigned'}
                    <span className="block text-xs">
                      In-charges: {names.length > 0 ? names.join(', ') : `${r.incharges} assigned`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {low.length > 0 && (
          <div>
            <p className="font-medium text-foreground">
              {low.length} bus{low.length === 1 ? ' was' : 'es were'} scanned by too few people. Most of the absences
              on {low.length === 1 ? 'it' : 'them'} are learners nobody scanned; ask every in-charge to scan.
            </p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {low.map((r) => (
                <li key={r.routeId}>
                  {link(r)} · {r.present} of {r.roster} present · {r.markers} of {r.incharges} in-charges scanned
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
