import { formatStopTime } from '@/lib/driver/format';

export interface TimetableStop {
  id: string;
  name: string;
  time: string | null; // morning (inbound, to-college) pickup
  eveningTime: string | null; // evening (outbound, from-college) drop
  order: number | null;
  isMajor: boolean | null;
}

/**
 * Ordered stop list with both the morning pickup and evening drop times. Shared by
 * the driver dashboard and the My Routes page so the timetable looks identical everywhere.
 */
export function RouteTimetable({ stops }: { stops: TimetableStop[] }) {
  if (stops.length === 0) {
    return <p className="text-muted-foreground">No stops configured for this route yet.</p>;
  }
  return (
    <ol className="divide-y divide-border">
      {stops.map((s, i) => (
        <li key={s.id} className="flex items-center gap-3 py-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
            {s.order ?? i + 1}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">
            {s.name}
            {s.isMajor && (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                Major
              </span>
            )}
          </span>
          <span className="shrink-0 text-right tabular-nums text-muted-foreground">
            <span className="block">
              <span className="mr-1 text-[10px] uppercase tracking-wide text-gray-400">Morning</span>
              {formatStopTime(s.time)}
            </span>
            <span className="block">
              <span className="mr-1 text-[10px] uppercase tracking-wide text-gray-400">Evening</span>
              {formatStopTime(s.eveningTime)}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
