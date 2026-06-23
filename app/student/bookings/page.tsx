'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type DayStatus = 'not_booked' | 'booked' | 'locked' | 'closed';

interface Day { date: string; status: DayStatus; cutoff: string }
interface Board { routeLabel: string | null; stopLabel: string | null; assigned: boolean; days: Day[] }

async function fetchBoard(): Promise<Board> {
  const res = await fetch('/api/student/bookings', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error('Failed to load bookings');
  return (await res.json()).data as Board;
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

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const fmtCutoff = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const STATUS_LABEL: Record<DayStatus, string> = {
  not_booked: 'Not booked',
  booked: 'Booked',
  locked: 'Confirmed',
  closed: 'Closed',
};
const STATUS_CLASS: Record<DayStatus, string> = {
  not_booked: 'text-muted-foreground',
  booked: 'text-green-700 dark:text-green-300',
  locked: 'text-blue-700 dark:text-blue-300',
  closed: 'text-muted-foreground',
};

export default function StudentBookingsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['student-bookings'], queryFn: fetchBoard });

  const mut = useMutation({
    mutationFn: mutateBooking,
    onSuccess: (d) => {
      toast.success(d.status === 'booked' ? 'Bus booked' : 'Booking cancelled');
      qc.invalidateQueries({ queryKey: ['student-bookings'] });
      qc.invalidateQueries({ queryKey: ['student-pass'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Action failed'),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (error) return <div className="text-destructive">Could not load your bookings.</div>;
  if (!data) return null;

  if (!data.assigned) {
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
    <div className="mx-auto w-full max-w-md space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Book Bus</h1>
        <p className="text-sm text-muted-foreground">{data.routeLabel ?? '—'} · Stop: {data.stopLabel ?? '—'}</p>
        <p className="text-xs text-muted-foreground mt-1">Book before 6 PM the day before. One booking covers both trips.</p>
      </div>

      <div className="space-y-2">
        {data.days.map((d) => {
          const canBook = d.status === 'not_booked';
          const canCancel = d.status === 'booked';
          return (
            <Card key={d.date}>
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{fmtDate(d.date)}</p>
                  <p className={`text-xs ${STATUS_CLASS[d.status]}`}>{STATUS_LABEL[d.status]}</p>
                  {(canBook || canCancel) && (
                    <p className="text-[11px] text-muted-foreground">Closes {fmtCutoff(d.cutoff)}</p>
                  )}
                </div>
                {canBook && (
                  <Button size="sm" disabled={mut.isPending} onClick={() => mut.mutate({ travel_date: d.date, action: 'book' })}>
                    Book
                  </Button>
                )}
                {canCancel && (
                  <Button size="sm" variant="outline" disabled={mut.isPending} onClick={() => mut.mutate({ travel_date: d.date, action: 'cancel' })}>
                    Cancel
                  </Button>
                )}
                {(d.status === 'locked' || d.status === 'closed') && (
                  <span className="text-xs text-muted-foreground">{d.status === 'locked' ? 'Locked' : '—'}</span>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
