'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isDirectionOpen, formatHM, type AttendanceWindows, type AttDirection } from '@/lib/boarding/attendance-window';

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

const READER_ID = 'scan-dialog-reader';

/**
 * Scanner-in-a-modal. Marks the passed-in leg (the page owns the toggle). Reuses
 * the old scan page's html5-qrcode + 6-digit + walk-up flow. Fires onMarked after
 * a successful scan so the page can refresh the roster. Camera runs only while the
 * dialog is open and the leg's window is open.
 */
export default function ScanDialog({
  open,
  onOpenChange,
  direction,
  windows,
  onMarked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  direction: AttDirection;
  windows: AttendanceWindows;
  onMarked: () => void;
}) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const busyRef = useRef(false);
  const lastTokenRef = useRef('');
  // Kept current every render so the long-lived scan callback (registered once by the
  // camera-start effect) always reads the latest direction/windows instead of the stale
  // closure captured when the effect last ran.
  const directionRef = useRef(direction);
  directionRef.current = direction;
  const windowsRef = useRef(windows);
  windowsRef.current = windows;
  // Bumped whenever the camera-lifecycle effect (re)starts or tears down, so an in-flight
  // scanner.start() that resolves after teardown can detect it's stale and self-stop instead
  // of being adopted into scannerRef.
  const cameraGenRef = useRef(0);

  const win = windows[direction];
  const legOpen = isDirectionOpen(win);

  async function submit(token: string, walkUp = false) {
    if (!token) return;
    // Read the CURRENT direction/windows via refs, not the props closed over when this
    // callback was registered with the scanner — the camera-start effect doesn't restart
    // on a direction change, so the closed-over props could be stale.
    const dir = directionRef.current;
    const w = windowsRef.current;
    if (!isDirectionOpen(w[dir])) {
      setResult({
        ok: false,
        reason: 'window_closed',
        error: `${dir === 'onward' ? 'Onward (morning)' : 'Return (evening)'} scanning is open ${formatHM(w[dir].start)}–${formatHM(w[dir].end)} only.`,
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
      if (json.ok) {
        setResult(json);
        setManual('');
        onMarked();
      } else {
        setResult({ ok: false, ...json, error: json.error || json.reason || 'Scan failed' });
      }
    } catch {
      setResult({ ok: false, error: 'Network error' });
    } finally {
      setTimeout(() => {
        busyRef.current = false;
      }, 1500);
    }
  }

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

  async function startCamera() {
    if (scannerRef.current) return;
    if (!document.getElementById(READER_ID)) return;
    // Snapshot the generation before the async start() call. If teardown runs while
    // start() is still in flight, cameraGenRef will have moved on by the time we get
    // here — that's our signal to stop the just-started stream instead of adopting it.
    const gen = cameraGenRef.current;
    const scanner = new Html5Qrcode(READER_ID);
    try {
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 250 }, (decoded) => submit(decoded), () => {});
      if (cameraGenRef.current !== gen) {
        // Cleanup already ran (dialog closed/unmounted) while start() was pending — this
        // scanner was never assigned to scannerRef, so nothing else can stop it. Stop it
        // ourselves so the camera stream isn't leaked.
        try {
          await scanner.stop();
          await scanner.clear();
        } catch {
          /* ignore */
        }
        return;
      }
      scannerRef.current = scanner;
      setScanning(true);
    } catch {
      if (cameraGenRef.current === gen) {
        setResult({ ok: false, error: 'Could not start camera — use manual entry below.' });
      }
    }
  }

  // Run the camera only while the dialog is open and the leg is open.
  useEffect(() => {
    cameraGenRef.current++;
    if (open && legOpen) void startCamera();
    return () => {
      cameraGenRef.current++;
      void stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, legOpen]);

  // Clear transient state whenever the dialog closes.
  useEffect(() => {
    if (!open) {
      setResult(null);
      setManual('');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scan boarding pass · {direction === 'onward' ? 'Onward' : 'Return'}</DialogTitle>
        </DialogHeader>

        {!legOpen && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {direction === 'onward' ? 'Onward' : 'Return'} scanning is open {formatHM(win.start)}–{formatHM(win.end)} only.
            </span>
          </div>
        )}

        <div id={READER_ID} className="w-full overflow-hidden rounded-md" />

        <div className="flex gap-2">
          {!scanning ? (
            <Button className="flex-1" onClick={startCamera} disabled={!legOpen}>
              {legOpen ? 'Start camera' : 'Scanning closed'}
            </Button>
          ) : (
            <Button variant="outline" className="flex-1" onClick={stopCamera}>
              Stop
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Or enter the 6-digit code:</p>
          <div className="flex gap-2">
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="6-digit code"
              disabled={!legOpen}
            />
            <Button onClick={() => submit(manual)} disabled={!manual || !legOpen}>
              Mark
            </Button>
          </div>
        </div>

        {result && (
          <div className={`rounded-lg border p-3 text-sm ${result.ok ? 'border-green-400' : 'border-red-400'}`}>
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
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">⚠ Bus over capacity — boarded as overflow.</p>
                )}
              </div>
            ) : result.reason === 'not_booked' ? (
              <div className="space-y-2">
                <p className="text-amber-700 dark:text-amber-300">⚠ {result.learner?.name ?? 'Learner'} has no booking for today.</p>
                <p className="text-xs text-muted-foreground">Seats remaining: {result.seatsRemaining ?? 0}</p>
                <Button className="w-full" onClick={() => submit(lastTokenRef.current, true)}>
                  {(result.seatsRemaining ?? 0) > 0 ? 'Add as walk-up' : 'Add as walk-up (over capacity)'}
                </Button>
              </div>
            ) : (
              <p className="text-red-700 dark:text-red-300">✗ {result.error}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
