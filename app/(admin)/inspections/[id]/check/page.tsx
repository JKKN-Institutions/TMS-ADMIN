'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { BusCard } from '@/components/inspections/bus-card';
import { ChecklistStep } from '@/components/inspections/checklist-step';
import { LegSwitch } from '@/components/inspections/leg-switch';
import { StopsTab } from '@/components/inspections/stops-tab';
import { StaffTab } from '@/components/inspections/staff-tab';
import { RidersTab } from '@/components/inspections/riders-tab';
import { computeResult, submitBlockers } from '@/lib/inspections/result';
import type { InspectionItemDTO } from '@/lib/inspections/types';
import { defaultLeg, type Leg } from '@/lib/inspections/overview';
import { istMinutesOfDay } from '@/lib/boarding/attendance-window';
import { istToday } from '@/lib/booking/window';
import { fetchInspection, fetchOverview, fetchRoster, saveItems, submitInspection } from '../../inspection-api';

type Patch = Partial<Pick<InspectionItemDTO, 'result' | 'note'>>;
type Tab = 'bus' | 'stops' | 'riders' | 'staff' | 'checklist';
const TABS: { key: Tab; label: string }[] = [
  { key: 'bus', label: 'Bus' },
  { key: 'stops', label: 'Stops' },
  { key: 'riders', label: 'Riders' },
  { key: 'staff', label: 'Staff' },
  { key: 'checklist', label: 'Checklist' },
];

export default function InspectionCheckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['inspection', id], queryFn: () => fetchInspection(id), refetchOnWindowFocus: false });

  const [items, setItems] = useState<InspectionItemDTO[]>([]);
  const [notes, setNotes] = useState('');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<Tab>('bus');
  const [leg, setLeg] = useState<Leg>(() => defaultLeg(istMinutesOfDay()));
  const overviewQuery = useQuery({
    queryKey: ['inspection', id, 'overview', leg],
    queryFn: () => fetchOverview(id, leg),
    refetchOnWindowFocus: false,
  });
  // The check screen is a live view of today, so the roster day is always IST today.
  const [rosterDate] = useState(() => istToday());
  const routeId = data?.route?.id ?? null;
  const rosterQuery = useQuery({
    queryKey: ['inspection', id, 'roster', leg],
    queryFn: () => fetchRoster(routeId as string, rosterDate, leg),
    enabled: !!routeId,
    refetchOnWindowFocus: false,
  });
  const stopRiderCounts = useMemo(() => {
    const rows = rosterQuery.data?.rows;
    if (!rows) return undefined;
    const m = new Map<string, { booked: number; boarded: number }>();
    for (const r of rows) {
      if (!r.stop_id) continue;
      const c = m.get(r.stop_id) ?? { booked: 0, boarded: 0 };
      if (r.booked) c.booked += 1;
      if (r.status === 'present') c.boarded += 1;
      m.set(r.stop_id, c);
    }
    return m;
  }, [rosterQuery.data]);
  const dirty = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seeded = useRef(false);
  const mounted = useRef(true);
  // Mirrors `items` outside React's render cycle so flush() always PUTs the
  // latest values — a setTimeout captured from an earlier render (or a flush
  // chained behind a slower prior save) must never read/save a stale array.
  const latestItemsRef = useRef<InspectionItemDTO[]>([]);
  // Serializes autosaves: every flush() chains onto the tail of this promise
  // instead of firing independently, so an earlier (slower) request can never
  // land after a later one and overwrite it with stale answers. onSubmit
  // awaits this same tail so it never races an in-flight/queued save (R8).
  const savingRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    latestItemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (!data || seeded.current) return;
    seeded.current = true;
    if (data.status === 'submitted') { router.replace(`/inspections/${id}`); return; }
    setItems(data.items);
    latestItemsRef.current = data.items;
  }, [data, id, router]);

  // Unmount cleanup: cancel the pending debounce timer, fire a best-effort
  // final flush of anything still dirty (fire-and-forget — the component is
  // gone so nothing here touches state), and release local photo previews.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      if (dirty.current.size) void flush();
      latestItemsRef.current.forEach((i) => i.photoUrls.forEach((u) => { if (u?.startsWith('blob:')) URL.revokeObjectURL(u); }));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flush(): Promise<void> {
    const run = savingRef.current.then(async () => {
      const ids = [...dirty.current];
      if (!ids.length) return;
      dirty.current.clear();
      if (mounted.current) setSaveState('saving');
      const current = latestItemsRef.current;
      try {
        await saveItems(id, current.filter((i) => ids.includes(i.id)).map((i) => ({ id: i.id, result: i.result, note: i.note, photoPaths: i.photoPaths })));
        // M-5: only report "saved" if nothing became dirty again while this
        // request was in flight; otherwise a later save is still owed.
        if (mounted.current) setSaveState(dirty.current.size ? 'saving' : 'saved');
      } catch {
        ids.forEach((x) => dirty.current.add(x)); // keep for the next attempt
        if (mounted.current) setSaveState('error');
      }
    });
    savingRef.current = run;
    return run;
  }

  function update(updater: (prev: InspectionItemDTO[]) => InspectionItemDTO[], changedIds: string[]) {
    setItems((prev) => {
      const next = updater(prev);
      latestItemsRef.current = next;
      return next;
    });
    changedIds.forEach((x) => dirty.current.add(x));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 1500);
  }

  const onChange = (itemId: string, patch: Patch) =>
    update((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i)), [itemId]);

  const onAddPhoto = (itemId: string, path: string, url: string) =>
    update((prev) => prev.map((i) => (i.id === itemId ? { ...i, photoPaths: [...i.photoPaths, path], photoUrls: [...i.photoUrls, url] } : i)), [itemId]);

  const onRemovePhoto = (itemId: string, index: number) => {
    const removedUrl = items.find((i) => i.id === itemId)?.photoUrls[index];
    if (removedUrl?.startsWith('blob:')) URL.revokeObjectURL(removedUrl);
    update((prev) => prev.map((i) => (i.id === itemId
      ? { ...i, photoPaths: i.photoPaths.filter((_, j) => j !== index), photoUrls: i.photoUrls.filter((_, j) => j !== index) }
      : i)), [itemId]);
  };

  const onMarkRemainingPass = () => {
    const changed = items.filter((i) => !i.result).map((i) => i.id);
    update((prev) => prev.map((i) => (i.result ? i : { ...i, result: 'pass' as const })), changed);
  };

  async function onSubmit() {
    const blockers = submitBlockers(items);
    if (blockers.length) { toast.error(blockers.join(' · ')); return; }
    setSubmitting(true);
    try {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      // Never submit while an autosave is in flight or queued: wait for the
      // whole save chain, then run one more flush to catch anything that was
      // still dirty when the last queued save took its snapshot.
      await savingRef.current;
      await flush();
      if (dirty.current.size) throw new Error('Could not save your answers — check the connection and try again');
      const { result } = await submitInspection(id, notes || null);
      toast.success(result === 'pass' ? 'Inspection passed' : result === 'fail' ? 'Inspection FAILED — critical items failed' : 'Passed with issues');
      await qc.invalidateQueries({ queryKey: ['inspections'] });
      await qc.invalidateQueries({ queryKey: ['inspection', id] });
      router.replace(`/inspections/${id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setSubmitting(false);
    }
  }

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />;
  // Only a missing inspection blanks the screen; a failed background refetch keeps the last data (I1).
  if (!data) return <p className="text-red-600 dark:text-red-400">{(error as Error)?.message ?? 'Inspection not found'}</p>;
  if (!data.isMine) return <p className="text-amber-700 dark:text-amber-400">This draft was started by {data.inspectorName ?? 'another inspector'}; only they can continue it.</p>;

  const preview = computeResult(items);
  const overview = overviewQuery.data;
  const showLegSwitch = tab === 'stops' || tab === 'riders' || tab === 'staff';
  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-40">
      <DetailPageHeader
        crumbs={[{ label: 'Bus Inspection', href: '/inspections' }, { label: data.vehicle.registration }]}
        backHref="/inspections" title={`Inspect ${data.vehicle.registration}`}
        subtitle={saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved — will retry on next change' : 'All changes saved'}
      />
      {isError && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          <span className="min-w-0">Couldn&apos;t refresh — showing last loaded data</span>
          <button type="button" onClick={() => void refetch()} className="font-semibold underline">Retry</button>
        </p>
      )}
      <div className="sticky top-0 z-10 -mx-4 overflow-x-auto border-b border-gray-200 bg-white/95 px-4 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
        <div className="flex w-max gap-1 py-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === t.key ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {showLegSwitch && <LegSwitch value={leg} onChange={setLeg} />}

      {tab === 'bus' && <BusCard detail={data} overview={overview} overviewError={overviewQuery.isError} />}

      {tab === 'stops' && (
        overviewQuery.isLoading ? <div className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" /> :
        overviewQuery.isError ? <p className="text-red-600 dark:text-red-400">{(overviewQuery.error as Error)?.message ?? 'Could not load stops'}</p> :
        overview ? <StopsTab stops={overview.stops} leg={leg} riderCounts={stopRiderCounts} /> : null
      )}

      {tab === 'riders' && <RidersTab detail={data} overview={overview} leg={leg} date={rosterDate} roster={rosterQuery} />}

      {tab === 'staff' && (
        overviewQuery.isLoading ? <div className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" /> :
        overviewQuery.isError ? <p className="text-red-600 dark:text-red-400">{(overviewQuery.error as Error)?.message ?? 'Could not load staff'}</p> :
        overview ? <StaffTab overview={overview} /> : null
      )}

      {/* Always mounted (only hidden) so an in-flight photo upload's spinner/error survives a tab switch. */}
      <div className={tab === 'checklist' ? 'space-y-5' : 'hidden'}>
        <ChecklistStep items={items} onChange={onChange} onAddPhoto={onAddPhoto} onRemovePhoto={onRemovePhoto} onMarkRemainingPass={onMarkRemainingPass} disabled={submitting} />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Overall remarks (optional)" disabled={submitting}
          className="w-full rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-800 dark:bg-gray-900 disabled:opacity-50" />
      </div>

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-gray-200 bg-white/95 p-3 backdrop-blur lg:bottom-0 dark:border-gray-800 dark:bg-gray-950/95">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <p className="text-sm">Result so far: <b className={preview === 'fail' ? 'text-red-600 dark:text-red-400' : preview === 'pass' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}>{preview.replace(/_/g, ' ')}</b></p>
          <button disabled={submitting} onClick={onSubmit} className="rounded-lg bg-green-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">
            {submitting ? 'Submitting…' : 'Submit inspection'}
          </button>
        </div>
      </div>
    </div>
  );
}
