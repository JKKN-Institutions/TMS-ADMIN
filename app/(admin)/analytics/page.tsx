'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

// The analytics view pulls in recharts (~390KB). Load it as a SEPARATE lazy chunk
// via next/dynamic so navigating to /analytics no longer ships recharts in the
// route's first-load JS — the shell paints immediately and the charts stream in
// alongside the data fetch. The view already renders its own client-side loading
// state while it fetches, so ssr:false changes nothing the user sees.
const AnalyticsView = dynamic(() => import('./analytics-view'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading analytics…</p>
      </div>
    </div>
  ),
});

export default function AnalyticsPage() {
  return <AnalyticsView />;
}
