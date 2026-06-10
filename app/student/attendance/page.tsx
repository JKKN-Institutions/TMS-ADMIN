'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';

interface Att {
  id: string;
  tripDate: string;
  direction: string;
  status: string;
  method: string;
  routeLabel: string | null;
  stopLabel: string | null;
  scannedAt: string;
}

async function fetchAtt(): Promise<Att[]> {
  const res = await fetch('/api/student/attendance', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error('Failed to load attendance');
  return (await res.json()).data as Att[];
}

export default function StudentAttendancePage() {
  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ['student-attendance'],
    queryFn: fetchAtt,
  });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (error) return <div className="text-destructive">Could not load attendance.</div>;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">My Attendance</h1>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No boarding records yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <Card key={a.id}>
              <CardContent className="py-3 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {new Date(a.tripDate).toLocaleDateString()} · {a.direction}
                  </p>
                  <p className="text-xs text-muted-foreground break-words">
                    {a.routeLabel ?? '—'}
                    {a.stopLabel ? ` · ${a.stopLabel}` : ''}
                  </p>
                </div>
                <span
                  className={`shrink-0 whitespace-nowrap text-xs px-2 py-0.5 rounded ${
                    a.status === 'present'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
                  }`}
                >
                  {a.status}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
