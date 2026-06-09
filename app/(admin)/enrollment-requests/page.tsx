'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface Learner {
  id: string;
  name: string;
  rollNumber: string | null;
  departmentName: string | null;
  routeLabel: string | null;
  stopLabel: string | null;
  assigned: boolean;
}
interface RouteOpt {
  id: string;
  label: string;
  stops: { id: string; name: string }[];
}
interface Data {
  learners: Learner[];
  routes: RouteOpt[];
}

async function fetchData(): Promise<Data> {
  const res = await fetch('/api/admin/enrollment-requests', {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load');
  return (await res.json()).data as Data;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="py-3">
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

export default function EnrollmentRequestsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-enrollment'], queryFn: fetchData });
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Learner | null>(null);
  const [routeId, setRouteId] = useState('');
  const [stopId, setStopId] = useState('');

  const allocate = useMutation({
    mutationFn: async (payload: { learnerId: string; routeId: string | null; stopId: string | null }) => {
      const res = await fetch('/api/admin/enrollment-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
    },
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['admin-enrollment'] });
    },
  });

  const learners = data?.learners ?? [];
  const routes = data?.routes ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return learners;
    return learners.filter(
      (l) => l.name.toLowerCase().includes(q) || (l.rollNumber ?? '').toLowerCase().includes(q)
    );
  }, [learners, search]);

  const stats = useMemo(
    () => ({
      total: learners.length,
      allocated: learners.filter((l) => l.assigned).length,
      unallocated: learners.filter((l) => !l.assigned).length,
    }),
    [learners]
  );

  const openEdit = (l: Learner) => {
    setEditing(l);
    setRouteId('');
    setStopId('');
  };
  const selectedRoute = routes.find((r) => r.id === routeId);

  if (isLoading) return <div className="p-4 text-muted-foreground">Loading…</div>;
  if (error) return <div className="p-4 text-destructive">{(error as Error).message}</div>;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Transport Enrollment</h1>

      <div className="grid grid-cols-3 gap-3 max-w-xl">
        <Stat label="Bus-required" value={stats.total} />
        <Stat label="Allocated" value={stats.allocated} />
        <Stat label="Unallocated" value={stats.unallocated} />
      </div>

      <Input
        placeholder="Search by name or roll number…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr className="text-left">
                <th className="px-3 py-2">Learner</th>
                <th className="px-3 py-2">Roll</th>
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2">Route</th>
                <th className="px-3 py-2">Stop</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    No bus-required learners.
                  </td>
                </tr>
              )}
              {filtered.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{l.name}</td>
                  <td className="px-3 py-2">{l.rollNumber ?? '—'}</td>
                  <td className="px-3 py-2">{l.departmentName ?? '—'}</td>
                  <td className="px-3 py-2">
                    {l.routeLabel ?? <span className="text-amber-600">Unallocated</span>}
                  </td>
                  <td className="px-3 py-2">{l.stopLabel ?? '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="outline" className="h-7 text-xs" onClick={() => openEdit(l)}>
                      {l.assigned ? 'Change' : 'Allocate'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Allocate transport — {editing?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {editing?.assigned && (
              <p className="text-xs text-muted-foreground">
                Current: {editing.routeLabel} · {editing.stopLabel}
              </p>
            )}
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
                {routes.map((r) => (
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
            {allocate.isError && (
              <p className="text-destructive text-xs">{(allocate.error as Error).message}</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            {editing?.assigned && (
              <Button
                variant="outline"
                onClick={() => editing && allocate.mutate({ learnerId: editing.id, routeId: null, stopId: null })}
                disabled={allocate.isPending}
              >
                Clear allocation
              </Button>
            )}
            <Button
              onClick={() => editing && allocate.mutate({ learnerId: editing.id, routeId, stopId })}
              disabled={!routeId || !stopId || allocate.isPending}
            >
              {allocate.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
