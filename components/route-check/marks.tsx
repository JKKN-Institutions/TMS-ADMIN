import type { BookingMark, FeeMark } from '@/lib/route-check/marks';

const base = 'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold';
const GREEN = `${base} bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300`;
const RED = `${base} bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300`;
const AMBER = `${base} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300`;
const GREY = `${base} bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300`;

export function FeeMarkChip({ mark, size = 'sm' }: { mark: FeeMark | 'exempt' | null; size?: 'sm' | 'lg' }) {
  const big = size === 'lg' ? ' px-3 py-1 text-sm' : '';
  switch (mark) {
    case 'paid': return <span className={GREEN + big}>✓ Fee paid</span>;
    case 'override': return <span className={GREEN + big}>✓ Fee override</span>;
    case 'exempt': return <span className={GREEN + big}>✓ In-charge</span>;
    case 'unpaid': return <span className={RED + big}>✗ Fee unpaid</span>;
    case 'none': return <span className={GREY + big}>No bill</span>;
    default: return <span className={GREY + big}>Fee ?</span>;
  }
}

export function BookingMarkChip({ mark, size = 'sm' }: { mark: BookingMark | null; size?: 'sm' | 'lg' }) {
  const big = size === 'lg' ? ' px-3 py-1 text-sm' : '';
  switch (mark) {
    case 'this_route': return <span className={GREEN + big}>✓ Booked</span>;
    case 'other_route': return <span className={AMBER + big}>Booked other bus</span>;
    case 'none': return <span className={RED + big}>✗ No booking</span>;
    default: return null;
  }
}
