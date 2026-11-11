'use client';

/**
 * One learner's bus attendance report — opened from a name in the Learner
 * register. Month picker (opens on the register's month, else the latest month
 * with records), totals with a day counted once, a day-by-day calendar, every
 * record, and an Excel / PDF export.
 *
 * Auto-absences are split out from staff-marked ones: the closing job marks
 * every unmarked rider absent, so a learner on a bus nobody scanned looks absent
 * even if they rode. Morning = `onward`, evening = `return`.
 */

import { Suspense, use, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { DataTable } from '@/components/ui/data-table';
import { ExportMenu } from '@/components/ui/export-menu';
import { MonthSummaryCards } from '@/components/attendance/month-summary-cards';
import { MonthCalendar } from '@/components/attendance/month-calendar';
import { RiderKindBadge } from '@/components/boarding/rider-kind-badge';
import { exportTable, type ExportFormat } from '@/lib/export/table-export';
import { isAutoMark } from '@/lib/boarding/auto-mark';
import { isMonthKey, summarizeMonth } from '@/lib/attendance/month-summary';
import { isOffRosterRider } from '@/lib/attendance/rider-kind';
import { getAttendanceColumns, type AttendanceRow } from '@/app/student/attendance/columns';
import type { LearnerReportResponse } from '@/app/api/admin/attendance/learners/[learnerId]/route';

class ForbiddenError extends Error {}

async function fetchReport(id: string): Promise<LearnerReportResponse> {
  const res = await fetch(`/api/admin/attendance/learners/${id}`, { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 403) throw new ForbiddenError('Forbidden');
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load attendance');
  return json.data as LearnerReportResponse;
}

const ALL = 'all';
const REGISTER = '/attendance/learners';

const monthLabel = (key: string) =>
  new Date(`${key}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const timeLabel = (ts: string | null) =>
  ts ? new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';

const crumbs = (name: string) => [
  { label: 'Attendance', href: '/attendance' },
  { label: 'Learner Register', href: REGISTER },
  { label: name },
];

function LearnerAttendanceReport({ learnerId }: { learnerId: string }) {
  const requested = useSearchParams().get('month');

  const { data, isLoading, error } = useQuery({
    queryKey: ['attendance-learner-report', learnerId],
    queryFn: () => fetchReport(learnerId),
    retry: (count, err) => !(err instanceof ForbiddenError) && count < 2,
  });
  const [month, setMonth] = useState<string | null>(isMonthKey(requested) ? requested : null);
  const [filteredRows, setFilteredRows] = useState<AttendanceRow[] | null>(null);

  const columns = useMemo(() => getAttendanceColumns(), []);
  const all = useMemo<AttendanceRow[]>(() => data?.rows ?? [], [data]);
  const months = useMemo(() => {
    const set = new Set(all.map((r) => r.tripDate.slice(0, 7)));
    if (month && month !== ALL) set.add(month);
    return [...set].sort().reverse();
  }, [all, month]);

  // No month asked for: open on the latest month that has records.
  useEffect(() => {
    if (month === null && data) setMonth(months[0] ?? ALL);
  }, [month, data, months]);

  const selected = month ?? ALL;
  const rows = useMemo(
    () => (selected === ALL ? all : all.filter((r) => r.tripDate.startsWith(selected))),
    [all, selected],
  );
  const onFilteredRowsChange = useCallback((r: AttendanceRow[], isFiltered: boolean) => {
    setFilteredRows(isFiltered ? r : null);
  }, []);

  const learner = data?.learner ?? null;
  const name = learner?.name ?? (isLoading ? 'Loading…' : 'Learner');
  const offRosterKind = all.find((r) => isOffRosterRider(r.riderKind))?.riderKind ?? null;
  const period = selected === ALL ? 'All time' : monthLabel(selected);
  const subtitle =
    [learner?.rollNumber, learner?.institution, learner?.routeLabel ? `Bus ${learner.routeLabel}` : null]
      .filter(Boolean)
      .join(' · ') || undefined;

  const onExport = (format: ExportFormat) => {
    const out = filteredRows ?? rows;
    const s = summarizeMonth(out);
    return exportTable(format, {
      rows: out,
      title: `Attendance ${name}`.slice(0, 31), // Excel caps a sheet name at 31
      filename: `attendance-${(learner?.rollNumber ?? learnerId).replace(/[^\w-]+/g, '_')}-${selected}`,
      summary:
        `${name}${learner?.rollNumber ? ` (${learner.rollNumber})` : ''} · ${period} · ` +
        `${s.daysPresent} days present · ${s.onwardPresent} morning · ${s.returnPresent} evening · ` +
        `${s.staffAbsent} absent · ${s.autoAbsent} auto-absent`,
      columns: [
        { header: 'Date', value: (r) => dayLabel(r.tripDate), width: 18 },
        { header: 'Trip', value: (r) => (r.direction === 'return' ? 'Evening' : 'Morning'), width: 10 },
        { header: 'Bus', value: (r) => r.routeLabel, width: 30 },
        { header: 'Stop', value: (r) => r.stopLabel, width: 24 },
        { header: 'Status', value: (r) => (r.status === 'present' ? 'Present' : 'Absent'), width: 10 },
        { header: 'Marked by', value: (r) => (isAutoMark(r.method) ? 'Automatic' : 'Staff'), width: 12 },
        { header: 'Time', value: (r) => (isAutoMark(r.method) ? '' : timeLabel(r.scannedAt)), width: 10 },
      ],
    });
  };

  if (error instanceof ForbiddenError) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs('Attendance report')} backHref={REGISTER} title="Attendance report" />
        <p className="rounded-lg border border-border p-6 text-sm text-foreground">
          You don&apos;t have permission to view attendance.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={crumbs(name)}
        backHref={REGISTER}
        title={name}
        subtitle={subtitle}
        actions={
          <>
            <RiderKindBadge kind={offRosterKind} />
            <select
              value={selected}
              onChange={(e) => setMonth(e.target.value)}
              aria-label="Attendance month"
              className="h-[38px] rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              <option value={ALL}>All time</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
            <ExportMenu onExport={onExport} disabled={rows.length === 0} />
          </>
        }
      />

      {/* An error must not fall through to zeros: "0 days present" is a different and false claim. */}
      {error ? (
        <p className="rounded-lg border border-border p-6 text-sm text-foreground">
          Could not load this learner&apos;s attendance{error instanceof Error ? `: ${error.message}` : ''}. Nothing is
          shown rather than shown as zero.
        </p>
      ) : (
        <>
          <MonthSummaryCards rows={rows} loading={isLoading} />

          {selected !== ALL && !isLoading && <MonthCalendar month={selected} trips={rows} />}

          <DataTable
            columns={columns}
            data={rows}
            getRowId={(r) => r.id}
            entityName="records"
            isLoading={isLoading}
            searchPlaceholder="Search route, stop..."
            emptyMessage={
              selected === ALL ? 'No attendance recorded for this learner yet.' : `No attendance in ${monthLabel(selected)}.`
            }
            onFilteredRowsChange={onFilteredRowsChange}
            filters={[
              {
                columnId: 'status',
                title: 'Status',
                options: [
                  { label: 'Present', value: 'present' },
                  { label: 'Absent', value: 'absent' },
                ],
              },
              {
                columnId: 'direction',
                title: 'Direction',
                options: [
                  { label: 'Onward', value: 'onward' },
                  { label: 'Return', value: 'return' },
                ],
              },
            ]}
          />
        </>
      )}
    </div>
  );
}

export default function LearnerAttendanceReportPage({ params }: { params: Promise<{ learnerId: string }> }) {
  const { learnerId } = use(params);
  return (
    // useSearchParams needs a Suspense boundary above it.
    <Suspense fallback={null}>
      <LearnerAttendanceReport learnerId={learnerId} />
    </Suspense>
  );
}
