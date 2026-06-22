'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { grievanceCategoryLabel } from '@/lib/grievances/categories';

interface GrvItem {
  id: string;
  category: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  learnerName: string;
  rollNumber: string | null;
  routeLabel: string | null;
}
interface Comment {
  id: string;
  author_role: string;
  message: string;
  created_at: string;
}
interface Detail {
  grievance: {
    id: string;
    category: string;
    subject: string;
    description: string;
    status: string;
    priority: string;
    resolution: string | null;
    created_at: string;
  };
  comments: Comment[];
  learner: { first_name: string | null; last_name: string | null; roll_number: string | null } | null;
}

const STATUS = ['open', 'in_progress', 'resolved', 'closed'];
const STATUS_STYLES: Record<string, string> = {
  open: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  resolved: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  closed: 'bg-muted text-muted-foreground',
};

async function fetchList(): Promise<GrvItem[]> {
  const res = await fetch('/api/admin/transport-grievances', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
  return (await res.json()).data as GrvItem[];
}
async function fetchDetail(id: string): Promise<Detail> {
  const res = await fetch(`/api/admin/transport-grievances?id=${id}`, { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error('Failed');
  return (await res.json()).data as Detail;
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

export default function GrievancesPage() {
  const qc = useQueryClient();
  const { data: list = [], isLoading, error } = useQuery({ queryKey: ['admin-grievances'], queryFn: fetchList });
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [resolution, setResolution] = useState('');

  const detail = useQuery({
    queryKey: ['admin-grievance', openId],
    queryFn: () => fetchDetail(openId!),
    enabled: !!openId,
  });

  const addComment = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/transport-grievances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ grievanceId: openId, message: comment }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    },
    onSuccess: () => {
      setComment('');
      qc.invalidateQueries({ queryKey: ['admin-grievance', openId] });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (payload: { status?: string; resolution?: string }) => {
      const res = await fetch('/api/admin/transport-grievances', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ grievanceId: openId, ...payload }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-grievance', openId] });
      qc.invalidateQueries({ queryKey: ['admin-grievances'] });
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (g) =>
        g.subject.toLowerCase().includes(q) ||
        g.learnerName.toLowerCase().includes(q) ||
        (g.rollNumber ?? '').toLowerCase().includes(q)
    );
  }, [list, search]);

  const stats = useMemo(
    () => ({
      total: list.length,
      open: list.filter((g) => g.status === 'open').length,
      resolved: list.filter((g) => g.status === 'resolved').length,
    }),
    [list]
  );

  if (isLoading) return <div className="p-4 text-muted-foreground">Loading…</div>;
  if (error) return <div className="p-4 text-destructive">{(error as Error).message}</div>;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Transport Grievances</h1>

      <div className="grid grid-cols-3 gap-3 max-w-xl">
        <Stat label="Total" value={stats.total} />
        <Stat label="Open" value={stats.open} />
        <Stat label="Resolved" value={stats.resolved} />
      </div>

      <Input
        placeholder="Search subject / learner / roll…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr className="text-left">
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">Learner</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Route</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    No grievances.
                  </td>
                </tr>
              )}
              {filtered.map((g) => (
                <tr key={g.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{g.subject}</td>
                  <td className="px-3 py-2">
                    {g.learnerName}
                    {g.rollNumber ? ` (${g.rollNumber})` : ''}
                  </td>
                  <td className="px-3 py-2">{grievanceCategoryLabel(g.category)}</td>
                  <td className="px-3 py-2">{g.routeLabel ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[g.status] ?? ''}`}>
                      {g.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        setOpenId(g.id);
                        setResolution('');
                        setComment('');
                      }}
                    >
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog
        open={!!openId}
        onOpenChange={(o) => {
          if (!o) setOpenId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grievance</DialogTitle>
          </DialogHeader>
          {detail.isLoading || !detail.data ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium">{detail.data.grievance.subject}</p>
                <p className="text-xs text-muted-foreground">
                  {grievanceCategoryLabel(detail.data.grievance.category)}
                  {detail.data.learner
                    ? ` · ${`${detail.data.learner.first_name ?? ''} ${detail.data.learner.last_name ?? ''}`.trim()}`
                    : ''}
                </p>
                <p className="mt-2 text-muted-foreground">{detail.data.grievance.description}</p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  className="border rounded-md px-2 py-1 text-sm bg-background"
                  defaultValue={detail.data.grievance.status}
                  onChange={(e) => updateStatus.mutate({ status: e.target.value })}
                >
                  {STATUS.map((s) => (
                    <option key={s} value={s}>
                      {s.replace('_', ' ')}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">change status</span>
              </div>

              <div className="border-t pt-2 space-y-2 max-h-48 overflow-y-auto">
                {detail.data.comments.length === 0 && (
                  <p className="text-xs text-muted-foreground">No messages yet.</p>
                )}
                {detail.data.comments.map((c) => (
                  <div key={c.id} className={c.author_role === 'learner' ? 'pr-6' : 'pl-6'}>
                    <span className="text-[10px] uppercase text-muted-foreground">{c.author_role}</span>
                    <p
                      className={`rounded-md px-2 py-1 ${
                        c.author_role === 'admin' ? 'bg-primary/10' : 'bg-muted'
                      }`}
                    >
                      {c.message}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Reply to learner…" />
                <Button onClick={() => addComment.mutate()} disabled={!comment || addComment.isPending}>
                  Send
                </Button>
              </div>

              <div className="border-t pt-2">
                <label className="text-xs text-muted-foreground">Resolution note</label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    placeholder="Resolution summary"
                  />
                  <Button
                    variant="outline"
                    onClick={() => updateStatus.mutate({ status: 'resolved', resolution })}
                    disabled={!resolution || updateStatus.isPending}
                  >
                    Resolve
                  </Button>
                </div>
                {detail.data.grievance.resolution && (
                  <p className="text-green-700 dark:text-green-300 text-xs mt-1">
                    Current: {detail.data.grievance.resolution}
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
