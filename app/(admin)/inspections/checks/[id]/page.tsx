'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { FeeMarkChip, BookingMarkChip } from '@/components/route-check/marks';
import { FINE_NOTE_LABEL, type FineNote } from '@/lib/route-check/fine-rules';
import { fetchCheck, type CheckFineSummary } from '../../inspection-api';

const LEG_LABEL: Record<'onward' | 'return', string> = { onward: 'Morning', return: 'Evening' };
const OUTCOME_LABEL: Record<string, string> = {
  ok: 'OK',
  not_on_route: 'Not on this route',
  no_booking: 'No booking',
  fee_unpaid: 'Fee unpaid',
  unknown_card: 'Unknown card',
  manual: 'Manual entry',
};

function fmtDateTime(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** fine_note is space-separated `<rule>:<note>` parts, or the single word 'fines_off' / 'error'. */
function fineNoteLabels(note: string | null): string[] {
  if (!note) return [];
  return note
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(':');
      const key = idx >= 0 ? part.slice(idx + 1) : part;
      return FINE_NOTE_LABEL[key as FineNote] ?? part;
    });
}

/**
 * One fine on the report: its amount and live status. Read-only — a fine is
 * cancelled by cancelling its bill in MyJKKN with a supporting document, never
 * from here (the bill-cancellation guard must not be bypassed).
 */
function FineChip({ label, fineId, fine }: { label: string; fineId: string | null; fine: CheckFineSummary | null }) {
  if (!fineId) return null;
  const cancelled = fine?.status === 'cancelled';
  const tone = cancelled
    ? 'bg-gray-100 text-gray-500 line-through dark:bg-gray-800 dark:text-gray-400'
    : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
  const detail = fine ? `₹${fine.amount.toLocaleString('en-IN')} · ${fine.status}` : 'status unavailable';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {label} · {detail}
    </span>
  );
}

export default function CheckReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['check', id], queryFn: () => fetchCheck(id) });

  if (isLoading) {
    return (
      <div className="min-w-0 space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
        <div className="h-40 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (isError || !data) {
    return <p className="text-sm text-red-600 dark:text-red-400">{(error as Error)?.message ?? 'Route check not found.'}</p>;
  }

  const counts = [
    { label: 'Registered', value: data.counts.registered },
    { label: 'Booked', value: data.counts.booked },
    { label: 'Present', value: data.counts.present },
    { label: 'Unpaid', value: data.counts.unpaid },
    { label: 'Without booking', value: data.counts.withoutBooking },
    { label: 'Not on route', value: data.counts.notOnRoute },
  ];

  return (
    <div className="min-w-0 space-y-4">
      <DetailPageHeader
        crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Bus Inspection', href: '/inspections' }, { label: 'Check' }]}
        backHref="/inspections"
        title={`${data.route?.routeNumber ?? 'Route'} · ${data.checkDate}`}
        subtitle={`${LEG_LABEL[data.leg]} trip · ${data.bus?.registration ?? 'No bus'} · Inspector ${data.checker.name ?? data.checker.email ?? '—'} · Submitted ${fmtDateTime(data.submittedAt)}`}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {counts.map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs text-gray-500 dark:text-gray-400">{c.label}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{c.value ?? '—'}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        To cancel a fine, cancel the bill in MyJKKN with a supporting document.
      </p>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">Person</th>
              <th className="px-4 py-3">Fee</th>
              <th className="px-4 py-3">Booking</th>
              <th className="px-4 py-3">Outcome</th>
              <th className="px-4 py-3">Fines</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.people.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400" colSpan={5}>
                  No people recorded on this check.
                </td>
              </tr>
            )}
            {data.people.map((p) => {
              const noteLabels = fineNoteLabels(p.fineNote);
              return (
                <tr key={p.id}>
                  <td className="min-w-0 px-4 py-3">
                    <p className="truncate font-medium text-gray-900 dark:text-gray-100">{p.name ?? '—'}</p>
                    {p.code && <p className="truncate text-xs text-gray-500 dark:text-gray-400">{p.code}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <FeeMarkChip mark={p.feeState} />
                  </td>
                  <td className="px-4 py-3">
                    <BookingMarkChip mark={p.bookingState} />
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{OUTCOME_LABEL[p.outcome] ?? p.outcome}</td>
                  <td className="min-w-0 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <FineChip label="Fee fine" fineId={p.feeFineId} fine={p.feeFine} />
                      <FineChip label="Booking fine" fineId={p.bookingFineId} fine={p.bookingFine} />
                      {noteLabels.map((label, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                          {label}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
