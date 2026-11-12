'use client';

import { useQuery } from '@tanstack/react-query';
import { Camera, CheckCircle2, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PRE_TRIP_ITEMS } from '@/lib/tracking/pre-trip-check';
import { PRE_TRIP_STATUS_LABEL, type PreTripDayRow } from '@/lib/tracking/pre-trip-admin';
import { PRE_TRIP_STATUS_TONE, checkTime } from './columns';

/** Asks the server for a short-lived signed URL, only when the pop-up is open. */
function OdometerPhoto({ checkId }: { checkId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['pre-trip-photo', checkId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/pre-trip-checks/${checkId}/photo`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const j = (await res.json().catch(() => null)) as { data?: { url: string }; error?: string } | null;
      if (!res.ok || !j?.data?.url) throw new Error(j?.error ?? 'Could not open the photo');
      return j.data.url;
    },
    staleTime: 60_000, // the signed URL lives 120 s; refetch well before it expires
    gcTime: 60_000,
    retry: false,
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading photo…</p>;
  if (error || !data) {
    return <p className="text-sm text-red-600 dark:text-red-400">{(error as Error)?.message ?? 'Could not open the photo'}</p>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not an optimisable asset
    <img src={data} alt="Odometer photo" className="max-h-80 w-full rounded-lg bg-gray-100 object-contain dark:bg-gray-800" />
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-foreground" title={value}>{value}</dd>
    </div>
  );
}

/** One check in full: who, which bus and route, the six answers, note and photo. */
export function CheckDetailsDialog({ row, onClose }: { row: PreTripDayRow | null; onClose: () => void }) {
  const c = row?.check ?? null;
  return (
    <Dialog open={!!row && !!c} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        {row && c && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <span>
                  Route {row.routeNumber ?? '—'}
                  {row.routeName ? ` · ${row.routeName}` : ''}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PRE_TRIP_STATUS_TONE[row.status]}`}>
                  {PRE_TRIP_STATUS_LABEL[row.status]}
                </span>
              </DialogTitle>
              <DialogDescription>Pre-trip check recorded by the driver.</DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Fact label="Driver" value={row.driverName ?? 'Unknown driver'} />
              <Fact label="Bus" value={row.busRegistration ?? 'Bus not found'} />
              <Fact label="Time" value={checkTime(c.createdAt)} />
              <Fact label="Odometer" value={c.odometerKm == null ? '—' : `${c.odometerKm.toLocaleString('en-IN')} km`} />
            </dl>

            {c.skipped ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-900/50">
                <span className="font-semibold">Skipped:</span> {c.skipReason ?? 'no reason given'}. The trip ran without
                the day&apos;s check, so there are no answers and no photo.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-2">
                {PRE_TRIP_ITEMS.map(({ key, label }) => {
                  const ok = c.items[key] === true;
                  const Icon = ok ? CheckCircle2 : XCircle;
                  return (
                    <li
                      key={key}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                        ok
                          ? 'bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300'
                          : 'bg-red-50 font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-300'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="flex-1">{label}</span>
                      <span className="text-xs">{ok ? 'OK' : 'NOT OK'}</span>
                    </li>
                  );
                })}
              </ul>
            )}

            {c.notes && (
              <p className="text-sm text-foreground">
                <span className="font-medium">Driver&apos;s note:</span> {c.notes}
              </p>
            )}

            {c.hasPhoto && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Camera className="h-4 w-4" aria-hidden="true" /> Odometer photo
                </p>
                <OdometerPhoto checkId={c.id} />
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
