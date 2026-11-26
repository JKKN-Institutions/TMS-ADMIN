import { STATUS_LABEL, type DriverStatus } from '@/lib/drivers/status-rule';

const TONE: Record<DriverStatus, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  on_leave: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400',
};

/** The driver's one status. Inactive is the same flag MyJKKN's employee list shows. */
export function DriverStatusBadge({ status }: { status: DriverStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[status]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {STATUS_LABEL[status]}
    </span>
  );
}
