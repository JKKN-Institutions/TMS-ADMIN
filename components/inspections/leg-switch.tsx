'use client';

import type { Leg } from '@/lib/inspections/overview';
import { LEG_NAME } from '@/lib/boarding/attendance-window';

export function LegSwitch({ value, onChange }: { value: Leg; onChange: (leg: Leg) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-800">
      {(['onward', 'return'] as Leg[]).map((leg) => (
        <button
          key={leg}
          type="button"
          onClick={() => onChange(leg)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === leg
              ? 'bg-green-600 text-white'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
          }`}
        >
          {LEG_NAME[leg]}
        </button>
      ))}
    </div>
  );
}
