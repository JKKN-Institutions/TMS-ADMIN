'use client';

import { ChevronLeft, ChevronRight, Pencil, QrCode } from 'lucide-react';
import { monthGrid } from '@/lib/booking/month';
import { istToday } from '@/lib/booking/window';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

export type CellStatus =
  | 'open' | 'booked' | 'locked' | 'closed'
  | 'holiday' | 'no_service' | 'weekly_off' | 'out_of_horizon';

/** One marked boarding record for a day (a day can have onward + return). */
export interface AttendanceMark {
  direction: string;  // 'onward' | 'return' | …
  status: string;     // 'present' | 'absent'
  method: string;     // 'qr' | 'manual'
  scannedAt: string;  // ISO timestamp — the "marked time"
}

export interface DayCell {
  date: string;
  status: CellStatus;
  note?: string | null;
  cutoff?: string | null;
  attendance?: AttendanceMark[];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const monthLabel = (monthStr: string) =>
  new Date(monthStr + '-01T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const fmtTime = (ts: string) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtShort = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

// status → visual + whether the cell is actionable.
// `dot` drives the legend swatch so colors stay defined in one place.
const STYLE: Record<CellStatus, { cls: string; dot: string; label: string; action: 'book' | 'cancel' | null }> = {
  open: {
    cls: 'bg-white text-gray-900 border-gray-200 hover:border-green-500 hover:bg-green-50 hover:shadow-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700 dark:hover:bg-green-950/40',
    dot: 'border border-gray-300 bg-white dark:bg-gray-900', label: 'Open', action: 'book',
  },
  booked: {
    cls: 'bg-green-600 text-white border-green-600 hover:bg-green-700 shadow-sm',
    dot: 'bg-green-600', label: 'Booked', action: 'cancel',
  },
  locked: {
    cls: 'bg-blue-600 text-white border-blue-600 shadow-sm',
    dot: 'bg-blue-600', label: 'Confirmed', action: null,
  },
  closed: {
    cls: 'bg-gray-100 text-gray-400 border-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700',
    dot: 'bg-gray-200 dark:bg-gray-700', label: 'Closed', action: null,
  },
  holiday: {
    cls: 'bg-red-600 text-white border-red-600 shadow-sm',
    dot: 'bg-red-600', label: 'Leave', action: null,
  },
  no_service: {
    cls: 'bg-red-500 text-white border-red-500 shadow-sm',
    dot: 'bg-red-500', label: 'No service', action: null,
  },
  weekly_off: {
    cls: 'bg-red-600 text-white border-red-600 shadow-sm',
    dot: 'bg-red-600', label: 'Sunday off', action: null,
  },
  out_of_horizon: {
    cls: 'bg-gray-50 text-gray-300 border-gray-100 dark:bg-gray-900 dark:text-gray-600 dark:border-gray-800',
    dot: 'bg-gray-100 dark:bg-gray-800', label: '—', action: null,
  },
};

// Legend only shows the statuses a learner actually needs to read.
const LEGEND: CellStatus[] = ['open', 'booked', 'locked', 'holiday', 'weekly_off', 'closed'];

export function BookingCalendar({
  month, cells, onPrev, onNext, onToday, onBook, onCancel, pendingDate,
}: {
  month: string;
  cells: Map<string, DayCell>;
  onPrev: () => void;
  onNext: () => void;
  onToday?: () => void;
  onBook: (date: string) => void;
  onCancel: (date: string) => void;
  pendingDate: string | null;
}) {
  const weeks = monthGrid(month);
  const today = istToday();

  return (
    <TooltipProvider delayDuration={150}>
      <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4 dark:border-gray-800 dark:bg-gray-900">
        {/* Month navigation */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button" onClick={onPrev} aria-label="Previous month"
            className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-gray-300 text-gray-600 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="flex flex-1 flex-col items-center">
            <h2 className="text-base font-semibold text-gray-900 sm:text-lg dark:text-white">{monthLabel(month)}</h2>
            {onToday && (
              <button
                type="button" onClick={onToday}
                className="mt-0.5 cursor-pointer rounded-md px-1.5 text-[11px] font-medium text-blue-600 transition-colors hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400"
              >
                Jump to this month
              </button>
            )}
          </div>

          <button
            type="button" onClick={onNext} aria-label="Next month"
            className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-gray-300 text-gray-600 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Weekday header (Sunday is dimmed to hint it is non-bookable) */}
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400 sm:gap-1.5 sm:text-[11px]">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={`py-1 ${i === 0 ? 'text-red-500 dark:text-red-400' : ''}`}>{w}</div>
          ))}
        </div>

        {/* Day grid */}
        <div className="mt-1 space-y-1 sm:space-y-1.5">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {week.map((date, di) => {
                if (!date) return <div key={di} className="aspect-square min-h-[44px]" />;
                const cell = cells.get(date) ?? { date, status: 'out_of_horizon' as CellStatus };
                return (
                  <DayButton
                    key={di}
                    cell={cell}
                    weekday={WEEKDAYS_LONG[di]}
                    isToday={date === today}
                    isPending={pendingDate === date}
                    onBook={onBook}
                    onCancel={onCancel}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2 border-t border-gray-100 pt-3 text-[11px] text-gray-500 dark:border-gray-800 dark:text-gray-400">
          {LEGEND.map((status) => (
            <Legend key={status} swatch={STYLE[status].dot} label={STYLE[status].label} />
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}

function DayButton({
  cell, weekday, isToday, isPending, onBook, onCancel,
}: {
  cell: DayCell;
  weekday: string;
  isToday: boolean;
  isPending: boolean;
  onBook: (date: string) => void;
  onCancel: (date: string) => void;
}) {
  const s = STYLE[cell.status];
  const clickable = s.action !== null && !isPending;
  const dayNum = Number(cell.date.slice(8, 10));
  const captioned = cell.status === 'holiday' || cell.status === 'no_service' || cell.status === 'weekly_off';
  const marks = cell.attendance ?? [];

  // Discoverability dot: green = all present, amber = mixed, rose = all absent.
  const attDot = marks.length === 0
    ? null
    : marks.every((m) => m.status === 'present') ? 'bg-emerald-400'
    : marks.some((m) => m.status === 'present') ? 'bg-amber-400'
    : 'bg-rose-400';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-disabled={!clickable}
          aria-pressed={cell.status === 'booked' || cell.status === 'locked'}
          aria-label={`${weekday} ${dayNum} — ${s.label}${isToday ? ', today' : ''}`}
          tabIndex={clickable || marks.length > 0 ? 0 : -1}
          onClick={() => {
            if (!clickable) return;
            if (s.action === 'book') onBook(cell.date);
            else if (s.action === 'cancel') onCancel(cell.date);
          }}
          className={[
            'relative flex aspect-square min-h-[44px] flex-col items-center justify-center rounded-xl border text-sm transition-all duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
            clickable ? 'cursor-pointer motion-safe:active:scale-95' : 'cursor-default',
            isToday ? 'ring-2 ring-blue-400 ring-offset-1 dark:ring-offset-gray-900' : '',
            isPending ? 'opacity-60' : '',
            s.cls,
          ].join(' ')}
        >
          <span className="font-semibold tabular-nums">{dayNum}</span>
          {captioned && (
            <span className="pointer-events-none absolute inset-x-0 bottom-1 truncate px-1 text-[8px] font-medium leading-tight opacity-90 sm:text-[9px]">
              {cell.note ?? (cell.status === 'weekly_off' ? 'Off' : s.label)}
            </span>
          )}
          {attDot && (
            <span className={`pointer-events-none absolute right-1 top-1 h-2 w-2 rounded-full ring-2 ring-white dark:ring-gray-900 ${attDot}`} />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[230px] border border-gray-700 bg-gray-900 px-3 py-2 text-left text-white shadow-lg dark:bg-gray-950">
        <p className="text-[11px] font-semibold">{weekday}, {fmtShort(cell.date)}{isToday ? ' · Today' : ''}</p>
        <p className="mt-0.5 text-[10px] text-gray-400">{s.label}</p>
        {marks.length > 0 ? (
          <div className="mt-1.5 space-y-1">
            {marks.map((m, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[11px]">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.status === 'present' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                <span className="capitalize">{m.direction || 'Trip'}</span>
                <span className="text-gray-500">·</span>
                <span className="capitalize">{m.status || '—'}</span>
                {m.scannedAt && (
                  <>
                    <span className="text-gray-500">·</span>
                    <span className="tabular-nums">{fmtTime(m.scannedAt)}</span>
                  </>
                )}
                {m.method && (
                  <span className="ml-auto inline-flex items-center text-gray-400" title={m.method === 'manual' ? 'Marked manually' : 'Scanned (QR)'}>
                    {m.method === 'manual' ? <Pencil className="h-2.5 w-2.5" /> : <QrCode className="h-2.5 w-2.5" />}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-gray-300">
            {cell.status === 'open' ? 'Tap to book this day.'
              : cell.status === 'booked' ? 'Booked — tap to cancel.'
              : cell.status === 'locked' ? 'Booking confirmed — no attendance marked yet.'
              : cell.status === 'weekly_off' ? 'Weekly holiday — no service.'
              : 'No attendance marked.'}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded ${swatch}`} />
      {label}
    </span>
  );
}
