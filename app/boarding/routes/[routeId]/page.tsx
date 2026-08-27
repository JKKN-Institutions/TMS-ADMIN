'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Users, ListChecks, ChevronLeft, ChevronRight, CalendarClock } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { DataTable } from '@/components/ui/data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/detail-view';
import { istToday, addDays } from '@/lib/booking/window';
import { getRosterColumns, type RosterStudent } from './columns';

interface RouteInfo { id: string; route_number: string | null; route_name: string | null }

interface RosterData {
  route: RouteInfo;
  students: RosterStudent[];
  counts: { booked: number; capacity: number };
}

const fmtDateLong = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

async function fetchRoster(routeId: string, date: string): Promise<RosterData> {
  const res = await fetch(`/api/boarding/routes/${routeId}/roster?date=${date}`, { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load roster');
  return json.data as RosterData;
}

export default function BoardingRosterPage({ params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = use(params);
  const { can, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || can('tms.attendance.manage');
  const qc = useQueryClient();

  // Which day's roster. Today is markable; other days are read-only previews
  // (advance bookings for future dates, history for past dates).
  const today = istToday();
  const [date, setDate] = useState<string>(() => today);
  const isToday = date === today;
  const isFuture = date > today;
  const editable = canManage && isToday;

  const {
    data: rosterData,
    isLoading: loading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: ['boarding-roster', routeId, date],
    queryFn: () => fetchRoster(routeId, date),
    enabled: !!routeId,
  });

  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState<{ booked: number; capacity: number }>({ booked: 0, capacity: 0 });
  const [selected, setSelected] = useState<RosterStudent | null>(null);

  // Sync the locally-mutable roster from the query whenever a fresh load lands
  // (route/date change). postMarks() below then mutates `students` directly for
  // optimistic UI, with a revert-on-failure — that logic is unchanged.
  useEffect(() => {
    if (rosterData) {
      setRoute(rosterData.route);
      setStudents(rosterData.students);
      setMeta({ booked: rosterData.counts?.booked ?? 0, capacity: rosterData.counts?.capacity ?? 0 });
    }
  }, [rosterData]);

  const error = isError ? (queryError instanceof Error ? queryError.message : 'Failed to load roster') : null;

  useEffect(() => {
    if (isError) toast.error(error ?? 'Failed to load roster');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError]);

  const counts = useMemo(() => ({
    total: students.length,
    onward: students.filter((s) => s.onward_status === 'present').length,
    return: students.filter((s) => s.return_status === 'present').length,
  }), [students]);

  // Persist a batch of onward marks; optimistic with revert on failure.
  // `prev` is captured inside the state updater so it's never a stale closure.
  // Marking is onward-only (see lib/boarding/attendance-window.ts) — the API
  // rejects direction: 'return' with a 400, so this always sends 'onward'.
  const postMarks = async (marks: { learnerId: string; status: 'present' | 'absent' }[]) => {
    if (marks.length === 0) return;
    const wanted = new Map(marks.map((m) => [m.learnerId, m.status]));
    let prev: RosterStudent[] = [];
    setStudents((list) => {
      prev = list;
      return list.map((s) => {
        const next = wanted.get(s.id);
        if (!next) return s;
        return { ...s, onward_status: next };
      });
    });
    setSaving(true);
    try {
      const res = await fetch('/api/boarding/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ routeId, direction: 'onward', marks }),
      });
      const json = await res.json();
      // Every requested mark was locked by a colleague (or already-true), and
      // nothing was written — revert. `prev` is already correct for any noop
      // rows in the batch (their requested status equalled what was there).
      if (res.status === 409 && json?.reason === 'locked') {
        setStudents(prev);
        toast.error(json.error || 'Another staff member has already marked this student.');
        return;
      }
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to save');
      if (json.locked?.length > 0) {
        toast.error(`${json.locked.length} mark(s) belong to another in-charge and were not changed.`);
      } else if (json.updated === 0 && json.skipped > 0) {
        toast('Already set to that status — nothing changed.');
      }
      // Always resync — the optimistic guess above may not match what the
      // server actually wrote when a batch was partially locked or a noop.
      qc.invalidateQueries({ queryKey: ['boarding-roster'] });
    } catch (e) {
      setStudents(prev);
      toast.error(e instanceof Error ? e.message : 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const markOne = (learnerId: string, status: 'present' | 'absent') =>
    postMarks([{ learnerId, status }]);

  const markRemainingAbsent = () => {
    const remaining = students.filter((s) => s.onward_status == null).map((s) => ({ learnerId: s.id, status: 'absent' as const }));
    if (remaining.length === 0) {
      toast('No unmarked learners');
      return;
    }
    if (!confirm(`Mark ${remaining.length} unmarked learner(s) ABSENT?`)) return;
    postMarks(remaining);
  };

  const columns = useMemo(
    () => getRosterColumns(editable, saving, markOne, setSelected),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editable, saving]
  );

  const statusOptions = [
    { label: 'Present', value: 'present' },
    { label: 'Absent', value: 'absent' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/boarding/routes" aria-label="Back to routes" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-700 transition-colors hover:bg-gray-50">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">{route ? `Route ${route.route_number || '—'}` : 'Roster'}</h1>
            {route?.route_name && <p className="text-gray-600 text-sm truncate">{route.route_name}</p>}
          </div>
        </div>
        <Link href="/boarding/attendance" className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700">
          <ListChecks className="h-4 w-4" /> Attendance &amp; Scan
        </Link>
      </div>

      {/* Date selector — view today (markable) or any other day's bookings (read-only) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white p-1 dark:border-gray-700 dark:bg-gray-900">
          <button
            type="button" aria-label="Previous day" onClick={() => setDate((d) => addDays(d, -1))}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date" value={date} onChange={(e) => setDate(e.target.value || today)} aria-label="Roster date"
            className="cursor-pointer border-0 bg-transparent px-1 text-sm font-medium text-gray-900 focus:outline-none dark:text-gray-100"
          />
          <button
            type="button" aria-label="Next day" onClick={() => setDate((d) => addDays(d, 1))}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {!isToday && (
          <button
            type="button" onClick={() => setDate(today)}
            className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-900 dark:text-blue-300"
          >
            Today
          </button>
        )}
      </div>

      {!isToday && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {isFuture ? 'Advance bookings' : 'Past records'} for <strong>{fmtDateLong(date)}</strong> — read-only.
            Attendance can only be marked on the day of travel.
          </span>
        </div>
      )}

      {/* Summary */}
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-blue-700 dark:text-blue-300">
          <Users className="h-4 w-4" /> {meta.booked} booked / {meta.capacity} seats
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-gray-700">
          <Users className="h-4 w-4 text-gray-400" /> {counts.total} on roster
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-green-700 dark:text-green-300">
          <CheckCircle2 className="h-4 w-4" /> {counts.onward} onward
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-purple-700 dark:text-purple-300">
          <CheckCircle2 className="h-4 w-4" /> {counts.return} return
        </span>
      </div>

      {error ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">{error}</div>
      ) : (
        <DataTable
          columns={columns}
          data={students}
          entityName="students"
          isLoading={loading}
          searchPlaceholder="Search learner, roll #..."
          pageSize={20}
          filters={[
            { columnId: 'onward', title: 'Onward', options: statusOptions },
          ]}
          enableRowSelection={editable}
          getRowId={(s) => s.id}
          toolbarActions={
            editable
              ? ({ selectedRows, resetSelection }) => {
                  // With rows selected → bulk-mark the selection.
                  if (selectedRows.length > 0) {
                    const ids = selectedRows.map((s) => s.id);
                    const bulk = (status: 'present' | 'absent') => {
                      postMarks(ids.map((learnerId) => ({ learnerId, status })));
                      resetSelection();
                    };
                    const btn = (tone: 'present' | 'absent') =>
                      tone === 'present'
                        ? 'rounded-md border border-green-300 bg-white px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50'
                        : 'rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50';
                    return (
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs font-medium text-gray-600">{selectedRows.length} selected</span>
                        <div className="inline-flex items-center gap-1">
                          <button type="button" disabled={saving} onClick={() => bulk('present')} className={btn('present')}>Present</button>
                          <button type="button" disabled={saving} onClick={() => bulk('absent')} className={btn('absent')}>Absent</button>
                        </div>
                      </div>
                    );
                  }
                  // Nothing selected → quick "mark remaining absent".
                  return (
                    <div className="flex items-center gap-2">
                      <button type="button" disabled={saving} onClick={() => markRemainingAbsent()} className="inline-flex h-[38px] items-center rounded-lg border border-gray-300 bg-white px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                        Mark remaining absent
                      </button>
                    </div>
                  );
                }
              : undefined
          }
        />
      )}

      {/* Learner detail — opened by clicking a name in the roster */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected?.name ?? 'Learner'}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Roll number" value={selected.roll_number} />
              <Field label="Register number" value={selected.register_number} />
              <div className="col-span-2"><Field label="Institution" value={selected.institution} /></div>
              <Field label="Degree" value={selected.degree} />
              <Field label="Section" value={selected.section} />
              <div className="col-span-2"><Field label="Department" value={selected.department} /></div>
              <div className="col-span-2"><Field label="Programme" value={selected.program} /></div>
              <Field label="Semester" value={selected.semester} />
              <Field label="Academic year" value={selected.academic_year} />
              <Field label="Transport year" value={selected.transport_year} />
              <Field label="Boarding stop" value={selected.stop} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
