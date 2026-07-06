'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { DetailPageHeader, SectionCard, Field } from '@/components/ui/detail-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/hooks/use-permissions';
import { categoryLabel, PORTAL_LABEL, type BugReportDetail } from '@/lib/bug-reports/shared';
import { StatusBadge, PriorityBadge, PortalBadge } from '../columns';

const crumbs = (name: string) => [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Bug Reports', href: '/bug-reports' },
  { label: name },
];

const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleString() : '—');

async function fetchDetail(id: string): Promise<BugReportDetail> {
  const res = await fetch(`/api/admin/bug-reports?id=${encodeURIComponent(id)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load');
  return (await res.json()).data as BugReportDetail;
}

// console_logs is an arbitrary JSON blob — render it defensively.
function stringifyLogs(logs: unknown): string {
  if (logs == null) return '';
  if (typeof logs === 'string') return logs;
  try {
    return JSON.stringify(logs, null, 2);
  } catch {
    return String(logs);
  }
}

export default function BugReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); // Next 15/16: params is a Promise
  const qc = useQueryClient();
  const { can, isSuperAdmin } = usePermissions();
  const canReply = isSuperAdmin || can('tms.settings.manage');
  const [reply, setReply] = useState('');

  // Same query key the list uses for detail → served from cache on navigation.
  const { data: d, isLoading, isError } = useQuery({
    queryKey: ['admin-bug-report', id],
    queryFn: () => fetchDetail(id),
  });

  const sendReply = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/bug-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id, message: reply }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
    },
    onSuccess: () => {
      setReply('');
      qc.invalidateQueries({ queryKey: ['admin-bug-report', id] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6 p-4">
        <DetailPageHeader crumbs={crumbs('Loading…')} backHref="/bug-reports" title="Loading…" />
        <div className="h-40 animate-pulse rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900" />
      </div>
    );
  }

  if (isError || !d) {
    return (
      <div className="space-y-6 p-4">
        <DetailPageHeader crumbs={crumbs('Not found')} backHref="/bug-reports" title="Bug report not found" />
        <p className="text-gray-600 dark:text-gray-300">
          This bug report could not be loaded.{' '}
          <Link href="/bug-reports" className="text-green-600 hover:underline">
            Back to bug reports
          </Link>
        </p>
      </div>
    );
  }

  const logs = stringifyLogs(d.consoleLogs);

  return (
    <div className="space-y-6 p-4">
      <DetailPageHeader
        crumbs={crumbs(d.title)}
        backHref="/bug-reports"
        title={d.title}
        subtitle={`${categoryLabel(d.category)} · ${d.reporterName} · ${fmt(d.createdAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PortalBadge portal={d.portal} />
            <StatusBadge status={d.status} />
            <PriorityBadge priority={d.priority} />
          </div>
        }
      />

      <SectionCard title="Report">
        <div className="space-y-4">
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</div>
            <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 text-sm text-gray-700 dark:text-gray-300">
              {d.description || '—'}
            </p>
          </div>
          {d.screenshotUrl && (
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Screenshot</div>
              <a href={d.screenshotUrl} target="_blank" rel="noopener noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={d.screenshotUrl}
                  alt="Bug screenshot"
                  className="max-h-96 w-full rounded-lg border border-gray-200 object-contain dark:border-gray-700"
                />
              </a>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Context">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Portal" value={<span>{PORTAL_LABEL[d.portal]}</span>} />
          <Field label="Category" value={categoryLabel(d.category)} />
          <Field label="Priority" value={<PriorityBadge priority={d.priority} />} />
          <Field label="Status" value={<StatusBadge status={d.status} />} />
          <Field label="Reporter" value={d.reporterName} />
          <Field label="Email" value={d.reporterEmail} />
          <Field label="Reported" value={fmt(d.createdAt)} />
          <Field label="Updated" value={fmt(d.updatedAt)} />
          <Field
            label="Reported from"
            value={
              d.pageUrl ? (
                <a
                  href={d.pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1 truncate text-green-600 hover:underline"
                  title={d.pageUrl}
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{d.pageUrl}</span>
                </a>
              ) : null
            }
          />
        </div>
      </SectionCard>

      <SectionCard title="Conversation">
        <div className="space-y-3">
          <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            {d.messages.length === 0 && <p className="text-xs text-muted-foreground">No messages yet.</p>}
            {d.messages.map((m) => (
              <div key={m.id}>
                <span className="text-[10px] uppercase text-muted-foreground">
                  {m.author} · {fmt(m.createdAt)}
                </span>
                <p className="whitespace-pre-wrap break-words rounded-md bg-muted px-2 py-1 text-sm">{m.message}</p>
              </div>
            ))}
          </div>
          {canReply && (
            <div className="flex gap-2">
              <Input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Reply to reporter…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && reply && !sendReply.isPending) sendReply.mutate();
                }}
              />
              <Button onClick={() => sendReply.mutate()} disabled={!reply || sendReply.isPending}>
                Send
              </Button>
            </div>
          )}
          {sendReply.isError && <p className="text-xs text-destructive">{(sendReply.error as Error).message}</p>}
        </div>
      </SectionCard>

      {logs && (
        <SectionCard title="Console logs">
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-3 text-[11px] leading-relaxed text-gray-700 dark:text-gray-300">
            {logs}
          </pre>
        </SectionCard>
      )}
    </div>
  );
}
