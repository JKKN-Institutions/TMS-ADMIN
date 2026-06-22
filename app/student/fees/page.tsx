'use client';

import { useQuery } from '@tanstack/react-query';
import { Receipt, AlertTriangle, CheckCircle2, Info, RefreshCw, Loader2 } from 'lucide-react';

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
}

async function fetchAccess(): Promise<Access> {
  const res = await fetch('/api/student/transport-access', { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load transport fees');
  return json.data as Access;
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

export default function StudentFeesPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['student-transport-access'],
    queryFn: fetchAccess,
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
          {error instanceof Error ? error.message : 'Could not load your transport fees.'}
        </div>
      </div>
    );
  }

  const hasTerms = data.terms.length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-600">
            <Receipt className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Transport Fees</h1>
            {data.transport_year_name && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{data.transport_year_name}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {/* Status banner */}
      {!data.allowed ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-950/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <div>
              <p className="font-semibold text-red-800 dark:text-red-300">Portal access restricted</p>
              <p className="mt-1 text-sm text-red-700 dark:text-red-300/90">
                You have <strong>{data.overdue_count}</strong> overdue transport term{data.overdue_count === 1 ? '' : 's'} totalling{' '}
                <strong>{inr(data.total_owed)}</strong>. Please clear the overdue amount at the transport office to restore access to the rest of the portal.
              </p>
            </div>
          </div>
        </div>
      ) : data.reason === 'current' ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-500/30 dark:bg-green-950/30">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            <p className="text-sm font-medium text-green-800 dark:text-green-300">You're up to date on your transport fees.</p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
          <div className="flex items-center gap-3">
            <Info className="h-5 w-5 text-gray-500" />
            <p className="text-sm text-gray-600 dark:text-gray-300">No transport fees are currently assigned to your account.</p>
          </div>
        </div>
      )}

      {/* Terms — stacked cards on mobile (no cramped/clipped table), table from sm up */}
      {hasTerms && (
        <>
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
        </>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500">
        Payments are recorded by the transport office. If you've paid but still see an overdue status, please tap Refresh or contact the office.
      </p>
    </div>
  );
}
