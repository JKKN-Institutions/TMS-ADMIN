'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Timer, AlertTriangle } from 'lucide-react';
import { useTransportAccess } from '@/lib/student/use-transport-access';
import { barState, clockOffset, formatRemaining, remainingMs } from '@/lib/fees/payment-notice/bar-state';

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * The learner's 48-hour payment countdown. `strip` sits in the portal layout
 * above every page; `card` is the larger version on /student/fees. Both read
 * the same cached query, so they can never disagree.
 */
export function PaymentNoticeBar({ variant = 'strip' }: { variant?: 'strip' | 'card' }) {
  const { data, dataUpdatedAt } = useTransportAccess();
  const notice = data?.payment_notice ?? null;
  // Offset is captured per response; dataUpdatedAt changes on every refetch.
  const offset = useMemo(
    () => (data?.server_now ? clockOffset(data.server_now, dataUpdatedAt || Date.now()) : 0),
    [data?.server_now, dataUpdatedAt],
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (notice?.status !== 'running') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [notice?.status]);

  const left = notice ? remainingMs(notice.expires_at, now, offset) : 0;
  const state = barState(notice, left);
  if (state === 'hidden' || !notice) return null;

  // Always an alert: solid red in every state. The icon pulses once the
  // urgent window starts so the last hours still read as more pressing.
  const tone = 'border-red-700 bg-red-600 text-white dark:border-red-900 dark:bg-red-800';
  const iconPulse = state === 'urgent' || state === 'processing' ? 'animate-pulse' : '';
  const Icon = state === 'fined' ? AlertTriangle : Timer;

  const message =
    state === 'fined'
      ? `A Transport Fee of ${inr(notice.amount)} has been added because the maintenance fee wasn't paid in time.`
      : state === 'processing'
        ? "Time's up — Transport Fee being added…"
        : null;

  const deadline = new Date(notice.expires_at).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });

  if (variant === 'card') {
    return (
      <div className={`rounded-xl border p-4 ${tone}`}>
        <div className="flex min-w-0 items-start gap-3">
          <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconPulse}`} />
          <div className="min-w-0 space-y-1">
            {message ? (
              <p className="font-medium">{message}</p>
            ) : (
              <>
                <p className="text-sm">Pay your Transport Maintenance Fee by <strong>{deadline}</strong></p>
                <p className="font-mono text-3xl font-bold tabular-nums">{formatRemaining(left)}</p>
                <p className="text-sm">If it is not paid in time, a Transport Fee of {inr(notice.amount)} will be added.</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`border-b px-4 py-2 text-sm ${tone}`}>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1">
        <Icon className={`h-4 w-4 shrink-0 ${iconPulse}`} />
        <p className="min-w-0 flex-1">
          {message ?? (
            <>
              Pay your Transport Maintenance Fee within{' '}
              <span className="font-mono font-semibold tabular-nums">{formatRemaining(left)}</span>, or a Transport Fee of{' '}
              {inr(notice.amount)} will be added.
            </>
          )}
        </p>
        <Link href="/student/fees" className="inline-flex h-11 shrink-0 items-center rounded-md bg-green-600 px-4 font-semibold text-white shadow-sm ring-1 ring-white/40 transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:h-7">
          {state === 'fined' ? 'View fees' : 'Pay now'}
        </Link>
      </div>
    </div>
  );
}
