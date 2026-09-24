'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { FeeMarkChip, BookingMarkChip } from '@/components/route-check/marks';
import { FINE_NOTE_LABEL, ruleNote, type FineNote, type FineRule } from '@/lib/route-check/fine-rules';
import { scannedCounts } from '@/lib/route-check/counts';
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
 *
 * A row can carry a fine this check did NOT raise: when the learner was already
 * fined (an earlier check, or the 48h sweep for the fee rule) the existing fine's
 * id is stored for reference. That one is shown muted as "earlier".
 */
function FineChip({ label, rule, fineNote, fineId, fine }: {
  label: string; rule: FineRule; fineNote: string | null; fineId: string | null; fine: CheckFineSummary | null;
}) {
  if (!fineId) return null;
  const raisedHere = ruleNote(fineNote, rule) === 'raised';
  const cancelled = fine?.status === 'cancelled';
  const tone = cancelled
    ? 'bg-gray-100 text-gray-500 line-through dark:bg-gray-800 dark:text-gray-400'
    : raisedHere
      ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  const detail = fine ? `₹${fine.amount.toLocaleString('en-IN')} · ${fine.status}` : 'status unavailable';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {raisedHere ? label : `Earlier ${label.toLowerCase()}`} · {detail}
    </span>
  );
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Back to the tab (Checks, with its date range, or Start inspection) the report was opened from. */
function backHrefFrom(sp: { from?: string; to?: string; tab?: string }): string {
  if (sp.tab === 'start') return '/inspections?tab=start';
  const qs = new URLSearchParams({ tab: 'checks' });
  if (sp.from && DATE_RE.test(sp.from)) qs.set('from', sp.from);
  if (sp.to && DATE_RE.test(sp.to)) qs.set('to', sp.to);
  return `/inspections?${qs.toString()}`;
}

function CountGrid({ title, note, items }: { title: string; note: string; items: { label: string; value: number | null }[] }) {
  return (
    <section className="min-w-0 space-y-2">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">{note}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs text-gray-500 dark:text-gray-400">{c.label}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{c.value ?? '—'}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function CheckReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string; tab?: string }>;
}) {
  const { id } = use(params);
  const backHref = backHrefFrom(use(searchParams));
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

  const submitted = data.status === 'submitted';
  const scanned = scannedCounts(data.people);
  const onBus = [
    { label: 'Scanned', value: scanned.checked },
    { label: 'Unpaid', value: scanned.unpaid },
    { label: 'No booking', value: scanned.noBooking },
    { label: 'Not on route', value: scanned.notOnRoute },
    { label: 'Unknown cards', value: scanned.unknownCards },
    { label: 'Fined by this check', value: submitted ? scanned.finesRaised : null },
  ];
  const wholeRoute = [
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
        crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Bus Inspection', href: backHref }, { label: 'Check' }]}
        backHref={backHref}
        title={`${data.route?.routeNumber ?? 'Route'} · ${data.checkDate}`}
        subtitle={`${LEG_LABEL[data.leg]} trip · ${data.bus?.registration ?? 'No bus'} · Inspector ${data.checker.name ?? data.checker.email ?? '—'} · ${
          submitted ? `Submitted ${fmtDateTime(data.submittedAt)}` : `Draft, started ${fmtDateTime(data.startedAt)} (not submitted)`
        }`}
      />

      <CountGrid title="On this bus" note="The people the inspector scanned." items={onBus} />
      <CountGrid
        title="Whole route"
        note={
          submitted
            ? 'Everyone registered on the route that day, saved at submit. Most may not have travelled; this is not what the inspector found.'
            : 'Saved when the check is submitted.'
        }
        items={wholeRoute}
      />

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
                      <FineChip label="Fee fine" rule="fee" fineNote={p.fineNote} fineId={p.feeFineId} fine={p.feeFine} />
                      <FineChip label="Booking fine" rule="booking" fineNote={p.fineNote} fineId={p.bookingFineId} fine={p.bookingFine} />
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
