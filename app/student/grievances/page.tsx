'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GRIEVANCE_CATEGORIES, grievanceCategoryLabel } from '@/lib/grievances/categories';

interface GrvItem {
  id: string;
  category: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  routeLabel: string | null;
}
interface ListData {
  grievances: GrvItem[];
  allocatedRouteId: string | null;
  allocatedRouteLabel: string | null;
}
interface Comment {
  id: string;
  author_role: string;
  message: string;
  created_at: string;
}
interface Detail {
  grievance: { id: string; description: string; status: string; resolution: string | null };
  comments: Comment[];
}

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  resolved: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  closed: 'bg-muted text-muted-foreground',
};

async function fetchList(): Promise<ListData> {
  const res = await fetch('/api/student/grievances', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
  return (await res.json()).data as ListData;
}
async function fetchDetail(id: string): Promise<Detail> {
  const res = await fetch(`/api/student/grievances?id=${id}`, { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error('Failed');
  return (await res.json()).data as Detail;
}

export default function StudentGrievancesPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['student-grievances'], queryFn: fetchList });
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [category, setCategory] = useState('other');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [linkRoute, setLinkRoute] = useState(true);
  const [comment, setComment] = useState('');

  const detail = useQuery({
    queryKey: ['student-grievance', selected],
    queryFn: () => fetchDetail(selected!),
    enabled: !!selected,
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/student/grievances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'create',
          category,
          subject,
          description,
          priority,
          routeId: linkRoute ? data?.allocatedRouteId : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    },
    onSuccess: () => {
      setShowForm(false);
      setSubject('');
      setDescription('');
      setCategory('other');
      setPriority('normal');
      qc.invalidateQueries({ queryKey: ['student-grievances'] });
    },
  });

  const addComment = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/student/grievances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'comment', grievanceId: selected, message: comment }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    },
    onSuccess: () => {
      setComment('');
      qc.invalidateQueries({ queryKey: ['student-grievance', selected] });
    },
  });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (error) return <div className="text-destructive">Could not load grievances.</div>;
  const d = data!;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Grievances</h1>
        <Button onClick={() => setShowForm((s) => !s)} className="h-8 text-xs">
          {showForm ? 'Cancel' : 'New grievance'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Raise a grievance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Category</label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {GRIEVANCE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Subject</label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Description</label>
              <textarea
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="text-xs text-muted-foreground">
                Priority
                <select
                  className="border rounded-md px-2 py-1 text-sm bg-background ml-2"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </label>
              {d.allocatedRouteId && (
                <label className="text-xs flex items-center gap-1">
                  <input type="checkbox" checked={linkRoute} onChange={(e) => setLinkRoute(e.target.checked)} />
                  Link to my route ({d.allocatedRouteLabel})
                </label>
              )}
            </div>
            {create.isError && <p className="text-destructive text-xs">{(create.error as Error).message}</p>}
            <Button disabled={!subject || !description || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? 'Submitting…' : 'Submit'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 divide-y">
          {d.grievances.length === 0 && <p className="p-4 text-sm text-muted-foreground">No grievances yet.</p>}
          {d.grievances.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelected((s) => (s === g.id ? null : g.id))}
              className="w-full text-left p-3 hover:bg-muted/50 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{g.subject}</p>
                <p className="text-xs text-muted-foreground">
                  {grievanceCategoryLabel(g.category)} · {new Date(g.createdAt).toLocaleDateString()}
                </p>
              </div>
              <span className={`shrink-0 whitespace-nowrap text-xs px-2 py-0.5 rounded ${STATUS_STYLES[g.status] ?? ''}`}>
                {g.status.replace('_', ' ')}
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {detail.isLoading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : (
              detail.data && (
                <>
                  <p className="whitespace-pre-wrap break-words text-muted-foreground">{detail.data.grievance.description}</p>
                  {detail.data.grievance.resolution && (
                    <p className="whitespace-pre-wrap break-words text-green-700 dark:text-green-300">
                      Resolution: {detail.data.grievance.resolution}
                    </p>
                  )}
                  <div className="space-y-2 border-t pt-2">
                    {detail.data.comments.length === 0 && (
                      <p className="text-xs text-muted-foreground">No messages yet.</p>
                    )}
                    {detail.data.comments.map((c) => (
                      <div key={c.id} className={`min-w-0 ${c.author_role === 'admin' ? 'pl-6' : ''}`}>
                        <span className="text-[10px] uppercase text-muted-foreground">{c.author_role}</span>
                        <p
                          className={`whitespace-pre-wrap break-words rounded-md px-2 py-1 ${
                            c.author_role === 'admin' ? 'bg-primary/10' : 'bg-muted'
                          }`}
                        >
                          {c.message}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      className="flex-1 min-w-0"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Add a message…"
                    />
                    <Button className="shrink-0" onClick={() => addComment.mutate()} disabled={!comment || addComment.isPending}>
                      Send
                    </Button>
                  </div>
                </>
              )
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
