'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BusScanner } from '@/components/inspections/bus-scanner';
import { classifyScan } from '@/lib/boarding/scan-resolve';
import { OUTCOME_META } from '@/lib/inspections/outcome-meta';
import { scanLearner, type LearnerScanResult } from '@/app/(admin)/inspections/inspection-api';

/** Camera reads only: a JKKN ID card number, or null so the scanner shows its reject message. */
const parseJkknId = (raw: string): string | null => {
  const c = classifyScan(raw, 'camera');
  return c.shape === 'jkkn_id' && !c.refusal ? c.code : null;
};

/** The camera fires ~12 decodes/s; the same card is not re-submitted within this window. */
const SAME_CARD_MS = 4000;
const yn = (b: boolean) => (b ? 'yes' : 'no');

type Verdict = { kind: 'result'; code: string; r: LearnerScanResult } | { kind: 'error'; message: string };
type SessionCheck = { at: number; code: string; r: LearnerScanResult };

export function LearnerScanDialog({ inspectionId, open, onClose }: { inspectionId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<SessionCheck[]>([]);
  const [, setIgnored] = useState(0);
  // Synchronous guard (state lags a render behind the next decode frame):
  // true from the moment a code is accepted until "Scan next".
  const busyRef = useRef(false);
  const lastRef = useRef<{ code: string; at: number } | null>(null);
  // Bumped on close so a reply that lands after the dialog closed shows no stale verdict on reopen.
  const genRef = useRef(0);

  async function onCode(code: string) {
    if (busyRef.current) return;
    const now = Date.now();
    const last = lastRef.current;
    if (last && last.code === code && now - last.at < SAME_CARD_MS) {
      // Same card still in front of the lens — drop it, and re-render so the
      // scanner's internal pause (set on every accepted read) is released.
      setIgnored((n) => n + 1);
      return;
    }
    busyRef.current = true;
    lastRef.current = { code, at: now };
    setBusy(true);
    const gen = genRef.current;
    try {
      const r = await scanLearner(inspectionId, code);
      if (gen === genRef.current) setVerdict({ kind: 'result', code, r });
      setChecks((prev) => [{ at: Date.now(), code, r }, ...prev]);
      void qc.invalidateQueries({ queryKey: ['inspection', inspectionId], exact: true });
    } catch (e) {
      const message = (e as Error).message || 'Could not check the card';
      toast.error(message);
      if (gen === genRef.current) setVerdict({ kind: 'error', message });
    } finally {
      setBusy(false);
    }
  }

  function scanNext() {
    lastRef.current = lastRef.current ? { ...lastRef.current, at: Date.now() } : null;
    setVerdict(null);
    busyRef.current = false;
  }

  function close() {
    genRef.current++;
    setVerdict(null);
    setBusy(false);
    busyRef.current = false;
    lastRef.current = null;
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto rounded-xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Scan learner ID</DialogTitle>
          <DialogDescription>Check only — this never marks attendance.</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          {/* Keep the camera running under the verdict so "Scan next" is instant. */}
          <div className={verdict ? 'hidden' : ''}>
            <BusScanner
              onCode={onCode}
              paused={busy || !!verdict}
              parse={parseJkknId}
              rejectMessage="That QR is not a JKKN ID card. Scan the QR on the learner's ID card."
              subject="ID card"
              photoMode="fresh-only"
            />
            {busy && <p className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">Checking card…</p>}
          </div>

          {verdict?.kind === 'result' && <VerdictCard r={verdict.r} code={verdict.code} />}
          {verdict?.kind === 'error' && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
              {verdict.message}
            </div>
          )}
          {verdict && (
            <button type="button" onClick={scanNext} className="w-full rounded-lg bg-green-600 py-2.5 font-semibold text-white">
              Scan next
            </button>
          )}

          {checks.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Checked this session ({checks.length})</h3>
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                {checks.map((c) => (
                  <li key={`${c.at}-${c.code}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      {c.r.name ?? c.code}
                      {c.r.roll && <span className="text-gray-500 dark:text-gray-400"> · {c.r.roll}</span>}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${OUTCOME_META[c.r.outcome].chip}`}>
                      {OUTCOME_META[c.r.outcome].label}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VerdictCard({ r, code }: { r: LearnerScanResult; code: string }) {
  const meta = OUTCOME_META[r.outcome];
  return (
    <div className={`space-y-1 rounded-xl border p-4 ${meta.card}`}>
      <p className="text-lg font-bold">{meta.icon} {meta.label}</p>
      {r.outcome === 'unknown_card' ? (
        <p className="text-sm">Card {code} is not linked to any current learner.</p>
      ) : (
        <>
          <p className="min-w-0 truncate font-medium">{r.name ?? 'Name not recorded'}{r.roll ? ` · ${r.roll}` : ''}</p>
          <p className="text-sm">
            {r.onThisRoute ? 'On this bus' : 'Belongs to another bus'} · Booked today: {yn(r.bookedToday)} · Boarded: {yn(r.boardedToday)}
            {' · '}Fee: {r.feeLabel ?? (r.feesOk ? 'OK' : 'Due')}
          </p>
        </>
      )}
    </div>
  );
}
