'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, ListChecks, Download, QrCode } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable, type DataTableFilter } from '@/components/ui/data-table';
import ScanDialog from '@/components/boarding/scan-dialog';
import { getRosterColumns } from './columns';
import type { RosterRow } from '@/lib/booking/roster';
import { DEFAULT_WINDOWS, isDirectionOpen, formatHM, type AttendanceWindows, type AttDirection } from '@/lib/boarding/attendance-window';

const todayStr = () => new Date().toISOString().slice(0, 10);

interface RosterResponse {
  date: string;
  direction: AttDirection;
  rows: RosterRow[];
  counts: { total: number; present: number; absent: number; unmarked: number };
}

async function fetchRoster(date: string, direction: AttDirection): Promise<RosterResponse> {
  const res = await fetch(`/api/boarding/attendance/roster?date=${date}&direction=${direction}`, { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load roster');
  return json.data as RosterResponse;
}

async function fetchWindows(): Promise<{ windows: AttendanceWindows; activeDirection: AttDirection | null }> {
  const res = await fetch('/api/boarding/attendance-window', { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json?.success) return { windows: DEFAULT_WINDOWS, activeDirection: null };
  return { windows: json.data.windows as AttendanceWindows, activeDirection: (json.data.activeDirection ?? null) as AttDirection | null };
}

export default function BoardingAttendancePage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayStr());
  const [direction, setDirection] = useState<AttDirection>('onward');
  const [scanOpen, setScanOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const dirSeeded = useRef(false);
  // Forces a re-render every 30s so the amber closed-window hint (isToday && !legOpen)
  // appears/disappears at a scan-window edge instead of lagging until an unrelated re-render.
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  const isToday = date === todayStr();

  const { data: winData } = useQuery({ queryKey: ['boarding-attendance-window'], queryFn: fetchWindows });
  const windows = winData?.windows ?? DEFAULT_WINDOWS;
  // Seed the leg once from the server-computed active direction (device clock may be wrong).
  useEffect(() => {
    if (!dirSeeded.current && winData?.activeDirection) {
      setDirection(winData.activeDirection);
      dirSeeded.current = true;
    }
  }, [winData]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['boarding-roster', date, direction],
    queryFn: () => fetchRoster(date, direction),
  });
  useEffect(() => {
    if (isError) toast.error(error instanceof Error ? error.message : 'Failed to load roster');
  }, [isError, error]);

  const rows = data?.rows ?? [];
  const counts = data?.counts ?? { total: 0, present: 0, absent: 0, unmarked: 0 };

  const legOpen = isDirectionOpen(windows[direction]);
  const canMark = isToday && legOpen;

  const mark = useCallback(
    async (row: RosterRow, status: 'present' | 'absent') => {
      setBusyId(row.learner_id);
      try {
        const res = await fetch('/api/boarding/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ routeId: row.route_id, direction, marks: [{ learnerId: row.learner_id, status }] }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to mark attendance');
        toast.success(`Marked ${row.name} ${status}`);
        qc.invalidateQueries({ queryKey: ['boarding-roster'] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to mark attendance');
      } finally {
        setBusyId(null);
      }
    },
    [direction, qc]
  );

  const columns = useMemo(
    () => getRosterColumns({ canMark, busyId, onMark: mark }),
    [canMark, busyId, mark]
  );

  const filters: DataTableFilter[] = [
    { columnId: 'status', title: 'Status', options: [{ label: 'Present', value: 'present' }, { label: 'Absent', value: 'absent' }, { label: 'Unmarked', value: 'unmarked' }] },
  ];

  const exportCsv = (rowsToExport: RosterRow[]) => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Learner', 'Roll No.', 'Route', 'Stop', 'Status', 'Method', 'Marked At'];
    const lines = [header.map(esc).join(',')];
    for (const r of rowsToExport) {
      lines.push([r.name, r.roll, r.route_number, r.stop_name, r.status, r.method, r.scanned_at].map(esc).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${date}-${direction}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
          <p className="text-gray-600 mt-1 text-sm">Today&apos;s booked students — scan or mark them present for the selected leg.</p>
        </div>
        {/* Leg toggle */}
        <div className="inline-flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
          {(['onward', 'return'] as AttDirection[]).map((d) => {
            const active = direction === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => { dirSeeded.current = true; setDirection(d); }}
                className={`px-4 py-2 text-sm font-medium transition-colors ${active ? 'bg-green-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300'}`}
              >
                {d === 'onward' ? 'Onward' : 'Return'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Analytics tiles + day picker */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid flex-1 grid-cols-3 gap-3">
          <Tile label="Present" value={counts.present} tone="green" icon={<CheckCircle2 className="h-4 w-4" />} />
          <Tile label="Absent" value={counts.absent} tone="red" icon={<XCircle className="h-4 w-4" />} />
          <Tile label="Total bookings" value={counts.total} tone="slate" icon={<ListChecks className="h-4 w-4" />} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Day</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-[38px] rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
      </div>

      {isToday && !legOpen && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {direction === 'onward' ? 'Onward' : 'Return'} window is {formatHM(windows[direction].start)}–{formatHM(windows[direction].end)}; marking present/absent and scanning are closed for this leg until it opens.
        </p>
      )}

      <DataTable
        columns={columns}
        data={rows}
        entityName="students"
        isLoading={isLoading}
        searchPlaceholder="Search learner, roll #..."
        pageSize={20}
        filters={filters}
        enableRowSelection
        getRowId={(r) => r.learner_id}
        toolbarActions={({ selectedRows }) => (
          <>
            {isToday && (
              <button
                type="button"
                onClick={() => setScanOpen(true)}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
              >
                <QrCode className="h-4 w-4" /> Scan
              </button>
            )}
            {selectedRows.length > 0 && (
              <button
                type="button"
                onClick={() => exportCsv(selectedRows)}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                <Download className="h-4 w-4" /> Export ({selectedRows.length})
              </button>
            )}
          </>
        )}
      />

      <ScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        direction={direction}
        windows={windows}
        onMarked={() => qc.invalidateQueries({ queryKey: ['boarding-roster'] })}
      />
    </div>
  );
}

function Tile({ label, value, tone, icon }: { label: string; value: number; tone: 'green' | 'red' | 'gray' | 'slate'; icon: React.ReactNode }) {
  const toneCls =
    tone === 'green'
      ? 'text-green-700 dark:text-green-300'
      : tone === 'red'
      ? 'text-red-700 dark:text-red-300'
      : tone === 'gray'
      ? 'text-gray-600 dark:text-gray-300'
      : 'text-slate-700 dark:text-slate-300';
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className={`flex items-center gap-1.5 text-xs font-medium ${toneCls}`}>
        {icon} {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  );
}
