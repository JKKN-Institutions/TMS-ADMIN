'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck2, CheckCircle2, Clock, Percent, XCircle } from 'lucide-react';
import { SectionCard } from '@/components/ui/detail-view';
import { SummaryCard, SummaryCards } from '@/components/ui/summary-cards';
import { DataTable } from '@/components/ui/data-table';
import { isAutoMark, AUTO_MARK_TITLE } from '@/lib/boarding/auto-mark';
import { getAttendanceColumns, type AttendanceRow } from '@/app/student/attendance/columns';

class ForbiddenError extends Error {}

async function fetchLearnerAttendance(id: string): Promise<AttendanceRow[]> {
  const res = await fetch(`/api/admin/passengers/learners/${id}/attendance`, { cache: 'no-store' });
  if (res.status === 403) throw new ForbiddenError('Forbidden');
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load attendance');
  return json.data as AttendanceRow[];
}

const ALL = 'all';

const monthLabel = (key: string) =>
  new Date(`${key}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

interface Tally {
  total: number;
  present: number;
  absent: number;
  autoAbsent: number;
}

function tally(rows: AttendanceRow[]): Tally {
  const t: Tally = { total: rows.length, present: 0, absent: 0, autoAbsent: 0 };
  for (const r of rows) {
    if (r.status === 'present') t.present++;
    else if (r.status === 'absent') {
      t.absent++;
      if (isAutoMark(r.method)) t.autoAbsent++;
    }
  }
  return t;
}

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

/**
 * One learner's boarding attendance totals + day-by-day history, for admins.
 *
 * Auto-absences are split out from staff-marked ones: the closing job marks
 * every unmarked rider absent, so a learner on a bus nobody scanned looks absent
 * even if they rode. Morning = `onward`, evening = `return`.
 */
export function LearnerAttendanceSection({ learnerId }: { learnerId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['passenger-learner-attendance', learnerId],
    queryFn: () => fetchLearnerAttendance(learnerId),
    retry: (count, err) => !(err instanceof ForbiddenError) && count < 2,
  });
  const [month, setMonth] = useState(ALL);

  const columns = useMemo(() => getAttendanceColumns(), []);
  const all = useMemo(() => data ?? [], [data]);
  const months = useMemo(
    () => [...new Set(all.map((r) => r.tripDate.slice(0, 7)))].sort().reverse(),
    [all],
  );
  const rows = useMemo(
    () => (month === ALL ? all : all.filter((r) => r.tripDate.startsWith(month))),
    [all, month],
  );

  const t = tally(rows);
  const morning = tally(rows.filter((r) => r.direction === 'onward'));
  const evening = tally(rows.filter((r) => r.direction === 'return'));
  const staffAbsent = t.absent - t.autoAbsent;
  const dash = isLoading ? '—' : undefined;

  if (error instanceof ForbiddenError) {
    return (
      <SectionCard title="Attendance">
        <p className="text-sm text-gray-500">You don&apos;t have permission to view attendance.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Attendance"
      action={
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          aria-label="Attendance month"
          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700"
        >
          <option value={ALL}>All time</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
      }
    >
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">Couldn&apos;t load attendance. Please refresh and try again.</p>
      ) : (
        <div className="space-y-4">
          <SummaryCards>
            <SummaryCard icon={CalendarCheck2} label="Total trips" value={dash ?? t.total} />
            <SummaryCard icon={CheckCircle2} label="Present" value={dash ?? t.present} tone="good" />
            <SummaryCard
              icon={XCircle}
              label="Absent"
              value={dash ?? t.absent}
              tone={t.absent > 0 ? 'danger' : 'neutral'}
              hint={isLoading ? undefined : `${staffAbsent} by staff · ${t.autoAbsent} auto`}
            />
            <SummaryCard
              icon={Clock}
              label="Auto-absent"
              value={dash ?? t.autoAbsent}
              tone={t.autoAbsent > 0 ? 'warn' : 'neutral'}
              hint="not marked before closing"
              title={AUTO_MARK_TITLE}
            />
            <SummaryCard
              icon={Percent}
              label="Attendance"
              value={dash ?? `${pct(t.present, t.total)}%`}
              tone="info"
              hint={isLoading ? undefined : `${t.present} of ${t.total} trips`}
            />
          </SummaryCards>

          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <LegLine label="Morning" t={morning} loading={isLoading} />
            <LegLine label="Evening" t={evening} loading={isLoading} />
          </div>

          <DataTable
            columns={columns}
            data={rows}
            entityName="records"
            isLoading={isLoading}
            searchPlaceholder="Search route, stop..."
            emptyMessage="No attendance recorded for this learner yet."
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
        </div>
      )}
    </SectionCard>
  );
}

function LegLine({ label, t, loading }: { label: string; t: Tally; loading: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-gray-200 px-3 py-2">
      <span className="font-medium text-gray-900">{label}</span>
      {loading ? (
        <span className="text-gray-400">—</span>
      ) : (
        <>
          <span className="text-green-700 dark:text-green-400">{t.present} present</span>
          <span className="text-red-600 dark:text-red-400">{t.absent} absent</span>
          <span className="text-gray-500">
            {t.total} trips · {pct(t.present, t.total)}%
          </span>
        </>
      )}
    </div>
  );
}
