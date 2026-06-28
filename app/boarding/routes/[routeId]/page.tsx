'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Users, QrCode, ChevronLeft, ChevronRight, CalendarClock } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { DataTable } from '@/components/ui/data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/detail-view';
import { istToday, addDays } from '@/lib/booking/window';
import { getRosterColumns, type RosterStudent, type RosterDirection } from './columns';

interface RouteInfo { id: string; route_number: string | null; route_name: string | null }

const statusKey = (d: RosterDirection): 'onward_status' | 'return_status' =>
  d === 'return' ? 'return_status' : 'onward_status';

const fmtDateLong = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

export default function BoardingRosterPage({ params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = use(params);
  const { can, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || can('tms.attendance.manage');

  // Which day's roster. Today is markable; other days are read-only previews
  // (advance bookings for future dates, history for past dates).
  const today = istToday();
  const [date, setDate] = useState<string>(() => today);
  const isToday = date === today;
  const isFuture = date > today;
  const editable = canManage && isToday;

  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState<{ booked: number; capacity: number }>({ booked: 0, capacity: 0 });
  const [selected, setSelected] = useState<RosterStudent | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/boarding/routes/${routeId}/roster?date=${date}`, { cache: 'no-store', credentials: 'same-origin' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load roster');
      setRoute(json.data.route);
      setStudents(json.data.students as RosterStudent[]);
      setMeta({ booked: json.data.counts?.booked ?? 0, capacity: json.data.counts?.capacity ?? 0 });
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load roster';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, date]);

  const counts = useMemo(() => ({
    total: students.length,
    onward: students.filter((s) => s.onward_status === 'present').length,
    return: students.filter((s) => s.return_status === 'present').length,
  }), [students]);

  // Persist a batch of marks for a direction; optimistic with revert on failure.
  // `prev` is captured inside the state updater so it's never a stale closure.
  const postMarks = async (direction: RosterDirection, marks: { learnerId: string; status: 'present' | 'absent' }[]) => {
    if (marks.length === 0) return;
    const wanted = new Map(marks.map((m) => [m.learnerId, m.status]));
    let prev: RosterStudent[] = [];
    setStudents((list) => {
      prev = list;
      return list.map((s) => {
        const next = wanted.get(s.id);
        if (!next) return s;
        return direction === 'return' ? { ...s, return_status: next } : { ...s, onward_status: next };
      });
    });
    setSaving(true);
    try {
      const res = await fetch('/api/boarding/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ routeId, direction, marks }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to save');
    } catch (e) {
      setStudents(prev);
      toast.error(e instanceof Error ? e.message : 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const markOne = (learnerId: string, direction: RosterDirection, status: 'present' | 'absent') =>
    postMarks(direction, [{ learnerId, status }]);

  const markRemainingAbsent = (direction: RosterDirection) => {
    const key = statusKey(direction);
    const remaining = students.filter((s) => s[key] == null).map((s) => ({ learnerId: s.id, status: 'absent' as const }));
    if (remaining.length === 0) {
      toast(`No unmarked learners for ${direction}`);
      return;
    }
    if (!confirm(`Mark ${remaining.length} unmarked learner(s) ABSENT for ${direction}?`)) return;
    postMarks(direction, remaining);
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
        <Link href="/boarding/scan" className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700">
          <QrCode className="h-4 w-4" /> Scan Boarding Pass
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
            { columnId: 'return', title: 'Return', options: statusOptions },
          ]}
          enableRowSelection={editable}
          getRowId={(s) => s.id}
          toolbarActions={
            editable
              ? ({ selectedRows, resetSelection }) => {
                  // With rows selected → bulk-mark the selection per direction.
                  if (selectedRows.length > 0) {
                    const ids = selectedRows.map((s) => s.id);
                    const bulk = (direction: RosterDirection, status: 'present' | 'absent') => {
                      postMarks(direction, ids.map((learnerId) => ({ learnerId, status })));
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
                          <span className="text-xs text-gray-500">Onward</span>
                          <button type="button" disabled={saving} onClick={() => bulk('onward', 'present')} className={btn('present')}>Present</button>
                          <button type="button" disabled={saving} onClick={() => bulk('onward', 'absent')} className={btn('absent')}>Absent</button>
                        </div>
                        <div className="inline-flex items-center gap-1">
                          <span className="text-xs text-gray-500">Return</span>
                          <button type="button" disabled={saving} onClick={() => bulk('return', 'present')} className={btn('present')}>Present</button>
                          <button type="button" disabled={saving} onClick={() => bulk('return', 'absent')} className={btn('absent')}>Absent</button>
                        </div>
                      </div>
                    );
                  }
                  // Nothing selected → quick "mark remaining absent" per direction.
                  return (
                    <div className="flex items-center gap-2">
                      <span className="hidden text-xs text-gray-500 sm:inline">Mark remaining absent:</span>
                      <button type="button" disabled={saving} onClick={() => markRemainingAbsent('onward')} className="inline-flex h-[38px] items-center rounded-lg border border-gray-300 bg-white px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                        Onward
                      </button>
                      <button type="button" disabled={saving} onClick={() => markRemainingAbsent('return')} className="inline-flex h-[38px] items-center rounded-lg border border-gray-300 bg-white px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                        Return
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
