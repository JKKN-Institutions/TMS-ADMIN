'use client';

import { usePathname, useRouter } from 'next/navigation';
import { CalendarCheck } from 'lucide-react';

/**
 * Floating shortcut to the bus-booking page. Stacks directly above the
 * bug-reporter widget (bottom-right) and hides on the booking board itself,
 * where it would be redundant. Rendered once by the student layout, so it shows
 * on every student page for signed-in students. Owns its own visibility rule so
 * the layout stays dumb.
 *
 * Vertical offset: below the lg breakpoint the fixed bottom nav is present and
 * the bug FAB is lifted to sit just above it (see globals.css), so this stacks
 * higher — calc(7.5rem + safe-area) clears the raised bug FAB. On lg+ (no bottom
 * nav, bug FAB low) it drops back to the tighter bottom-24 stack.
 */
export default function BookBusFab() {
  const pathname = usePathname();
  const router = useRouter();

  // Redundant on the booking board — hide there.
  if (pathname === '/student/bookings' || pathname.startsWith('/student/bookings/')) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => router.push('/student/bookings')}
      aria-label="Book bus"
      title="Book bus"
      className="fixed bottom-[calc(7.5rem_+_env(safe-area-inset-bottom))] right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-green-600 text-white shadow-lg transition-colors hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 lg:bottom-24"
    >
      <CalendarCheck className="h-5 w-5" />
    </button>
  );
}
