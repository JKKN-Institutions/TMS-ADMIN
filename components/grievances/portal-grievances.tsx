'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCircle2, ChevronDown, MessageSquarePlus, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable } from '@/components/ui/data-table';
import { GRIEVANCE_CATEGORIES, grievanceCategoryLabel } from '@/lib/grievances/categories';
import { categoryIcon, PriorityBadge, StatusBadge } from './badges';
import { getPortalGrievanceColumns, type PortalGrievanceRow } from './portal-columns';

// Self-service grievances UI shared by the student, driver and boarding portals.
// They all talk to the same API shape (just a different namespace), so the only
// prop is `apiBase`. The list uses the app's advanced data table; selecting a
// grievance opens its support conversation in an inline panel below the table
// (mirroring the admin queue).

interface ListData {
  grievances: PortalGrievanceRow[];
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

async function fetchList(apiBase: string): Promise<ListData> {
  const res = await fetch(apiBase, { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
  return (await res.json()).data as ListData;
}
async function fetchDetail(apiBase: string, id: string): Promise<Detail> {
  const res = await fetch(`${apiBase}?id=${id}`, { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error('Failed');
  return (await res.json()).data as Detail;
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// House-styled category picker (Radix dropdown) — matches every other dropdown.
function CategorySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const Icon = categoryIcon(value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-[38px] w-full items-center justify-between gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-500/10">
        <span className="flex min-w-0 items-center gap-2 truncate">
          <Icon className="h-4 w-4 shrink-0 text-gray-400" />
          {grievanceCategoryLabel(value)}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
        {GRIEVANCE_CATEGORIES.map((c) => {
          const CIcon = categoryIcon(c.value);
          return (
            <DropdownMenuItem key={c.value} onSelect={() => onChange(c.value)}>
              <Check className={value === c.value ? 'opacity-100' : 'opacity-0'} />
              <CIcon className="text-gray-400" />
              {c.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Segmented Low / Normal / High control.
function PrioritySegment({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts = [
    { v: 'low', l: 'Low' },
    { v: 'normal', l: 'Normal' },
    { v: 'high', l: 'High' },
  ];
  return (
    <div className="inline-flex rounded-lg border border-gray-300 p-0.5 dark:border-gray-700">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
            value === o.v
              ? 'bg-green-600 text-white'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-500/10'
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

// The expanded conversation: description, support/you bubbles, resolution, reply box.
function Conversation({ apiBase, grievanceId }: { apiBase: string; grievanceId: string }) {
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const detail = useQuery({
    queryKey: [apiBase, 'detail', grievanceId],
    queryFn: () => fetchDetail(apiBase, grievanceId),
  });

  const addComment = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'comment', grievanceId, message: comment }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    },
    onSuccess: () => {
      setComment('');
      qc.invalidateQueries({ queryKey: [apiBase, 'detail', grievanceId] });
    },
  });

  if (detail.isLoading || !detail.data) {
    return <p className="px-4 py-4 text-sm text-muted-foreground">Loading conversation…</p>;
  }
  const d = detail.data;

  return (
    <div className="space-y-3 p-4">
      <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 text-sm text-gray-700 dark:text-gray-300">
        {d.grievance.description}
      </p>

      <div className="space-y-2">
        {d.comments.length === 0 ? (
          <p className="text-xs text-muted-foreground">No replies yet — we’ll respond here.</p>
        ) : (
          d.comments.map((c) => {
            const isAdmin = c.author_role === 'admin';
            return (
              <div key={c.id} className={`flex ${isAdmin ? 'justify-start' : 'justify-end'}`}>
                <div
                  className={`max-w-2xl rounded-2xl px-3 py-1.5 text-sm ${
                    isAdmin ? 'rounded-tl-sm bg-muted text-foreground' : 'rounded-tr-sm bg-green-600 text-white'
                  }`}
                >
                  <div className={`mb-0.5 text-[10px] uppercase tracking-wide ${isAdmin ? 'text-muted-foreground' : 'text-green-50/80'}`}>
                    {isAdmin ? 'Support' : 'You'}
                  </div>
                  <p className="whitespace-pre-wrap break-words">{c.message}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {d.grievance.resolution && (
        <div className="flex items-start gap-2 rounded-lg bg-green-50 p-2.5 text-sm text-green-800 dark:bg-green-500/10 dark:text-green-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="whitespace-pre-wrap break-words">
            <span className="font-medium">Resolution:</span> {d.grievance.resolution}
          </span>
        </div>
      )}

      <div className="flex gap-2">
        <Input
          className="flex-1 min-w-0"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Write a reply…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && comment && !addComment.isPending) addComment.mutate();
          }}
        />
        <Button className="shrink-0" onClick={() => addComment.mutate()} disabled={!comment || addComment.isPending}>
          Send
        </Button>
      </div>
    </div>
  );
}

export function PortalGrievances({ apiBase }: { apiBase: string }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: [apiBase, 'list'], queryFn: () => fetchList(apiBase) });
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [category, setCategory] = useState('other');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [linkRoute, setLinkRoute] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiBase, {
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
      qc.invalidateQueries({ queryKey: [apiBase, 'list'] });
    },
  });

  const onView = (g: PortalGrievanceRow) => setOpenId(g.id);
  const columns = useMemo(() => getPortalGrievanceColumns(onView), []);

  useEffect(() => {
    if (openId) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [openId]);

  const grievances = data?.grievances ?? [];
  const selected = openId ? grievances.find((g) => g.id === openId) ?? null : null;
  const isEmpty = !!data && grievances.length === 0;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Grievances</h1>
          <p className="text-sm text-muted-foreground">Raise a transport issue and track its progress.</p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)} className="shrink-0 gap-1.5">
          {showForm ? (
            <>
              <X className="h-4 w-4" /> Cancel
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" /> New grievance
            </>
          )}
        </Button>
      </div>

      {showForm && (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800">
          <h2 className="text-sm font-semibold">Raise a grievance</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <CategorySelect value={category} onChange={setCategory} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
              <div>
                <PrioritySegment value={priority} onChange={setPriority} />
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <textarea
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened?"
            />
          </div>
          {data?.allocatedRouteId && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={linkRoute}
                onChange={(e) => setLinkRoute(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span className="text-muted-foreground">
                Link to my route <span className="font-medium text-foreground">{data.allocatedRouteLabel}</span>
              </span>
            </label>
          )}
          {create.isError && <p className="text-xs text-destructive">{(create.error as Error).message}</p>}
          <div className="flex justify-end">
            <Button disabled={!subject || !description || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? 'Submitting…' : 'Submit grievance'}
            </Button>
          </div>
        </div>
      )}

      {error ? (
        <div className="rounded-xl border border-gray-200 p-4 text-sm text-destructive dark:border-gray-800">
          Could not load grievances.
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 p-10 text-center dark:border-gray-700">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-500/15">
            <MessageSquarePlus className="h-6 w-6" />
          </div>
          <p className="font-medium">No grievances yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Raise one whenever something’s wrong with your transport — a delay, a safety concern, anything.
          </p>
          <Button className="mt-4 gap-1.5" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> New grievance
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={grievances}
          entityName="grievances"
          isLoading={isLoading}
          searchPlaceholder="Search subject, route…"
          filters={[
            {
              columnId: 'status',
              title: 'Status',
              options: [
                { label: 'Open', value: 'open' },
                { label: 'In progress', value: 'in_progress' },
                { label: 'Resolved', value: 'resolved' },
                { label: 'Closed', value: 'closed' },
              ],
            },
            {
              columnId: 'priority',
              title: 'Priority',
              options: [
                { label: 'High', value: 'high' },
                { label: 'Normal', value: 'normal' },
                { label: 'Low', value: 'low' },
              ],
            },
            {
              columnId: 'category',
              title: 'Category',
              options: GRIEVANCE_CATEGORIES.map((c) => ({ label: c.label, value: c.value })),
            },
          ]}
        />
      )}

      {openId && selected && (
        <div ref={panelRef} className="scroll-mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800">
          <div className="flex items-start justify-between gap-3 border-b border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-500/5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-base font-semibold">{selected.subject}</h2>
                <StatusBadge status={selected.status} />
                <PriorityBadge priority={selected.priority} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {grievanceCategoryLabel(selected.category)} · {fmtDate(selected.createdAt)}
                {selected.routeLabel ? ` · ${selected.routeLabel}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpenId(null)}
              aria-label="Close conversation"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <Conversation apiBase={apiBase} grievanceId={openId} />
        </div>
      )}
    </div>
  );
}
