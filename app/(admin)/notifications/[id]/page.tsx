'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { CategoryBadge, PriorityBadge } from '../columns';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface DetailRecipient {
  userId: string;
  email: string | null;
  readAt: string | null;
}
interface Detail {
  id: string;
  title: string | null;
  body: string | null;
  url: string | null;
  category: string | null;
  priority: string | null;
  audience: string;
  createdAt: string;
  sentAt: string | null;
  expiresAt: string | null;
  stats: { recipients: number; reads: number; readPercent: number };
  recipients: DetailRecipient[];
}

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : '—');

const cardCls = 'rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900';
const eyebrowCls = 'text-[11px] font-semibold uppercase tracking-wider text-gray-400';

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-800 dark:text-gray-200">{children}</dd>
    </div>
  );
}

export default function NotificationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { can } = usePermissions();
  const canManage = can(TMS_PERMISSIONS.NOTIFICATIONS_MANAGE);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-notification', id],
    queryFn: async (): Promise<Detail> => {
      const res = await fetch(`/api/admin/notifications/${id}`, { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
      return (await res.json()).data as Detail;
    },
  });

  const del = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/notifications/${id}`, { method: 'DELETE', credentials: 'same-origin' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Delete failed');
    },
    onSuccess: () => {
      toast.success('Notification deleted');
      router.push('/notifications');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Delete failed'),
  });

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => router.push('/notifications')}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-4 w-4" /> Back to notifications
      </button>

      {isLoading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : error || !data ? (
        <div className="text-destructive">Could not load this notification.</div>
      ) : (
        <>
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white break-words">{data.title || '(untitled)'}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <CategoryBadge category={data.category} />
              <PriorityBadge priority={data.priority} />
              <span className="text-xs text-muted-foreground">Sent {fmt(data.sentAt || data.createdAt)}</span>
            </div>
          </div>

          {/* Workspace: message + recipients (left) · delivery results (right, sticky) */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            {/* LEFT */}
            <div className="space-y-6">
              <section className={`${cardCls} p-6`}>
                <span className={eyebrowCls}>Message</span>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                  {data.body}
                </p>
                {data.url && (
                  <p className="mt-4 text-xs text-muted-foreground">
                    Links to <span className="font-mono text-gray-600 dark:text-gray-300">{data.url}</span>
                  </p>
                )}
              </section>

              <section className={cardCls}>
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 dark:border-gray-800">
                  <span className={eyebrowCls}>Recipients</span>
                  <span className="text-xs text-gray-400">
                    {data.recipients.length < data.stats.recipients
                      ? `showing ${data.recipients.length} of ${data.stats.recipients.toLocaleString()}`
                      : `${data.stats.recipients.toLocaleString()} total`}
                  </span>
                </div>
                <div className="max-h-[28rem] divide-y divide-gray-50 overflow-y-auto dark:divide-gray-800">
                  {data.recipients.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-muted-foreground">No recipients.</p>
                  ) : (
                    data.recipients.map((r) => (
                      <div key={r.userId} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                        <span className="truncate text-gray-700 dark:text-gray-200">{r.email ?? r.userId}</span>
                        {r.readAt ? (
                          <span className="shrink-0 text-xs font-medium text-green-600 dark:text-green-400">Read · {fmt(r.readAt)}</span>
                        ) : (
                          <span className="shrink-0 text-xs text-gray-400">Unread</span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            {/* RIGHT — delivery results (sticky) */}
            <aside className="space-y-4 self-start lg:sticky lg:top-4">
              <section className={`${cardCls} p-5`}>
                <span className={eyebrowCls}>Delivery</span>

                {/* Read-rate hero */}
                <div className="mt-3 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 px-4 py-5 text-center dark:from-green-500/10 dark:to-emerald-500/[0.04]">
                  <div className="text-3xl font-bold tabular-nums text-green-700 dark:text-green-400">{data.stats.readPercent}%</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {data.stats.reads.toLocaleString()} of {data.stats.recipients.toLocaleString()} read
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-green-100 dark:bg-green-500/20">
                    <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${data.stats.readPercent}%` }} />
                  </div>
                </div>

                {/* Meta */}
                <dl className="mt-4 divide-y divide-gray-50 dark:divide-gray-800">
                  <MetaRow label="Recipients">{data.stats.recipients.toLocaleString()}</MetaRow>
                  <MetaRow label="Read">{data.stats.reads.toLocaleString()}</MetaRow>
                  <MetaRow label="Audience">{data.audience}</MetaRow>
                  <MetaRow label="Category"><CategoryBadge category={data.category} /></MetaRow>
                  <MetaRow label="Priority"><PriorityBadge priority={data.priority} /></MetaRow>
                  <MetaRow label="Sent">{fmt(data.sentAt || data.createdAt)}</MetaRow>
                  {data.expiresAt && <MetaRow label="Expires">{fmt(data.expiresAt)}</MetaRow>}
                </dl>
              </section>

              {canManage && (
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" /> Delete notification
                </button>
              )}
            </aside>
          </div>

          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Delete notification?"
            description="This permanently removes the notification and its delivery records. This can't be undone."
            confirmLabel="Delete"
            danger
            loading={del.isPending}
            onConfirm={() => del.mutate()}
          />
        </>
      )}
    </div>
  );
}
