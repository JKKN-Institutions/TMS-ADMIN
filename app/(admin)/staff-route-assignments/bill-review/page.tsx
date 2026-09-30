'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Clock, IndianRupee, Play } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import UniversalStatCard from '@/components/universal-stat-card';
import { usePermissions } from '@/hooks/use-permissions';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { istToday } from '@/lib/booking/window';
import { previousMonth, monthLabel, type ReviewConfig, type ReviewMode } from '@/lib/fees/incharge-bill-review';
import type { ReviewRowDto } from '@/app/api/admin/incharge-bill-review/route';
import { getReviewColumns } from './columns';

type ReviewData = { month: string; config: ReviewConfig; excused: Array<{ day: string; reason: string }>; rows: ReviewRowDto[] };

async function fetchReview(month: string): Promise<ReviewData> {
  const res = await fetch(`/api/admin/incharge-bill-review?month=${month}`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load');
  return json.data as ReviewData;
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

/** The current month and the five before it, newest first. */
function monthOptions(): string[] {
  const out: string[] = [istToday().slice(0, 7)];
  let cursor = istToday();
  for (let i = 0; i < 5; i++) {
    const m = previousMonth(cursor);
    out.push(m);
    cursor = `${m}-15`;
  }
  return out;
}

const MODE_TEXT: Record<ReviewMode, string> = {
  off: 'Off — nothing runs.',
  preview: 'Preview — shows who would pass; no bill changes.',
  auto: 'Auto — passing staff have their bill cancelled after each month ends.',
};

export default function InchargeBillReviewPage() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canEdit = can(TMS_PERMISSIONS.FEES_EDIT);
  const months = useMemo(monthOptions, []);
  const [month, setMonth] = useState(months[1]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<ReviewConfig | null>(null);
  const [excDay, setExcDay] = useState('');
  const [excReason, setExcReason] = useState('');
  const [confirmApply, setConfirmApply] = useState(false);

  const { data, isLoading, isError } = useQuery({ queryKey: ['incharge-bill-review', month], queryFn: () => fetchReview(month) });
  const config = draft ?? data?.config ?? null;
  const rows = data?.rows ?? [];
  const columns = useMemo(() => getReviewColumns(), []);
  const refresh = () => qc.invalidateQueries({ queryKey: ['incharge-bill-review'] });

  const stats = useMemo(() => ({
    passed: rows.filter((r) => r.outcome === 'passed').length,
    failed: rows.filter((r) => r.outcome === 'failed').length,
    notEnough: rows.filter((r) => r.outcome === 'not_enough_days').length,
    cancelled: rows.reduce((s, r) => s + (r.applied ? r.cancelled_amount : 0), 0),
  }), [rows]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); toast.success(ok); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">In-charge bill review</h1>
          <p className="text-gray-600 dark:text-gray-400">
            A bus in-charge&apos;s staff transport bill is cancelled when, for a full month, their bus was scanned every service day and they marked on at least {data?.config.minPersonalPct ?? 75}% of those days.
          </p>
        </div>
        <select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-[38px] shrink-0 rounded-lg border px-3 text-sm dark:bg-gray-900">
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <UniversalStatCard title="Pass" value={stats.passed} icon={CheckCircle2} color="green" loading={isLoading} />
        <UniversalStatCard title="Fail" value={stats.failed} icon={XCircle} color="red" loading={isLoading} />
        <UniversalStatCard title="Not enough days" value={stats.notEnough} icon={Clock} color="yellow" loading={isLoading} />
        <UniversalStatCard title="Cancelled" value={`Rs ${stats.cancelled.toLocaleString('en-IN')}`} icon={IndianRupee} color="teal" loading={isLoading} />
      </div>

      {canEdit && config && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border p-4 dark:border-gray-700">
            <h2 className="mb-3 font-semibold">Mode</h2>
            <div className="space-y-2">
              {(['off', 'preview', 'auto'] as ReviewMode[]).map((m) => (
                <label key={m} className="flex items-start gap-2 text-sm">
                  <input type="radio" name="mode" checked={config.mode === m} onChange={() => setDraft({ ...config, mode: m })} className="mt-1" />
                  <span>{MODE_TEXT[m]}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <label className="flex items-center gap-2">Own marks %
                <input type="number" min={1} max={100} value={config.minPersonalPct} onChange={(e) => setDraft({ ...config, minPersonalPct: Number(e.target.value) })} className="w-20 rounded border px-2 py-1 dark:bg-gray-900" />
              </label>
              <label className="flex items-center gap-2">Min days
                <input type="number" min={1} max={26} value={config.minRequiredDays} onChange={(e) => setDraft({ ...config, minRequiredDays: Number(e.target.value) })} className="w-20 rounded border px-2 py-1 dark:bg-gray-900" />
              </label>
            </div>
            <button
              disabled={busy || !draft}
              onClick={() => act(async () => { await send('/api/admin/incharge-bill-review/settings', 'PUT', config); setDraft(null); }, 'Settings saved')}
              className="mt-3 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >Save</button>
          </section>

          <section className="rounded-xl border p-4 dark:border-gray-700">
            <h2 className="mb-1 font-semibold">Excused days</h2>
            <p className="mb-3 text-xs text-gray-500">Days that do not count at all (for example a system outage). Holidays in the service calendar and days nobody in the fleet marked are skipped automatically.</p>
            <ul className="mb-3 space-y-1 text-sm">
              {(data?.excused ?? []).map((e) => (
                <li key={e.day} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{e.day} — {e.reason}</span>
                  <button disabled={busy} onClick={() => act(() => send(`/api/admin/incharge-bill-review/excused-days?day=${e.day}`, 'DELETE'), 'Removed')} className="shrink-0 text-xs text-red-600">Remove</button>
                </li>
              ))}
              {(data?.excused ?? []).length === 0 && <li className="text-gray-500">None this month.</li>}
            </ul>
            <div className="flex flex-wrap gap-2">
              <input type="date" aria-label="Excused date" value={excDay} onChange={(e) => setExcDay(e.target.value)} className="rounded border px-2 py-1 text-sm dark:bg-gray-900" />
              <input aria-label="Reason" placeholder="Reason" value={excReason} onChange={(e) => setExcReason(e.target.value)} className="min-w-0 flex-1 rounded border px-2 py-1 text-sm dark:bg-gray-900" />
              <button
                disabled={busy || !excDay || !excReason.trim()}
                onClick={() => act(async () => { await send('/api/admin/incharge-bill-review/excused-days', 'POST', { day: excDay, reason: excReason }); setExcDay(''); setExcReason(''); }, 'Excused day added')}
                className="rounded-lg border border-green-600 px-3 py-1 text-sm text-green-700 disabled:opacity-50 dark:text-green-400"
              >Add</button>
            </div>
          </section>
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => act(() => send('/api/admin/incharge-bill-review/run', 'POST', { month, preview: true }), 'Preview updated')}
            className="inline-flex items-center gap-2 rounded-lg border border-green-600 px-3 py-2 text-sm font-medium text-green-700 disabled:opacity-50 dark:text-green-400">
            <Play className="h-4 w-4" /> Run preview for {monthLabel(month)}
          </button>
          {data?.config.mode === 'auto' && (
            <button disabled={busy} onClick={() => setConfirmApply(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              Apply now (cancels passing bills)
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmApply}
        onOpenChange={setConfirmApply}
        danger
        loading={busy}
        title={`Cancel passing bills for ${monthLabel(month)}?`}
        description="Every in-charge who passed this month will have their outstanding staff transport bill cancelled and will be notified. A cancelled bill cannot be billed again this year. This cannot be undone."
        confirmLabel="Yes, cancel their bills"
        onConfirm={() => act(async () => { await send('/api/admin/incharge-bill-review/run', 'POST', { month, preview: false }); setConfirmApply(false); }, 'Review applied')}
      />

      {isError && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">Could not load the bill review. You may not have permission, or the server failed — try again.</p>
      )}

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        entityName="staff"
        searchPlaceholder="Search staff or route…"
        getRowId={(r) => r.person_id}
        filters={[{ columnId: 'outcome', title: 'Result', options: [
          { label: 'Pass', value: 'passed' }, { label: 'Fail', value: 'failed' }, { label: 'Not enough days', value: 'not_enough_days' },
        ] }]}
      />
    </div>
  );
}
