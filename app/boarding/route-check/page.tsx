'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, ClipboardList, Loader2, ScanLine } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BusScanner } from '@/components/scanner/bus-scanner';
import { LEG_NAME } from '@/lib/boarding/attendance-window';
import type { CheckLeg, MyCheckRoute } from '@/lib/route-check/types';
import { fetchMyRoutes, startCheck } from './route-check-api';

const LEGS: CheckLeg[] = ['onward', 'return'];

interface StickerHit { routeId: string; routeNumber: string | null; vehicleReg: string | null }

async function fetchBySticker(reg: string): Promise<StickerHit> {
  const res = await fetch(`/api/boarding/route-check/by-sticker?reg=${encodeURIComponent(reg)}`, { cache: 'no-store' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return (body as { data: StickerHit }).data;
}

function legLabel(entry: MyCheckRoute['today'][CheckLeg]) {
  if (!entry) return 'Start';
  if (entry.status === 'submitted') return 'Submitted ✓';
  return 'Continue';
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1].map((i) => (
        <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="h-4 w-2/3 rounded bg-gray-100 dark:bg-gray-800" />
          <div className="mt-2 h-3 w-1/2 rounded bg-gray-100 dark:bg-gray-800" />
          <div className="mt-4 flex gap-2">
            <div className="h-9 flex-1 rounded-lg bg-gray-100 dark:bg-gray-800" />
            <div className="h-9 flex-1 rounded-lg bg-gray-100 dark:bg-gray-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

function StickerScanDialog({ open, onClose, onHit }: { open: boolean; onClose: () => void; onHit: (reg: string) => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto rounded-xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Scan bus sticker</DialogTitle>
          <DialogDescription>Point the camera at the QR sticker inside the bus.</DialogDescription>
        </DialogHeader>
        <div className="min-w-0">
          <BusScanner onCode={onHit} paused={!open} readerId="bus-inspection-sticker" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StickerCard({ reg, hit, error, onPick, busyLeg }: {
  reg: string;
  hit: StickerHit | undefined;
  error: string | null;
  onPick: (leg: CheckLeg) => void;
  busyLeg: CheckLeg | null;
}) {
  if (error) {
    return (
      <div className="min-w-0 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-900/20">
        <p className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 break-words">{error}</span>
        </p>
      </div>
    );
  }
  if (!hit) return <LoadingSkeleton />;
  return (
    <div className="min-w-0 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900/40 dark:bg-green-900/20">
      <p className="truncate font-semibold text-gray-900 dark:text-gray-100">
        Bus {hit.vehicleReg ?? reg} &middot; Route {hit.routeNumber ?? '—'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {LEGS.map((leg) => (
          <button
            key={leg}
            type="button"
            disabled={busyLeg !== null}
            onClick={() => onPick(leg)}
            className="flex-1 inline-flex min-w-[7rem] items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-green-700 dark:hover:bg-green-600"
          >
            {busyLeg === leg && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {LEG_NAME[leg]}
          </button>
        ))}
      </div>
    </div>
  );
}

function BusInspectionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reg = searchParams.get('reg');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const { data: routes, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['route-check', 'my-routes'],
    queryFn: fetchMyRoutes,
  });

  const stickerQuery = useQuery({
    queryKey: ['route-check', 'by-sticker', reg],
    queryFn: () => fetchBySticker(reg as string),
    enabled: !!reg,
    retry: false,
  });

  async function handleTap(route: MyCheckRoute, leg: CheckLeg) {
    const today = route.today[leg];
    if (today?.status === 'submitted') {
      router.push(`/boarding/route-check/${today.id}`);
      return;
    }
    const key = `${route.routeId}:${leg}`;
    setBusyKey(key);
    try {
      const { checkId } = await startCheck(route.routeId, leg);
      router.push(`/boarding/route-check/${checkId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to start check');
      setBusyKey(null);
    }
  }

  const [stickerBusyLeg, setStickerBusyLeg] = useState<CheckLeg | null>(null);
  async function handleStickerPick(leg: CheckLeg) {
    if (!stickerQuery.data) return;
    setStickerBusyLeg(leg);
    try {
      const { checkId } = await startCheck(stickerQuery.data.routeId, leg);
      router.push(`/boarding/route-check/${checkId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to start check');
      setStickerBusyLeg(null);
    }
  }

  function handleScanHit(scannedReg: string) {
    setScannerOpen(false);
    router.replace(`/boarding/route-check?reg=${encodeURIComponent(scannedReg)}`);
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Bus Inspection</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Pick a route and leg to start checking riders.</p>
        </div>
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <ScanLine className="h-4 w-4" />
          Scan bus sticker
        </button>
      </div>

      {reg && (
        <StickerCard
          reg={reg}
          hit={stickerQuery.data}
          error={stickerQuery.isError ? (stickerQuery.error instanceof Error ? stickerQuery.error.message : 'Could not find that bus') : null}
          onPick={handleStickerPick}
          busyLeg={stickerBusyLeg}
        />
      )}

      {isLoading && <LoadingSkeleton />}

      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-900/20">
          <p className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error instanceof Error ? error.message : 'Failed to load your routes'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/30"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && (routes?.length ?? 0) === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center dark:border-gray-800 dark:bg-gray-900">
          <ClipboardList className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            No routes assigned to you for checking. Ask the Transport Head.
          </p>
        </div>
      )}

      {!isLoading && !isError && (routes?.length ?? 0) > 0 && (
        <div className="space-y-3">
          {routes!.map((route) => (
            <div
              key={route.routeId}
              className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
            >
              <p className="truncate font-semibold text-gray-900 dark:text-gray-100">
                Route {route.routeNumber ?? '—'}
              </p>
              <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                {route.routeName ?? '—'} &middot; Bus {route.vehicleReg ?? '—'}
              </p>
              <div className="mt-3 flex gap-2">
                {LEGS.map((leg) => {
                  const key = `${route.routeId}:${leg}`;
                  const busy = busyKey === key;
                  const submitted = route.today[leg]?.status === 'submitted';
                  return (
                    <button
                      key={leg}
                      type="button"
                      disabled={busy}
                      onClick={() => handleTap(route, leg)}
                      className={
                        submitted
                          ? 'flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 disabled:opacity-60 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300'
                          : 'flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-green-700 dark:hover:bg-green-600'
                      }
                    >
                      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {LEG_NAME[leg]}: {legLabel(route.today[leg])}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <StickerScanDialog open={scannerOpen} onClose={() => setScannerOpen(false)} onHit={handleScanHit} />
    </div>
  );
}

export default function BusInspectionPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-lg space-y-4 p-4"><LoadingSkeleton /></div>}>
      <BusInspectionContent />
    </Suspense>
  );
}
