'use client';

import { monthDays } from '@/lib/attendance/month-summary';
import { cn } from '@/lib/utils';

export interface CalendarTrip {
  tripDate: string;
  direction: string;
  status: string;
  method: string | null;
}

type Mark = 'present' | 'absent' | 'auto' | null;

function markOf(t: CalendarTrip | undefined): Mark {
  if (!t) return null;
  if (t.status === 'present') return 'present';
  if (t.status === 'absent') return t.method === 'auto' ? 'auto' : 'absent';
  return null;
}

const MARK_CLASS: Record<Exclude<Mark, null>, string> = {
  present: 'bg-green-500 text-white',
  absent: 'bg-red-500 text-white',
  auto: 'bg-slate-300 text-slate-700 dark:bg-slate-600 dark:text-slate-100',
};
const MARK_TEXT: Record<Exclude<Mark, null>, string> = {
  present: 'present',
  absent: 'absent',
  auto: 'not marked (auto-absent)',
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * One month as a Monday-first calendar. Each day shows two chips: M (morning,
 * onward) and E (evening, return) — green present, red absent, grey auto-absent
 * (nobody marked the bus before the window closed), empty = no record.
 */
export function MonthCalendar({ month, trips }: { month: string; trips: CalendarTrip[] }) {
  const byKey = new Map(trips.map((t) => [`${t.tripDate}|${t.direction}`, t] as const));
  const days = monthDays(month);
  // getUTCDay: 0 = Sunday. Monday-first offset.
  const lead = (new Date(`${days[0]}T00:00:00Z`).getUTCDay() + 6) % 7;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
        {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => <div key={`pad-${i}`} />)}
        {days.map((d) => {
          const isSunday = new Date(`${d}T00:00:00Z`).getUTCDay() === 0;
          const legs: [string, Mark][] = [
            ['M', markOf(byKey.get(`${d}|onward`))],
            ['E', markOf(byKey.get(`${d}|return`))],
          ];
          const label = `${d}: ` + legs
            .map(([l, m]) => `${l === 'M' ? 'morning' : 'evening'} ${m ? MARK_TEXT[m] : 'no record'}`)
            .join(', ');
          return (
            <div
              key={d}
              title={label}
              aria-label={label}
              className={cn(
                'flex min-h-[52px] flex-col items-center justify-between rounded-md border border-border p-1',
                isSunday && 'bg-muted/40',
              )}
            >
              <span className="text-xs tabular-nums text-muted-foreground">{Number(d.slice(8))}</span>
              <div className="flex gap-0.5">
                {legs.map(([l, m]) => (
                  <span
                    key={l}
                    className={cn(
                      'inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-semibold',
                      m ? MARK_CLASS[m] : 'border border-dashed border-border text-muted-foreground/60',
                    )}
                  >
                    {l}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <Legend cls={MARK_CLASS.present} text="Present" />
        <Legend cls={MARK_CLASS.absent} text="Absent" />
        <Legend cls={MARK_CLASS.auto} text="Auto-absent (not marked)" />
        <span>M = morning · E = evening</span>
      </div>
    </div>
  );
}

function Legend({ cls, text }: { cls: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('inline-block h-3 w-3 rounded', cls)} /> {text}
    </span>
  );
}
