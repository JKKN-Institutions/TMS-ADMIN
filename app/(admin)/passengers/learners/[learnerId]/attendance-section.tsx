'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { SectionCard } from '@/components/ui/detail-view';
import { DataTable } from '@/components/ui/data-table';
import { MonthSummaryCards } from '@/components/attendance/month-summary-cards';
import { MonthCalendar } from '@/components/attendance/month-calendar';
import { RiderKindBadge } from '@/components/boarding/rider-kind-badge';
import { isMonthKey } from '@/lib/attendance/month-summary';
import { isOffRosterRider } from '@/lib/attendance/rider-kind';
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
  new Date(`${key}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

/**
 * One learner's bus attendance for admins: month picker (opens on ?month= from
 * the Learner register, else the latest month with records), totals with
 * days present counted once per date, a day-by-day calendar, and the records.
 *
 * Auto-absences are split out from staff-marked ones: the closing job marks
 * every unmarked rider absent, so a learner on a bus nobody scanned looks absent
 * even if they rode. Morning = `onward`, evening = `return`.
 */
export function LearnerAttendanceSection({ learnerId }: { learnerId: string }) {
  const searchParams = useSearchParams();
  const requested = searchParams.get('month');

  const { data, isLoading, error } = useQuery({
    queryKey: ['passenger-learner-attendance', learnerId],
    queryFn: () => fetchLearnerAttendance(learnerId),
    retry: (count, err) => !(err instanceof ForbiddenError) && count < 2,
  });
  const [month, setMonth] = useState<string | null>(isMonthKey(requested) ? requested : null);

  const columns = useMemo(() => getAttendanceColumns(), []);
  const all = useMemo(() => data ?? [], [data]);
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
  const offRosterKind = rows.find((r) => isOffRosterRider(r.riderKind))?.riderKind ?? null;

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
        <div className="flex items-center gap-2">
          <RiderKindBadge kind={offRosterKind} />
          <select
            value={selected}
            onChange={(e) => setMonth(e.target.value)}
            aria-label="Attendance month"
            className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            <option value={ALL}>All time</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">Couldn&apos;t load attendance. Please refresh and try again.</p>
      ) : (
        <div className="space-y-4">
          <MonthSummaryCards rows={rows} loading={isLoading} />

          {selected !== ALL && !isLoading && <MonthCalendar month={selected} trips={rows} />}

          <DataTable
            columns={columns}
            data={rows}
            entityName="records"
            isLoading={isLoading}
            searchPlaceholder="Search route, stop..."
            emptyMessage={selected === ALL ? 'No attendance recorded for this learner yet.' : `No attendance in ${monthLabel(selected)}.`}
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
