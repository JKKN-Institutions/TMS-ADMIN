'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * A boarding staffer is assigned exactly one route, so there's no list to show —
 * this resolves their single assignment and forwards straight to its roster.
 * (The nav link stays the static /boarding/routes; the route id is per-staffer.)
 */
export default function BoardingRoutesPage() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/boarding/dashboard', { cache: 'no-store', credentials: 'same-origin' });
        const json = await res.json();
        const routes = (json?.data?.routes ?? []) as { id: string }[];
        if (res.ok && json.success && routes.length > 0) {
          router.replace(`/boarding/routes/${routes[0].id}`);
        } else {
          setMessage('No route assigned. Ask an admin to assign you to a route.');
        }
      } catch {
        setMessage('Could not load your route. Please try again.');
      }
    })();
  }, [router]);

  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="text-center">
        {message ? (
          <p className="text-sm text-gray-500">{message}</p>
        ) : (
          <>
            <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-green-600" />
            <p className="text-sm text-gray-600">Opening your route…</p>
          </>
        )}
      </div>
    </div>
  );
}
