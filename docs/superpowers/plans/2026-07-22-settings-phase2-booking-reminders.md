# Settings Phase 2 — Automatic Booking Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the learner "book tomorrow's bus" reminder fire automatically every day before the configured cutoff, targeting only learners who have not yet booked.

**Architecture:** The reminder logic already exists inside `app/api/admin/bookings/send-reminders/route.ts` but only runs when a human POSTs. Extract it into `lib/booking/reminders.ts`, make its copy reflect the admin-configured cutoff instead of a hardcoded "8 PM", gate it on `autoNotifyPassengers`, then call it from BOTH the existing admin route (manual "send now") and a new Vercel-Cron-triggered route.

**Tech Stack:** Next.js 15 route handlers, Supabase service-role client, Vercel Cron, Vitest.

## Global Constraints

- **Scheduling is Vercel Cron, NOT pg_cron.** This supersedes the Phase 1 spec, which chose pg_cron when the project had no cron at all. It now has a working one and `CRON_SECRET` is already provisioned in production. Introducing pg_cron would mean two scheduling mechanisms.
- **Follow the existing cron route pattern EXACTLY:** `app/api/cron/incharge-attendance/route.ts` is the reference. That means: a `GET` handler; `export const dynamic = 'force-dynamic'`; guard `if (!secret || request.headers.get('authorization') !== \`Bearer ${secret}\`) return 401`; `createServiceRoleClient()`; support `?dryRun=1`; return `NextResponse.json({ success: true, data: summary })`.
- **Reminder targeting (unchanged, load-bearing):** ONLY transport learners (`bus_required = true`, non-null `transport_route_id`, non-null `profile_id`) who have NO `tms_booking` row for the target date AND were not already reminded for it. Learners who already booked, and non-transport users, must never be notified.
- **Idempotency must be preserved.** Re-running the same day must not double-notify. The existing mechanism is the `url` marker `/student/bookings?d=<date>` + prior-recipient lookup.
- `dispatchNotification(svc, input)` accepts `createdBy` as `string | null | undefined` (it stores `input.createdBy ?? null`), so the cron does NOT need a synthetic user id — pass `null`.
- The target date is **tomorrow** = `bookableDates()[0]` (index 0 is tomorrow regardless of the configured horizon).
- Verify with `npm run test -- <path>` (NOT `npx vitest run`). Test files MUST use RELATIVE imports — vitest cannot resolve the `@/` alias. `npm run lint` is BROKEN; `next build` does NOT gate types. Type gate = `npx tsc --noEmit 2>&1 | grep <file>` returning ZERO lines.
- Commit per task, LOCAL ONLY. Explicit `git add <paths>`, never `-A`/`-u`. No history rewrites.

---

## File structure

| File | Responsibility | Action |
|------|----------------|--------|
| `lib/booking/reminders.ts` | Reminder copy (pure) + the send routine | Create |
| `lib/booking/reminders.test.ts` | Unit tests for the pure copy builder | Create |
| `app/api/admin/bookings/send-reminders/route.ts` | Manual "send now" (admin) | Modify — delegate to the lib |
| `app/api/cron/booking-reminders/route.ts` | Vercel Cron entry point | Create |
| `vercel.json` | Cron schedule registration | Modify |

---

### Task 1: Reminder library + pure copy builder

**Files:**
- Create: `lib/booking/reminders.ts`
- Test: `lib/booking/reminders.test.ts`

**Interfaces:**
- Consumes: `loadSchedulingConfig(svc)` from `@/lib/settings/scheduling` → `{ enableBookingTimeWindow, cutoffHour, daysAhead, autoNotifyPassengers }`; `bookableDates()` from `@/lib/booking/window`; `dispatchNotification(svc, input)` from `@/lib/notifications/dispatch`.
- Produces:
  - `formatCutoffHour(hour: number): string` — pure, 24h → "8 PM" / "7:00 PM"-style label
  - `reminderCopy(date: string, cutoffHour: number): { title: string; body: string }` — pure
  - `sendBookingReminders(svc, opts?: { createdBy?: string | null; dryRun?: boolean }): Promise<ReminderSummary>`
  - `interface ReminderSummary { date: string; reminded: number; candidates: number; skipped: string | null; dryRun: boolean }`

- [ ] **Step 1: Write the failing tests**

Create `lib/booking/reminders.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatCutoffHour, reminderCopy } from './reminders';

describe('formatCutoffHour', () => {
  it('formats midday and midnight', () => {
    expect(formatCutoffHour(0)).toBe('12 AM');
    expect(formatCutoffHour(12)).toBe('12 PM');
  });
  it('formats morning and evening hours', () => {
    expect(formatCutoffHour(9)).toBe('9 AM');
    expect(formatCutoffHour(20)).toBe('8 PM');
    expect(formatCutoffHour(19)).toBe('7 PM');
  });
});

describe('reminderCopy', () => {
  it('states the configured cutoff, not a hardcoded 8 PM', () => {
    const copy = reminderCopy('2026-07-23', 19);
    expect(copy.body).toContain('7 PM');
    expect(copy.body).not.toContain('8 PM');
  });
  it('names the travel date', () => {
    expect(reminderCopy('2026-07-23', 20).body).toContain('2026-07-23');
  });
  it('has a stable, non-empty title', () => {
    expect(reminderCopy('2026-07-23', 20).title.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they FAIL**

Run: `npm run test -- lib/booking/reminders.test.ts`
Expected: FAIL — module `./reminders` not found.

- [ ] **Step 3: Create `lib/booking/reminders.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import { bookableDates } from './window';
import { dispatchNotification } from '../notifications/dispatch';
import { loadSchedulingConfig } from '../settings/scheduling';

export interface ReminderSummary {
  date: string;
  reminded: number;
  candidates: number;
  /** Non-null when the run intentionally did nothing (e.g. reminders disabled). */
  skipped: string | null;
  dryRun: boolean;
}

interface LearnerRow { id: string; profile_id: string | null }

/** 24h hour → a short human label ("8 PM"). Pure. */
export function formatCutoffHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

/** The reminder's title/body for a travel date + the CONFIGURED cutoff. Pure. */
export function reminderCopy(date: string, cutoffHour: number): { title: string; body: string } {
  return {
    title: "Book tomorrow's bus",
    body: `Booking for ${date} closes at ${formatCutoffHour(cutoffHour)} today. Tap to reserve your seat.`,
  };
}

/**
 * Notify every transport learner who has NOT booked tomorrow yet.
 *
 * Targeting is deliberately narrow: bus_required learners with a route AND a login
 * profile, minus anyone who already booked that date, minus anyone already reminded
 * for it. Idempotent per (learner, date) via the url marker, so a retried cron run
 * cannot double-notify.
 */
export async function sendBookingReminders(
  svc: SupabaseClient,
  opts: { createdBy?: string | null; dryRun?: boolean } = {},
): Promise<ReminderSummary> {
  const dryRun = opts.dryRun === true;
  const cfg = await loadSchedulingConfig(svc);
  const date = bookableDates()[0]; // tomorrow
  const base: ReminderSummary = { date, reminded: 0, candidates: 0, skipped: null, dryRun };

  if (!cfg.autoNotifyPassengers) {
    return { ...base, skipped: 'autoNotifyPassengers is off' };
  }

  const urlMarker = `/student/bookings?d=${date}`;

  const { data: learners } = await svc
    .from('learners_profiles')
    .select('id, profile_id')
    .eq('bus_required', true)
    .not('transport_route_id', 'is', null)
    .not('profile_id', 'is', null);
  const all = (learners ?? []) as LearnerRow[];
  if (all.length === 0) return base;

  const { data: booked } = await svc
    .from('tms_booking')
    .select('learner_id')
    .eq('travel_date', date);
  const bookedIds = new Set<string>(((booked ?? []) as { learner_id: string }[]).map((b) => b.learner_id));

  // Who already received THIS date's reminder — the idempotency guard.
  const { data: priorNotifs } = await svc
    .from('tms_notification')
    .select('id')
    .eq('category', 'booking')
    .eq('url', urlMarker);
  const priorIds = ((priorNotifs ?? []) as { id: string }[]).map((n) => n.id);
  const notifiedProfiles = new Set<string>();
  if (priorIds.length) {
    const { data: recs } = await svc
      .from('tms_notification_recipient')
      .select('user_id')
      .in('notification_id', priorIds);
    for (const r of (recs ?? []) as { user_id: string }[]) notifiedProfiles.add(r.user_id);
  }

  const targetProfiles = all
    .filter((l) => !bookedIds.has(l.id) && l.profile_id && !notifiedProfiles.has(l.profile_id))
    .map((l) => l.profile_id as string);

  const summary = { ...base, candidates: targetProfiles.length };
  if (targetProfiles.length === 0) return summary;
  if (dryRun) return summary; // computed everything, wrote nothing

  const copy = reminderCopy(date, cfg.cutoffHour);
  const dispatched = await dispatchNotification(svc, {
    title: copy.title,
    body: copy.body,
    category: 'booking',
    priority: 'normal',
    url: urlMarker,
    createdBy: opts.createdBy ?? null,
    targeting: { type: 'users', user_ids: targetProfiles },
  });
  return { ...summary, reminded: dispatched.recipientCount };
}
```

- [ ] **Step 4: Run the tests and confirm they PASS**

Run: `npm run test -- lib/booking/reminders.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Type gate + commit**

Run: `npx tsc --noEmit 2>&1 | grep "lib/booking/reminders"` — expect ZERO lines.

```bash
git add lib/booking/reminders.ts lib/booking/reminders.test.ts
git commit -m "feat(booking): extract reminder library with configured-cutoff copy"
```

---

### Task 2: Wire both entry points (admin manual + Vercel Cron)

**Files:**
- Modify: `app/api/admin/bookings/send-reminders/route.ts`
- Create: `app/api/cron/booking-reminders/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes (Task 1): `sendBookingReminders(svc, { createdBy, dryRun })` → `ReminderSummary`.

- [ ] **Step 1: Refactor the admin route to delegate**

Replace the body of `app/api/admin/bookings/send-reminders/route.ts`, keeping its existing auth (`withAuth` + `TMS_PERMISSIONS.BOOKINGS_MANAGE`) and `{success, data}` response shape:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { sendBookingReminders } from '@/lib/booking/reminders';

/**
 * Manual "send now" for the daily booking reminder. The scheduled path is
 * /api/cron/booking-reminders; both delegate to lib/booking/reminders.ts so the
 * targeting and idempotency rules can never drift between them.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function handler(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.BOOKINGS_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
    const summary = await sendBookingReminders(createServiceRoleClient(), {
      createdBy: auth.userId,
      dryRun,
    });
    return NextResponse.json({ success: true, data: summary });
  } catch (e) {
    console.error('admin/bookings/send-reminders error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => handler(request, auth));
```

- [ ] **Step 2: Create the cron route**

Create `app/api/cron/booking-reminders/route.ts`, mirroring `app/api/cron/incharge-attendance/route.ts`:

```typescript
/**
 * Daily learner booking reminder.
 *
 * Scheduled from vercel.json at "30 11 * * *" UTC = 17:00 IST — before the default
 * 20:00 IST booking cutoff, so a reminded learner still has time to act. Vercel sends
 * `Authorization: Bearer $CRON_SECRET`.
 *
 * Targets ONLY transport learners with no booking for tomorrow. Idempotent per
 * (learner, date), so a retried run cannot double-notify. Respects the
 * autoNotifyPassengers setting — when off, the run reports skipped and writes nothing.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sendBookingReminders } from '@/lib/booking/reminders';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Dry run: compute the audience and report it, but notify nobody. Auth is still
  // required — this is not a public preview.
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

  try {
    const summary = await sendBookingReminders(createServiceRoleClient(), {
      createdBy: null, // no human actor for a scheduled run
      dryRun,
    });
    return NextResponse.json({ success: true, data: summary });
  } catch (e) {
    console.error('[booking-reminders] run failed', e);
    return NextResponse.json({ error: 'Reminder run failed' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Register the schedule in `vercel.json`**

Add a second entry to the existing `crons` array (do NOT remove the existing one):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["bom1"],
  "crons": [
    {
      "path": "/api/cron/incharge-attendance",
      "schedule": "30 15 * * *"
    },
    {
      "path": "/api/cron/booking-reminders",
      "schedule": "30 11 * * *"
    }
  ]
}
```

- [ ] **Step 4: Verify**

Run: `npm run test -- lib/booking lib/settings` — expect all passing.
Run: `npx tsc --noEmit 2>&1 | grep -E "send-reminders|cron/booking-reminders|lib/booking/reminders"` — expect ZERO lines.
Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('vercel.json parses OK')"` — expect the OK line (a malformed vercel.json silently breaks deployment).

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/bookings/send-reminders/route.ts app/api/cron/booking-reminders/route.ts vercel.json
git commit -m "feat(booking): automatic daily booking reminders via Vercel Cron"
```

---

### Task 3: Verification + smoke checklist

**Files:** none (verification only)

- [ ] **Step 1: Full suite + build**

Run: `npm run test` — all passing.
Run: `npx next build --webpack` — reaches "Compiled successfully". (A full build needs an env file; page-data collection failing on missing Supabase vars is an environment artifact, not a code defect.)

- [ ] **Step 2: Record the human smoke checklist**

These need a real deployment + authenticated access and CANNOT be verified by the agent:
1. `GET /api/cron/booking-reminders` with NO auth header → **401**.
2. With `Authorization: Bearer $CRON_SECRET` and `?dryRun=1` → `{success, data}` with a plausible `candidates` count and `reminded: 0`.
3. Live run: confirm learners WITHOUT a booking for tomorrow receive the 🔔 notification and learners WITH one receive nothing.
4. Re-run the same day → `reminded: 0` (idempotency holds, nobody double-notified).
5. Turn `autoNotifyPassengers` off in Settings → run reports `skipped` and writes nothing.
6. Set the cutoff to 19 and confirm the notification body says "7 PM", not "8 PM".
