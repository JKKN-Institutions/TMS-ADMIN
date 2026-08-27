'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, ListChecks, Download, QrCode, TicketX } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable, type DataTableFilter } from '@/components/ui/data-table';
import ScanDialog from '@/components/boarding/scan-dialog';
import AbsenceDialog, { type AbsenceRoute } from '@/components/boarding/absence-dialog';
import { getRosterColumns } from './columns';
import type { RosterRow } from '@/lib/booking/roster';
import { DEFAULT_WINDOWS, isDirectionOpen, formatHM, type AttendanceWindows, type AttDirection } from '@/lib/boarding/attendance-window';

const todayStr = () => new Date().toISOString().slice(0, 10);

interface RosterResponse {
  date: string;
  direction: AttDirection;
  rows: RosterRow[];
  counts: { total: number; present: number; absent: number; unmarked: number; booked: number; withoutTicket: number };
  share: { total: number; marked: number; remaining: number };
}

async function fetchRoster(date: string, direction: AttDirection): Promise<RosterResponse> {
  const res = await fetch(`/api/boarding/attendance/roster?date=${date}&direction=${direction}`, { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load roster');
  return json.data as RosterResponse;
}

async function fetchWindows(): Promise<{ windows: AttendanceWindows }> {
  const res = await fetch('/api/boarding/attendance-window', { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json?.success) return { windows: DEFAULT_WINDOWS };
  return { windows: json.data.windows as AttendanceWindows };
}

export default function BoardingAttendancePage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayStr());
  const direction: AttDirection = 'onward';
  const [scanOpen, setScanOpen] = useState(false);
  const [absenceOpen, setAbsenceOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
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

  const legOpenNow = isDirectionOpen(windows.onward);
  const canMarkNow = isToday && legOpenNow;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['boarding-roster', date, direction],
    queryFn: () => fetchRoster(date, direction),
    // A route can have a dozen staff splitting this roster, and the global
    // defaults (staleTime 60s, refetchOnWindowFocus false, no interval) mean a
    // page held open on a moving bus never shows a colleague's marks at all.
    // Poll only while marking is possible -- a past day cannot change, so
    // polling it is pure load.
    refetchInterval: canMarkNow ? 15_000 : false,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (isError) toast.error(error instanceof Error ? error.message : 'Failed to load roster');
  }, [isError, error]);

  const rows = data?.rows ?? [];
  const counts = data?.counts ?? { total: 0, present: 0, absent: 0, unmarked: 0, booked: 0, withoutTicket: 0 };
  const share = data?.share ?? { total: 0, marked: 0, remaining: 0 };
  // Derived from the data, not the flag: the page has no access to the setting, and
  // deriving it from the rows keeps the column/filter in sync with what actually
  // arrived. False while share-scoring is off (owner_name null on every row) — in
  // that state the In-charge column and filter are omitted entirely rather than
  // showing "Unassigned" for the whole bus.
  const hasOwners = rows.some((r) => r.owner_name !== null);

  // Every distinct route on this roster, for the absence dialog. An in-charge
  // on two buses must choose which one they are declaring absence from.
  const absenceRoutes: AbsenceRoute[] = useMemo(() => {
    const byId = new Map<string, AbsenceRoute>();
    for (const r of rows) {
      if (r.route_id && !byId.has(r.route_id)) byId.set(r.route_id, { id: r.route_id, number: r.route_number ?? null });
    }
    return [...byId.values()];
  }, [rows]);

  const legOpen = isDirectionOpen(windows.onward);
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
        // 409 = a colleague owns this mark. The roster is polled, not live, so
        // this is reachable from a stale screen even though the button rendered
        // -- refetch so the row redraws as Locked.
        if (res.status === 409 && json?.reason === 'locked') {
          toast.error(json.error || 'Another staff member has already marked this student.');
          qc.invalidateQueries({ queryKey: ['boarding-roster'] });
          return;
        }
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
    () => getRosterColumns({ canMark, busyId, onMark: mark, hasOwners }),
    [canMark, busyId, mark, hasOwners]
  );

  const filters: DataTableFilter[] = [
    ...(hasOwners
      ? [{ columnId: 'owner', title: 'In-charge', options: [{ label: 'My share', value: 'mine' }, { label: 'Others', value: 'others' }] }]
      : []),
    { columnId: 'ticket', title: 'Ticket', options: [{ label: 'Booked', value: 'booked' }, { label: 'Without ticket', value: 'without_ticket' }] },
    { columnId: 'status', title: 'Status', options: [{ label: 'Present', value: 'present' }, { label: 'Absent', value: 'absent' }, { label: 'Unmarked', value: 'unmarked' }] },
  ];

  const exportCsv = (rowsToExport: RosterRow[]) => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Learner', 'Roll No.', 'Route', 'Stop', 'Ticket', 'Status', 'Method', 'Marked At'];
    const lines = [header.map(esc).join(',')];
    for (const r of rowsToExport) {
      const ticket = r.booked ? 'Booked' : 'Without ticket';
      lines.push([r.name, r.roll, r.route_number, r.stop_name, ticket, r.status, r.method, r.scanned_at].map(esc).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${date}-onward.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
        {/* Copy is gated on hasOwners for the same reason the owner column and
            filter are: with no allocation on this route there are no shares, so
            promising "you mark only your own share" would describe a rule that
            is not in force. */}
        <p className="text-gray-600 mt-1 text-sm">
          {hasOwners ? (
            <>
              The whole bus is listed so you can see it is covered, but you mark only
              your own share. Students owned by another in-charge show their name.
            </>
          ) : (
            <>
              Everyone allocated to your route — students who booked a seat can be scanned or marked present;
              the rest are listed as <span className="font-medium">Without ticket</span>.
            </>
          )}
        </p>
      </div>

      {/* Analytics tiles + day picker */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        {/* Share tiles only where shares exist. With no owners, `share.total`
            is the whole booked bus and calling it "My share" is a lie;
            "Marked" would conflate present with absent, and the Absent tile
            would vanish from a screen in-charges read every day. Off the flag
            this must be exactly the pre-share set of tiles. */}
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          {hasOwners ? (
            <>
              <Tile label="My share" value={share.total} tone="slate" icon={<ListChecks className="h-4 w-4" />} />
              <Tile label="Marked" value={share.marked} tone="green" icon={<CheckCircle2 className="h-4 w-4" />} />
              <Tile label="Remaining" value={share.remaining} tone="amber" icon={<XCircle className="h-4 w-4" />} />
              <Tile label="On bus" value={counts.total} tone="gray" icon={<TicketX className="h-4 w-4" />} />
            </>
          ) : (
            <>
              <Tile label="Present" value={counts.present} tone="green" icon={<CheckCircle2 className="h-4 w-4" />} />
              <Tile label="Absent" value={counts.absent} tone="red" icon={<XCircle className="h-4 w-4" />} />
              <Tile label="Without ticket" value={counts.withoutTicket} tone="amber" icon={<TicketX className="h-4 w-4" />} />
              <Tile label="On roster" value={counts.total} tone="slate" icon={<ListChecks className="h-4 w-4" />} />
            </>
          )}
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
          Attendance window is {formatHM(windows.onward.start)}–{formatHM(windows.onward.end)}; marking present/absent and scanning are closed until it opens.
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
            {isToday && rows.length > 0 && (
              <button
                type="button"
                onClick={() => setAbsenceOpen(true)}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                I am absent today
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
        windows={windows}
        onMarked={() => qc.invalidateQueries({ queryKey: ['boarding-roster'] })}
      />

      <AbsenceDialog
        open={absenceOpen}
        onOpenChange={setAbsenceOpen}
        routes={absenceRoutes}
        date={date}
        onDeclared={() => {
          qc.invalidateQueries({ queryKey: ['incharge-absence'] });
          qc.invalidateQueries({ queryKey: ['boarding-roster'] });
        }}
      />
    </div>
  );
}

function Tile({ label, value, tone, icon }: { label: string; value: number; tone: 'green' | 'red' | 'gray' | 'amber' | 'slate'; icon: React.ReactNode }) {
  const toneCls =
    tone === 'green'
      ? 'text-green-700 dark:text-green-300'
      : tone === 'red'
      ? 'text-red-700 dark:text-red-300'
      : tone === 'amber'
      ? 'text-amber-700 dark:text-amber-300'
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
