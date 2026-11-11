'use client';

/**
 * One learner's bus attendance report — opened from a name in the Learner
 * register. Month picker (opens on the register's month, else the latest month
 * with records), totals with a day counted once, a day-by-day calendar, every
 * record, and an Excel / PDF export.
 *
 * Layout (top to bottom): back link → header banner → colour KPI tiles → month
 * bar → calendar → records, matching the Daily Report.
 *
 * Auto-absences are split out from staff-marked ones: the closing job marks
 * every unmarked rider absent, so a learner on a bus nobody scanned looks absent
 * even if they rode. Morning = `onward`, evening = `return`.
 */

import { Suspense, use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, CalendarCheck2, CalendarDays, ChevronLeft, ChevronRight, Clock, Moon, Repeat, Sun, XCircle,
} from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { ExportMenu } from '@/components/ui/export-menu';
import { MonthCalendar } from '@/components/attendance/month-calendar';
import { exportTable, type ExportFormat } from '@/lib/export/table-export';
import { AUTO_MARK_TITLE, isAutoMark } from '@/lib/boarding/auto-mark';
import { isMonthKey, summarizeMonth } from '@/lib/attendance/month-summary';
import { isOffRosterRider, RIDER_KIND_LABEL } from '@/lib/attendance/rider-kind';
import { getAttendanceColumns, type AttendanceRow } from '@/app/student/attendance/columns';
import type { LearnerReportResponse } from '@/app/api/admin/attendance/learners/[learnerId]/route';
import { ATT_TABLE_CSS, AttendanceBanner, BAR_BUTTON, ControlBar, KpiTile, SectionPanel } from '../../attendance-ui';

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

function BackLink() {
  return (
    <Link href={REGISTER} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Learner Register
    </Link>
  );
}

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
  // Newest first. Includes the asked-for month even when it has no records.
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
  const riderLabel = `${RIDER_KIND_LABEL[offRosterKind ?? 'transport']} rider`;
  const period = selected === ALL ? 'All time' : monthLabel(selected);
  const about = [learner?.rollNumber, learner?.institution, learner?.routeLabel ? `Bus ${learner.routeLabel}` : null]
    .filter(Boolean)
    .join(' · ');

  const s = summarizeMonth(rows);
  const recordedDays = new Set(rows.map((r) => r.tripDate)).size;
  const presentPct = recordedDays > 0 ? Math.round((s.daysPresent / recordedDays) * 100) : null;
  // An error must not fall through to zeros: "0 days present" is a different and false claim.
  const dash = isLoading || error ? '—' : undefined;

  // Step through the months that have records (the list is newest first).
  const at = months.indexOf(selected);
  const older = at >= 0 ? months[at + 1] : undefined;
  const newer = at > 0 ? months[at - 1] : undefined;

  const onExport = (format: ExportFormat) => {
    const out = filteredRows ?? rows;
    const t = summarizeMonth(out);
    return exportTable(format, {
      rows: out,
      title: `Attendance ${name}`.slice(0, 31), // Excel caps a sheet name at 31
      filename: `attendance-${(learner?.rollNumber ?? learnerId).replace(/[^\w-]+/g, '_')}-${selected}`,
      summary:
        `${name}${learner?.rollNumber ? ` (${learner.rollNumber})` : ''} · ${period} · ` +
        `${t.daysPresent} days present · ${t.onwardPresent} morning · ${t.returnPresent} evening · ` +
        `${t.staffAbsent} absent · ${t.autoAbsent} auto-absent`,
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
      <div className="space-y-5">
        <BackLink />
        <AttendanceBanner title="Attendance report" />
        <p className="rounded-xl border border-border p-6 text-sm text-foreground">
          You don&apos;t have permission to view attendance.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <style dangerouslySetInnerHTML={{ __html: ATT_TABLE_CSS }} />
      <BackLink />

      {/* 1. Header banner */}
      <AttendanceBanner
        title={name}
        description={about || 'Bus attendance report'}
        chip={{ icon: CalendarDays, label: riderLabel, value: period }}
      />

      {/* 2. KPI tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          tone="green" icon={CalendarCheck2} label="Days present" value={dash ?? s.daysPresent}
          sub={dash ? undefined : presentPct === null ? 'a day counts once' : `${presentPct}% of ${recordedDays} recorded days`}
          title="Days with at least one trip present. A day counts once even with both trips."
        />
        <KpiTile tone="blue" icon={Sun} label="Morning trips" value={dash ?? s.onwardPresent} sub={dash ? undefined : 'present, to college'} />
        <KpiTile tone="violet" icon={Moon} label="Evening trips" value={dash ?? s.returnPresent} sub={dash ? undefined : 'present, return'} />
        <KpiTile tone="teal" icon={Repeat} label="Both trips" value={dash ?? s.bothTripDays} sub={dash ? undefined : 'days with morning + evening'} />
        <KpiTile tone="red" icon={XCircle} label="Absent" value={dash ?? s.staffAbsent} sub={dash ? undefined : 'marked by staff'} />
        <KpiTile
          tone="orange" icon={Clock} label="Auto-absent" value={dash ?? s.autoAbsent}
          sub={dash ? undefined : 'not scanned before closing'} title={AUTO_MARK_TITLE}
        />
      </div>

      {/* 3. Month bar */}
      <ControlBar>
        <CalendarDays className="ml-1 hidden h-5 w-5 text-green-600 sm:block" aria-hidden="true" />
        <div className="flex items-center gap-1.5">
          <button
            type="button" className={`${BAR_BUTTON} w-10`} aria-label="Older month"
            disabled={!older} onClick={() => older && setMonth(older)}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <select
            value={selected}
            onChange={(e) => setMonth(e.target.value)}
            aria-label="Attendance month"
            className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            <option value={ALL}>All time</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <button
            type="button" className={`${BAR_BUTTON} w-10`} aria-label="Newer month"
            disabled={!newer} onClick={() => newer && setMonth(newer)}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setMonth(ALL)}
          disabled={selected === ALL}
          className={`${BAR_BUTTON} px-4 text-sm font-medium`}
        >
          All time
        </button>
        <div className="ml-auto">
          <ExportMenu onExport={onExport} disabled={rows.length === 0} />
        </div>
      </ControlBar>

      {error ? (
        <p className="rounded-xl border border-border p-6 text-sm text-foreground">
          Could not load this learner&apos;s attendance{error instanceof Error ? `: ${error.message}` : ''}. Nothing is
          shown rather than shown as zero.
        </p>
      ) : (
        <>
          {/* 4. Day by day */}
          {selected !== ALL && !isLoading && (
            <SectionPanel title="Day by day" note={period}>
              <MonthCalendar month={selected} trips={rows} />
            </SectionPanel>
          )}

          {/* 5. Every record */}
          <SectionPanel title="Attendance records" note={`${period} · every trip recorded for this learner`} table>
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
          </SectionPanel>
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
