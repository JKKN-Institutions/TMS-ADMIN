import { CHECK_OUTCOME_META } from '@/lib/route-check/outcome-meta';
import type { CheckStaffRow } from '@/lib/route-check/types';

export function StaffFeeChip({ row }: { row: CheckStaffRow }) {
  if (row.isIncharge || row.feeState === 'exempt') {
    return <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">Exempt</span>;
  }
  if (row.feeState === 'paid' || row.feeState === 'override') {
    return <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">Paid</span>;
  }
  if (row.feeState === 'unpaid') {
    return (
      <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
        Unpaid{row.feeOwed != null ? ` ₹${row.feeOwed}` : ''}
      </span>
    );
  }
  if (row.feeState === 'none') {
    return <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">No bill</span>;
  }
  return <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">—</span>;
}

function StaffRow({ row }: { row: CheckStaffRow }) {
  const outcomeLabel = row.checkOutcome ? CHECK_OUTCOME_META[row.checkOutcome].label : undefined;
  return (
    <li className="flex min-w-0 items-center justify-between gap-2 py-2">
      <span className="flex min-w-0 items-center gap-2">
        <span
          title={outcomeLabel}
          className={
            row.checked
              ? 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-600 text-[11px] font-bold text-white'
              : 'h-5 w-5 shrink-0 rounded-full border-2 border-gray-300 dark:border-gray-700'
          }
        >
          {row.checked ? '✓' : ''}
        </span>
        <span className="min-w-0 truncate text-sm">
          <span className="font-medium text-gray-900 dark:text-gray-100">{row.name}</span>
          {row.code && <span className="text-gray-500 dark:text-gray-400"> · {row.code}</span>}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {row.isIncharge && (
          <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">In-charge</span>
        )}
        <StaffFeeChip row={row} />
      </span>
    </li>
  );
}

export function StaffList({ rows }: { rows: CheckStaffRow[] }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">No staff on this route.</p>;
  }
  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
      {rows.map((r) => (
        <StaffRow key={r.staffId} row={r} />
      ))}
    </ul>
  );
}
