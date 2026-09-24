import type { CheckCounts } from '@/lib/route-check/types';

type Tone = 'plain' | 'red' | 'amber' | 'green';

const TILES: { key: keyof CheckCounts; label: string; hint: string; tone: (n: number) => Tone }[] = [
  { key: 'registered', label: 'Registered', hint: 'on this route', tone: () => 'plain' },
  { key: 'booked', label: 'Booked', hint: 'for today', tone: () => 'plain' },
  { key: 'present', label: 'Present', hint: 'marked on board', tone: () => 'plain' },
  { key: 'unpaid', label: 'Fee unpaid', hint: 'transport fee', tone: (n) => (n > 0 ? 'red' : 'plain') },
  { key: 'withoutBooking', label: 'No booking', hint: 'not booked today', tone: (n) => (n > 0 ? 'amber' : 'plain') },
  { key: 'notOnRoute', label: 'Not on this bus', hint: 'from another bus', tone: (n) => (n > 0 ? 'amber' : 'plain') },
  { key: 'checked', label: 'Checked', hint: 'scanned so far', tone: () => 'green' },
];

const TONE: Record<Tone, { box: string; value: string }> = {
  plain: { box: 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900', value: 'text-gray-900 dark:text-gray-100' },
  red: { box: 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30', value: 'text-red-700 dark:text-red-300' },
  amber: { box: 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30', value: 'text-amber-800 dark:text-amber-300' },
  green: { box: 'border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/30', value: 'text-green-800 dark:text-green-300' },
};

/** One card per count, full labels (never truncated), tinted only when a number needs attention. */
export function CountsBar({ counts }: { counts: CheckCounts }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7 lg:gap-3">
      {TILES.map((t) => {
        const n = counts[t.key];
        const tone = TONE[t.tone(n)];
        return (
          <div key={t.key} className={`min-w-0 rounded-xl border p-2 sm:p-3 ${t.key === 'checked' ? 'col-span-3 sm:col-span-1' : ''} ${tone.box}`}>
            <p className="text-[11px] font-medium leading-tight text-gray-600 sm:text-xs dark:text-gray-400">{t.label}</p>
            <p className={`mt-0.5 text-xl font-bold tabular-nums sm:mt-1 sm:text-2xl ${tone.value}`}>{n}</p>
            <p className="hidden text-[11px] leading-tight text-gray-500 sm:block dark:text-gray-500">{t.hint}</p>
          </div>
        );
      })}
    </div>
  );
}
