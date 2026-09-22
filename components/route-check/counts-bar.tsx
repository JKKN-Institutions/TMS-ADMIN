import type { CheckCounts } from '@/lib/route-check/types';

const TILES: { key: keyof CheckCounts; label: string }[] = [
  { key: 'registered', label: 'Registered' },
  { key: 'booked', label: 'Booked' },
  { key: 'present', label: 'Present' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'withoutBooking', label: 'Without booking' },
  { key: 'notOnRoute', label: 'Not on bus' },
];

export function CountsBar({ counts }: { counts: CheckCounts }) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
      {TILES.map((t) => (
        <div
          key={t.key}
          className="min-w-0 rounded-lg border border-gray-200 bg-white p-2 text-center dark:border-gray-800 dark:bg-gray-900"
        >
          <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{t.label}</p>
          <p className="text-base font-semibold text-gray-900 dark:text-gray-100">{counts[t.key]}</p>
        </div>
      ))}
      <div className="min-w-0 rounded-lg border border-green-200 bg-green-50 p-2 text-center dark:border-green-900/40 dark:bg-green-900/20">
        <p className="truncate text-[11px] text-green-700 dark:text-green-400">Checked ✓</p>
        <p className="text-base font-semibold text-green-800 dark:text-green-300">
          {counts.checked}
        </p>
      </div>
    </div>
  );
}
