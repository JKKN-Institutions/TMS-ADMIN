'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ReqItem {
  id: string;
  status: string;
  requestType: string;
  routeLabel: string | null;
  stopLabel: string | null;
  reason: string | null;
  adminNotes: string | null;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}
interface RouteOpt {
  id: string;
  label: string;
  stops: { id: string; name: string }[];
}
interface EnrollData {
  busRequired: boolean | null;
  assigned: boolean;
  allocation: { routeLabel: string | null; stopLabel: string | null };
  hasPending: boolean;
  canRequest: boolean;
  requests: ReqItem[];
  routes: RouteOpt[];
}
type Resp = { data?: EnrollData; notFound?: boolean };

async function fetchEnrollment(): Promise<Resp> {
  const res = await fetch('/api/student/enrollment', { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error('Failed to load enrollment');
  return { data: (await res.json()).data as EnrollData };
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  cancelled: 'bg-muted text-muted-foreground',
};

export default function StudentEnrollmentPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['student-enrollment'], queryFn: fetchEnrollment });
  const [routeId, setRouteId] = useState('');
  const [stopId, setStopId] = useState('');
  const [reason, setReason] = useState('');

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/student/enrollment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ preferredRouteId: routeId, preferredStopId: stopId, reason }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to submit');
    },
    onSuccess: () => {
      setRouteId('');
      setStopId('');
      setReason('');
      qc.invalidateQueries({ queryKey: ['student-enrollment'] });
    },
  });

  const cancel = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await fetch('/api/student/enrollment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ requestId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to cancel');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student-enrollment'] }),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (error) return <div className="text-destructive">Could not load enrollment.</div>;
  if (data?.notFound || !data?.data) {
    return (
      <div className="text-muted-foreground text-sm">
        No learner record is linked to your account yet.
      </div>
    );
  }

  const d = data.data;
  const selectedRoute = d.routes.find((r) => r.id === routeId);

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Transport Enrollment</h1>

      {d.assigned && (
        <Card>
          <CardHeader>
            <CardTitle>Current allocation</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {d.allocation.routeLabel ?? '—'} · stop {d.allocation.stopLabel ?? '—'}
          </CardContent>
        </Card>
      )}

      {d.canRequest ? (
        <Card>
          <CardHeader>
            <CardTitle>{d.assigned ? 'Request a route change' : 'Request transport'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Route</label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={routeId}
                onChange={(e) => {
                  setRouteId(e.target.value);
                  setStopId('');
                }}
              >
                <option value="">Select a route…</option>
                {d.routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Boarding stop</label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background disabled:opacity-50"
                value={stopId}
                onChange={(e) => setStopId(e.target.value)}
                disabled={!selectedRoute}
              >
                <option value="">Select a stop…</option>
                {selectedRoute?.stops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Reason (optional)</label>
              <textarea
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            {submit.isError && (
              <p className="text-destructive text-xs">{(submit.error as Error).message}</p>
            )}
            <Button disabled={!routeId || !stopId || submit.isPending} onClick={() => submit.mutate()}>
              {submit.isPending ? 'Submitting…' : 'Submit request'}
            </Button>
          </CardContent>
        </Card>
      ) : d.hasPending ? (
        <p className="text-sm text-muted-foreground">
          You have a pending request. You can submit a new one after it&apos;s reviewed.
        </p>
      ) : !d.busRequired ? (
        <p className="text-sm text-muted-foreground">
          Transport is not marked as required for your profile. Contact the transport office if you
          need it.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>My requests</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {d.requests.length === 0 && <p className="text-muted-foreground">No requests yet.</p>}
          {d.requests.map((r) => (
            <div key={r.id} className="border rounded-md p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium break-words">
                  {r.routeLabel ?? '—'} · {r.stopLabel ?? '—'}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[r.status] ?? ''}`}>
                  {r.status}
                </span>
              </div>
              {r.reason && <p className="text-muted-foreground mt-1">{r.reason}</p>}
              {r.status === 'rejected' && r.rejectionReason && (
                <p className="text-red-600 mt-1">Reason: {r.rejectionReason}</p>
              )}
              {r.status === 'pending' && (
                <Button
                  variant="outline"
                  className="mt-2 h-7 text-xs"
                  onClick={() => cancel.mutate(r.id)}
                  disabled={cancel.isPending}
                >
                  Cancel request
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
