'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { resolveSticker, startInspection, currentPosition } from '../../inspections/inspection-api';

/** decodeURIComponent, but a malformed segment (e.g. a stray `%`) falls back to the raw text instead of throwing. */
function safeDecode(raw: string): string {
  try { return decodeURIComponent(raw); } catch { return raw; }
}

export default function StickerLandingPage({ params }: { params: Promise<{ reg: string }> }) {
  const { reg } = use(params);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode double-invoke would create two starts
    ran.current = true;
    (async () => {
      try {
        const bus = await resolveSticker(reg);
        const { inspectionId } = await startInspection(bus.vehicleId, await currentPosition());
        router.replace(`/inspections/${inspectionId}/check`);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [reg, router]);

  return (
    <div className="mx-auto max-w-md space-y-4 py-10 text-center">
      {error ? (
        <>
          <p className="text-lg font-semibold text-red-600">{error}</p>
          <Link href="/inspections/scan" className="inline-block rounded-lg bg-green-600 px-4 py-2 font-semibold text-white">Pick the bus manually</Link>
        </>
      ) : (
        <p className="text-gray-600">Opening inspection for {safeDecode(reg)}…</p>
      )}
    </div>
  );
}
