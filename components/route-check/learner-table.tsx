import { Fragment } from 'react';
import { CHECK_OUTCOME_META } from '@/lib/route-check/outcome-meta';
import type { CheckLearnerRow } from '@/lib/route-check/types';
import { FeeMarkChip, BookingMarkChip } from './marks';

/** '07:30:00' → '07:30'. */
export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

const ATTENDANCE: Record<CheckLearnerRow['status'], { label: string; cls: string }> = {
  present: { label: 'Present', cls: 'text-green-700 dark:text-green-400' },
  absent: { label: 'Absent', cls: 'text-red-700 dark:text-red-400' },
  unmarked: { label: 'Not marked', cls: 'text-gray-400 dark:text-gray-500' },
};

const th = 'px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';
const td = 'px-3 py-2.5 align-middle';

/**
 * Riders as a table (tablet/desktop). Same rows and stop grouping as the phone
 * list, with a labelled column for each fact instead of a row of unlabelled chips.
 */
export function LearnerTable({
  groups,
}: {
  groups: { stopName: string; stopTime: string | null; rows: CheckLearnerRow[] }[];
}) {
  if (groups.length === 0) {
    return <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">No riders match this filter.</p>;
  }
  let n = 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
          <tr>
            <th className={`${th} w-12`}>#</th>
            <th className={th}>Learner</th>
            <th className={th}>Roll no.</th>
            <th className={th}>Attendance</th>
            <th className={th}>Booking</th>
            <th className={th}>Fee</th>
            <th className={`${th} text-right`}>Owed</th>
            <th className={th}>Checked</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={`${g.stopName}-${g.rows[0]?.learnerId ?? ''}`}>
              <tr className="border-b border-gray-100 bg-gray-50/60 dark:border-gray-800 dark:bg-gray-800/30">
                <td colSpan={8} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                  {g.stopName}
                  {g.stopTime && <span className="ml-2 font-normal normal-case text-gray-500 dark:text-gray-400">{hhmm(g.stopTime)}</span>}
                  <span className="ml-2 font-normal normal-case text-gray-400 dark:text-gray-500">· {g.rows.length}</span>
                </td>
              </tr>
              {g.rows.map((r) => {
                n += 1;
                const att = ATTENDANCE[r.status];
                return (
                  <tr key={r.learnerId} className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/40">
                    <td className={`${td} tabular-nums text-gray-400 dark:text-gray-500`}>{n}</td>
                    <td className={`${td} min-w-0`}>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{r.name}</p>
                      {r.notOnRoute && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">Boarded from bus {r.otherBus?.routeNumber ?? '—'}</p>
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap text-gray-600 dark:text-gray-300`}>{r.roll ?? '—'}</td>
                    <td className={`${td} whitespace-nowrap font-medium ${att.cls}`}>{att.label}</td>
                    <td className={td}><BookingMarkChip mark={r.bookingMark} /></td>
                    <td className={td}><FeeMarkChip mark={r.feeMark} /></td>
                    <td className={`${td} whitespace-nowrap text-right tabular-nums`}>
                      {r.feeMark === 'unpaid' && r.feeOwed != null ? (
                        <span className="font-semibold text-red-700 dark:text-red-300">₹{r.feeOwed.toLocaleString('en-IN')}</span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">—</span>
                      )}
                    </td>
                    <td className={td}>
                      {r.checked && r.checkOutcome ? (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${CHECK_OUTCOME_META[r.checkOutcome].chip}`}>
                          ✓ {CHECK_OUTCOME_META[r.checkOutcome].label}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">Not yet</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
