'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Bus, MapPin, CalendarCheck, Clock, CalendarOff, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookingCalendar, type DayCell } from '@/components/booking/booking-calendar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { addMonth, istMonth } from '@/lib/booking/month';

interface MonthResp {
  routeLabel: string | null;
  stopLabel: string | null;
  assigned: boolean;
  month: string;
  cells: DayCell[];
}

async function fetchMonth(month: string): Promise<MonthResp> {
  const res = await fetch(`/api/student/bookings?month=${month}`, { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error('Failed to load bookings');
  return (await res.json()).data as MonthResp;
}

async function mutateBooking(input: { travel_date: string; action: 'book' | 'cancel' }) {
  const res = await fetch('/api/student/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Action failed');
  return json.data as { travel_date: string; status: string };
}

export default function StudentBookingsPage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState<string>(() => istMonth());
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  // Holds the day awaiting confirmation; the mutation only fires once confirmed.
  const [confirm, setConfirm] = useState<{ date: string; action: 'book' | 'cancel' } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['student-bookings', month],
    queryFn: () => fetchMonth(month),
  });

  const mut = useMutation({
    mutationFn: mutateBooking,
    onMutate: (v) => setPendingDate(v.travel_date),
    onSuccess: (d) => {
      setConfirm(null); // close the dialog; on error it stays open so the user can retry
      toast.success(d.status === 'booked' ? 'Bus booked' : 'Booking cancelled');
      qc.invalidateQueries({ queryKey: ['student-bookings'] });
      qc.invalidateQueries({ queryKey: ['student-pass'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Action failed'),
    onSettled: () => setPendingDate(null),
  });

  const cells = useMemo(() => {
    const m = new Map<string, DayCell>();
    for (const c of data?.cells ?? []) m.set(c.date, c);
    return m;
  }, [data]);

  const bookedThisMonth = useMemo(
    () => (data?.cells ?? []).filter((c) => c.status === 'booked' || c.status === 'locked').length,
    [data]
  );

  if (error) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/50 dark:bg-red-950/30">
        <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
        <p className="text-sm font-medium text-red-700 dark:text-red-300">Could not load your bookings.</p>
        <p className="text-xs text-red-600/80 dark:text-red-400/80">Please refresh the page or try again shortly.</p>
      </div>
    );
  }

  if (data && !data.assigned) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardHeader><CardTitle>No route allocated</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          You need a transport route allocated before you can book a bus. Please contact the transport office.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto w-full max-w-full space-y-4 sm:space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Book your bus</h1>
        <p className="text-sm text-muted-foreground">
          Reserve a seat for the days you&apos;ll travel — one tap books both trips that day.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        {/* Summary + guidance (sticky on desktop, stacks on mobile) */}
        <aside className="space-y-3 lg:sticky lg:top-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <InfoRow icon={<Bus className="h-4 w-4" />} label="Route" value={data?.routeLabel ?? '—'} loading={isLoading} />
            <div className="my-3 h-px bg-gray-100 dark:bg-gray-800" />
            <InfoRow icon={<MapPin className="h-4 w-4" />} label="Boarding stop" value={data?.stopLabel ?? '—'} loading={isLoading} />
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 dark:border-green-900/50 dark:bg-green-950/30">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-green-600/10 text-green-700 dark:text-green-400">
              <CalendarCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-semibold tabular-nums text-green-700 dark:text-green-400">{bookedThisMonth}</p>
              <p className="text-xs text-green-700/80 dark:text-green-400/80">
                day{bookedThisMonth === 1 ? '' : 's'} booked this month
              </p>
            </div>
          </div>

          <div className="space-y-2.5 rounded-2xl border border-gray-200 bg-white p-4 text-xs text-muted-foreground shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <Hint icon={<Clock className="h-4 w-4 text-blue-500" />}>
              Booking closes at <span className="font-medium text-foreground">6 PM the day before</span> travel.
            </Hint>
            <Hint icon={<CalendarOff className="h-4 w-4 text-slate-400" />}>
              <span className="font-medium text-foreground">Sundays are a weekly holiday</span> — no bus service, so they can&apos;t be booked.
            </Hint>
          </div>
        </aside>

        {/* Calendar */}
        <section className="min-w-0">
          {isLoading ? (
            <CalendarSkeleton />
          ) : (
            <BookingCalendar
              month={month}
              cells={cells}
              onPrev={() => setMonth((m) => addMonth(m, -1))}
              onNext={() => setMonth((m) => addMonth(m, 1))}
              onToday={() => setMonth(istMonth())}
              onBook={(date) => setConfirm({ date, action: 'book' })}
              onCancel={(date) => setConfirm({ date, action: 'cancel' })}
              pendingDate={pendingDate}
            />
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(next) => { if (!next) setConfirm(null); }}
        loading={mut.isPending}
        danger={confirm?.action === 'cancel'}
        title={confirm?.action === 'cancel' ? 'Cancel this booking?' : 'Confirm your booking'}
        confirmLabel={confirm?.action === 'cancel' ? 'Cancel booking' : 'Book bus'}
        cancelLabel={confirm?.action === 'cancel' ? 'Keep booking' : 'Not now'}
        description={
          confirm
            ? confirm.action === 'cancel'
              ? (<>Release your seat for <strong>{formatLong(confirm.date)}</strong>? You can rebook before 6&nbsp;PM the day before travel.</>)
              : (<>Reserve a seat for <strong>{formatLong(confirm.date)}</strong>? This covers both trips that day{data?.routeLabel ? <> on <strong>{data.routeLabel}</strong></> : null}.</>)
            : null
        }
        onConfirm={() => { if (confirm) mut.mutate({ travel_date: confirm.date, action: confirm.action }); }}
      />
    </div>
  );
}

/** 'YYYY-MM-DD' → e.g. "Monday, 29 June 2026" in the viewer's locale. */
function formatLong(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function InfoRow({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value: string; loading?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {loading ? (
          <span className="mt-1 block h-4 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        ) : (
          <p className="break-words text-sm font-medium text-foreground">{value}</p>
        )}
      </div>
    </div>
  );
}

function Hint({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 leading-snug">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </p>
  );
}

function CalendarSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between">
        <span className="h-10 w-10 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
        <span className="h-5 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <span className="h-10 w-10 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {Array.from({ length: 42 }).map((_, i) => (
          <div key={i} className="aspect-square min-h-[44px] animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
    </div>
  );
}
