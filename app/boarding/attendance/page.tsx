'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, ListChecks, Download, QrCode, TicketX } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable, type DataTableFilter } from '@/components/ui/data-table';
import ScanDialog from '@/components/boarding/scan-dialog';
import AbsenceDialog, { type AbsenceRoute } from '@/components/boarding/absence-dialog';
import { getRosterColumns } from './columns';
import type { RosterRow } from '@/lib/booking/roster';
import {
  DEFAULT_WINDOWS, activeDirection, LEG_NAME,
  type AttendanceWindows, type AttDirection,
} from '@/lib/boarding/attendance-window';
import { openHoursText } from '@/lib/boarding/trip-direction';
import { useAttendanceSettingsLive } from '@/hooks/use-attendance-settings-live';
import { useAuth } from '@/providers/auth-provider';
import { istToday } from '@/lib/booking/window';
import { offlineKv } from '@/lib/boarding/offline/kv';
import { loadRoster, loadWindows, pruneSnapshots, saveRoster, saveWindows } from '@/lib/boarding/offline/snapshot';
import { applyPending, pendingByLearner } from '@/lib/boarding/offline/apply-pending';
import { useOfflineAttendance } from '@/components/boarding/offline/use-offline-attendance';
import { OfflineStatusBar } from '@/components/boarding/offline/offline-status-bar';
import { OfflineProblemsPanel } from '@/components/boarding/offline/offline-problems-panel';

// IST, matching the date the outbox files marks under. The old UTC version
// showed yesterday between 00:00 and 05:30 IST.
const todayStr = () => istToday();

interface RosterResponse {
  date: string;
  direction: AttDirection;
  rows: RosterRow[];
  counts: { total: number; present: number; absent: number; unmarked: number; booked: number; withoutTicket: number; boardedWithoutTicket: number };
  share: { total: number; marked: number; remaining: number };
  /** Active JKKN ID -> learner id, for offline card scans. */
  cards?: Record<string, string>;
  /** Client-only: set when this came from the phone, not the server. */
  savedAt?: string | null;
}

const OFFLINE_NO_COPY =
  "No signal, and this day's list is not saved on this phone yet. Open Attendance once with signal first.";

async function fetchRoster(date: string, direction: AttDirection, userId: string | null): Promise<RosterResponse> {
  let res: Response;
  try {
    res = await fetch(`/api/boarding/attendance/roster?date=${date}&direction=${direction}`, { cache: 'no-store', credentials: 'same-origin' });
  } catch {
    // fetch rejects only when no response arrived at all: no signal.
    if (userId) {
      const saved = await loadRoster<RosterResponse>(offlineKv(), userId, date).catch(() => null);
      if (saved) return { ...saved.value, savedAt: saved.savedAt };
    }
    throw new Error(OFFLINE_NO_COPY);
  }
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load roster');
  const data = json.data as RosterResponse;
  if (userId) void saveRoster(offlineKv(), userId, date, data, new Date()).catch(() => {});
  return { ...data, savedAt: null };
}

async function fetchWindows(
  userId: string | null,
): Promise<{ windows: AttendanceWindows; activeDirection: AttDirection | null }> {
  let res: Response;
  try {
    res = await fetch('/api/boarding/attendance-window', { cache: 'no-store', credentials: 'same-origin' });
  } catch {
    // No signal. Admin-customised hours (and the evening switch) must not
    // silently fall back to the defaults, so use the saved copy. With no
    // server to ask, the phone's clock is the only clock there is.
    const saved = userId ? await loadWindows<AttendanceWindows>(offlineKv(), userId).catch(() => null) : null;
    const windows = saved?.value ?? DEFAULT_WINDOWS;
    return { windows, activeDirection: activeDirection(windows) };
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) return { windows: DEFAULT_WINDOWS, activeDirection: null };
  const windows = json.data.windows as AttendanceWindows;
  if (userId) void saveWindows(offlineKv(), userId, windows, new Date()).catch(() => {});
  return {
    windows,
    // The server's clock, not the phone's: a wrong device clock must not open the wrong tab.
    activeDirection: (json.data.activeDirection ?? null) as AttDirection | null,
  };
}

export default function BoardingAttendancePage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  const offline = useOfflineAttendance(userId, () => qc.invalidateQueries({ queryKey: ['boarding-roster'] }));

  useEffect(() => {
    if (userId) void pruneSnapshots(offlineKv(), userId, istToday()).catch(() => {});
  }, [userId]);

  const [date, setDate] = useState(todayStr());
  const [direction, setDirection] = useState<AttDirection>('onward');
  // Once the staffer picks a tab, stop moving them to the open trip.
  const tabChosen = useRef(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [absenceOpen, setAbsenceOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Forces a re-render every 30s so the tabs/hint (isToday && !canMark, openLeg)
  // appear/disappear at a scan-window edge instead of lagging until an unrelated re-render.
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  const isToday = date === todayStr();

  const { data: winData } = useQuery({
    queryKey: ['boarding-attendance-window', userId],
    queryFn: () => fetchWindows(userId),
    // Settings changes are pushed live (useAttendanceSettingsLive). These two
    // re-reads cover a phone that dropped its live connection in the background.
    refetchOnWindowFocus: true,
    refetchInterval: 120_000,
  });
  useAttendanceSettingsLive();
  const windows = winData?.windows ?? DEFAULT_WINDOWS;

  // Open on the trip that is open for marking, unless the staffer picked a tab.
  useEffect(() => {
    if (!tabChosen.current && winData?.activeDirection) setDirection(winData.activeDirection);
  }, [winData?.activeDirection]);
  // Evening switched off while its tab is showing: fall back to the morning.
  useEffect(() => {
    if (direction === 'return' && !windows.return.active) setDirection('onward');
  }, [direction, windows.return.active]);

  // Marking is allowed only on the tab whose window is open right now.
  const openLeg = activeDirection(windows);
  const canMarkNow = isToday && openLeg === direction;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['boarding-roster', date, direction, userId],
    queryFn: () => fetchRoster(date, direction, userId),
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

  // Only the viewed trip's unsent marks: the morning and evening tabs are
  // separate records, so a waiting evening mark must not show on Morning.
  const pending = useMemo(
    () => pendingByLearner(offline.entries, date, direction),
    [offline.entries, date, direction],
  );
  const view = useMemo(() => (data ? applyPending(data, pending) : undefined), [data, pending]);
  const rows = view?.rows ?? [];
  const counts = view?.counts ?? { total: 0, present: 0, absent: 0, unmarked: 0, booked: 0, withoutTicket: 0, boardedWithoutTicket: 0 };
  const share = view?.share ?? { total: 0, marked: 0, remaining: 0 };
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

  const canMark = canMarkNow;

  // Every tap goes to the outbox, online or not; it sends within a second
  // when there is signal, and the toasts come from the sync's answers
  // (lib/boarding/offline/messages.ts), worded as they were before.
  // `direction` is the tab being marked. Marking is only enabled on the tab
  // whose window is open (canMark), so it is also the trip open at tap time.
  const { markOffline } = offline;
  const mark = useCallback(
    (row: RosterRow, status: 'present' | 'absent') => { void markOffline(row, status, direction); },
    [markOffline, direction],
  );

  /**
   * Clear a without-ticket boarding record.
   *
   * This is the only caller of the DELETE endpoint. It is no longer the sole
   * correction path for an unbooked rider — those rows now carry the same
   * Present↔Absent toggle as booked ones — but the two corrections mean
   * different things and both are needed: Absent records that the student did
   * not travel, Undo records that the row should never have existed. Only Undo
   * removes a notification the student has already received, which is why it is
   * gated on the narrower `can_clear`.
   */
  const undo = useCallback(
    async (row: RosterRow) => {
      if (!offline.online) {
        toast('Undo needs signal. Try again when you are back online.', { icon: '⚠️' });
        return;
      }
      setBusyId(row.learner_id);
      try {
        const res = await fetch('/api/boarding/attendance', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ routeId: row.route_id, direction, learnerIds: [row.learner_id] }),
        });
        const json = await res.json();
        // Same stale-screen case as marking: the roster polls every 15s, so a
        // colleague's claim on the row can land between render and click.
        if (res.status === 409) {
          toast.error(json.error || 'Another staff member recorded this.');
          qc.invalidateQueries({ queryKey: ['boarding-roster'] });
          return;
        }
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to clear the record');
        toast.success(
          json.cleared > 0 ? `Cleared the record for ${row.name}` : `Nothing to clear for ${row.name}`,
        );
        qc.invalidateQueries({ queryKey: ['boarding-roster'] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to clear the record');
      } finally {
        setBusyId(null);
      }
    },
    [direction, qc, offline.online]
  );

  const columns = useMemo(
    () => getRosterColumns({ canMark, busyId, onMark: mark, onUndo: undo, hasOwners, pending }),
    [canMark, busyId, mark, undo, hasOwners, pending]
  );

  const filters: DataTableFilter[] = [
    ...(hasOwners
      ? [{ columnId: 'owner', title: 'In-charge', options: [{ label: 'My share', value: 'mine' }, { label: 'Others', value: 'others' }] }]
      : []),
    {
      columnId: 'ticket',
      title: 'Ticket',
      options: [
        { label: 'Booked', value: 'booked' },
        { label: 'Travelled without booking', value: 'rode_without_ticket' },
        { label: 'Not booked', value: 'without_ticket' },
      ],
    },
    { columnId: 'status', title: 'Status', options: [{ label: 'Present', value: 'present' }, { label: 'Absent', value: 'absent' }, { label: 'Unmarked', value: 'unmarked' }] },
  ];

  const exportCsv = (rowsToExport: RosterRow[]) => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Learner', 'Roll No.', 'Route', 'Stop', 'Booking', 'Travelled Without Booking', 'Status', 'Method', 'Marked At'];
    const lines = [header.map(esc).join(',')];
    for (const r of rowsToExport) {
      // Booking state and the travelled-anyway flag are separate columns rather
      // than three values in one, so the export can be filtered on "did they
      // travel without booking" without string-matching a label.
      const ticket = r.booked ? 'Booked' : 'Not booked';
      lines.push([r.name, r.roll, r.route_number, r.stop_name, ticket, r.is_walk_up ? 'Yes' : 'No', r.status, r.method, r.scanned_at].map(esc).join(','));
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
              Everyone allocated to your route. Students who booked a seat can be scanned
              or marked present or absent.
            </>
          )}
        </p>

        {/* The rule, stated as an ACTION rather than a definition. The two
            unbooked states confused staff when they were only distinguishable
            by their badge wording, so the screen now says outright when to tap
            and — just as importantly — when to do nothing. Most "Not booked"
            students simply stayed home and must be left alone. */}
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {/* The KEY to the action column. The buttons are single letters so a
              1,600-row roster stays readable on a phone, which means their
              meaning has to live somewhere on the page — this is that place.
              Each button also carries a title + aria-label (see MarkButton in
              columns.tsx); this legend is what serves a sighted in-charge who
              cannot hover on a touchscreen. Keep the swatches the same colours
              as the buttons: matching them is the whole point. */}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-medium">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-green-600 text-xs font-semibold text-white">
                P
              </span>
              Present
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-red-600 text-xs font-semibold text-white">
                A
              </span>
              Absent
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-blue-600 text-xs font-semibold text-white">
                B
              </span>
              Boarded without booking
            </span>
          </p>
          <p className="mt-2 font-medium">Students marked “Not booked” did not book a seat today.</p>
          <p className="mt-1">
            Most of them stayed at home — <span className="font-medium">leave those alone</span>. Only
            if you can actually see one of them on your bus, tap{' '}
            <span className="font-medium">B</span>. They are then recorded as{' '}
            <span className="font-medium">Travelled without booking</span> and notified.
          </p>
          {/* Both corrections, spelled out, because they are NOT the same act
              and staff were reaching for the wrong one. Tapping B on someone
              who then did not travel needs A (a second fact about the
              student); a mistap on the wrong row needs Undo (this record
              should not exist). Undo only appears on records you made. */}
          <p className="mt-1">
            Got it wrong? Tap <span className="font-medium">A</span> if they did not travel, or the{' '}
            <span className="font-medium">undo arrow</span> to remove the record altogether.
          </p>
        </div>

        <div className="mt-3 space-y-3">
          <OfflineStatusBar
            online={offline.online}
            pendingCount={offline.entries.length}
            savedAt={data?.savedAt ?? null}
            authRequired={offline.authRequired}
          />
          <OfflineProblemsPanel problems={offline.problems} onDismiss={(id) => void offline.dismiss(id)} />
        </div>
      </div>

      {/* Analytics tiles + day picker */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        {/* Share tiles only where shares exist. With no owners, `share.total`
            is the whole booked bus and calling it "My share" is a lie;
            "Marked" would conflate present with absent, and the Absent tile
            would vanish from a screen in-charges read every day. Off the flag
            this must be exactly the pre-share set of tiles. */}
        {/* "Not booked" and "Travelled without booking" are deliberately BOTH
            shown. The first is most of the roster on any given day and means
            very little on its own; the second is the number this screen now
            exists to produce. Collapsing them into one tile would hide the
            signal inside the noise. The labels share no leading words on
            purpose — the first pair shipped as "Without ticket" / "Rode without
            ticket" and staff could not tell them apart at a glance. */}
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-5">
          {hasOwners ? (
            <>
              <Tile label="My share" value={share.total} tone="slate" icon={<ListChecks className="h-4 w-4" />} />
              <Tile label="Marked" value={share.marked} tone="green" icon={<CheckCircle2 className="h-4 w-4" />} />
              <Tile label="Remaining" value={share.remaining} tone="amber" icon={<XCircle className="h-4 w-4" />} />
              <Tile label="Travelled without booking" value={counts.boardedWithoutTicket} tone="red" icon={<TicketX className="h-4 w-4" />} />
              <Tile label="On bus" value={counts.total} tone="gray" icon={<ListChecks className="h-4 w-4" />} />
            </>
          ) : (
            <>
              <Tile label="Present" value={counts.present} tone="green" icon={<CheckCircle2 className="h-4 w-4" />} />
              <Tile label="Absent" value={counts.absent} tone="red" icon={<XCircle className="h-4 w-4" />} />
              <Tile label="Travelled without booking" value={counts.boardedWithoutTicket} tone="red" icon={<TicketX className="h-4 w-4" />} />
              <Tile label="Not booked" value={counts.withoutTicket} tone="amber" icon={<TicketX className="h-4 w-4" />} />
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

      {windows.return.active && (
        <div
          role="tablist"
          aria-label="Trip"
          className="inline-flex rounded-lg border border-gray-300 p-0.5 text-sm dark:border-gray-700"
        >
          {(['onward', 'return'] as const).map((leg) => (
            <button
              key={leg}
              type="button"
              role="tab"
              aria-selected={direction === leg}
              onClick={() => {
                tabChosen.current = true;
                setDirection(leg);
              }}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                direction === leg
                  ? 'bg-green-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              {LEG_NAME[leg]}
              {isToday && openLeg === leg ? ' · open now' : ''}
            </button>
          ))}
        </div>
      )}

      {isToday && !canMark && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {openLeg
            ? `Marking is open for the ${LEG_NAME[openLeg].toLowerCase()} trip now. Switch to the ${LEG_NAME[openLeg]} tab to mark.`
            : `Attendance is open ${openHoursText(windows)} only. Marking present or absent and scanning are closed until then.`}
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
                disabled={!offline.online}
                title={offline.online ? undefined : 'Needs signal'}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
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
        offline={{ online: offline.online, roster: view, queueScan: offline.queueScan }}
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
