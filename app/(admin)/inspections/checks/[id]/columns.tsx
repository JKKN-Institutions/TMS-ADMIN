'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { FeeMarkChip, BookingMarkChip } from '@/components/route-check/marks';
import { FINE_NOTE_LABEL, ruleNote, type FineNote, type FineRule } from '@/lib/route-check/fine-rules';
import type { CheckFineSummary, CheckReportPerson } from '../../inspection-api';

export const OUTCOME_LABEL: Record<string, string> = {
  ok: 'OK',
  not_on_route: 'Not on this route',
  no_booking: 'No booking',
  fee_unpaid: 'Fee unpaid',
  unknown_card: 'Unknown card',
  manual: 'Manual entry',
};

/** fine_note is space-separated `<rule>:<note>` parts, or the single word 'fines_off' / 'error'. */
function fineNoteLabels(note: string | null): string[] {
  if (!note) return [];
  return note
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(':');
      const key = idx >= 0 ? part.slice(idx + 1) : part;
      return FINE_NOTE_LABEL[key as FineNote] ?? part;
    });
}

/**
 * One fine on the report: its amount and live status. Read-only — a fine is
 * cancelled by cancelling its bill in MyJKKN with a supporting document, never
 * from here (the bill-cancellation guard must not be bypassed).
 *
 * A row can carry a fine this check did NOT raise: when the learner was already
 * fined (an earlier check, or the 48h sweep for the fee rule) the existing fine's
 * id is stored for reference. That one is shown muted as "earlier".
 */
function FineChip({ label, rule, fineNote, fineId, fine }: {
  label: string; rule: FineRule; fineNote: string | null; fineId: string | null; fine: CheckFineSummary | null;
}) {
  if (!fineId) return null;
  const raisedHere = ruleNote(fineNote, rule) === 'raised';
  const cancelled = fine?.status === 'cancelled';
  const tone = cancelled
    ? 'bg-gray-100 text-gray-500 line-through dark:bg-gray-800 dark:text-gray-400'
    : raisedHere
      ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  const detail = fine ? `₹${fine.amount.toLocaleString('en-IN')} · ${fine.status}` : 'status unavailable';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {raisedHere ? label : `Earlier ${label.toLowerCase()}`} · {detail}
    </span>
  );
}

// Read-only report table. `outcome` carries id + accessorFn + filterFn so the
// page's Outcome dropdown binds to it.
export function getCheckPeopleColumns(): ColumnDef<CheckReportPerson>[] {
  return [
    {
      id: 'person',
      meta: { label: 'Person' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Person" />,
      accessorFn: (p) => `${p.name ?? '—'} ${p.code ?? ''}`.trim(),
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900 dark:text-gray-100">{row.original.name ?? '—'}</p>
          {row.original.code && <p className="truncate text-xs text-gray-500 dark:text-gray-400">{row.original.code}</p>}
        </div>
      ),
    },
    {
      id: 'fee',
      meta: { label: 'Fee' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fee" />,
      accessorFn: (p) => p.feeState ?? '',
      enableGlobalFilter: false,
      size: 120,
      cell: ({ row }) => <FeeMarkChip mark={row.original.feeState} />,
    },
    {
      id: 'booking',
      meta: { label: 'Booking' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Booking" />,
      accessorFn: (p) => p.bookingState ?? '',
      enableGlobalFilter: false,
      size: 120,
      cell: ({ row }) => <BookingMarkChip mark={row.original.bookingState} />,
    },
    {
      id: 'outcome',
      meta: { label: 'Outcome' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Outcome" />,
      accessorFn: (p) => p.outcome,
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => (
        <span className="text-gray-700 dark:text-gray-300">{OUTCOME_LABEL[row.original.outcome] ?? row.original.outcome}</span>
      ),
    },
    {
      id: 'fines',
      meta: { label: 'Fines' },
      header: () => <span>Fines</span>,
      enableSorting: false,
      enableGlobalFilter: false,
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <FineChip label="Fee fine" rule="fee" fineNote={p.fineNote} fineId={p.feeFineId} fine={p.feeFine} />
            <FineChip label="Booking fine" rule="booking" fineNote={p.fineNote} fineId={p.bookingFineId} fine={p.bookingFine} />
            {fineNoteLabels(p.fineNote).map((label, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                {label}
              </span>
            ))}
          </div>
        );
      },
    },
  ];
}
