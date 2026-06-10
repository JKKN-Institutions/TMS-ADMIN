'use client';

import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Pass {
  hasPass: boolean;
  token?: string;
  name?: string;
  rollNumber?: string | null;
  routeLabel?: string | null;
  stopLabel?: string | null;
}

async function fetchPass(): Promise<{ data?: Pass; notFound?: boolean }> {
  const res = await fetch('/api/student/boarding-pass', { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error('Failed to load boarding pass');
  return { data: (await res.json()).data as Pass };
}

export default function StudentPassPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['student-pass'], queryFn: fetchPass });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (error) return <div className="text-destructive">Could not load your boarding pass.</div>;
  if (data?.notFound || !data?.data) {
    return (
      <div className="text-muted-foreground text-sm">
        No learner record is linked to your account yet.
      </div>
    );
  }

  const p = data.data;
  if (!p.hasPass) {
    return (
      <Card className="mx-auto w-full max-w-sm">
        <CardHeader>
          <CardTitle>No boarding pass yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Your boarding pass appears here once you have a transport route allocated.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto w-full max-w-sm space-y-4">
      <h1 className="text-center text-xl font-semibold">Boarding Pass</h1>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-6">
          <div className="bg-white p-3 rounded-lg">
            <QRCodeSVG value={p.token!} size={200} />
          </div>
          <div className="text-center">
            <p className="font-medium">{p.name}</p>
            {p.rollNumber && <p className="text-xs text-muted-foreground">{p.rollNumber}</p>}
            <p className="text-sm mt-2">{p.routeLabel ?? '—'}</p>
            <p className="text-xs text-muted-foreground">Stop: {p.stopLabel ?? '—'}</p>
          </div>
          <p className="text-[11px] text-muted-foreground text-center">
            Show this to boarding staff to mark your attendance.
          </p>
          <details className="text-center w-full">
            <summary className="text-[11px] text-muted-foreground cursor-pointer">Pass code (manual entry)</summary>
            <p className="text-[10px] font-mono break-all select-all mt-1 text-muted-foreground px-2">{p.token}</p>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
