'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { IDetectedBarcode, IScannerError } from '@yudiel/react-qr-scanner';
import { Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cameraErrorMessage } from '@/lib/boarding/scan-errors';
import {
  isDirectionOpen,
  activeDirection,
  formatHM,
  DEFAULT_WINDOWS,
  type AttendanceWindows,
  type AttDirection,
} from '@/lib/boarding/attendance-window';

// Loaded only in the browser: the scanner touches camera/WebRTC APIs, and lazy
// loading keeps its wasm fallback out of the initial route bundle.
const Scanner = dynamic(
  () => import('@yudiel/react-qr-scanner').then((m) => m.Scanner),
  { ssr: false }
);

type ScanResult = {
  ok: boolean;
  learner?: { name: string; rollNumber: string | null };
  direction?: string;
  walkUp?: boolean;
  reason?: 'not_booked' | 'window_closed';
  seatsRemaining?: number;
  overCapacity?: boolean;
  error?: string;
};

export default function BoardingScanPage() {
  const [windows, setWindows] = useState<AttendanceWindows | null>(null);
  const [direction, setDirection] = useState<AttDirection>('onward');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  const [, setTick] = useState(0); // forces a re-evaluate of open/closed on an interval

  const busyRef = useRef(false);
  const directionRef = useRef(direction);
  directionRef.current = direction;
  const lastTokenRef = useRef<string>('');
  const windowsRef = useRef<AttendanceWindows | null>(null);
  windowsRef.current = windows;

  // Load configured windows + the server-computed active direction once (the
  // device clock may be wrong, so the initial tab is seeded from the server).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/boarding/attendance-window', { cache: 'no-store', credentials: 'same-origin' });
        const json = await res.json();
        if (json?.success) {
          setWindows(json.data.windows as AttendanceWindows);
          if (json.data.activeDirection) setDirection(json.data.activeDirection as AttDirection);
        } else {
          setWindows(DEFAULT_WINDOWS);
        }
      } catch {
        setWindows(DEFAULT_WINDOWS);
      }
    })();
  }, []);

  // Re-evaluate open/closed every 30s so the tab flips automatically at the window edges.
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  const onwardOpen = windows ? isDirectionOpen(windows.onward) : true;
  const returnOpen = windows ? isDirectionOpen(windows.return) : true;
  const anyOpen = onwardOpen || returnOpen;
  const canScan = direction === 'onward' ? onwardOpen : returnOpen;

  // If the selected direction has closed, auto-switch to whichever is open.
  useEffect(() => {
    if (!windows) return;
    const curOpen = direction === 'onward' ? onwardOpen : returnOpen;
    if (!curOpen) {
      const active = activeDirection(windows);
      if (active) setDirection(active);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onwardOpen, returnOpen, windows]);

  // Stop scanning if the window just closed (unmounting <Scanner> releases the camera).
  useEffect(() => {
    if (!canScan) setScanning(false);
  }, [canScan]);

  async function submit(token: string, walkUp = false) {
    if (!token) return;
    // Client guard: don't POST a direction whose window is closed (server enforces too).
    const w = windowsRef.current;
    const dir = directionRef.current;
    if (w && !isDirectionOpen(w[dir])) {
      const win = w[dir];
      setResult({
        ok: false,
        reason: 'window_closed',
        error: `${dir === 'onward' ? 'Onward (morning)' : 'Return (evening)'} scanning is open ${formatHM(win.start)}–${formatHM(win.end)} only.`,
      });
      return;
    }
    if (busyRef.current && !walkUp) return;
    busyRef.current = true;
    lastTokenRef.current = token;
    try {
      const res = await fetch('/api/boarding/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, direction: dir, walkUp }),
      });
      const json = await res.json();
      setResult(json.ok ? json : { ok: false, ...json, error: json.error || json.reason || 'Scan failed' });
    } catch {
      setResult({ ok: false, error: 'Network error' });
    } finally {
      setTimeout(() => {
        busyRef.current = false;
      }, 1500);
    }
  }

  const winLabel = (d: AttDirection) => {
    const w = windows?.[d];
    if (!w) return '—';
    if (!w.enabled) return 'All day';
    return `${formatHM(w.start)}–${formatHM(w.end)}`;
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Scan Boarding Pass</h1>

      {/* Direction toggle — the active leg auto-selects by time; the closed leg is disabled */}
      <div className="grid grid-cols-2 gap-2">
        {(['onward', 'return'] as AttDirection[]).map((d) => {
          const open = d === 'onward' ? onwardOpen : returnOpen;
          const isActive = direction === d;
          return (
            <button
              key={d}
              type="button"
              disabled={!open}
              onClick={() => setDirection(d)}
              className={[
                'flex flex-col items-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-green-600 bg-green-600 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
                open ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
              ].join(' ')}
            >
              <span>{d === 'onward' ? 'Onward (morning)' : 'Return (evening)'}</span>
              <span className={`mt-0.5 text-[10px] font-normal ${isActive ? 'text-green-50' : 'text-gray-400'}`}>
                {winLabel(d)}{!open && windows?.[d].enabled ? ' · closed' : ''}
              </span>
            </button>
          );
        })}
      </div>

      {/* Closed banner — no window is currently open */}
      {windows && !anyOpen && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Scanning is closed right now. Onward opens at <strong>{formatHM(windows.onward.start)}</strong>,
            Return opens at <strong>{formatHM(windows.return.start)}</strong>.
          </span>
        </div>
      )}

      <Card>
        <CardContent className="p-3">
          {scanning && canScan ? (
            <div className="w-full overflow-hidden rounded-md">
              <Scanner
                formats={['qr_code']}
                scanDelay={250}
                allowMultiple={false}
                sound={true}
                constraints={{
                  facingMode: 'environment',
                  advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
                }}
                components={{ torch: true, finder: true }}
                onScan={(codes: IDetectedBarcode[]) => {
                  const v = codes[0]?.rawValue;
                  if (v) void submit(v);
                }}
                onError={(e: IScannerError) =>
                  setResult({ ok: false, error: cameraErrorMessage(e?.kind) })
                }
              />
            </div>
          ) : null}
          <div className="flex gap-2 mt-3">
            {!scanning ? (
              <Button className="flex-1" onClick={() => setScanning(true)} disabled={!canScan}>
                {canScan ? 'Start camera' : 'Scanning closed'}
              </Button>
            ) : (
              <Button variant="outline" className="flex-1" onClick={() => setScanning(false)}>
                Stop
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 space-y-2">
          <p className="text-xs text-muted-foreground">Or enter the 6-digit code manually:</p>
          <div className="flex gap-2">
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="6-digit code"
              disabled={!canScan}
            />
            <Button onClick={() => submit(manual)} disabled={!manual || !canScan}>
              Mark
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card className={result.ok ? 'border-green-400' : 'border-red-400'}>
          <CardContent className="py-4 text-sm space-y-2">
            {result.ok ? (
              <div>
                <p className="font-medium text-green-700 dark:text-green-300">
                  ✓ Marked present ({result.direction}){result.walkUp ? ' · walk-up' : ''}
                </p>
                <p>
                  {result.learner?.name}
                  {result.learner?.rollNumber ? ` · ${result.learner.rollNumber}` : ''}
                </p>
                {result.overCapacity && (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                    ⚠ Bus is over capacity — boarded as overflow.
                  </p>
                )}
              </div>
            ) : result.reason === 'not_booked' ? (
              <div className="space-y-2">
                <p className="text-amber-700 dark:text-amber-300">
                  ⚠ {result.learner?.name ?? 'Learner'} has no booking for today.
                </p>
                <p className="text-xs text-muted-foreground">
                  Seats remaining: {result.seatsRemaining ?? 0}
                </p>
                <Button
                  className="w-full"
                  onClick={() => submit(lastTokenRef.current, true)}
                >
                  {(result.seatsRemaining ?? 0) > 0 ? 'Add as walk-up' : 'Add as walk-up (over capacity)'}
                </Button>
              </div>
            ) : (
              <p className="text-red-700 dark:text-red-300">✗ {result.error}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
