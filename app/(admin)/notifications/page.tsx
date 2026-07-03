'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Send, Users } from 'lucide-react';
import { DataTable, type DataTableFilter } from '@/components/ui/data-table';
import { usePermissions } from '@/hooks/use-permissions';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_PRIORITIES } from '@/lib/notifications/fields';
import { getNotificationColumns, type NotifRow } from './columns';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

async function fetchList(): Promise<NotifRow[]> {
  const res = await fetch('/api/admin/notifications', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load');
  return (await res.json()).data as NotifRow[];
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-lg font-semibold tabular-nums text-gray-900 dark:text-white">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { can, isLoading: permsLoading } = usePermissions();
  const canView = can(TMS_PERMISSIONS.NOTIFICATIONS_VIEW);
  const canSend = can(TMS_PERMISSIONS.NOTIFICATIONS_SEND);
  const canManage = can(TMS_PERMISSIONS.NOTIFICATIONS_MANAGE);
  const [pendingDelete, setPendingDelete] = useState<NotifRow | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: fetchList,
    enabled: canView,
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/notifications/${id}`, { method: 'DELETE', credentials: 'same-origin' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Delete failed');
    },
    onSuccess: () => {
      toast.success('Notification deleted');
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ['admin-notifications'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Delete failed'),
  });

  const columns = useMemo(
    () =>
      getNotificationColumns(
        (n) => router.push(`/notifications/${n.id}`),
        (n) => setPendingDelete(n),
        canManage,
      ),
    [router, canManage],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'category', title: 'Category', options: NOTIFICATION_CATEGORIES.map((c) => ({ label: c, value: c })) },
    { columnId: 'priority', title: 'Priority', options: NOTIFICATION_PRIORITIES.map((p) => ({ label: p, value: p })) },
  ];

  const totalRecipients = rows.reduce((sum, r) => sum + (r.recipientCount || 0), 0);

  if (!permsLoading && !canView) {
    return <div className="p-6 text-sm text-muted-foreground">You don&apos;t have permission to view notifications.</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Notifications</h1>
          <p className="text-sm text-muted-foreground">Compose and broadcast transport notifications.</p>
        </div>
        {canSend && (
          <button
            type="button"
            onClick={() => router.push('/notifications/new')}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            <Plus className="h-4 w-4" /> Compose
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <StatCard label="Notifications" value={rows.length} icon={Send} />
        <StatCard label="Recipients reached" value={totalRecipients.toLocaleString()} icon={Users} />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        entityName="notifications"
        searchPlaceholder="Search by title…"
        filters={filters}
        getRowId={(r) => r.id}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
        title="Delete notification?"
        description={
          pendingDelete
            ? `"${pendingDelete.title ?? 'This notification'}" and its delivery records will be permanently removed. This can't be undone.`
            : undefined
        }
        confirmLabel="Delete"
        danger
        loading={del.isPending}
        onConfirm={() => pendingDelete && del.mutate(pendingDelete.id)}
      />
    </div>
  );
}
