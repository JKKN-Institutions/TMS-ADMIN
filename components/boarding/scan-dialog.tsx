'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, Clock } from 'lucide-react';
import {
  classifyCameraError,
  cameraErrorMessage,
  shouldTryOtherCameras,
  pickBackCamera,
  isFreshCapture,
} from '@/lib/boarding/camera-errors';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { activeDirection, LEG_NAME, type AttendanceWindows, type AttDirection } from '@/lib/boarding/attendance-window';
import { openHoursText } from '@/lib/boarding/trip-direction';
import { classifyScan, type ScanSource } from '@/lib/boarding/scan-resolve';
import { noteRead, type LastRead } from '@/lib/boarding/scan-dedupe';
import { feeBadge, type FeeTone } from '@/lib/boarding/fee-badge';
import { resolveScanOffline } from '@/lib/boarding/offline/local-scan';
import type { QueueScanInput } from '@/components/boarding/offline/use-offline-attendance';
import type { RosterRow } from '@/lib/booking/roster';

type FeeTerm = {
  termNo: number | null;
  amount: number | null;
  balance: number | null;
  dueDate: string | null;
  status: string | null;
  paid: boolean;
  overdue: boolean;
};

type ScanResult = {
  ok: boolean;
  matchedBy?: 'jkkn_id';
  learner?: {
    name: string;
    rollNumber: string | null;
    photoUrl?: string | null;
    routeLabel?: string | null;
    stopLabel?: string | null;
  };
  direction?: string;
  booked?: boolean;
  walkUp?: boolean;
  reason?: 'not_booked' | 'window_closed';
  seatsRemaining?: number;
  overCapacity?: boolean;
  /** The learner was already marked present — nothing was written this time. */
  alreadyMarked?: { by: string; at: string | null };
  /** This scan corrected an earlier absent mark made by someone else. */
  overrode?: { from: 'present' | 'absent'; by: string; at: string | null };
  /** null means the fee read failed. Render that as unavailable, never as 0. */
  fees?: {
    allowed: boolean;
    reason: string | null;
    overdueCount: number;
    totalOwed: number;
    terms: FeeTerm[];
  } | null;
  error?: string;
  /** Saved on this phone because there was no signal; sent later. */
  offlineSaved?: boolean;
  /** Queued offline, but the card matched nobody on the saved roster; the server resolves it on sync. */
  unverified?: boolean;
};

const READER_ID = 'scan-dialog-reader';
const PHOTO_READER_ID = 'scan-dialog-photo-reader';

const FEE_TONE: Record<FeeTone, string> = {
  paid: 'border-green-400 bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200',
  overdue: 'border-red-400 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200',
  due: 'border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
  none: 'border-muted text-muted-foreground',
  unknown: 'border-muted text-muted-foreground',
};

const FEE_ICON: Record<FeeTone, string> = { paid: '✓ ', overdue: '✗ ', due: '✗ ', none: '', unknown: '' };

/**
 * The learner's transport-fee position, shown on every scan. Display only: it
 * never decides whether attendance is marked. The wording rules live in
 * lib/boarding/fee-badge.ts, where they are tested.
 */
function FeeBadgeView({ fees }: { fees: ScanResult['fees'] }) {
  const badge = feeBadge(fees);
  if (!badge) return null;
  // Money owed gets a full-width red panel rather than the small pill. The
  // attendance mark is ALREADY written by the time this renders — fees never
  // block a scan — so this is the staffer's cue to tell the learner, not a
  // refusal. 'due' is red too: unpaid is unpaid, whatever the due date says.
  if (badge.tone === 'overdue' || badge.tone === 'due') {
    return (
      <div className="rounded-md border-2 border-red-500 bg-red-50 px-3 py-2 text-red-800 dark:bg-red-950/40 dark:text-red-200">
        <p className="text-sm font-semibold">✗ Fees not paid</p>
        {badge.detail && <p className="mt-0.5 break-words text-xs">{badge.detail}</p>}
      </div>
    );
  }
  return (
    <div className={`rounded-md border px-2 py-1 text-xs ${FEE_TONE[badge.tone]}`}>
      <p className="font-medium">
        {FEE_ICON[badge.tone]}
        {badge.label}
      </p>
      {badge.detail && <p className="mt-0.5 break-words">{badge.detail}</p>}
    </div>
  );
}

/**
 * Scanner-in-a-modal. The trip is decided by the server's clock — morning or
 * evening, whichever window is open right now; the request names the trip it
 * believes is open, and the server refuses a mismatch. Reuses the old scan
 * page's html5-qrcode + 6-digit + walk-up flow. Fires onMarked after a
 * successful scan so the page can refresh the roster. Camera runs only while
 * the dialog is open and some trip's window is open.
 */
export default function ScanDialog({
  open,
  onOpenChange,
  windows,
  onMarked,
  offline,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  windows: AttendanceWindows;
  onMarked: () => void;
  offline?: {
    online: boolean;
    roster: { rows: RosterRow[]; cards?: Record<string, string> } | undefined;
    queueScan: (input: QueueScanInput) => Promise<void>;
  };
}) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  // Forces a re-render every 30s while open so legOpen (which reads new Date())
  // re-evaluates at a scan-window edge, flipping the closed banner and the
  // camera-lifecycle effect below without waiting on an unrelated re-render.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const i = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(i);
  }, [open]);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  // Synchronous re-entry guard: set the instant startCamera() is entered (before any
  // await), cleared in a finally covering every exit path. Blocks a second startCamera()
  // call (e.g. the visible "Start camera" button) from racing the auto-start effect's
  // in-flight scanner.start() before scannerRef.current is assigned.
  const startingRef = useRef(false);
  const busyRef = useRef(false);
  const lastTokenRef = useRef('');
  const lastSourceRef = useRef<ScanSource>('camera');
  // The card the camera saw most recently, so a card still held in view is not
  // re-submitted when the post-request cooldown lapses. See scan-dedupe.ts.
  const lastReadRef = useRef<LastRead | null>(null);
  // Kept current every render so the long-lived scan callback (registered once by the
  // camera-start effect) always reads the latest windows instead of the stale
  // closure captured when the effect last ran.
  const windowsRef = useRef(windows);
  windowsRef.current = windows;
  // Bumped whenever the camera-lifecycle effect (re)starts or tears down, so an in-flight
  // scanner.start() that resolves after teardown can detect it's stale and self-stop instead
  // of being adopted into scannerRef.
  const cameraGenRef = useRef(0);
  const offlineRef = useRef(offline);
  offlineRef.current = offline;

  // Which trip is open for scanning right now, if any.
  const leg = activeDirection(windows);
  const legOpen = leg !== null;

  /**
   * No signal: resolve against the saved roster and queue. Returns true when it
   * handled the scan. Only camera reads are queued -- a typed JKKN ID is
   * refused anyway, and a typed 6-digit code needs the server.
   */
  async function submitOffline(
    token: string, source: ScanSource, walkUp: boolean, direction: AttDirection,
  ): Promise<boolean> {
    const o = offlineRef.current;
    if (!o) return false;
    const local = resolveScanOffline(token, source, o.roster ?? { rows: [] });
    if (local.kind === 'refused') {
      setResult({ ok: false, error: local.message });
      return true;
    }
    if (source !== 'camera') {
      setResult({ ok: false, error: 'Typed codes need signal. Scan the QR or the ID card instead.' });
      return true;
    }
    if (local.kind === 'resolved' && local.alreadyPresent) {
      setResult({ ok: true, alreadyMarked: { by: 'you or a colleague', at: null }, learner: { name: local.name, rollNumber: null } });
      return true;
    }
    // No booking is no longer a question to answer: an unbooked rider is
    // queued as a walk-up straight away, the same rule the server applies.
    // Asking first is what left them unrecorded when the second tap never came.
    const unbooked = local.kind === 'resolved' && !local.booked;
    await o.queueScan({
      learnerId: local.kind === 'resolved' ? local.learnerId : null,
      token,
      walkUp: walkUp || unbooked,
      name: local.kind === 'resolved' ? local.name : null,
      verified: local.kind === 'resolved' && local.verified,
      direction,
    });
    setResult({
      ok: true,
      offlineSaved: true,
      unverified: local.kind !== 'resolved' || !local.verified,
      walkUp: walkUp || unbooked,
      learner: local.kind === 'resolved' ? { name: local.name, rollNumber: null } : undefined,
      error: local.kind === 'unknown' ? local.message : undefined,
    });
    onMarked();
    return true;
  }

  async function submit(token: string, source: ScanSource, walkUp = false) {
    if (!token) return;
    // Instant feedback beats a round trip. The SERVER refusal is still the
    // authority; this only spares the staffer the wait.
    const decision = classifyScan(token, source);
    if (decision.refusal === 'typed_jkkn_id') {
      setResult({ ok: false, error: 'Point the camera at the card to use a JKKN ID.' });
      return;
    }
    // Read the CURRENT windows via the ref, not the props closed over when this
    // callback was registered with the scanner — the camera-start effect doesn't restart
    // on a windows change, so the closed-over props could be stale.
    const w = windowsRef.current;
    const current = activeDirection(w);
    if (!current) {
      setResult({ ok: false, reason: 'window_closed', error: `Scanning is open ${openHoursText(w)} only.` });
      return;
    }
    if (offlineRef.current && !offlineRef.current.online) {
      await submitOffline(token, source, walkUp, current);
      return;
    }
    if (busyRef.current && !walkUp) return;
    busyRef.current = true;
    lastTokenRef.current = token;
    lastSourceRef.current = source;
    try {
      const res = await fetch('/api/boarding/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, direction: current, walkUp, source }),
      });
      const json = await res.json();
      if (json.ok) {
        setResult(json);
        onMarked();
      } else {
        setResult({ ok: false, ...json, error: json.error || json.reason || 'Scan failed' });
      }
    } catch {
      // Forget the card, so holding it up again retries once the cooldown
      // lapses. Without this a dropped request could never be retried by camera.
      lastReadRef.current = null;
      // The request never got an answer: treat it as no signal and queue it.
      if (!(await submitOffline(token, source, walkUp, current))) {
        setResult({ ok: false, error: 'Network error' });
      }
    } finally {
      setTimeout(() => {
        busyRef.current = false;
      }, 1500);
    }
  }

  // Every camera decode lands here, ~10 times a second while a card is in view.
  // Only a read of a NEW card, or of the same card after it has been out of view,
  // reaches submit(). Typed codes and the walk-up button call submit() directly,
  // so a staffer's explicit action is never filtered.
  function onCameraRead(decoded: string) {
    const code = classifyScan(decoded, 'camera').code;
    const { ignore, last } = noteRead(lastReadRef.current, code, Date.now());
    lastReadRef.current = last;
    if (ignore) return;
    void submit(decoded, 'camera');
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
    if (scannerRef.current || startingRef.current) return;
    if (!document.getElementById(READER_ID)) return;
    startingRef.current = true;
    try {
      // Snapshot the generation before the async start() call. If teardown runs while
      // start() is still in flight, cameraGenRef will have moved on by the time we get
      // here — that's our signal to stop the just-started stream instead of adopting it.
      const gen = cameraGenRef.current;
      const config = { fps: 10, qrbox: 250 };

      // One attempt = one fresh scanner. Resolves true when the camera is live.
      const attempt = async (camera: string | MediaTrackConstraints): Promise<true | { err: unknown }> => {
        const scanner = new Html5Qrcode(READER_ID);
        try {
          await scanner.start(camera, config, onCameraRead, () => {});
        } catch (err) {
          try { scanner.clear(); } catch { /* ignore */ }
          return { err };
        }
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
          return true;
        }
        scannerRef.current = scanner;
        setScanning(true);
        return true;
      };

      // 1) The rear camera by facing mode — works on most phones.
      const first = await attempt({ facingMode: 'environment' });
      if (first === true) return;
      let kind = classifyCameraError(first.err);
      console.error('[scan] camera start failed (facingMode):', first.err);

      // 2) Some phones refuse facingMode or hold a stuck stream on one lens:
      //    try the listed cameras by id, rear first. Pointless when the camera
      //    is blocked or the browser has no camera API.
      if (shouldTryOtherCameras(kind) && cameraGenRef.current === gen) {
        try {
          const cams = await Html5Qrcode.getCameras();
          const preferred = pickBackCamera(cams);
          const ids = preferred ? [preferred, ...cams.map((c) => c.id).filter((id) => id !== preferred)] : [];
          for (const id of ids) {
            if (cameraGenRef.current !== gen) return;
            const r = await attempt(id);
            if (r === true) return;
            kind = classifyCameraError(r.err);
            console.error('[scan] camera start failed (deviceId):', r.err);
          }
        } catch (err) {
          kind = classifyCameraError(err);
          console.error('[scan] listing cameras failed:', err);
        }
      }

      if (cameraGenRef.current === gen) {
        setResult({ ok: false, error: cameraErrorMessage(kind) });
      }
    } finally {
      startingRef.current = false;
    }
  }

  // Backup scan: a photo of the ID card taken with the phone's own camera app.
  // Works where the live camera cannot start (permission quirks, a busy lens,
  // in-app browsers). Still a read of the physical card: the input opens the
  // camera (capture), and a photo older than two minutes is refused.
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [readingPhoto, setReadingPhoto] = useState(false);

  async function onPhotoPicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same card be photographed again
    if (!file) return;
    if (!isFreshCapture(file, Date.now())) {
      setResult({ ok: false, error: 'Take a new photo of the ID card with the camera. Saved or downloaded pictures are not accepted.' });
      return;
    }
    setReadingPhoto(true);
    try {
      // html5-qrcode refuses a file scan while the live camera runs.
      await stopCamera();
      const reader = new Html5Qrcode(PHOTO_READER_ID);
      let decoded: string;
      try {
        decoded = await reader.scanFile(file, false);
      } finally {
        try { reader.clear(); } catch { /* ignore */ }
      }
      await submit(decoded, 'camera');
    } catch (err) {
      console.error('[scan] photo decode failed:', err);
      setResult({ ok: false, error: 'Could not read the card in that photo. Hold the card flat, fill the frame, avoid glare, and try again.' });
    } finally {
      setReadingPhoto(false);
    }
  }

  // Run the camera only while the dialog is open and a trip window is open —
  // morning always, evening too when switched on in Settings.
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
      // Reopening the scanner is a deliberate new session, so the same card
      // should scan straight away rather than wait out the same-card gap.
      lastReadRef.current = null;
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scan boarding pass{leg ? ` · ${LEG_NAME[leg]}` : ''}</DialogTitle>
        </DialogHeader>

        {!legOpen && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Scanning is open {openHoursText(windows)} only.
            </span>
          </div>
        )}

        <div id={READER_ID} className="w-full overflow-hidden rounded-md" />
        <div id={PHOTO_READER_ID} className="hidden" />

        <div className="flex gap-2">
          {!scanning ? (
            <Button className="flex-1" onClick={startCamera} disabled={!legOpen || readingPhoto}>
              {legOpen ? 'Start camera' : 'Scanning closed'}
            </Button>
          ) : (
            <Button variant="outline" className="flex-1" onClick={stopCamera}>
              Stop
            </Button>
          )}
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => photoInputRef.current?.click()}
            disabled={!legOpen || readingPhoto}
          >
            <Camera className="mr-1.5 h-4 w-4" />
            {readingPhoto ? 'Reading…' : 'Scan from photo'}
          </Button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onPhotoPicked}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Scan the learner&apos;s JKKN ID card. If the live camera does not start or cannot read the
          card, tap <span className="font-medium">Scan from photo</span> and take a picture of the card.
        </p>

        {result && (
          <div className={`rounded-lg border p-3 text-sm ${result.ok ? 'border-green-400' : 'border-red-400'}`}>
            {result.ok ? (
              <div className="space-y-2">
                <p className="font-medium text-green-700 dark:text-green-300">
                  {result.offlineSaved
                    ? '✓ Saved on this phone'
                    : result.alreadyMarked ? '✓ Already marked present' : '✓ Marked present'}
                  {result.direction === 'onward' || result.direction === 'return'
                    ? ` · ${LEG_NAME[result.direction]}`
                    : ''}
                </p>
                {/* Said in words, not as a "· walk-up" suffix: this is the one
                    fact the staffer must carry off the bus, and it is now
                    recorded without them confirming anything. */}
                {result.walkUp && (
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    Travelled without booking — recorded.
                  </p>
                )}
                {result.offlineSaved && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    No signal. It will be sent when you are back online
                    {result.unverified ? ', and the pass will be checked then' : ''}.
                    {result.error ? ` ${result.error}` : ''}
                  </p>
                )}

                <div className="flex items-start gap-3">
                  {result.learner?.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote learner photo, next/image adds nothing here
                    <img
                      src={result.learner.photoUrl}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-md border object-cover"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{result.learner?.name}</p>
                    {result.learner?.rollNumber && (
                      <p className="truncate text-xs text-muted-foreground">{result.learner.rollNumber}</p>
                    )}
                    <p className="truncate text-xs text-muted-foreground">
                      {result.learner?.routeLabel ?? 'Route —'} · Stop: {result.learner?.stopLabel ?? '—'}
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      JKKN ID card
                      {result.booked === false ? ' · not booked today' : ''}
                    </p>
                  </div>
                </div>

                <FeeBadgeView fees={result.fees} />

                {/* A dozen in-charges can share this route. Naming who marked
                    first stops the second scanner wondering if the scan failed. */}
                {result.alreadyMarked && (
                  <p className="text-xs text-muted-foreground">
                    Marked by {result.alreadyMarked.by}
                    {result.alreadyMarked.at
                      ? ` at ${new Date(result.alreadyMarked.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : ''}
                    . Nothing changed.
                  </p>
                )}
                {result.overrode && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    ⚠ Was marked {result.overrode.from} by {result.overrode.by} — corrected to present.
                  </p>
                )}
                {result.overCapacity && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">⚠ Bus over capacity — boarded as overflow.</p>
                )}
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
