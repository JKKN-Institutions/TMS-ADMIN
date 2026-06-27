'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, CheckCircle2, ChevronDown, Clock, MessageSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/ui/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePermissions } from '@/hooks/use-permissions';
import { GRIEVANCE_CATEGORIES, grievanceCategoryLabel } from '@/lib/grievances/categories';
import { getGrievanceColumns, PriorityBadge, StatusBadge, type GrievanceRow } from './columns';

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

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

async function fetchList(): Promise<GrievanceRow[]> {
  const res = await fetch('/api/admin/transport-grievances', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
  return (await res.json()).data as GrievanceRow[];
}
async function fetchDetail(id: string): Promise<Detail> {
  const res = await fetch(`/api/admin/transport-grievances?id=${id}`, { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error('Failed');
  return (await res.json()).data as Detail;
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: typeof MessageSquare;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-2xl font-semibold leading-none text-gray-900 dark:text-gray-100">{value}</div>
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{label}</div>
      </div>
    </div>
  );
}

// Styled status picker — matches the app's Radix dropdown style (rounded border,
// chevron trigger, green-hover items with a check on the active one) used by the
// table filters, instead of the unstyleable native <select> popup.
function StatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const current = STATUS_OPTIONS.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className="mt-1 inline-flex h-[38px] w-full items-center justify-between gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-500/10"
      >
        <span className="truncate">{current?.label ?? value.replace('_', ' ')}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
        {STATUS_OPTIONS.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => onChange(o.value)}>
            <Check className={value === o.value ? 'opacity-100' : 'opacity-0'} /> {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function GrievancesPage() {
  const qc = useQueryClient();
  const { can, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || can('tms.grievances.manage');

  const { data: list = [], isLoading, error } = useQuery({ queryKey: ['admin-grievances'], queryFn: fetchList });
  const [openId, setOpenId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [resolution, setResolution] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  const detail = useQuery({
    queryKey: ['admin-grievance', openId],
    queryFn: () => fetchDetail(openId!),
    enabled: !!openId,
  });

  // Bring the inline panel into view when a grievance is selected.
  useEffect(() => {
    if (openId) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [openId]);

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

  // Status / resolution update keyed by an explicit grievanceId, so it serves
  // both the inline panel and the table's per-row quick actions.
  const updateStatus = useMutation({
    mutationFn: async (payload: { grievanceId: string; status?: string; resolution?: string }) => {
      const res = await fetch('/api/admin/transport-grievances', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    },
    onSuccess: (_d, payload) => {
      if (payload.resolution !== undefined) setResolution('');
      qc.invalidateQueries({ queryKey: ['admin-grievance', payload.grievanceId] });
      qc.invalidateQueries({ queryKey: ['admin-grievances'] });
    },
  });

  const onView = (g: GrievanceRow) => {
    setOpenId(g.id);
    setResolution('');
    setComment('');
  };
  const onSetStatus = (g: GrievanceRow, status: string) => updateStatus.mutate({ grievanceId: g.id, status });

  const columns = useMemo(
    () => getGrievanceColumns(onView, onSetStatus, canManage),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage]
  );

  const stats = useMemo(
    () => ({
      total: list.length,
      open: list.filter((g) => g.status === 'open').length,
      inProgress: list.filter((g) => g.status === 'in_progress').length,
      resolved: list.filter((g) => g.status === 'resolved').length,
    }),
    [list]
  );

  // Header meta shows instantly from the already-loaded list row; the detail
  // query then fills in the description, conversation and live status below.
  const selected = openId ? list.find((g) => g.id === openId) ?? null : null;
  const g = detail.data?.grievance;
  const headerSubject = selected?.subject ?? g?.subject ?? 'Grievance';
  const headerStatus = g?.status ?? selected?.status;
  const headerPriority = g?.priority ?? selected?.priority;
  const headerCategory = g?.category ?? selected?.category ?? 'other';
  const headerCreated = g?.created_at ?? selected?.createdAt;
  const headerLearner = detail.data?.learner
    ? `${detail.data.learner.first_name ?? ''} ${detail.data.learner.last_name ?? ''}`.trim()
    : selected?.learnerName ?? '';

  if (error) return <div className="p-4 text-destructive">{(error as Error).message}</div>;

  return (
    <div className="space-y-5 p-4">
      <div>
        <h1 className="text-xl font-semibold">Transport Grievances</h1>
        <p className="text-sm text-muted-foreground">Review, respond to and resolve learner transport grievances.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total" value={stats.total} icon={MessageSquare} accent="bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300" />
        <StatCard label="Open" value={stats.open} icon={AlertCircle} accent="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" />
        <StatCard label="In progress" value={stats.inProgress} icon={Clock} accent="bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" />
        <StatCard label="Resolved" value={stats.resolved} icon={CheckCircle2} accent="bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" />
      </div>

      <DataTable
        columns={columns}
        data={list}
        entityName="grievances"
        isLoading={isLoading}
        searchPlaceholder="Search subject, learner, roll…"
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

      {/* Inline detail panel — replaces the old popup modal. Renders within the
          page, below the table, when a grievance is selected. */}
      {openId && (
        <div ref={panelRef} className="scroll-mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-start justify-between gap-3 border-b border-gray-200 bg-gray-50 p-4 dark:bg-gray-500/5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">{headerSubject}</h2>
                <StatusBadge status={headerStatus} />
                <PriorityBadge priority={headerPriority} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {grievanceCategoryLabel(headerCategory)}
                {headerLearner ? ` · ${headerLearner}` : ''}
                {selected?.routeLabel ? ` · ${selected.routeLabel}` : ''}
                {headerCreated ? ` · ${new Date(headerCreated).toLocaleDateString()}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpenId(null)}
              aria-label="Close details"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {detail.isLoading || !detail.data ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="grid gap-5 p-4 lg:grid-cols-3">
              {/* Main column: description + conversation + reply */}
              <div className="space-y-4 lg:col-span-2">
                <div>
                  <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</h3>
                  <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 text-sm text-gray-700 dark:text-gray-300">
                    {detail.data.grievance.description}
                  </p>
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Conversation</h3>
                  <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-3">
                    {detail.data.comments.length === 0 && (
                      <p className="text-xs text-muted-foreground">No messages yet.</p>
                    )}
                    {detail.data.comments.map((c) => (
                      <div key={c.id} className={c.author_role === 'admin' ? 'pl-6' : 'pr-6'}>
                        <span className="text-[10px] uppercase text-muted-foreground">{c.author_role}</span>
                        <p
                          className={`whitespace-pre-wrap break-words rounded-md px-2 py-1 text-sm ${
                            c.author_role === 'admin' ? 'bg-primary/10' : 'bg-muted'
                          }`}
                        >
                          {c.message}
                        </p>
                      </div>
                    ))}
                  </div>
                  {canManage && (
                    <div className="mt-2 flex gap-2">
                      <Input
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Reply to learner…"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && comment && !addComment.isPending) addComment.mutate();
                        }}
                      />
                      <Button onClick={() => addComment.mutate()} disabled={!comment || addComment.isPending}>
                        Send
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Side column: status control + resolution */}
              <div className="space-y-4">
                {canManage && (
                  <div className="rounded-lg border border-gray-200 p-3">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</label>
                    <StatusSelect
                      value={detail.data.grievance.status}
                      onChange={(v) => updateStatus.mutate({ grievanceId: openId, status: v })}
                      disabled={updateStatus.isPending}
                    />
                  </div>
                )}

                <div className="rounded-lg border border-gray-200 p-3">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resolution</label>
                  {detail.data.grievance.resolution && (
                    <p className="mt-1 whitespace-pre-wrap break-words rounded-md bg-green-50 px-2 py-1 text-xs text-green-700 dark:bg-green-500/10 dark:text-green-300">
                      {detail.data.grievance.resolution}
                    </p>
                  )}
                  {canManage && (
                    <div className="mt-2 space-y-2">
                      <Input
                        value={resolution}
                        onChange={(e) => setResolution(e.target.value)}
                        placeholder="Resolution summary"
                      />
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => updateStatus.mutate({ grievanceId: openId, status: 'resolved', resolution })}
                        disabled={!resolution || updateStatus.isPending}
                      >
                        Mark resolved
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
