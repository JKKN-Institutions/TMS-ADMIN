'use client';

import { usePathname, useRouter } from 'next/navigation';
import { CalendarCheck } from 'lucide-react';

/**
 * Floating shortcut to the bus-booking page. Stacks directly above the
 * bug-reporter widget (bottom-right) and hides on the booking board itself,
 * where it would be redundant. Rendered once by the student layout, so it shows
 * on every student page for signed-in students. Owns its own visibility rule so
 * the layout stays dumb.
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
      className="fixed bottom-24 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-white shadow-lg transition-colors hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
    >
      <CalendarCheck className="h-6 w-6" />
    </button>
  );
}
