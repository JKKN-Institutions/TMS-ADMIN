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

  it('no longer allowlists the retired enforcement crons', () => {
    // Attendance enforcement was removed 2026-08-27. The routes are gone, so
    // leaving their paths here would hold an un-gated hole open for whatever
    // later claims those URLs.
    expect(SRC).not.toContain("'/api/cron/incharge-attendance'");
    expect(SRC).not.toContain("'/api/cron/incharge-month-verdict'");
  });

  it('does NOT allowlist the whole /api/cron/ prefix', () => {
    // A prefix allowlist would un-block every future cron route by accident,
    // including any that removes roles or bills people. Each one must be an
    // exact, deliberate entry.
    expect(SRC).not.toContain("'/api/cron/'");
  });
});
