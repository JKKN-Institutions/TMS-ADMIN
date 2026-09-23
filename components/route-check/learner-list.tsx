import { CHECK_OUTCOME_META } from '@/lib/route-check/outcome-meta';
import type { CheckLearnerRow } from '@/lib/route-check/types';
import { FeeMarkChip, BookingMarkChip } from './marks';

function LearnerRow({ row }: { row: CheckLearnerRow }) {
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
          {row.roll && <span className="text-gray-500 dark:text-gray-400"> · {row.roll}</span>}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {row.status === 'present' && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" title="Present" />}
        {row.notOnRoute && (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            From bus {row.otherBus?.routeNumber ?? '—'}
          </span>
        )}
        <BookingMarkChip mark={row.bookingMark} />
        <FeeMarkChip mark={row.feeMark} />
        {row.feeMark === 'unpaid' && row.feeOwed != null && (
          <span className="shrink-0 text-xs text-red-700 dark:text-red-300">₹{row.feeOwed}</span>
        )}
      </span>
    </li>
  );
}

export function LearnerList({
  groups,
  onTap,
}: {
  groups: { stopName: string; stopTime: string | null; rows: CheckLearnerRow[] }[];
  onTap?: (row: CheckLearnerRow) => void;
}) {
  // onTap is reserved for a future manual-select flow; the list itself is display-only for now (a tick needs a scan).
  void onTap;
  if (groups.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">No riders match this filter.</p>;
  }
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={`${g.stopName}-${g.rows[0]?.learnerId ?? ''}`} className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {g.stopName}
            {g.stopTime && <span className="font-normal normal-case"> · {g.stopTime}</span>}
          </p>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {g.rows.map((r) => (
              <LearnerRow key={r.learnerId} row={r} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
