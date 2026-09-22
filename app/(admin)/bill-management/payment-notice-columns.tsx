'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { PaymentNoticeRow } from '@/app/api/admin/fees/payment-notices/route';

const STATUS_STYLE: Record<PaymentNoticeRow['status'], string> = {
  running: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  fined: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const ist = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function timeLeft(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

export function paymentNoticeColumns(): ColumnDef<PaymentNoticeRow>[] {
  return [
    { accessorKey: 'person_name', header: 'Learner' },
    { accessorKey: 'roll_number', header: 'Roll no.', cell: ({ row }) => row.original.roll_number ?? '—' },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[row.original.status]}`}>
          {row.original.status}
        </span>
      ),
    },
    { accessorKey: 'started_at', header: 'Started', cell: ({ row }) => ist(row.original.started_at) },
    { accessorKey: 'expires_at', header: 'Deadline', cell: ({ row }) => ist(row.original.expires_at) },
    {
      id: 'left',
      header: 'Time left',
      cell: ({ row }) => (row.original.status === 'running' ? timeLeft(row.original.expires_at) : '—'),
    },
    { id: 'reminded', header: 'Reminded', cell: ({ row }) => (row.original.reminder_sent_at ? 'Yes' : 'No') },
  ];
}
