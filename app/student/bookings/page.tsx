'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookingCalendar, type DayCell } from '@/components/booking/booking-calendar';
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

  const { data, isLoading, error } = useQuery({
    queryKey: ['student-bookings', month],
    queryFn: () => fetchMonth(month),
  });

  const mut = useMutation({
    mutationFn: mutateBooking,
    onMutate: (v) => setPendingDate(v.travel_date),
    onSuccess: (d) => {
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

  if (error) return <div className="text-destructive">Could not load your bookings.</div>;

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
    <div className="mx-auto w-full max-w-full space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Book Bus</h1>
        <p className="text-sm text-muted-foreground">{data?.routeLabel ?? '—'} · Stop: {data?.stopLabel ?? '—'}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tap an open day to book — one booking covers both trips. Booking closes 6 PM the day before.
          {bookedThisMonth > 0 && ` · ${bookedThisMonth} day${bookedThisMonth === 1 ? '' : 's'} booked this month.`}
        </p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : (
        <BookingCalendar
          month={month}
          cells={cells}
          onPrev={() => setMonth((m) => addMonth(m, -1))}
          onNext={() => setMonth((m) => addMonth(m, 1))}
          onBook={(date) => mut.mutate({ travel_date: date, action: 'book' })}
          onCancel={(date) => mut.mutate({ travel_date: date, action: 'cancel' })}
          pendingDate={pendingDate}
        />
      )}
    </div>
  );
}
