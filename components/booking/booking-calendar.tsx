'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthGrid } from '@/lib/booking/month';

export type CellStatus =
  | 'open' | 'booked' | 'locked' | 'closed'
  | 'holiday' | 'no_service' | 'out_of_horizon';

export interface DayCell {
  date: string;
  status: CellStatus;
  note?: string | null;
  cutoff?: string | null;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const monthLabel = (monthStr: string) =>
  new Date(monthStr + '-01T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

// status → visual + whether the cell is actionable
const STYLE: Record<CellStatus, { cls: string; label: string; action: 'book' | 'cancel' | null }> = {
  open: { cls: 'bg-white text-gray-900 border-gray-200 hover:border-green-500 hover:bg-green-50 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700 dark:hover:bg-green-950/40', label: 'Open', action: 'book' },
  booked: { cls: 'bg-green-600 text-white border-green-600', label: 'Booked', action: 'cancel' },
  locked: { cls: 'bg-blue-600 text-white border-blue-600', label: 'Confirmed', action: null },
  closed: { cls: 'bg-gray-100 text-gray-400 border-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700', label: 'Closed', action: null },
  holiday: { cls: 'bg-red-600 text-white border-red-600', label: 'Leave', action: null },
  no_service: { cls: 'bg-red-500 text-white border-red-500', label: 'No service', action: null },
  out_of_horizon: { cls: 'bg-gray-50 text-gray-300 border-gray-100 dark:bg-gray-900 dark:text-gray-600 dark:border-gray-800', label: '—', action: null },
};

export function BookingCalendar({
  month, cells, onPrev, onNext, onBook, onCancel, pendingDate,
}: {
  month: string;
  cells: Map<string, DayCell>;
  onPrev: () => void;
  onNext: () => void;
  onBook: (date: string) => void;
  onCancel: (date: string) => void;
  pendingDate: string | null;
}) {
  const weeks = monthGrid(month);
  const dayNum = (d: string) => Number(d.slice(8, 10));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={onPrev} aria-label="Previous month"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{monthLabel(month)}</h2>
        <button type="button" onClick={onNext} aria-label="Next month"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-gray-400">
        {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
      </div>

      <div className="mt-1 space-y-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((date, di) => {
              if (!date) return <div key={di} className="aspect-square" />;
              const cell = cells.get(date) ?? { date, status: 'out_of_horizon' as CellStatus };
              const s = STYLE[cell.status];
              const isPending = pendingDate === date;
              const clickable = s.action !== null;
              return (
                <button
                  key={di}
                  type="button"
                  disabled={!clickable || isPending}
                  title={cell.note ?? s.label}
                  onClick={() => {
                    if (s.action === 'book') onBook(date);
                    else if (s.action === 'cancel') onCancel(date);
                  }}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-sm transition-colors disabled:cursor-default ${s.cls} ${isPending ? 'opacity-60' : ''}`}
                >
                  <span className="font-semibold tabular-nums">{dayNum(date)}</span>
                  {(cell.status === 'holiday' || cell.status === 'no_service') && cell.note && (
                    <span className="pointer-events-none absolute inset-x-0 bottom-0.5 truncate px-1 text-[8px] leading-tight opacity-90">
                      {cell.note}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-gray-500 dark:text-gray-400">
        <Legend swatch="border border-gray-300 bg-white dark:bg-gray-900" label="Open" />
        <Legend swatch="bg-green-600" label="Booked" />
        <Legend swatch="bg-blue-600" label="Confirmed" />
        <Legend swatch="bg-red-600" label="Leave" />
        <Legend swatch="bg-gray-200 dark:bg-gray-700" label="Closed" />
      </div>
    </div>
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
