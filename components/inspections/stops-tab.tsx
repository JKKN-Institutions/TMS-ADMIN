import type { Leg } from '@/lib/inspections/overview';
import type { InspectionOverview } from '@/lib/inspections/types';
import { fmtTime } from '@/lib/inspections/format';

export function StopsTab({ stops, leg, riderCounts }: {
  stops: InspectionOverview['stops'];
  leg: Leg;
  riderCounts?: Map<string, { booked: number; boarded: number }>;
}) {
  if (!stops.length) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No stops recorded for this route</p>;
  }
  return (
    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
      {stops.map((s) => {
        const time = leg === 'onward' ? s.morning : s.evening;
        const otherTime = leg === 'onward' ? s.evening : s.morning;
        const counts = riderCounts?.get(s.id);
        return (
          <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
            <span className="w-6 shrink-0 text-sm text-gray-400 dark:text-gray-500">{s.order ?? '—'}.</span>
            <span className={`min-w-0 flex-1 truncate text-sm ${s.major ? 'font-bold' : ''}`}>
              {s.name}
              {s.major && (
                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  major
                </span>
              )}
            </span>
            <span className="shrink-0 text-sm">
              {fmtTime(time)}
              {otherTime && <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">({fmtTime(otherTime)})</span>}
            </span>
            {counts && (
              <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                {counts.boarded}/{counts.booked} boarded
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
