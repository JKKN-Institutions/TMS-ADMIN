'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ScanLine } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { LEG_NAME } from '@/lib/boarding/attendance-window';
import { headcountDelta, type Leg } from '@/lib/inspections/overview';
import { fmtIST } from '@/lib/inspections/format';
import type { InspectionDetail, InspectionOverview } from '@/lib/inspections/types';
import type { RosterRow } from '@/lib/booking/roster';
import { saveHeadcount, type RosterData } from '@/app/(admin)/inspections/inspection-api';
import { LearnerScanDialog } from '@/components/inspections/learner-scan-dialog';

const STATUS_CHIP: Record<RosterRow['status'], [string, string]> = {
  present: ['Present', 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'],
  absent: ['Absent', 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'],
  unmarked: ['Not marked', 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'],
};
/** Worded as the Attendance page and the boarding staff screen. */
const OTHER_BUS_TEXT: Record<NonNullable<RosterRow['other_bus']>['kind'], string> = {
  booked: 'Booked on bus', boarded: 'Boarded bus', from: 'From bus',
};
const BADGE = 'rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase';

const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00+05:30`).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

interface StopGroup { key: string; name: string; rows: RosterRow[] }

/** Rows grouped by stop, in the route's stop order (unknown stops last). */
function groupByStop(rows: RosterRow[], stops: InspectionOverview['stops'] | undefined): StopGroup[] {
  const order = new Map((stops ?? []).map((s, i) => [s.id, i]));
  const groups = new Map<string, StopGroup>();
  for (const r of rows) {
    const key = r.stop_id ?? '__none__';
    const g = groups.get(key) ?? { key, name: r.stop_name || 'Stop not set', rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }
  const rank = (g: StopGroup) => (g.key === '__none__' ? Number.MAX_SAFE_INTEGER : order.get(g.key) ?? Number.MAX_SAFE_INTEGER - 1);
  return [...groups.values()]
    .map((g) => ({ ...g, rows: [...g.rows].sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function RidersTab({ detail, overview, leg, date, roster }: {
  detail: InspectionDetail;
  overview?: InspectionOverview;
  leg: Leg;
  /** The roster day (IST today — the check screen is a live view). */
  date: string;
  /** Undefined data + not loading = no route to read. */
  roster: UseQueryResult<RosterData>;
}) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canEdit = can(TMS_PERMISSIONS.INSPECTION_CONDUCT) && detail.status === 'draft' && detail.isMine;
  const hasRoute = !!detail.route?.id;

  const stored = detail.riders;
  const storedForLeg = stored.leg === leg ? stored.headcount : null;
  const [input, setInput] = useState(storedForLeg == null ? '' : String(storedForLeg));
  const [saving, setSaving] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  useEffect(() => { setInput(storedForLeg == null ? '' : String(storedForLeg)); }, [leg, storedForLeg]);

  const rows = roster.data?.rows;
  const counts = roster.data?.counts;
  const groups = useMemo(() => (rows ? groupByStop(rows, overview?.stops) : []), [rows, overview?.stops]);
  const booked = rows ? rows.filter((r) => r.booked).length : null;
  const capacity = overview?.route?.capacity ?? detail.vehicle.capacity;
  const delta = counts ? headcountDelta(storedForLeg, counts.present) : null;

  async function onSave() {
    const trimmed = input.trim();
    const counted = trimmed === '' ? null : Number(trimmed);
    if (counted !== null && (!Number.isInteger(counted) || counted < 0 || counted > 500)) {
      toast.error('Enter a whole number from 0 to 500');
      return;
    }
    setSaving(true);
    try {
      await saveHeadcount(detail.id, leg, counted);
      toast.success(counted === null ? 'Headcount cleared' : 'Headcount saved');
      await qc.invalidateQueries({ queryKey: ['inspection', detail.id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{LEG_NAME[leg]} riders</h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">{fmtDate(date)}</span>
      </div>

      {/* Counts */}
      {hasRoute && (
        roster.isLoading ? <div className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" /> :
        counts && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {([
              ['Booked', booked, ''],
              ['Present', counts.present, 'text-green-700 dark:text-green-400'],
              ['Absent', counts.absent, 'text-red-700 dark:text-red-400'],
              ['Not marked', counts.unmarked, 'text-gray-600 dark:text-gray-400'],
              ['Capacity', capacity, ''],
            ] as const).map(([label, value, tone]) => (
              <div key={label} className="min-w-0 rounded-lg border border-gray-200 bg-white p-2 text-center dark:border-gray-800 dark:bg-gray-900">
                <p className={`text-lg font-bold ${tone}`}>{value ?? '—'}</p>
                <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{label}</p>
              </div>
            ))}
          </div>
        )
      )}

      {/* Headcount */}
      <section className="space-y-2 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <h3 className="text-sm font-semibold">Headcount on the bus</h3>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number" inputMode="numeric" min={0} max={500} step={1}
              value={input} onChange={(e) => setInput(e.target.value)} disabled={saving}
              placeholder="People counted" aria-label="People counted"
              className="w-36 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 disabled:opacity-50"
            />
            <button type="button" onClick={onSave} disabled={saving}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? 'Saving…' : 'Save headcount'}
            </button>
          </div>
        )}
        {stored.leg ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Saved ({LEG_NAME[stored.leg]}): counted {stored.headcount ?? '—'} · boarded {stored.boarded ?? '—'} · booked {stored.booked ?? '—'}
          </p>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">Headcount not taken</p>
        )}
        {delta && delta.diff !== null && (
          <p className={`text-sm font-medium ${delta.diff === 0 ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
            Now: {delta.label} ({counts?.present} present)
          </p>
        )}
      </section>

      {canEdit && hasRoute && (
        <>
          <button type="button" onClick={() => setScanOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-green-600 px-4 py-2.5 text-sm font-semibold text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/40">
            <ScanLine className="h-4 w-4" /> Scan learner ID
          </button>
          <LearnerScanDialog inspectionId={detail.id} open={scanOpen} onClose={() => setScanOpen(false)} />
        </>
      )}

      {/* Roster (read-only) */}
      {!hasRoute ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">This bus has no active route</p>
      ) : roster.isLoading ? (
        <div className="h-32 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
      ) : roster.isError || !rows ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          <span className="min-w-0">{(roster.error as Error)?.message ?? 'Could not load the rider roster'}</span>
          <button type="button" onClick={() => void roster.refetch()} className="font-semibold underline">Retry</button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No learners on this bus&apos;s roster for this trip</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <section key={g.key} className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
              <h4 className="flex items-center justify-between gap-2 bg-gray-50 px-4 py-2 text-sm font-semibold dark:bg-gray-800/60">
                <span className="min-w-0 truncate">{g.name}</span>
                <span className="shrink-0 text-xs font-normal text-gray-500 dark:text-gray-400">{g.rows.length}</span>
              </h4>
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {g.rows.map((r) => {
                  const [label, chip] = STATUS_CHIP[r.status];
                  return (
                    <li key={r.learner_id} className="space-y-1 px-4 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm">
                          <span className="font-medium">{r.name}</span>
                          {r.roll && <span className="text-gray-500 dark:text-gray-400"> · {r.roll}</span>}
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${chip}`}>{label}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                        {r.status !== 'unmarked' && (
                          <span className="min-w-0 truncate">
                            {r.method === 'auto' ? 'auto-marked' : `marked by ${r.marked_by_name ?? '—'}`}
                            {r.scanned_at ? ` · ${fmtIST(r.scanned_at)}` : ''}
                          </span>
                        )}
                        {r.is_walk_up && <span className={`${BADGE} bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300`}>walk-up</span>}
                        {r.other_bus && (
                          <span className={`${BADGE} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300`}>
                            {OTHER_BUS_TEXT[r.other_bus.kind]} {r.other_bus.routeNumber ?? '?'}
                          </span>
                        )}
                        {!r.booked && !r.is_walk_up && (
                          <span className={`${BADGE} bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400`}>not booked</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
