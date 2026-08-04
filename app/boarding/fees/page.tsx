'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, IndianRupee, CheckCircle2, AlertCircle } from 'lucide-react';
import { formatInr } from '@/lib/fees/staff-bill-notification';

interface StaffBill {
  id: string;
  amount: number;
  dueDate: string;
  termNo: number;
  status: string;
  stopName: string | null;
  yearName: string | null;
}

async function fetchMyFees(): Promise<{ bills: StaffBill[]; totalDue: number }> {
  const res = await fetch('/api/boarding/fees');
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load your transport fees');
  return json.data;
}

export default function StaffFeesPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['staff-fees'], queryFn: fetchMyFees });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your transport fees…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>We could not load your transport fees. Please try again, or contact the transport office.</span>
        </div>
      </div>
    );
  }

  const bills = data?.bills ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Transport Fees</h1>
        <p className="text-gray-600">Your transport fee for the current year.</p>
      </div>

      {bills.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800">
          You have no transport fee bills.
        </div>
      ) : (
        <>
          {(data?.totalDue ?? 0) > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
              <p className="text-sm text-amber-800 dark:text-amber-200">Amount due</p>
              <p className="flex items-center text-2xl font-bold text-amber-900 dark:text-amber-100">
                <IndianRupee className="mr-1 h-5 w-5" />
                {formatInr(data?.totalDue ?? 0).replace('₹', '')}
              </p>
            </div>
          )}

          <div className="space-y-3">
            {bills.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">
                    {b.yearName ? `Transport fee ${b.yearName}` : 'Transport fee'}
                  </p>
                  <p className="truncate text-sm text-gray-500">
                    Due {b.dueDate}
                    {b.stopName ? ` · ${b.stopName}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold text-gray-900">{formatInr(b.amount)}</p>
                  {b.status === 'paid' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Paid
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-amber-600">Unpaid</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="text-sm text-gray-500">
            To pay, contact the transport office. This page updates once your payment is recorded.
          </p>
        </>
      )}
    </div>
  );
}
