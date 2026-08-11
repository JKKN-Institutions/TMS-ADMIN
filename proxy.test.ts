import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./proxy.ts', import.meta.url), 'utf8');

describe('proxy cron allowlist', () => {
  it('allowlists the auto-generate cron endpoint', () => {
    // Without this the request is 401'd at the edge and the route's own
    // CRON_SECRET check never runs — which is exactly why the two existing
    // Vercel crons have never fired.
    expect(SRC).toContain("'/api/cron/auto-generate-bills'");
  });

  it('does NOT allowlist the whole /api/cron/ prefix', () => {
    // A prefix allowlist would also un-block /api/cron/incharge-attendance,
    // which removes bus in-charges from their role and bills them. Waking that
    // job must be a deliberate, separate decision.
    expect(SRC).not.toContain("'/api/cron/'");
  });
});
