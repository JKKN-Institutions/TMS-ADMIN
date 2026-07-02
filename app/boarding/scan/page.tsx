'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  isDirectionOpen,
  activeDirection,
  formatHM,
  DEFAULT_WINDOWS,
  type AttendanceWindows,
  type AttDirection,
} from '@/lib/boarding/attendance-window';

type ScanResult = {
  ok: boolean;
  learner?: { name: string; rollNumber: string | null };
  direction?: string;
  walkUp?: boolean;
  reason?: 'not_booked' | 'bus_full' | 'window_closed';
  seatsRemaining?: number;
  error?: string;
};

export default function BoardingScanPage() {
  const [windows, setWindows] = useState<AttendanceWindows | null>(null);
  const [direction, setDirection] = useState<AttDirection>('onward');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  const [, setTick] = useState(0); // forces a re-evaluate of open/closed on an interval

  const scannerRef = useRef<Html5Qrcode | null>(null);
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

  async function stopCamera() {
    const s = scannerRef.current;
    if (s) {
      try {
        await s.stop();
        await s.clear();
      } catch {
        /* ignore */
      }
      scannerRef.current = null;
      setScanning(false);
    }
  }

  // Stop the camera if scanning becomes disallowed (window just closed).
  useEffect(() => {
    if (!canScan && scannerRef.current) void stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function startCamera() {
    if (scannerRef.current) return;
    if (!document.getElementById('reader')) return;
    const scanner = new Html5Qrcode('reader');
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 250 },
        (decoded) => submit(decoded),
        () => {}
      );
      setScanning(true);
    } catch {
      setResult({ ok: false, error: 'Could not start camera — use manual entry below.' });
      scannerRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      void stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <div id="reader" className="w-full overflow-hidden rounded-md" />
          <div className="flex gap-2 mt-3">
            {!scanning ? (
              <Button className="flex-1" onClick={startCamera} disabled={!canScan}>
                {canScan ? 'Start camera' : 'Scanning closed'}
              </Button>
            ) : (
              <Button variant="outline" className="flex-1" onClick={stopCamera}>
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
                  disabled={(result.seatsRemaining ?? 0) <= 0}
                  onClick={() => submit(lastTokenRef.current, true)}
                >
                  {(result.seatsRemaining ?? 0) > 0 ? 'Add as walk-up' : 'Bus full'}
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
