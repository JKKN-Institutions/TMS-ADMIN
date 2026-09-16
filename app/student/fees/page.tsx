'use client';

import { useQuery } from '@tanstack/react-query';
import { Receipt, AlertTriangle, CheckCircle2, Info, RefreshCw, Loader2, ArrowRight } from 'lucide-react';

interface Term {
  term_no: number;
  amount: number;
  balance: number;
  due_date: string;
  status: string;
  paid: boolean;
  overdue: boolean;
}
interface Access {
  allowed: boolean;
  reason: string;
  transport_year_name?: string | null;
  overdue_count: number;
  total_owed: number;
  terms: Term[];
  term1_paid: boolean;
  term1_status: string | null;
  term1_due_date: string | null;
  term1_balance: number;
}

type TransportFeeStatus = 'paid' | 'partially_paid' | 'unpaid' | 'overdue' | 'cancelled' | 'unknown';
interface TransportFeeItem {
  id: string;
  amount: number;
  paid_amount: number;
  due_date: string;
  reason: string;
  status: TransportFeeStatus;
}
interface TransportFees {
  items: TransportFeeItem[];
  outstanding: number;
  total: number;
  count: number;
}

async function fetchAccess(): Promise<Access> {
  const res = await fetch('/api/student/transport-access', { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load your fees');
  return json.data as Access;
}

async function fetchTransportFees(): Promise<TransportFees> {
  const res = await fetch('/api/student/transport-fee', { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  // Never fail the whole page for this: the maintenance fee is the part that
  // controls portal access and must always render.
  if (!res.ok || !json.success) return { items: [], outstanding: 0, total: 0, count: 0 };
  return json.data as TransportFees;
}

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function termBadge(t: Term) {
  if (t.paid) return <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-500/15 dark:text-green-400">Paid</span>;
  if (t.overdue) return <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-500/15 dark:text-red-400">Overdue</span>;
  if (t.status === 'partially_paid') return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-400">Partial</span>;
  return <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-500/15 dark:text-gray-300">Pending</span>;
}

const TF_BADGE: Record<TransportFeeStatus, string> = {
  paid: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400',
  partially_paid: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400',
  unpaid: 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400',
  cancelled: 'bg-slate-100 text-slate-600 line-through dark:bg-slate-500/15 dark:text-slate-400',
  unknown: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400',
};

export default function StudentFeesPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['student-transport-access'],
    queryFn: fetchAccess,
  });

  const { data: transportFees } = useQuery({
    queryKey: ['student-transport-fee'],
    queryFn: fetchTransportFees,
  });

  const { data: transport } = useQuery({
    queryKey: ['student-transport-context'],
    queryFn: async () => {
      const res = await fetch('/api/student/transport-context', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!res.ok) return { route_label: null, stop_name: null, stop_wise: false };
      return (await res.json()).data as { route_label: string | null; stop_name: string | null; stop_wise: boolean };
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-300">
          {error instanceof Error ? error.message : 'Could not load your fees.'}
        </div>
      </div>
    );
  }

  const hasTerms = data.terms.length > 0;
  // Maintenance outstanding comes from the terms, so it stays in step with the
  // table below rather than being a second, separately-derived number.
  const maintenanceOutstanding = data.terms.reduce((s, t) => s + Math.max(0, Number(t.balance || 0)), 0);
  const tf = transportFees ?? { items: [], outstanding: 0, total: 0, count: 0 };
  const liveTransportFees = tf.items.filter((i) => i.status !== 'cancelled');

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-600">
            <Receipt className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Fees</h1>
            {data.transport_year_name && (
              <p className="truncate text-sm text-gray-500 dark:text-gray-400">{data.transport_year_name}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {/* The two charges, side by side, so the difference is obvious at a glance. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Transport Maintenance Fee
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{inr(maintenanceOutstanding)}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {maintenanceOutstanding > 0 ? 'Still to pay' : 'Fully paid'}
          </p>
        </div>
        <div
          className={`rounded-xl border p-4 ${
            tf.outstanding > 0
              ? 'border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-950/30'
              : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'
          }`}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Transport Fee
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${
              tf.outstanding > 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-900 dark:text-white'
            }`}
          >
            {inr(tf.outstanding)}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {tf.count > 0 ? `${tf.count} charge(s) raised` : 'None charged'}
          </p>
        </div>
      </div>

      {/* The rule, in the learner's own words. */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/30">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-amber-900 dark:text-amber-200">
            The college collects the <strong>Transport Maintenance Fee</strong>. If you do not pay it
            by the due date, a <strong>Transport Fee</strong> is charged to your account
            automatically <ArrowRight className="inline h-3.5 w-3.5" /> and you then have to pay that
            as well. Paying the maintenance fee on time avoids it.
          </p>
        </div>
      </div>

      {/* Status banner */}
      {!data.allowed ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-950/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <div>
              <p className="font-semibold text-red-800 dark:text-red-300">Portal access restricted</p>
              {data.reason === 'term1_unpaid' ? (
                <p className="mt-1 text-sm text-red-700 dark:text-red-300/90">
                  Your <strong>first term</strong> transport maintenance fee of <strong>{inr(data.term1_balance)}</strong>
                  {data.term1_due_date ? <> (due {fmtDate(data.term1_due_date)})</> : null} is not fully paid.
                  Clear it at the transport office to unlock bus booking and the rest of the portal.
                </p>
              ) : data.reason === 'term1_not_billed' ? (
                // Distinct from term1_unpaid on purpose: paying cannot fix this,
                // so the learner must be told to contact the office instead.
                <p className="mt-1 text-sm text-red-700 dark:text-red-300/90">
                  Your transport maintenance fee for this year has not been generated yet, so bus
                  booking is locked. Please contact the transport office — there is nothing to pay
                  until they raise your bill.
                </p>
              ) : (
                <p className="mt-1 text-sm text-red-700 dark:text-red-300/90">
                  You have <strong>{data.overdue_count}</strong> overdue maintenance term{data.overdue_count === 1 ? '' : 's'} totalling{' '}
                  <strong>{inr(data.total_owed)}</strong>. Please clear the overdue amount at the transport office to restore access to the rest of the portal.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : data.reason === 'current' ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-500/30 dark:bg-green-950/30">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            <p className="text-sm font-medium text-green-800 dark:text-green-300">You&apos;re up to date on your transport maintenance fee.</p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
          <div className="flex items-center gap-3">
            <Info className="h-5 w-5 text-gray-500" />
            <p className="text-sm text-gray-600 dark:text-gray-300">No transport maintenance fee is currently assigned to your account.</p>
          </div>
        </div>
      )}

      {/* Only meaningful for stop_wise structures — flat/tiered fees don't depend
          on the boarding stop at all, so this must never render for them (see
          review I5). */}
      {transport?.stop_wise && transport?.stop_name && (
        <div className="mb-4 rounded-lg border bg-muted/40 p-4 dark:bg-muted/20">
          <p className="text-sm text-muted-foreground">Your maintenance fee is based on your boarding stop</p>
          <p className="mt-1 font-medium">
            {transport.stop_name}
            {transport.route_label ? ` · Route ${transport.route_label}` : ''}
          </p>
        </div>
      )}

      {/* ── Transport Maintenance Fee ── */}
      {hasTerms && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Transport Maintenance Fee</h2>

          {/* Mobile: one card per term, so nothing overflows a narrow screen */}
          <div className="space-y-3 sm:hidden">
            {data.terms.map((t, i) => (
              <div
                key={`${t.term_no}-${i}`}
                className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">Term {t.term_no}</span>
                  {termBadge(t)}
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Amount</p>
                    <p className="truncate text-lg font-bold text-gray-900 dark:text-white">{inr(t.amount)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Due date</p>
                    <p className={`text-sm ${t.overdue ? 'font-semibold text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300'}`}>
                      {fmtDate(t.due_date)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* sm and up: table (overflow-x-auto so it can scroll if it ever exceeds the box) */}
          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white sm:block dark:border-gray-700 dark:bg-gray-900">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
                  <th className="px-4 py-3">Term</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Due date</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.terms.map((t, i) => (
                  <tr key={`${t.term_no}-${i}`} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">Term {t.term_no}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{inr(t.amount)}</td>
                    <td className={`px-4 py-3 ${t.overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300'}`}>
                      {fmtDate(t.due_date)}
                    </td>
                    <td className="px-4 py-3">{termBadge(t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Transport Fee (charged when the maintenance fee goes unpaid) ── */}
      {liveTransportFees.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Transport Fee</h2>
          <div className="space-y-3">
            {liveTransportFees.map((f) => (
              <div
                key={f.id}
                className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-lg font-bold text-gray-900 dark:text-white">{inr(f.amount)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${TF_BADGE[f.status]}`}>
                    {f.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{f.reason}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Due {fmtDate(f.due_date)}
                  {f.paid_amount > 0 ? ` · ${inr(f.paid_amount)} paid` : ''}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500">
        Payments are recorded by the transport office. If you&apos;ve paid but still see an overdue status, please tap Refresh or contact the office.
      </p>
    </div>
  );
}
