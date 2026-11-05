import { BedDouble, UserRound } from 'lucide-react';
import { isOffRosterRider, RIDER_KIND_LABEL, type RiderKind } from '@/lib/attendance/rider-kind';

/**
 * "Hostel" / "Irregular" pill for a rider who is not registered for transport
 * but was recorded on this bus. Renders nothing for a transport rider, so it
 * can be dropped into any row unconditionally.
 */
export function RiderKindBadge({ kind }: { kind: RiderKind | null | undefined }) {
  if (!isOffRosterRider(kind)) return null;
  const Icon = kind === 'hosteller' ? BedDouble : UserRound;
  return (
    <span
      title="Not registered for transport — recorded when scanned on this bus"
      className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
    >
      <Icon className="h-3 w-3 shrink-0" /> {RIDER_KIND_LABEL[kind]}
    </span>
  );
}
