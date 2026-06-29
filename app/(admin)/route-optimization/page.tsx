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
  MapPin,
  HelpCircle,
  X,
  GitMerge,
  Gauge,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type {
  ConsolidationClass,
  ConsolidationSuggestion,
  MergeSuggestion,
  OptimizationAnalysis,
  RightsizeSuggestion,
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
  mode: 'today_booking' | 'permanent';
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
function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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

function GuideStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
        {n}
      </span>
      <div>
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <p className="text-sm leading-relaxed text-gray-600">{children}</p>
      </div>
    </li>
  );
}

function GuideFeature({
  icon, tone, title, children,
}: {
  icon: React.ReactNode;
  tone: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-gray-100 bg-gray-50/50 p-3">
      <span className={`mt-0.5 shrink-0 ${tone}`}>{icon}</span>
      <div>
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <p className="text-sm leading-relaxed text-gray-600">{children}</p>
      </div>
    </div>
  );
}

function SuggestionRow({
  s,
  selected,
  onToggle,
  routeOptions,
  targets,
  onTarget,
}: {
  s: ConsolidationSuggestion;
  selected: boolean;
  onToggle: (routeId: string) => void;
  routeOptions: { id: string; label: string; spare: number }[];
  targets: Record<string, string>;
  onTarget: (learnerId: string, routeId: string) => void;
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
                      <select
                        value={targets[r.learnerId] ?? ''}
                        onChange={(e) => onTarget(r.learnerId, e.target.value)}
                        className="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900"
                      >
                        <option value="">— pick a bus —</option>
                        {routeOptions
                          .filter((o) => o.id !== s.routeId)
                          .map((o) => (
                            <option key={o.id} value={o.id} disabled={o.spare <= 0 && o.id !== (r.feasible ? r.targetRouteId : '')}>
                              {o.label} ({o.spare} free){r.feasible && o.id === r.targetRouteId ? ' · suggested' : ''}
                            </option>
                          ))}
                      </select>
                      {targets[r.learnerId] && !r.feasible && (
                        <span className="mt-1 block text-xs text-amber-600 dark:text-amber-400">manual override</span>
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
  const [horizon, setHorizon] = useState<'daily' | 'planning'>('daily');
  const [date, setDate] = useState(todayIso());
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(() => addDaysIso(todayIso(), 13));
  const [peak, setPeak] = useState<{ date: string; totalBookings: number; daysWithBookings: number } | null>(null);
  const [threshold, setThreshold] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<OptimizationAnalysis | null>(null);
  const [appliedRuns, setAppliedRuns] = useState<AppliedRun[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<'today_booking' | 'permanent'>('today_booking');
  const [mergeConfirm, setMergeConfirm] = useState<MergeSuggestion | null>(null);
  const [applyingMerge, setApplyingMerge] = useState(false);
  const [rsConfirm, setRsConfirm] = useState<RightsizeSuggestion | null>(null);
  const [applyingRs, setApplyingRs] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    try {
      const qs = new URLSearchParams({ threshold: String(threshold) });
      if (horizon === 'planning') {
        qs.set('from', from);
        qs.set('to', to);
      } else {
        qs.set('date', date);
      }
      const res = await fetch(`/api/admin/route-optimization?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to analyze');
      setAnalysis(json.data as OptimizationAnalysis);
      setAppliedRuns((json.appliedRuns as AppliedRun[]) ?? []);
      setPeak((json.peak as { date: string; totalBookings: number; daysWithBookings: number } | null) ?? null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to analyze';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [date, threshold, horizon, from, to]);

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

  const routeOptions = useMemo(() => {
    const rs = analysis?.routes ?? [];
    return rs.map((r) => ({
      id: r.routeId,
      label: `${r.routeName}${r.routeNumber ? ` #${r.routeNumber}` : ''}`,
      spare: Math.max(0, r.capacity - r.currentPassengers),
    }));
  }, [analysis]);

  useEffect(() => {
    if (!analysis) return;
    const init: Record<string, string> = {};
    for (const s of analysis.suggestions)
      for (const r of s.relocations)
        init[r.learnerId] = r.feasible && r.targetRouteId ? r.targetRouteId : '';
    setTargets(init);
  }, [analysis]);

  const selectedSuggestions = useMemo(
    () => (analysis?.suggestions ?? []).filter((s) => selected.has(s.routeId)),
    [analysis, selected]
  );
  const selectedMoves = useMemo(
    () => selectedSuggestions.reduce((sum, s) => sum + s.relocatablePassengers, 0),
    [selectedSuggestions]
  );

  const applySelected = useCallback(async (applyMode: 'today_booking' | 'permanent') => {
    setApplying(true);
    try {
      const moves: { learnerId: string; fromRouteId: string; toRouteId: string }[] = [];
      for (const s of (analysis?.suggestions ?? []).filter((x) => selected.has(x.routeId)))
        for (const r of s.relocations) {
          const to = targets[r.learnerId];
          if (to) moves.push({ learnerId: r.learnerId, fromRouteId: s.routeId, toRouteId: to });
        }
      if (moves.length === 0) { toast.error('No targets chosen for the selected routes'); return; }
      const useDate = horizon === 'planning' ? peak?.date ?? to : date;
      const res = await fetch('/api/admin/route-optimization/execute-transfers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: useDate, threshold, mode: applyMode, moves }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to apply');
      const r = json.result;
      toast.success(`Applied ${r.applied} move(s)${r.skipped.length ? `, ${r.skipped.length} skipped` : ''}`);
      setConfirmOpen(false);
      await runAnalysis();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to apply');
    } finally {
      setApplying(false);
    }
  }, [analysis, selected, targets, date, threshold, horizon, peak, to, runAnalysis]);

  const applyMerge = useCallback(
    async (merge: MergeSuggestion, applyMode: 'today_booking' | 'permanent') => {
      setApplyingMerge(true);
      try {
        const moves = merge.relocations.map((r) => ({
          learnerId: r.learnerId,
          fromRouteId: merge.mergedRouteId,
          toRouteId: merge.survivorRouteId,
        }));
        if (moves.length === 0) {
          toast.error('Nothing to merge');
          return;
        }
        const useDate = horizon === 'planning' ? peak?.date ?? to : date;
        const res = await fetch('/api/admin/route-optimization/execute-transfers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: useDate, threshold, mode: applyMode, moves }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to merge');
        const r = json.result;
        toast.success(
          `Merged ${r.applied} passenger(s)${r.skipped.length ? `, ${r.skipped.length} skipped` : ''}`
        );
        setMergeConfirm(null);
        await runAnalysis();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to merge');
      } finally {
        setApplyingMerge(false);
      }
    },
    [date, threshold, horizon, peak, to, runAnalysis]
  );

  const applyRightsize = useCallback(
    async (sg: RightsizeSuggestion) => {
      if (!sg.recommendedVehicleId) return;
      setApplyingRs(true);
      try {
        const useDate = horizon === 'planning' ? peak?.date ?? to : date;
        const res = await fetch('/api/admin/route-optimization/apply-vehicle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: useDate, swaps: [{ routeId: sg.routeId, toVehicleId: sg.recommendedVehicleId }] }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to change vehicle');
        const r = json.result;
        toast.success(r.applied > 0 ? 'Vehicle reassigned' : r.skipped?.[0]?.reason || 'No change applied');
        setRsConfirm(null);
        await runAnalysis();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to change vehicle');
      } finally {
        setApplyingRs(false);
      }
    },
    [date, horizon, peak, to, runAnalysis]
  );

  const runGeocode = useCallback(async () => {
    setGeocoding(true);
    setGeoMsg('Starting…');
    try {
      let total = 0;
      // Loop batches until none remain (or a batch makes no progress).
      for (let i = 0; i < 100; i++) {
        const res = await fetch('/api/admin/route-optimization/geocode-stops', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 40 }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Geocoding failed');
        total += json.result.geocoded;
        setGeoMsg(`Geocoded ${total}, ${json.result.remaining} remaining…`);
        if (json.result.remaining === 0 || json.result.geocoded === 0) break;
      }
      setGeoMsg(`Done — ${total} stop(s) geocoded. Re-analyze to use proximity matching.`);
      toast.success(`Geocoded ${total} stop(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Geocoding failed');
      setGeoMsg(null);
    } finally {
      setGeocoding(false);
    }
  }, []);

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
    <div className="space-y-5 p-4 sm:space-y-6 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="shrink-0 rounded-xl bg-blue-50 p-2 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
            <Zap className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Route Optimization</h1>
            <p className="mt-1 text-sm text-gray-600">
              Analyze daily bookings to find under-used buses whose passengers can be consolidated
              onto routes that already serve their boarding stops — then apply (and undo) the moves.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          aria-label="How route optimization works"
          className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <HelpCircle className="h-4 w-4 text-blue-600" />
          <span className="hidden sm:inline">How it works</span>
        </button>
      </div>

      {/* Controls */}
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
        <div className="inline-flex rounded-lg border border-gray-300 p-0.5">
          {(['daily', 'planning'] as const).map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => {
                setHorizon(h);
                if (h === 'planning') setMode('permanent');
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                horizon === h ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {h === 'daily' ? 'Daily' : 'Planning'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          {horizon === 'daily' ? (
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
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <label htmlFor="opt-from" className="text-sm font-medium text-gray-700">From</label>
                <input id="opt-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="opt-to" className="text-sm font-medium text-gray-700">To</label>
                <input id="opt-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
              </div>
            </>
          )}
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
          <button
            type="button"
            onClick={runGeocode}
            disabled={geocoding}
            title="Fill in stop coordinates so transfers can also match nearby stops"
            className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
          >
            {geocoding ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            {geocoding ? 'Geocoding…' : 'Geocode stops'}
          </button>
          {geoMsg && <span className="text-xs text-gray-500">{geoMsg}</span>}
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
          {horizon === 'planning' && (
            <div className="flex items-start gap-2 rounded-xl border border-purple-200 bg-purple-50 p-4 text-sm text-purple-800 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-300">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Planning view — sized to the busiest day in {from} → {to}
                {peak ? (
                  <>
                    : <strong>{peak.date}</strong> ({peak.totalBookings} booking(s) across {peak.daysWithBookings} active day(s)).
                  </>
                ) : (
                  ' (no bookings found in this range).'
                )}{' '}
                Applying changes defaults to a permanent allocation.
              </span>
            </div>
          )}
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
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Applied</th>
                      <th className="px-4 py-2.5 font-medium">Mode</th>
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
                        <td className="px-4 py-2.5">
                          {run.mode === 'permanent' ? (
                            <Badge label="Permanent" cls="bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300" />
                          ) : (
                            <Badge label="Today" cls="bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" />
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-900">{run.total_moves}</td>
                        <td className="px-4 py-2.5 text-gray-900">
                          {run.mode === 'permanent' ? <span className="text-gray-400">—</span> : run.routes_cancelled}
                        </td>
                        <td className="px-4 py-2.5 text-gray-900">
                          {run.mode === 'permanent' ? <span className="text-gray-400">—</span> : inr(run.estimated_savings)}
                        </td>
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

          {/* Combine buses (whole-route merges) */}
          {analysis.merges.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-gray-900">Combine buses</h2>
                <span className="text-sm text-gray-500">
                  {analysis.merges.length} bus(es) can be freed by merging whole routes
                </span>
              </div>
              <div className="space-y-3">
                {analysis.merges.map((m) => (
                  <div key={m.mergedRouteId} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <Bus className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
                        <div>
                          <p className="font-semibold text-gray-900">
                            {m.mergedRouteName}
                            {m.mergedRouteNumber && <span className="text-gray-500"> #{m.mergedRouteNumber}</span>}
                            <ArrowRight className="mx-2 inline h-4 w-4 text-gray-400" />
                            {m.survivorRouteName}
                            {m.survivorRouteNumber && <span className="text-gray-500"> #{m.survivorRouteNumber}</span>}
                          </p>
                          <p className="mt-0.5 text-sm text-gray-600">
                            {m.relocations.length} passenger(s) · survivor {m.combinedPassengers}/{m.survivorCapacity} after merge · {m.overlapStops} shared stop(s)
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {m.estimatedSavings > 0 && (
                          <span className="text-sm font-medium text-green-700 dark:text-green-400">
                            ~{inr(m.estimatedSavings)}/day
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setMergeConfirm(m)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-rose-700"
                        >
                          Merge
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Right-size vehicles */}
          {analysis.rightsize.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-gray-900">Right-size vehicles</h2>
                <span className="text-sm text-gray-500">Match each bus to its demand</span>
              </div>
              <div className="space-y-3">
                {analysis.rightsize.map((rs) => {
                  const tone =
                    rs.kind === 'upsize' ? 'text-amber-600' : rs.kind === 'no_fit' ? 'text-red-600' : 'text-blue-600';
                  const badge =
                    rs.kind === 'downsize'
                      ? { label: 'Downsize', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' }
                      : rs.kind === 'upsize'
                        ? { label: 'Upsize', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' }
                        : { label: 'No fit', cls: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300' };
                  return (
                    <div key={rs.routeId} className="rounded-xl border border-gray-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-start gap-2">
                          <Bus className={`mt-0.5 h-5 w-5 shrink-0 ${tone}`} />
                          <div>
                            <p className="font-semibold text-gray-900">
                              {rs.routeName}
                              {rs.routeNumber && <span className="text-gray-500"> #{rs.routeNumber}</span>}
                            </p>
                            <p className="mt-0.5 text-sm text-gray-600">{rs.reason}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge label={badge.label} cls={badge.cls} />
                          {rs.recommendedVehicleId && (
                            <button
                              type="button"
                              onClick={() => setRsConfirm(rs)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                            >
                              Change vehicle
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
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
                    routeOptions={routeOptions}
                    targets={targets}
                    onTarget={(learnerId, routeId) =>
                      setTargets((prev) => ({ ...prev, [learnerId]: routeId }))
                    }
                  />
                ))}
              </div>
            )}
          </section>

          {/* Occupancy table */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">Route occupancy</h2>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full min-w-[560px] text-sm">
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
        <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-xl border border-blue-200 bg-white p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between dark:border-blue-500/30">
          <span className="text-sm text-gray-700">
            <strong>{selected.size}</strong> route(s) selected ·{' '}
            <strong>{selectedMoves}</strong> passenger move(s)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="flex-1 cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:flex-none sm:py-1.5"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 sm:flex-none sm:py-1.5"
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
            <fieldset className="mt-4 space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="radio" name="mode" checked={mode === 'today_booking'} onChange={() => setMode('today_booking')} />
                Today only — move this date&apos;s bookings
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="radio" name="mode" checked={mode === 'permanent'} onChange={() => setMode('permanent')} />
                Permanent — change the learners&apos; standing route (does not alter this date&apos;s booking)
              </label>
            </fieldset>
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
                onClick={() => applySelected(mode)}
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

      {/* Merge confirm modal */}
      {mergeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Combine these buses?</h3>
            <p className="mt-2 text-sm text-gray-600">
              Move <strong>{mergeConfirm.relocations.length}</strong> passenger(s) from{' '}
              <strong>{mergeConfirm.mergedRouteName}</strong> onto{' '}
              <strong>{mergeConfirm.survivorRouteName}</strong> for <strong>{date}</strong>, freeing
              1 bus. You can undo this run afterwards from the Applied runs list.
            </p>
            <fieldset className="mt-4 space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="radio" name="merge-mode" checked={mode === 'today_booking'} onChange={() => setMode('today_booking')} />
                Today only — move this date&apos;s bookings
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="radio" name="merge-mode" checked={mode === 'permanent'} onChange={() => setMode('permanent')} />
                Permanent — change the learners&apos; standing route
              </label>
            </fieldset>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMergeConfirm(null)}
                disabled={applyingMerge}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => applyMerge(mergeConfirm, mode)}
                disabled={applyingMerge}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-60"
              >
                {applyingMerge && <Loader2 className="h-4 w-4 animate-spin" />}
                {applyingMerge ? 'Merging…' : 'Confirm & merge'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Right-size confirm modal */}
      {rsConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Change this route&apos;s vehicle?</h3>
            <p className="mt-2 text-sm text-gray-600">
              Reassign <strong>{rsConfirm.routeName}</strong> to a{' '}
              <strong>{rsConfirm.recommendedCapacity}-seat</strong> bus
              {rsConfirm.recommendedLabel ? ` (${rsConfirm.recommendedLabel})` : ''}. This is a standing
              fleet change you can undo from the Applied runs list.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRsConfirm(null)}
                disabled={applyingRs}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => applyRightsize(rsConfirm)}
                disabled={applyingRs}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
              >
                {applyingRs && <Loader2 className="h-4 w-4 animate-spin" />}
                {applyingRs ? 'Changing…' : 'Confirm & change'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* "How it works" guide */}
      {guideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setGuideOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="guide-title"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-xl sm:p-6"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-blue-50 p-1.5 text-blue-600">
                  <HelpCircle className="h-5 w-5" />
                </span>
                <h2 id="guide-title" className="text-lg font-semibold text-gray-900">
                  How route optimization works
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                aria-label="Close"
                className="cursor-pointer rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <ol className="space-y-3">
              <GuideStep n={1} title="Reads real bookings">
                Occupancy is the live count of actual bookings for the selected day — never sample data.
              </GuideStep>
              <GuideStep n={2} title="Classifies each route">
                Empty (0 booked), Under-utilized (≤ your threshold % of capacity), or Healthy. Capacity comes from the route&apos;s assigned vehicle.
              </GuideStep>
              <GuideStep n={3} title="Matches stops">
                A passenger can move to another route only if it serves their stop by name + pickup time (±15 min) — or a nearby stop once coordinates are geocoded.
              </GuideStep>
              <GuideStep n={4} title="You apply, and can undo">
                Nothing changes until you confirm. Every applied run is recorded and reversible from “Applied runs”.
              </GuideStep>
            </ol>

            <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Features enabled
            </h3>
            <div className="space-y-2.5">
              <GuideFeature icon={<GitMerge className="h-5 w-5" />} tone="text-rose-600" title="Combine buses (merge)">
                Folds an under-used route entirely into a survivor route that has room and serves all its stops — freeing a whole bus.
              </GuideFeature>
              <GuideFeature icon={<Users className="h-5 w-5" />} tone="text-emerald-600" title="Consolidation">
                Moves individual passengers off an under-used bus onto compatible routes that still have free seats.
              </GuideFeature>
              <GuideFeature icon={<Gauge className="h-5 w-5" />} tone="text-blue-600" title="Right-size vehicles">
                Suggests swapping a route to a better-fitting spare bus (downsize or upsize) based on its actual demand.
              </GuideFeature>
              <GuideFeature icon={<History className="h-5 w-5" />} tone="text-purple-600" title="Daily & Planning horizons">
                Daily optimizes a single date; Planning sizes decisions to the busiest day across a date range.
              </GuideFeature>
              <GuideFeature icon={<MapPin className="h-5 w-5" />} tone="text-amber-600" title="Geocoding">
                Fills in stop coordinates so transfers can also match nearby, differently-named stops.
              </GuideFeature>
              <GuideFeature icon={<Undo2 className="h-5 w-5" />} tone="text-gray-600" title="Undo">
                Any applied run can be rolled back — booking moves and vehicle changes are both restored.
              </GuideFeature>
            </div>

            <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-gray-600">
              <strong className="text-gray-800">Today vs Permanent:</strong> “Today” changes only the
              selected date&apos;s bookings; “Permanent” changes the learner&apos;s standing route. Savings
              figures are estimates based on each bus&apos;s daily operating cost.
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
