'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Zap,
  Bus,
  Users,
  Ticket,
  AlertTriangle,
  CircleSlash,
  IndianRupee,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Info,
  Undo2,
  History,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type {
  ConsolidationClass,
  ConsolidationSuggestion,
  OptimizationAnalysis,
  RouteClassification,
} from '@/lib/route-optimization/types';

interface AppliedRun {
  id: string;
  travel_date: string;
  threshold_percent: number;
  total_moves: number;
  routes_cancelled: number;
  estimated_savings: number;
  status: 'applied' | 'rolled_back';
  created_at: string;
  rolled_back_at: string | null;
}

const inputCls =
  'h-[38px] rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

const routeClassBadge: Record<RouteClassification, { label: string; cls: string }> = {
  empty: { label: 'Empty', cls: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-200' },
  under_utilized: {
    label: 'Under-utilized',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  },
  healthy: {
    label: 'Healthy',
    cls: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
  },
};

const consolidationBadge: Record<ConsolidationClass, { label: string; cls: string }> = {
  cancel_empty: {
    label: 'Cancel — no bookings',
    cls: 'bg-slate-100 text-slate-700 dark:bg-slate-600/40 dark:text-slate-200',
  },
  full_transfer: {
    label: 'Can cancel — all transferable',
    cls: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
  },
  partial_transfer: {
    label: 'Partial — some transferable',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  },
  no_transfer: {
    label: 'No transfer possible',
    cls: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  },
};

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function fmtTime(d: string): string {
  return new Date(d).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
/** A suggestion can be applied if it actually moves or frees a bus. */
function isApplicable(s: ConsolidationSuggestion): boolean {
  return s.relocatablePassengers > 0 || s.classification === 'cancel_empty';
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 text-gray-600">
        <span className={accent}>{icon}</span>
        <span className="text-sm">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function SuggestionRow({
  s,
  selected,
  onToggle,
}: {
  s: ConsolidationSuggestion;
  selected: boolean;
  onToggle: (routeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const badge = consolidationBadge[s.classification];
  const hasRelocations = s.relocations.length > 0;
  const applicable = isApplicable(s);

  return (
    <div
      className={`rounded-xl border bg-white ${
        selected ? 'border-blue-400 ring-1 ring-blue-300' : 'border-gray-200'
      }`}
    >
      <div className="flex items-center gap-3 p-4">
        <input
          type="checkbox"
          checked={selected}
          disabled={!applicable}
          onChange={() => onToggle(s.routeId)}
          aria-label={`Select ${s.routeName} for consolidation`}
          className="h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40"
        />
        <button
          type="button"
          onClick={() => hasRelocations && setOpen((o) => !o)}
          className="flex flex-1 items-center justify-between gap-3 text-left"
        >
          <div className="flex items-start gap-2">
            {hasRelocations ? (
              open ? (
                <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-gray-400" />
              ) : (
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-gray-400" />
              )
            ) : (
              <span className="mt-1 h-4 w-4 shrink-0" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900">{s.routeName}</h3>
                {s.routeNumber && <span className="text-sm text-gray-500">#{s.routeNumber}</span>}
              </div>
              <p className="mt-0.5 text-sm text-gray-600">
                {s.currentPassengers}/{s.capacity} seats booked · {s.relocatablePassengers} of{' '}
                {s.currentPassengers} transferable
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge label={badge.label} cls={badge.cls} />
            {s.estimatedSavings > 0 && (
              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                ~{inr(s.estimatedSavings)}/day
              </span>
            )}
          </div>
        </button>
      </div>

      {open && hasRelocations && (
        <div className="border-t border-gray-100 p-4">
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Learner</th>
                  <th className="px-3 py-2 font-medium">Boarding stop</th>
                  <th className="px-3 py-2 font-medium">Moves to</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {s.relocations.map((r) => (
                  <tr key={r.learnerId}>
                    <td className="px-3 py-2 text-gray-900">
                      {r.learnerName}
                      {r.learnerRoll && <span className="ml-1 text-gray-500">({r.learnerRoll})</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{r.boardingStop || '—'}</td>
                    <td className="px-3 py-2">
                      {r.feasible ? (
                        <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
                          <ArrowRight className="h-3.5 w-3.5" />
                          {r.targetRouteName}
                          {r.targetRouteNumber && (
                            <span className="text-gray-500">#{r.targetRouteNumber}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400" title={r.reason ?? ''}>
                          {r.reason || 'Not transferable'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RouteOptimizationPage() {
  const [date, setDate] = useState(todayIso());
  const [threshold, setThreshold] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<OptimizationAnalysis | null>(null);
  const [appliedRuns, setAppliedRuns] = useState<AppliedRun[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [rollingBack, setRollingBack] = useState<string | null>(null);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    try {
      const qs = new URLSearchParams({ date, threshold: String(threshold) });
      const res = await fetch(`/api/admin/route-optimization?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to analyze');
      setAnalysis(json.data as OptimizationAnalysis);
      setAppliedRuns((json.appliedRuns as AppliedRun[]) ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to analyze';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [date, threshold]);

  useEffect(() => {
    runAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = useCallback((routeId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(routeId)) next.delete(routeId);
      else next.add(routeId);
      return next;
    });
  }, []);

  const selectedSuggestions = useMemo(
    () => (analysis?.suggestions ?? []).filter((s) => selected.has(s.routeId)),
    [analysis, selected]
  );
  const selectedMoves = useMemo(
    () => selectedSuggestions.reduce((sum, s) => sum + s.relocatablePassengers, 0),
    [selectedSuggestions]
  );

  const applySelected = useCallback(async () => {
    setApplying(true);
    try {
      const res = await fetch('/api/admin/route-optimization/execute-transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, threshold, routeIds: Array.from(selected) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to apply');
      const r = json.result;
      toast.success(
        `Moved ${r.totalMoves} passenger(s)${r.routesCancelled ? `, freed ${r.routesCancelled} bus(es)` : ''}`
      );
      setConfirmOpen(false);
      await runAnalysis();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to apply');
    } finally {
      setApplying(false);
    }
  }, [date, threshold, selected, runAnalysis]);

  const undoRun = useCallback(
    async (runId: string) => {
      setRollingBack(runId);
      try {
        const res = await fetch('/api/admin/route-optimization/rollback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to undo');
        toast.success(`Restored ${json.result.restored} booking(s)`);
        await runAnalysis();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to undo');
      } finally {
        setRollingBack(null);
      }
    },
    [runAnalysis]
  );

  const s = analysis?.summary;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-blue-50 p-2 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
          <Zap className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Route Optimization</h1>
          <p className="mt-1 text-sm text-gray-600">
            Analyze daily bookings to find under-used buses whose passengers can be consolidated
            onto routes that already serve their boarding stops — then apply (and undo) the moves.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="opt-date" className="text-sm font-medium text-gray-700">
              Travel date
            </label>
            <input
              id="opt-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="opt-threshold" className="text-sm font-medium text-gray-700">
              Under-utilized at ≤ (% of capacity)
            </label>
            <input
              id="opt-threshold"
              type="number"
              min={1}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className={`${inputCls} w-28`}
            />
          </div>
          <button
            type="button"
            onClick={runAnalysis}
            disabled={loading}
            className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {loading ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && !analysis && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white p-12 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Analyzing bookings…
        </div>
      )}

      {analysis && s && (
        <div className="space-y-6">
          {s.totalBookings === 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                No bookings are recorded for {analysis.date} yet, so every active bus would run
                empty. Once the daily booking feature is in use, this view will populate with real
                occupancy and consolidation suggestions.
              </span>
            </div>
          )}

          {/* Summary */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <StatCard icon={<Bus className="h-5 w-5" />} label="Active routes" value={s.activeRoutes} accent="text-blue-500" />
            <StatCard icon={<Ticket className="h-5 w-5" />} label="Total bookings" value={s.totalBookings} accent="text-indigo-500" />
            <StatCard icon={<Users className="h-5 w-5" />} label="Routes booked" value={s.routesWithBookings} accent="text-emerald-500" />
            <StatCard icon={<AlertTriangle className="h-5 w-5" />} label="Under-utilized" value={s.underUtilizedRoutes} accent="text-amber-500" />
            <StatCard icon={<CircleSlash className="h-5 w-5" />} label="Cancellable buses" value={s.cancellableBuses} accent="text-rose-500" />
            <StatCard icon={<IndianRupee className="h-5 w-5" />} label="Est. savings/day" value={inr(s.estimatedSavings)} accent="text-green-600" />
          </div>

          {/* Applied runs */}
          {appliedRuns.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                <History className="h-5 w-5 text-gray-400" /> Applied runs for {analysis.date}
              </h2>
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Applied</th>
                      <th className="px-4 py-2.5 font-medium">Moves</th>
                      <th className="px-4 py-2.5 font-medium">Buses freed</th>
                      <th className="px-4 py-2.5 font-medium">Est. savings</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {appliedRuns.map((run) => (
                      <tr key={run.id}>
                        <td className="px-4 py-2.5 text-gray-600">{fmtTime(run.created_at)}</td>
                        <td className="px-4 py-2.5 text-gray-900">{run.total_moves}</td>
                        <td className="px-4 py-2.5 text-gray-900">{run.routes_cancelled}</td>
                        <td className="px-4 py-2.5 text-gray-900">{inr(run.estimated_savings)}</td>
                        <td className="px-4 py-2.5">
                          {run.status === 'applied' ? (
                            <Badge label="Applied" cls="bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300" />
                          ) : (
                            <Badge label="Rolled back" cls="bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-200" />
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {run.status === 'applied' && (
                            <button
                              type="button"
                              onClick={() => undoRun(run.id)}
                              disabled={rollingBack === run.id}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
                            >
                              {rollingBack === run.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Undo2 className="h-3.5 w-3.5" />
                              )}
                              Undo
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Suggestions */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">Consolidation suggestions</h2>
              <span className="text-sm text-gray-500">Select routes to consolidate, then apply</span>
            </div>
            {analysis.suggestions.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
                No under-used routes for this date — every active bus is healthy.
              </div>
            ) : (
              <div className="space-y-3">
                {analysis.suggestions.map((sug) => (
                  <SuggestionRow
                    key={sug.routeId}
                    s={sug}
                    selected={selected.has(sug.routeId)}
                    onToggle={toggle}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Occupancy table */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">Route occupancy</h2>
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Route</th>
                    <th className="px-4 py-2.5 font-medium">Booked / capacity</th>
                    <th className="px-4 py-2.5 font-medium">Utilization</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {analysis.routes.map((r) => {
                    const b = routeClassBadge[r.classification];
                    return (
                      <tr key={r.routeId}>
                        <td className="px-4 py-2.5 text-gray-900">
                          {r.routeName}
                          {r.routeNumber && <span className="ml-1 text-gray-500">#{r.routeNumber}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">
                          {r.currentPassengers} / {r.capacity}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100">
                              <div
                                className={`h-full rounded-full ${
                                  r.classification === 'healthy'
                                    ? 'bg-green-500'
                                    : r.classification === 'under_utilized'
                                      ? 'bg-amber-500'
                                      : 'bg-gray-300'
                                }`}
                                style={{ width: `${Math.min(100, r.utilizationPercent)}%` }}
                              />
                            </div>
                            <span className="text-gray-600">{r.utilizationPercent}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge label={b.label} cls={b.cls} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* Sticky apply bar */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-4 rounded-xl border border-blue-200 bg-white p-4 shadow-lg dark:border-blue-500/30">
          <span className="text-sm text-gray-700">
            <strong>{selected.size}</strong> route(s) selected ·{' '}
            <strong>{selectedMoves}</strong> passenger move(s)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Apply selected
            </button>
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Apply consolidation?</h3>
            <p className="mt-2 text-sm text-gray-600">
              This will move <strong>{selectedMoves}</strong> passenger booking(s) across{' '}
              <strong>{selected.size}</strong> route(s) for <strong>{date}</strong> onto healthy
              routes. You can undo this run afterwards from the Applied runs list.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={applying}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applySelected}
                disabled={applying}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
              >
                {applying && <Loader2 className="h-4 w-4 animate-spin" />}
                {applying ? 'Applying…' : 'Confirm & apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
