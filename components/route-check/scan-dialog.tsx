'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BusScanner } from '@/components/inspections/bus-scanner';
import { classifyCard } from '@/lib/route-check/card';
import { CHECK_OUTCOME_META } from '@/lib/route-check/outcome-meta';
import type { ScanResponse, CheckPersonEntry } from '@/lib/route-check/types';
import type { Candidate } from '@/lib/route-check/resolve';
import { scanCode, pickCandidate } from '@/app/boarding/route-check/route-check-api';
import { CandidatePicker } from './candidate-picker';

/** Camera reads only: a JKKN ID card number, a legacy UUID, or an id_code barcode — null rejects the read. */
const parseCard = (raw: string): string | null => {
  const c = classifyCard(raw);
  return c.shape === 'unknown' ? null : c.code;
};

/** The camera fires ~12 decodes/s; the same card is not re-submitted within this window. */
const SAME_CARD_MS = 4000;
const yn = (b: boolean | null) => (b == null ? '—' : b ? 'yes' : 'no');

const FEE_LABEL: Record<NonNullable<CheckPersonEntry['feeState']>, (owed: number | null) => string> = {
  paid: () => 'Paid',
  unpaid: (owed) => `Unpaid${owed != null ? ` ₹${owed}` : ''}`,
  none: () => 'No bill',
  unknown: () => '—',
  exempt: () => 'Exempt',
};

type Verdict =
  | { kind: 'recorded'; code: string; r: Extract<ScanResponse, { kind: 'recorded' }> }
  | { kind: 'candidates'; code: string; candidates: Candidate[] }
  | { kind: 'error'; message: string };
type SessionCheck = { at: number; code: string; entry: CheckPersonEntry; alreadyChecked: boolean };

export function RouteCheckScanDialog({ checkId, routeId, open, onClose }: { checkId: string; routeId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<SessionCheck[]>([]);
  const [, setIgnored] = useState(0);
  // Synchronous guard (state lags a render behind the next decode frame):
  // true from the moment a code is accepted until "Scan next" — this also
  // covers the whole candidates-picker interval, so the scanner stays blocked
  // while a pick is pending. A separate ref guards re-entrancy on the picker
  // itself (busyRef is already true throughout that window).
  const busyRef = useRef(false);
  const pickingRef = useRef(false);
  const lastRef = useRef<{ code: string; at: number } | null>(null);
  // Bumped on close so a reply that lands after the dialog closed shows no stale verdict on reopen.
  const genRef = useRef(0);

  function recordChecked(entry: CheckPersonEntry, alreadyChecked: boolean) {
    setChecks((prev) => [{ at: Date.now(), code: entry.code ?? entry.scannedCode ?? '', entry, alreadyChecked }, ...prev]);
    void qc.invalidateQueries({ queryKey: ['route-check', checkId], exact: true });
  }

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
      const res = await scanCode(checkId, code);
      if (res.kind === 'recorded') {
        if (gen === genRef.current) setVerdict({ kind: 'recorded', code, r: res });
        recordChecked(res.entry, res.alreadyChecked);
      } else {
        if (gen === genRef.current) setVerdict({ kind: 'candidates', code: res.code, candidates: res.candidates });
      }
    } catch (e) {
      const message = (e as Error).message || 'Could not check the card';
      toast.error(message);
      if (gen === genRef.current) setVerdict({ kind: 'error', message });
    } finally {
      setBusy(false);
    }
  }

  async function onPick(code: string, c: Candidate) {
    // Note: busyRef is already true here (set by onCode when the candidates
    // response came in, and never released while the picker is showing) —
    // guarding on it would make every tap a no-op. pickingRef is the
    // re-entrancy guard for the picker itself (double-tap protection).
    if (pickingRef.current) return;
    pickingRef.current = true;
    setBusy(true);
    const gen = genRef.current;
    try {
      const res = await pickCandidate(checkId, { personKind: c.personKind, id: c.id, matchedBy: c.matchedBy, scannedCode: code });
      if (res.kind === 'recorded') {
        if (gen === genRef.current) setVerdict({ kind: 'recorded', code, r: res });
        recordChecked(res.entry, res.alreadyChecked);
      } else {
        // Shouldn't happen (a specific person was chosen), but stay on the picker's data if it does.
        if (gen === genRef.current) setVerdict({ kind: 'candidates', code: res.code, candidates: res.candidates });
      }
    } catch (e) {
      const message = (e as Error).message || 'Could not check the card';
      toast.error(message);
      if (gen === genRef.current) setVerdict({ kind: 'error', message });
    } finally {
      pickingRef.current = false;
      setBusy(false);
    }
  }

  function cancelPick() {
    // Return to scanning without recording anything. lastRef is deliberately
    // left set: re-scanning the SAME card within SAME_CARD_MS is still
    // suppressed (it's the card still under the lens); a different card is
    // accepted immediately.
    setVerdict(null);
    busyRef.current = false;
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
    pickingRef.current = false;
    lastRef.current = null;
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto rounded-xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Scan ID card</DialogTitle>
          <DialogDescription>Ticks this route check — never marks boarding attendance.</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          {/* Keep the camera running under the verdict so "Scan next" is instant. */}
          <div className={verdict ? 'hidden' : ''}>
            <BusScanner
              onCode={onCode}
              paused={busy || !!verdict}
              formats={[Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.CODE_39, Html5QrcodeSupportedFormats.CODE_128]}
              frame="wide"
              readerId="route-check"
              parse={parseCard}
              photoMode="fresh-only"
              subject="ID card"
              rejectMessage="That code is not a JKKN ID card or ID barcode."
            />
            {busy && <p className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">Checking card…</p>}
          </div>

          {verdict?.kind === 'recorded' && <VerdictCard code={verdict.code} r={verdict.r} />}
          {verdict?.kind === 'candidates' && (
            <CandidatePicker
              code={verdict.code}
              candidates={verdict.candidates}
              routeId={routeId}
              busy={busy}
              onPick={(c) => void onPick(verdict.code, c)}
              onCancel={cancelPick}
            />
          )}
          {verdict?.kind === 'error' && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
              {verdict.message}
            </div>
          )}
          {(verdict?.kind === 'recorded' || verdict?.kind === 'error') && (
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
                      {c.entry.name ?? c.code}
                      {c.entry.code && <span className="text-gray-500 dark:text-gray-400"> · {c.entry.code}</span>}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${CHECK_OUTCOME_META[c.entry.outcome].chip}`}>
                      {CHECK_OUTCOME_META[c.entry.outcome].label}
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

function VerdictCard({ code, r }: { code: string; r: Extract<ScanResponse, { kind: 'recorded' }> }) {
  const { entry, alreadyChecked, feeOwed } = r;
  const meta = CHECK_OUTCOME_META[entry.outcome];
  const feeText = entry.feeState ? FEE_LABEL[entry.feeState](feeOwed) : '—';
  return (
    <div className={`space-y-1 rounded-xl border p-4 ${meta.card}`}>
      <p className="text-lg font-bold">{meta.icon} {meta.label}</p>
      {entry.outcome === 'unknown_card' ? (
        <p className="text-sm">Card {code} is not linked to anyone.</p>
      ) : (
        <>
          <p className="text-sm font-semibold">{alreadyChecked ? 'Already ticked' : '✓ Ticked'}</p>
          <p className="min-w-0 truncate font-medium">{entry.name ?? 'Name not recorded'}{entry.code ? ` · ${entry.code}` : ''}</p>
          <p className="text-sm">
            {entry.kind === 'learner' ? `Booked today: ${yn(entry.booked)} · ` : ''}
            Fee: {feeText} · {entry.onRoute ? 'On this bus' : 'Not on this bus'}
          </p>
        </>
      )}
    </div>
  );
}
