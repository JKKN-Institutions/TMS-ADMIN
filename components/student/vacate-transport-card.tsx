'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { LogOut, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { LearnerVacateState } from '@/lib/vacate/types';

async function fetchState(): Promise<LearnerVacateState> {
  const res = await fetch('/api/student/vacate-request', { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed');
  return json.data as LearnerVacateState;
}

export default function VacateTransportCard() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ['student-vacate-state'], queryFn: fetchState });
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/student/vacate-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed');
    },
    onSuccess: () => {
      toast.success('Vacate request submitted for approval');
      setConfirming(false);
      setReason('');
      qc.invalidateQueries({ queryKey: ['student-vacate-state'] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  if (isLoading) return null;
  if (isError) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
        Couldn&apos;t load your transport options. Please refresh the page, or contact the transport office if this persists.
      </div>
    );
  }
  if (!data) return null;

  const req = data.request;

  // Pending — waiting on the transport head.
  if (req && req.status === 'pending') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-semibold text-amber-800 dark:text-amber-300">Vacate request pending approval</p>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300/90">
              You asked to leave the bus on {new Date(req.createdAt).toLocaleDateString()}. The transport office will review it. Your fees stay as-is until it is approved.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Approved — done.
  if (req && req.status === 'approved') {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-500/30 dark:bg-green-950/20">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
          <div>
            <p className="font-semibold text-green-800 dark:text-green-300">You&apos;ve left the bus</p>
            <p className="mt-1 text-sm text-green-700 dark:text-green-300/90">
              Your transport vacate was approved. {req.cancelledBillCount} current-year fee term(s) were cancelled and your route was removed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Remaining states: no request, or a past rejected/withdrawn one. Only offer the
  // button to a currently-eligible learner; otherwise render nothing.
  if (!data.eligible) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
          <LogOut className="h-5 w-5 text-gray-600 dark:text-gray-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 dark:text-gray-100">Leaving the bus?</p>
          {req && req.status === 'rejected' && (
            <p className="mt-1 flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              Your last request was declined{req.decisionNote ? `: ${req.decisionNote}` : ''}. You can submit a new one.
            </p>
          )}
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Request to vacate transport. Once the transport office approves, your remaining current-year transport fees are cancelled and your route is removed.
          </p>

          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
            >
              Request to vacate transport
            </button>
          ) : (
            <div className="mt-3 space-y-2">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (optional)"
                rows={2}
                className="w-full rounded-lg border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-800"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => submit.mutate()}
                  disabled={submit.isPending}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Confirm vacate request
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirming(false); setReason(''); }}
                  className="inline-flex h-9 items-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
