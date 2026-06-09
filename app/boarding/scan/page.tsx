'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ScanResult = {
  ok: boolean;
  learner?: { name: string; rollNumber: string | null };
  direction?: string;
  error?: string;
};

export default function BoardingScanPage() {
  const [direction, setDirection] = useState<'onward' | 'return'>('onward');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const busyRef = useRef(false);
  const directionRef = useRef(direction);
  directionRef.current = direction;

  async function submit(token: string) {
    if (busyRef.current || !token) return;
    busyRef.current = true;
    try {
      const res = await fetch('/api/boarding/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, direction: directionRef.current }),
      });
      const json = await res.json();
      setResult(res.ok && json.ok ? json : { ok: false, error: json.error || 'Scan failed' });
    } catch {
      setResult({ ok: false, error: 'Network error' });
    } finally {
      // Debounce so a held QR code doesn't fire repeatedly.
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

  useEffect(() => {
    return () => {
      void stopCamera();
    };
  }, []);

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Scan Boarding Pass</h1>

      <div className="flex gap-2">
        <Button
          variant={direction === 'onward' ? 'default' : 'outline'}
          className="flex-1 h-8 text-xs"
          onClick={() => setDirection('onward')}
        >
          Onward
        </Button>
        <Button
          variant={direction === 'return' ? 'default' : 'outline'}
          className="flex-1 h-8 text-xs"
          onClick={() => setDirection('return')}
        >
          Return
        </Button>
      </div>

      <Card>
        <CardContent className="p-3">
          <div id="reader" className="w-full overflow-hidden rounded-md" />
          <div className="flex gap-2 mt-3">
            {!scanning ? (
              <Button className="flex-1" onClick={startCamera}>
                Start camera
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
          <p className="text-xs text-muted-foreground">Or enter the pass code manually:</p>
          <div className="flex gap-2">
            <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Pass code" />
            <Button onClick={() => submit(manual)} disabled={!manual}>
              Mark
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card className={result.ok ? 'border-green-400' : 'border-red-400'}>
          <CardContent className="py-4 text-sm">
            {result.ok ? (
              <div>
                <p className="font-medium text-green-700 dark:text-green-300">
                  ✓ Marked present ({result.direction})
                </p>
                <p>
                  {result.learner?.name}
                  {result.learner?.rollNumber ? ` · ${result.learner.rollNumber}` : ''}
                </p>
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
