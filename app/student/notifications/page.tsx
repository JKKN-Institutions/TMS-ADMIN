'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';

interface Notif {
  id: string;
  title: string | null;
  body: string | null;
  category: string | null;
  priority: string | null;
  url: string | null;
  createdAt: string;
}

async function fetchNotifs(): Promise<Notif[]> {
  const res = await fetch('/api/student/notifications', {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error('Failed to load notifications');
  return (await res.json()).data as Notif[];
}

export default function StudentNotificationsPage() {
  const { data: notifs = [], isLoading, error } = useQuery({
    queryKey: ['student-notifications'],
    queryFn: fetchNotifs,
  });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (error) return <div className="text-destructive">Could not load notifications.</div>;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Notifications</h1>
      {notifs.length === 0 ? (
        <p className="text-sm text-muted-foreground">You have no notifications.</p>
      ) : (
        <div className="space-y-2">
          {notifs.map((n) => (
            <Card key={n.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {n.title && <p className="font-medium">{n.title}</p>}
                    {n.body && (
                      <p className="text-sm text-muted-foreground break-words">{n.body}</p>
                    )}
                  </div>
                  <time className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(n.createdAt).toLocaleDateString()}
                  </time>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
