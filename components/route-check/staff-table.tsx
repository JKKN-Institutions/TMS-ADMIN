import { CHECK_OUTCOME_META } from '@/lib/route-check/outcome-meta';
import type { CheckStaffRow } from '@/lib/route-check/types';
import { StaffFeeChip } from './staff-list';

const th = 'px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';
const td = 'px-3 py-2.5 align-middle';

/** Staff riders + the route's in-charges as a table (tablet/desktop). */
export function StaffTable({ rows }: { rows: CheckStaffRow[] }) {
  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">No staff on this route.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
          <tr>
            <th className={`${th} w-12`}>#</th>
            <th className={th}>Staff</th>
            <th className={th}>Staff ID</th>
            <th className={th}>Role on bus</th>
            <th className={th}>Fee</th>
            <th className={th}>Checked</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.staffId} className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/40">
              <td className={`${td} tabular-nums text-gray-400 dark:text-gray-500`}>{i + 1}</td>
              <td className={td}>
                <p className="font-medium text-gray-900 dark:text-gray-100">{r.name}</p>
                {r.designation && <p className="text-xs text-gray-500 dark:text-gray-400">{r.designation}</p>}
              </td>
              <td className={`${td} whitespace-nowrap text-gray-600 dark:text-gray-300`}>{r.code ?? '—'}</td>
              <td className={td}>
                {r.isIncharge ? (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">In-charge</span>
                ) : (
                  <span className="text-xs text-gray-500 dark:text-gray-400">Rider</span>
                )}
              </td>
              <td className={td}><StaffFeeChip row={r} /></td>
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
