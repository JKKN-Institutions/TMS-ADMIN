# Daily "Needs attention" Mail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mail the dashboard's "Needs attention" list to the two transport heads at 10:00 IST every working day, and send nothing when nothing needs attention.

**Architecture:** The alert counting moves out of the dashboard route into a shared loader, so the dashboard and the mail read the same numbers. A pure renderer turns alerts into a mail, a small runner decides send/skip and records one log row per IST date, and a Bearer-protected cron route (called by pg_cron through pg_net) triggers it.

**Tech Stack:** Next.js 16 route handlers, Supabase (service-role client, pg_cron, pg_net, vault), nodemailer over Gmail SMTP, vitest.

**Spec:** `docs/superpowers/specs/2026-11-17-attention-digest-design.md`

## Global Constraints

- Work only in `.worktrees/attention-digest` on branch `feat/attention-digest`. Never `cd` to the main checkout; never bare `git stash`.
- Type-check with `node node_modules/typescript/bin/tsc --noEmit -p .` (`npx tsc` is a no-op stub here). Main already has about 550 errors; the bar is **no new errors in files this plan touches**.
- Tests: `node node_modules/vitest/vitest.mjs run <path>`. Vitest only includes `lib/**/*.test.ts` and `proxy.test.ts`, so all tested logic lives under `lib/`.
- `npm run lint` is broken; do not use it.
- Dependencies are added with `bun add` (`bun.lock` is the maintained lockfile). `node_modules` is a junction into the main checkout.
- A failed measurement is `null`, never `0`.
- Cron paths are allow-listed in `proxy.ts` by **exact path** only.
- Recipients: `surendhar.m@jkkn.ac.in`, `sekar.s@jkkn.ac.in`. They live in env, never in source.
- Schedule: `30 4 * * *` UTC (10:00 IST). Skip Sundays and all-routes rows in `tms_service_calendar`.
- Env names: `SMTP_USER`, `SMTP_PASS`, `ATTENTION_DIGEST_RECIPIENTS`, `ATTENTION_DIGEST_FROM_NAME` (optional, default `JKKN Transport`), existing `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`.
- Nothing is mailed to the heads, and the cron migration is not applied, until the user has approved a test mail.
- Commit messages end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Review Focus

1. **Route board failed to load.** `loadRouteBoard` returns `routes: []` on failure, which today reads as "0 routes without a bus". Expected: the two route checks are unmeasured (`null`), so the mail is not silenced. Pinned in Task 1.
2. **Database text inside the HTML mail.** Route numbers and bus registrations are free text. Expected: `<`, `&`, `"` are escaped. Pinned in Task 2.
3. **Only the blue info row exists.** Expected: that counts as nothing to report, and no mail is sent. Pinned in Tasks 2 and 3.
4. **Job fires twice, or is retried after a failure.** Expected: a second run after `sent` does nothing; a run after `failed` tries again. Pinned in Task 3.
5. **Credentials or recipients missing or malformed.** Expected: outcome `failed` with the missing names listed, HTTP 500 from the route, no partial send. Pinned in Task 3.

---

### Task 1: Shared attention loader

**Files:**
- Create: `lib/dashboard/attention.ts`
- Test: `lib/dashboard/attention.test.ts`
- Modify: `app/api/admin/dashboard/route.ts` (the six alert-input entries of the `Promise.all`, the `expiredDocVehicles` and `routesWithNoScans` helpers, and the `buildAlerts({...})` call)

**Interfaces:**
- Produces:
  ```ts
  export interface AttentionCounts {
    overdueBills: number | null;
    staleGrievances: number | null;
    openGrievances: number | null;
    ridersWithoutStop: number | null;
    expiredDocs: { count: number; registrations: string[] } | null;
    nobodyScanned: { count: number; numbers: string[] } | null;
    /** Keys of failed queries, using the dashboard's existing key names. */
    degraded: string[];
  }
  export async function loadAttentionCounts(supabase: SupabaseClient, today: string): Promise<AttentionCounts>;
  export function toAlertInputs(
    counts: AttentionCounts,
    board: { routes: DashboardRouteRow[]; degraded: string[] },
  ): AlertInputs;
  ```
- Degraded keys must stay exactly: `bills.overdue`, `grievances.stale`, `grievances.open`, `learners.noStop`, `vehicles.expiredDocs`, `routes.noScans`.

- [ ] **Step 1: Write the failing tests** for `toAlertInputs` in `lib/dashboard/attention.test.ts`:

```ts
const counts: AttentionCounts = {
  overdueBills: 172, staleGrievances: 14, openGrievances: 14, ridersWithoutStop: 9,
  expiredDocs: { count: 2, registrations: ['TN 33 A 1', 'TN 33 B 2'] },
  nobodyScanned: { count: 1, numbers: ['12'] }, degraded: [],
};
const row = (n: string, reg: string | null, hasDriver: boolean) =>
  ({ routeNumber: n, vehicleRegistration: reg, hasDriver }) as DashboardRouteRow;

it('derives the route checks from the board', () => {
  const i = toAlertInputs(counts, { routes: [row('4', null, true), row('9', 'TN1', false)], degraded: [] });
  expect(i.routesWithoutBus).toBe(1);
  expect(i.routesWithoutBusNumbers).toEqual(['4']);
  expect(i.routesWithoutDriver).toBe(1);
  expect(i.routesWithoutDriverNumbers).toEqual(['9']);
  expect(i.expiredVehicleDocs).toBe(2);
  expect(i.routesNobodyScanned).toBe(1);
});

it.each(['routes', 'board'])('leaves route checks unmeasured when the board failed (%s)', (key) => {
  const i = toAlertInputs(counts, { routes: [], degraded: [key] });
  expect(i.routesWithoutBus).toBeNull();
  expect(i.routesWithoutDriver).toBeNull();
});

it('keeps a failed count null', () => {
  const i = toAlertInputs({ ...counts, expiredDocs: null, nobodyScanned: null }, { routes: [], degraded: [] });
  expect(i.expiredVehicleDocs).toBeNull();
  expect(i.routesNobodyScanned).toBeNull();
});
```

- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run lib/dashboard/attention.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `lib/dashboard/attention.ts`.** Move the six queries out of the dashboard route unchanged (same filters, same `ACTIVE_LIFECYCLE_STATUSES`, same `DOC_EXPIRY_COLUMNS`, same morning-only `direction = 'onward'` rule), running them in one `Promise.all`. `staleBefore` is `now - 3 days`. Export `DOC_EXPIRY_COLUMNS` from here; the route imports it for its "due soon" query.
- [ ] **Step 4: Rewire the dashboard route.** Replace the six entries with one `loadAttentionCounts(supabase, today)` in the same `Promise.all`; feed each returned key into the route's `degraded.note(key, 'see attention loader')`; keep `finance.overdueBills`, `attention.docsExpired` and `fleet.expiredDocs` reading from the returned counts; build alerts with `buildAlerts(toAlertInputs(counts, board))`. Delete the now-unused helpers.
- [ ] **Step 5: Verify.** Tests pass; `node node_modules/vitest/vitest.mjs run lib/dashboard` is green; tsc reports no errors in `lib/dashboard/attention.ts` or `app/api/admin/dashboard/route.ts` that are absent on the base branch.
- [ ] **Step 6: Commit** `refactor(dashboard): share the Needs-attention checks with a loader`.

### Task 2: Mail renderer

**Files:**
- Create: `lib/attention-digest/render.ts`
- Test: `lib/attention-digest/render.test.ts`

**Interfaces:**
- Consumes: `DashboardAlert` from `lib/dashboard/types.ts`.
- Produces:
  ```ts
  /** Rows that go in the mail: everything except severity 'info'. Order preserved. */
  export function digestAlerts(alerts: DashboardAlert[]): DashboardAlert[];
  export function renderDigest(
    alerts: DashboardAlert[],              // already filtered by digestAlerts
    opts: { date: string; appUrl: string } // date = IST YYYY-MM-DD
  ): { subject: string; html: string; text: string };
  ```

- [ ] **Step 1: Write the failing tests** (build alerts with the real `buildAlerts`):

```ts
it('drops info rows and keeps the rest in order', ...)            // openGrievances only -> []
it('subject counts rows and carries the date', ...)               // 'TMS – 2 items need attention (17 Nov 2026)'
it('uses the singular for one row', ...)                          // 'TMS – 1 item needs attention (17 Nov 2026)'
it('groups rows under Critical, Warning and Could not check', ...) // headings appear in that order in text
it('lists every affected item, not a truncated sample', ...)      // 14 registrations all present in html and text
it('makes links absolute and tolerates a trailing slash', ...)    // appUrl 'https://x.in/' + '/fees' -> 'https://x.in/fees'
it('omits the link for a row with no href', ...)                  // checks-unmeasured row
it('escapes database text in html', ...)                          // item '<b>&"x' -> '&lt;b&gt;&amp;&quot;x', raw form absent
it('text body has no html tags', ...)                             // expect(text).not.toMatch(/<[a-z]/i)
```

- [ ] **Step 2: Run** the test file. Expected: FAIL, module not found.
- [ ] **Step 3: Implement.** HTML is a single 600px table with inline styles only (Gmail strips `<style>`); one block per alert showing count, subject, state chip, reason, items, action, and an "Open in TMS" link. Severity colours: critical `#b91c1c`, warning `#b45309`, unknown `#475569`. Heading copy: `Critical`, `Warning`, `Could not check`. Footer copy: `Sent automatically by JKKN TMS every working day at 10:00 am. Fixed items drop off the next mail.`
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(attention-digest): render the Needs-attention mail`.

### Task 3: Log table, mailer and runner

**Files:**
- Create: `supabase/migrations/20261117100000_tms_attention_digest_log.sql`
- Create: `lib/attention-digest/config.ts`, `lib/attention-digest/mailer.ts`, `lib/attention-digest/run.ts`
- Test: `lib/attention-digest/config.test.ts`, `lib/attention-digest/run.test.ts`
- Modify: `package.json`, `bun.lock` (`bun add nodemailer` and `bun add -d @types/nodemailer`)

**Interfaces:**
- Consumes: `loadAttentionCounts`, `toAlertInputs` (Task 1); `digestAlerts`, `renderDigest` (Task 2); `buildAlerts`; `loadRouteBoard(date)`; `istToday`, `isSunday` from `lib/booking/window`; `loadExceptions(svc, null, from, to)` from `lib/booking/calendar`.
- Produces:
  ```ts
  // config.ts
  export type MailConfig =
    | { ok: true; user: string; pass: string; fromName: string; recipients: string[]; appUrl: string }
    | { ok: false; missing: string[] };
  export function readMailConfig(env: Record<string, string | undefined>): MailConfig;
  export function parseRecipients(raw: string | undefined): string[]; // trim, lower-case, de-dupe, drop invalid

  // mailer.ts
  export async function sendMail(cfg: Extract<MailConfig, { ok: true }>,
    msg: { to: string[]; subject: string; html: string; text: string }): Promise<void>; // throws on SMTP error

  // run.ts
  export type DigestOutcome = 'sent' | 'failed' | 'skipped_clear' | 'skipped_off_day' | 'skipped_already_sent';
  export function decideDigest(i: { sunday: boolean; holiday: boolean; rows: number }):
    'send' | 'skipped_off_day' | 'skipped_clear';
  export interface DigestSummary {
    date: string; outcome: DigestOutcome | 'dry_run' | 'test_sent';
    rows: number; recipients: string[]; error: string | null;
    preview?: { subject: string; html: string; text: string }; // dry run only
  }
  export async function runAttentionDigest(svc: SupabaseClient,
    opts?: { dryRun?: boolean; testTo?: string; send?: typeof sendMail; now?: Date }): Promise<DigestSummary>;
  ```
- Table `tms_attention_digest_log`: `digest_date date primary key`, `outcome text not null check (outcome in ('sending','sent','failed','skipped_clear','skipped_off_day'))`, `rows integer not null default 0`, `recipients text[] not null default '{}'`, `error text`, `created_at`, `updated_at timestamptz not null default now()`. RLS enabled with no policies (service role only).

- [ ] **Step 1: Write the failing tests.**

```ts
// config.test.ts
it('reports every missing name', () =>
  expect(readMailConfig({})).toEqual({ ok: false,
    missing: ['SMTP_USER', 'SMTP_PASS', 'ATTENTION_DIGEST_RECIPIENTS', 'NEXT_PUBLIC_APP_URL'] }));
it('treats a recipients value with no valid address as missing', ...) // 'abc, ,x@' -> missing includes ATTENTION_DIGEST_RECIPIENTS
it('parses, lower-cases and de-dupes recipients', () =>
  expect(parseRecipients(' A@jkkn.ac.in, a@jkkn.ac.in ;b@jkkn.ac.in')).toEqual(['a@jkkn.ac.in', 'b@jkkn.ac.in']));
it('defaults the from name to JKKN Transport', ...)

// run.test.ts
it('skips an off day before looking at rows', () => {
  expect(decideDigest({ sunday: true, holiday: false, rows: 5 })).toBe('skipped_off_day');
  expect(decideDigest({ sunday: false, holiday: true, rows: 5 })).toBe('skipped_off_day');
});
it('skips when nothing is left', () =>
  expect(decideDigest({ sunday: false, holiday: false, rows: 0 })).toBe('skipped_clear'));
it('sends otherwise', () =>
  expect(decideDigest({ sunday: false, holiday: false, rows: 1 })).toBe('send'));
```

- [ ] **Step 2: Run** both files. Expected: FAIL, modules not found.
- [ ] **Step 3: Add the dependency and write the migration file** (do not apply it yet).
- [ ] **Step 4: Implement `config.ts` and `mailer.ts`.** Transport: host `smtp.gmail.com`, port `465`, `secure: true`; `from` is `"<fromName>" <user>`; all recipients in `to`.
- [ ] **Step 5: Implement `run.ts`.** Order of work inside `runAttentionDigest`:
  1. `date = istToday(now)`; load counts and the route board together; `rows = digestAlerts(buildAlerts(toAlertInputs(...)))`.
  2. `dryRun`: return `outcome: 'dry_run'` with `preview`; write nothing, send nothing. Works even on an off day and with missing mail config (falls back to an empty `appUrl`).
  3. `testTo`: require valid config, send only to that address, return `test_sent`; write nothing to the log.
  4. Otherwise `decideDigest`. A skip upserts its outcome and returns.
  5. Claim the day: insert `outcome: 'sending'`. On unique violation `23505`, read the row: `sent` or `sending` returns `skipped_already_sent`; anything else is re-claimed with an update guarded by `.eq('outcome', <what was read>)`.
  6. Config not ok: record `failed` with `error: 'missing: ' + names`. Otherwise send; record `sent`, or `failed` with the SMTP message. Never throw past this function for a send failure.
- [ ] **Step 6: Run** both test files and `lib/dashboard`. Expected: PASS. tsc: no errors in `lib/attention-digest/`.
- [ ] **Step 7: Commit** `feat(attention-digest): mailer, daily log and send/skip runner`.

### Task 4: Cron route and proxy allow-list

**Files:**
- Create: `app/api/cron/attention-digest/route.ts`
- Modify: `proxy.ts` (`PUBLIC_PATHS`), `proxy.test.ts`

**Interfaces:**
- Consumes: `runAttentionDigest` (Task 3), `createServiceRoleClient`.

- [ ] **Step 1: Add the failing proxy test:** `expect(SRC).toContain("'/api/cron/attention-digest'")`. Run `node node_modules/vitest/vitest.mjs run proxy.test.ts`. Expected: FAIL.
- [ ] **Step 2: Add the exact path to `PUBLIC_PATHS`** with a comment: sends one mail a day, moves no money, removes no role.
- [ ] **Step 3: Implement the route**, mirroring `app/api/cron/fee-payment-notices/route.ts`: `dynamic = 'force-dynamic'`, `maxDuration = 60`, 401 unless `Authorization: Bearer $CRON_SECRET`, `?dryRun=1`, `?testTo=<address>`. Respond `{ success: true, data: summary }`; status 500 when `summary.outcome === 'failed'`.
- [ ] **Step 4: Verify.** Proxy test passes. Start `next dev` in the worktree and check: no header returns 401 JSON; with the Bearer secret and `dryRun=1` returns 200 with `outcome: 'dry_run'` and a `preview.subject`. If the local env has no `CRON_SECRET`, say so and verify the 401 only.
- [ ] **Step 5: Commit** `feat(attention-digest): scheduled endpoint for the daily mail`.

### Task 5: Schedule migration and rollout notes

**Files:**
- Create: `supabase/migrations/20261117100100_schedule_attention_digest.sql`
- Create: `docs/attention-digest-runbook.md`

- [ ] **Step 1: Write the schedule migration**, copying `20260930120100_schedule_incharge_bill_review.sql`: job name `tms-attention-digest`, schedule `30 4 * * *`, path `/api/cron/attention-digest`, `timeout_milliseconds := 60000`, with the same "apply only after deploy" header plus "and only after a test mail is approved".
- [ ] **Step 2: Write the runbook** (short): the env vars, how to create a Google app password, the dry-run and test-send commands, how to read `tms_attention_digest_log`, and the off switch (`select cron.unschedule('tms-attention-digest');`).
- [ ] **Step 3: Full check.** `node node_modules/vitest/vitest.mjs run` whole suite green; tsc shows no new errors in touched files against the base.
- [ ] **Step 4: Commit** `chore(attention-digest): schedule migration and runbook`.

## After the plan (needs the user, not part of the tasks)

1. User adds `SMTP_USER`, `SMTP_PASS`, `ATTENTION_DIGEST_RECIPIENTS` in Vercel.
2. Apply the log-table migration; push; wait for deploy.
3. Dry run, then `testTo` the user's own address. User approves the look.
4. Apply the schedule migration. Check the log table after the first 10:00 run.
