# Automatic Transport Bill Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily cron sweeps every active current-year fee structure and generates bills for newly applicable learners, gated by a default-OFF Settings toggle — so nobody has to click Generate manually.

**Architecture:** Extract the existing 574-line generation engine out of the manual route into `lib/fees/generate.ts` (zero behavior change), add two auto-only policies (cross-structure conflict skip, no empty runs), then drive it from `/api/cron/auto-generate-bills` following the `booking-reminders` cron pattern. The kill switch is a fifth field in the existing scheduling settings blob.

**Tech Stack:** Next.js route handlers, Supabase service-role client, Vercel Cron, vitest.

**Spec:** `docs/superpowers/specs/2026-07-22-auto-bill-generation-design.md`

## Global Constraints

- Manual generate route request/response contract must not change AT ALL (Task 2 is behavior-identical; Task 3 adds auto-only branches gated on `opts.autoPolicy`).
- `autoGenerateBills` defaults to **false** everywhere (parser, blob defaults, UI seed).
- Every writer of the scheduling blob must round-trip ALL five fields — dropping one silently reverts it.
- Cron auth: `Authorization: Bearer $CRON_SECRET`, exactly like `app/api/cron/booking-reminders/route.ts`. CRON_SECRET is already configured in the Vercel project (booking-reminders depends on it).
- The run-note strings in the engine are pinned byte-for-byte — move them, never rewrite them.
- Never trigger a LIVE (non-dry-run) generation during verification. The toggle stays OFF.
- Repo idioms: `tsc` is chronically red repo-wide — verify with path-scoped tsc + `npm run build` + `npx vitest run`. Dev server uses port 3001 (3000 belongs to the sibling MyJKKN app). After `npm run build`, restore `next-env.d.ts` (`git checkout -- next-env.d.ts`).

---

### Task 1: `autoGenerateBills` field through the whole settings pipeline

**Files:**
- Modify: `lib/settings/scheduling.ts` (SchedulingConfig, DEFAULT_SCHEDULING_CONFIG, parseSchedulingConfig)
- Modify: `lib/scheduling-config.ts` (SchedulingSettings, defaultSchedulingSettings)
- Modify: `app/api/admin/settings/route.ts` (SchedulingSettingsData, toBlobShape)
- Modify: `components/admin/notifications-settings.tsx` (SchedulingBlob interface only)
- Test: `lib/settings/scheduling.test.ts` (append cases)

**Interfaces:**
- Produces: `SchedulingConfig.autoGenerateBills: boolean` (default `false`), readable via existing `loadSchedulingConfig(svc)`. Task 4 consumes this.

- [ ] **Step 1: Write the failing tests** — append to `lib/settings/scheduling.test.ts` (match the file's existing import style):

```ts
describe('autoGenerateBills', () => {
  it('defaults to false when absent', () => {
    expect(parseSchedulingConfig({}).autoGenerateBills).toBe(false);
    expect(parseSchedulingConfig(null).autoGenerateBills).toBe(false);
  });
  it('passes through an explicit boolean', () => {
    expect(parseSchedulingConfig({ autoGenerateBills: true }).autoGenerateBills).toBe(true);
    expect(parseSchedulingConfig({ autoGenerateBills: false }).autoGenerateBills).toBe(false);
  });
  it('rejects non-boolean values back to false', () => {
    expect(parseSchedulingConfig({ autoGenerateBills: 'yes' }).autoGenerateBills).toBe(false);
    expect(parseSchedulingConfig({ autoGenerateBills: 1 }).autoGenerateBills).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run lib/settings/scheduling.test.ts` — expect FAIL (`autoGenerateBills` does not exist on SchedulingConfig).

- [ ] **Step 3: Implement.** In `lib/settings/scheduling.ts`:
  - `SchedulingConfig`: add `autoGenerateBills: boolean;`
  - `DEFAULT_SCHEDULING_CONFIG`: add `autoGenerateBills: false,`
  - `parseSchedulingConfig` return object: add
    `autoGenerateBills: boolOr(b.autoGenerateBills, DEFAULT_SCHEDULING_CONFIG.autoGenerateBills),`

  In `lib/scheduling-config.ts`: add `autoGenerateBills: boolean;` to `SchedulingSettings` and `autoGenerateBills: false,` to `defaultSchedulingSettings`.

  In `app/api/admin/settings/route.ts`: add `autoGenerateBills: boolean;` to `SchedulingSettingsData` and `autoGenerateBills: cfg.autoGenerateBills,` inside `toBlobShape`.

  In `components/admin/notifications-settings.tsx`: add `autoGenerateBills: boolean;` to the `SchedulingBlob` interface (the `...current` spread already round-trips it once the type knows it).

- [ ] **Step 4: Run** `npx vitest run lib/settings/scheduling.test.ts` — expect PASS. Then `npx tsc --noEmit 2>&1 | grep -E "settings|scheduling"` — expect no NEW errors in these files.

- [ ] **Step 5: Commit** — `git add` the five files, message: `feat(settings): autoGenerateBills flag in the scheduling blob (default off)`.

---

### Task 2: Extract the generation engine (zero behavior change)

**Files:**
- Create: `lib/fees/generate.ts`
- Modify: `app/api/admin/fees/[id]/generate/route.ts` (becomes a thin wrapper)

**Interfaces:**
- Produces (Tasks 3 & 4 consume):

```ts
export interface GenerateOptions {
  mode: 'dry_run' | 'generate';
  triggeredBy: string | null; // auth.userId manually; null for cron
  autoPolicy?: boolean;       // Task 3 wires this; Task 2 defines but ignores it
}
export interface GeneratedSummary {
  runId: string | null; applicable: number; learnerBilled: number;
  staffDeferred: number; skipped: number; unresolved: number; errors: number;
  conflictSkipped: number; // Task 2: always 0. Task 3 fills it for autoPolicy runs.
  feeMode: string;
}
export type GenerateOutcome =
  | { kind: 'invalid'; message: string }              // route maps → 400
  | { kind: 'failed'; message: string }               // route maps → 500
  | { kind: 'dry_run'; preview: Record<string, unknown> } // the existing preview object, unchanged
  | { kind: 'generated'; summary: GeneratedSummary };
export async function generateForStructure(
  svc: SupabaseClient, fs: FeeStructureRow & { [k: string]: unknown }, opts: GenerateOptions
): Promise<GenerateOutcome>
```

- [ ] **Step 1: Create `lib/fees/generate.ts`.** Move the body of `generate()` from the route (everything from `const isTiered = fs.fee_mode === 'tiered';` — currently line 64 — through the final `return NextResponse.json({ success: true, data: {...}, message ... })` at line 567) into `generateForStructure`, together with the module-private `Term`/`Band`/`Resolved` interfaces (lines 32–44) and these imports from the route: `resolveApplicablePeople`/`ApplicablePerson`, `TRANSPORT_CATEGORY_NAME`/`FeeAudience`, `currentYearOf`, `resolvePersonTerms`/`UNRESOLVED_LABEL`/`StopScheduleTerm`/`UnresolvedReason`, `buildStaffFeeBillRow`, `filterOutInCharges`, plus `FeeStructureRow` from `./types` and `SupabaseClient` from `@supabase/supabase-js`. Apply EXACTLY these substitutions to the moved code — nothing else changes, including every string literal:

| # | Old (in route) | New (in lib) |
|---|---|---|
| 1 | `supabase` (the local `createServiceRoleClient()` var) | `svc` (parameter) — rename via the function signature, body references stay `supabase` by declaring the param `svc: SupabaseClient` and opening with `const supabase = svc;` (smallest possible diff) |
| 2 | `id` (route path param) | open with `const id = fs.id as string;` |
| 3 | every `return NextResponse.json({ error: X }, { status: 400 })` (8 sites: no bands / band no terms / no flat terms / no stop terms / no stop rates) | `return { kind: 'invalid', message: X };` |
| 4 | every `return NextResponse.json({ error: X }, { status: 500 })` (5 sites: stops resolve / profile emails / in-charge assignments / conflict check / academic years) | `return { kind: 'failed', message: X };` |
| 5 | `if (mode === 'dry_run') { return NextResponse.json({ success: true, data: preview }); }` | `if (opts.mode === 'dry_run') { return { kind: 'dry_run', preview }; }` — and replace the one other `mode` read (`const preview = { mode, ... }`) with `mode: opts.mode` |
| 6 | `triggered_by: auth.userId,` (run insert) | `triggered_by: opts.triggeredBy,` |
| 7 | `created_by: auth.userId,` (bill insert) | `created_by: opts.triggeredBy,` |
| 8 | the final success `return NextResponse.json(...)` | `return { kind: 'generated', summary: { runId, applicable: resolved.length, learnerBilled, staffDeferred, skipped, unresolved, errors, conflictSkipped: 0, feeMode: fs.fee_mode as string } };` |
| 9 | delete the moved `const mode: 'dry_run' \| 'generate' = ...` body-parse line (mode now arrives via `opts`) and the fs load/status-check lines 58–62 (stay in the route) | — |

  The engine does NOT call `logActivity` and does NOT touch `NextRequest`/`NextResponse` — if either import survives in `lib/fees/generate.ts`, the extraction took too much.

- [ ] **Step 2: Rewrite the route as a thin wrapper** — full replacement body of `app/api/admin/fees/[id]/generate/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { generateForStructure } from '@/lib/fees/generate';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// withAuth drops Next's route context, so pull the [id] from the path:
// /api/admin/fees/<id>/generate
function feeIdFromPath(request: NextRequest): string | null {
  const parts = request.nextUrl.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('fees');
  return i >= 0 && parts[i + 1] ? parts[i + 1] : null;
}

async function generate(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_GENERATE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = feeIdFromPath(request);
    if (!id) return NextResponse.json({ error: 'Fee structure id is required' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const mode: 'dry_run' | 'generate' = body?.mode === 'generate' ? 'generate' : 'dry_run';
    const supabase = createServiceRoleClient();

    const { data: fs } = await supabase.from('tms_fee_structure').select('*').eq('id', id).maybeSingle();
    if (!fs) return NextResponse.json({ error: 'Fee structure not found' }, { status: 404 });
    if (fs.status !== 'active') {
      return NextResponse.json({ error: 'Activate the fee structure before generating bills.' }, { status: 400 });
    }

    const outcome = await generateForStructure(supabase, fs, { mode, triggeredBy: auth.userId });
    if (outcome.kind === 'invalid') return NextResponse.json({ error: outcome.message }, { status: 400 });
    if (outcome.kind === 'failed') return NextResponse.json({ error: outcome.message }, { status: 500 });
    if (outcome.kind === 'dry_run') return NextResponse.json({ success: true, data: outcome.preview });

    const s = outcome.summary;
    await logActivity(auth, request, {
      module: 'fees',
      action: 'generate',
      entityType: 'tms_fee_structure',
      entityId: id,
      entityLabel: fs.name,
      description: `Generated transport bills for ${fs.name}: ${s.learnerBilled} learner bill(s), ${s.staffDeferred} staff deferred, ${s.skipped} skipped, ${s.unresolved} unresolved`,
      metadata: { runId: s.runId, learnerBilled: s.learnerBilled, staffDeferred: s.staffDeferred, skipped: s.skipped, unresolved: s.unresolved, errors: s.errors, feeMode: s.feeMode },
    });

    return NextResponse.json({
      success: true,
      data: { mode: 'generate', runId: s.runId, applicable: s.applicable, learnerBilled: s.learnerBilled, staffDeferred: s.staffDeferred, skipped: s.skipped, unresolved: s.unresolved, errors: s.errors },
      message: `Generated ${s.learnerBilled} learner bill(s); ${s.staffDeferred} staff deferred; ${s.skipped} already billed (skipped)${s.unresolved ? `; ${s.unresolved} unresolved` : ''}.`,
    });
  } catch (e) {
    console.error('Fee generation error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => generate(request, auth));
```

  Note the `data` and `message` shapes above are copied verbatim from the current route — that is the contract freeze.

- [ ] **Step 3: Verify** — `npx tsc --noEmit 2>&1 | grep -E "fees/generate|lib/fees/generate"` expect clean; `npx vitest run` expect all green; `npm run build 2>&1 | grep -E "Compiled|Error"` expect `✓ Compiled successfully`; `git checkout -- next-env.d.ts`.

- [ ] **Step 4: Commit** — message: `refactor(fees): extract generation engine to lib/fees/generate.ts (no behavior change)`.

---

### Task 3: Auto-only policies in the engine

**Files:**
- Modify: `lib/fees/generate.ts`

**Interfaces:**
- Consumes: `GenerateOptions.autoPolicy` (defined in Task 2, ignored until now).
- Produces: with `autoPolicy: true` — (a) persons already billed under a different structure this transport year are excluded and counted in `summary.conflictSkipped` / `preview.conflictSkipped`; (b) a generate-mode run that has nothing to insert returns `{ kind: 'generated', summary: { ...zeros, runId: null } }` WITHOUT writing a `tms_fee_generation_run` row.

- [ ] **Step 1: Conflict skip.** The engine already builds the conflicted-person set (`const conflicted = new Set<string>()` inside the chunked cross-structure check). Directly after `conflictCount = conflicted.size;` add:

```ts
    // AUTO POLICY (cron runs only): a person already billed by ANOTHER structure
    // for this transport year is skipped, not double-billed. Manual runs keep
    // today's behavior — surface the count, let the human decide.
    let conflictSkipped = 0;
    if (opts.autoPolicy && conflicted.size) {
      const before = resolved.length;
      for (let i = resolved.length - 1; i >= 0; i--) {
        if (conflicted.has(resolved[i].person.person_id)) resolved.splice(i, 1);
      }
      conflictSkipped = before - resolved.length;
    }
```

  (This sits BEFORE the `toGenerate`/`alreadyBilled` tally, so preview numbers and the short-circuit below both see the filtered cohort. `resolvedIds`, computed earlier for the conflict query itself, is not used again after this point — verify with a search before relying on that.)

  Add `conflictSkipped,` to the `preview` object, and change Task 2's hardcoded `conflictSkipped: 0` in the generated summary to `conflictSkipped`.

- [ ] **Step 2: No empty runs.** Immediately BEFORE the `tms_fee_generation_run` insert add:

```ts
    // AUTO POLICY: don't write a run row when there is nothing to generate —
    // a nightly sweep over N structures would otherwise bury the run history
    // in no-op rows.
    if (opts.autoPolicy && toGenerate === 0) {
      return {
        kind: 'generated',
        summary: {
          runId: null, applicable: resolved.length, learnerBilled: 0, staffDeferred: 0,
          skipped: alreadyBilled, unresolved, errors: 0, conflictSkipped,
          feeMode: fs.fee_mode as string,
        },
      };
    }
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit 2>&1 | grep "lib/fees/generate"` clean; `npx vitest run` green. Manual behavior untouched (both branches require `opts.autoPolicy`, which the manual route never sets).

- [ ] **Step 4: Commit** — message: `feat(fees): autoPolicy in generation engine — conflict skip + no empty runs`.

---

### Task 4: The sweep + cron route + schedule

**Files:**
- Create: `lib/fees/auto-generate.ts`
- Create: `app/api/cron/auto-generate-bills/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `generateForStructure` (Task 2/3), `loadSchedulingConfig` (Task 1).
- Produces: `runAutoGeneration(svc, { dryRun }): Promise<AutoGenSummary>`.

- [ ] **Step 1: Create `lib/fees/auto-generate.ts`:**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadSchedulingConfig } from '@/lib/settings/scheduling';
import { generateForStructure, type GenerateOutcome } from '@/lib/fees/generate';

export interface AutoGenStructureResult {
  id: string;
  name: string;
  outcome:
    | { kind: 'dry_run'; preview: Record<string, unknown> }
    | { kind: 'generated'; summary: Record<string, unknown> }
    | { kind: 'invalid' | 'failed' | 'threw'; message: string };
}
export interface AutoGenSummary {
  dryRun: boolean;
  skipped?: string;             // set when the sweep did nothing, with the reason
  transportYearId?: string;
  structures?: AutoGenStructureResult[];
}

/**
 * The nightly auto-billing sweep. Runs the SAME engine as the manual Generate
 * button over every status='active' fee structure of the CURRENT transport
 * year, with autoPolicy on (cross-structure conflict skip + no empty runs).
 *
 * dryRun bypasses the autoGenerateBills toggle on purpose: a dry run writes
 * nothing, and previewing what WOULD generate is exactly what an admin needs
 * BEFORE enabling the toggle. A live run with the toggle off is a no-op.
 */
export async function runAutoGeneration(
  svc: SupabaseClient,
  opts: { dryRun: boolean }
): Promise<AutoGenSummary> {
  const base: AutoGenSummary = { dryRun: opts.dryRun };

  if (!opts.dryRun) {
    const cfg = await loadSchedulingConfig(svc);
    if (!cfg.autoGenerateBills) return { ...base, skipped: 'autoGenerateBills is off' };
  }

  const { data: year, error: yearErr } = await svc
    .from('tms_transport_year')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();
  if (yearErr) return { ...base, skipped: `transport year lookup failed: ${yearErr.message}` };
  if (!year) return { ...base, skipped: 'no current transport year' };

  const { data: fsRows, error: fsErr } = await svc
    .from('tms_fee_structure')
    .select('*')
    .eq('status', 'active')
    .eq('transport_year_id', year.id);
  if (fsErr) return { ...base, skipped: `fee structure lookup failed: ${fsErr.message}` };
  const structures = fsRows ?? [];
  if (structures.length === 0) return { ...base, skipped: 'no active fee structures for the current year' };

  const results: AutoGenStructureResult[] = [];
  for (const fs of structures) {
    // One bad structure must not abort the others.
    try {
      const outcome: GenerateOutcome = await generateForStructure(svc, fs, {
        mode: opts.dryRun ? 'dry_run' : 'generate',
        triggeredBy: null, // no human actor; renders as "Auto" in the runs view
        autoPolicy: true,
      });
      if (outcome.kind === 'dry_run') {
        results.push({ id: fs.id, name: fs.name, outcome: { kind: 'dry_run', preview: outcome.preview } });
      } else if (outcome.kind === 'generated') {
        results.push({ id: fs.id, name: fs.name, outcome: { kind: 'generated', summary: outcome.summary as unknown as Record<string, unknown> } });
      } else {
        results.push({ id: fs.id, name: fs.name, outcome: { kind: outcome.kind, message: outcome.message } });
      }
    } catch (e) {
      console.error(`[auto-generate-bills] structure ${fs.id} (${fs.name}) threw:`, e);
      results.push({ id: fs.id, name: fs.name, outcome: { kind: 'threw', message: e instanceof Error ? e.message : 'unknown error' } });
    }
  }
  return { ...base, transportYearId: year.id, structures: results };
}
```

- [ ] **Step 2: Create `app/api/cron/auto-generate-bills/route.ts`** (mirror of booking-reminders):

```ts
/**
 * Daily automatic transport bill generation.
 *
 * Scheduled from vercel.json at "30 21 * * *" UTC = 03:00 IST — quiet hours,
 * after the day's data entry. Vercel sends `Authorization: Bearer $CRON_SECRET`.
 *
 * Sweeps every ACTIVE fee structure of the CURRENT transport year through the
 * same engine as the manual Generate button (idempotent ledger, so re-runs
 * cannot double-bill), with auto policy: cross-structure conflicts are skipped
 * and empty runs write nothing. Gated by the autoGenerateBills setting — OFF
 * means the run reports skipped and writes nothing. ?dryRun=1 previews without
 * writing and deliberately ignores the toggle (see lib/fees/auto-generate.ts).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runAutoGeneration } from '@/lib/fees/auto-generate';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  try {
    const summary = await runAutoGeneration(createServiceRoleClient(), { dryRun });
    return NextResponse.json({ success: true, data: summary });
  } catch (e) {
    console.error('[auto-generate-bills] run failed', e);
    return NextResponse.json({ error: 'Auto generation run failed' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Add the cron to `vercel.json`** — append to the existing `crons` array:

```json
    {
      "path": "/api/cron/auto-generate-bills",
      "schedule": "30 21 * * *"
    }
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit 2>&1 | grep -E "auto-generate"` clean; `npx vitest run` green.

- [ ] **Step 5: Commit** — message: `feat(fees): nightly auto-generation cron (03:00 IST), toggle-gated, dry-run capable`.

---

### Task 5: Settings toggle UI (Scheduling tab)

**Files:**
- Modify: `app/(admin)/settings/page.tsx` — add a "Billing automation" card inside the Scheduling tab's form, bound to `schedulingSettings.autoGenerateBills`, saved by the tab's existing Save button (which already POSTs the whole `schedulingSettings` object; Task 1 made the field round-trip).

**Interfaces:**
- Consumes: `schedulingSettings.autoGenerateBills` (state seeded from GET, typed by Task 1's `SchedulingSettings`).

- [ ] **Step 1: Add the card.** Locate the Scheduling tab's form section in `app/(admin)/settings/page.tsx` (the fields bound to `schedulingSettings.*`, e.g. `bookingWindowEndHour`) and append this card after the last existing scheduling field, matching the page's card styling (read the neighboring JSX first and reuse its classes if they differ):

```tsx
{/* Billing automation — the kill switch for the nightly auto-generation cron. */}
<div className="rounded-lg border border-gray-200 bg-white p-5">
  <div className="flex items-start justify-between gap-4">
    <div>
      <div className="text-sm font-medium text-gray-900">Automatic bill generation</div>
      <p className="mt-1 max-w-xl text-xs text-gray-600">
        When on, a nightly run (03:00 IST) generates transport bills for every learner
        who has become applicable under each ACTIVE fee structure of the current
        transport year — the same engine as the manual Generate button, so existing
        bills are never duplicated. People already billed by another structure this
        year are skipped. Before turning this on, deactivate any test structures:
        every active current-year structure will generate.
      </p>
    </div>
    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
      <input
        type="checkbox"
        checked={schedulingSettings.autoGenerateBills}
        onChange={(e) =>
          setSchedulingSettings({ ...schedulingSettings, autoGenerateBills: e.target.checked })
        }
        className="peer sr-only"
      />
      <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300"></div>
    </label>
  </div>
</div>
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit 2>&1 | grep "settings/page"` expect no NEW errors; `npx vitest run` green.

- [ ] **Step 3: Commit** — message: `feat(settings): Scheduling-tab toggle for automatic bill generation`.

---

### Task 6: End-to-end verification (no live generation)

**Files:** none (verification only; fix-forward commits if anything surfaces)

- [ ] **Step 1: Build gate** — `npm run build` ⇒ `✓ Compiled successfully`; `git checkout -- next-env.d.ts`; `npx vitest run` ⇒ all green.

- [ ] **Step 2: Dry-run probe.** Start the dev server with a local secret (Git Bash): `CRON_SECRET=local-test npm run dev -- -p 3001` (background). Then:
  `curl -s -H "Authorization: Bearer local-test" "http://localhost:3001/api/cron/auto-generate-bills?dryRun=1"`
  Expect `success: true` with a per-structure `preview` for each of the 5 active structures (Testing, Transport Fees 2026-2027, Arts Aided stop_wise, Arts Self tiered, Staff stop_wise).

- [ ] **Step 3: Cross-check the previews in SQL** (Supabase MCP): for at least the two flat student structures, confirm `toGeneratePairs`/`conflictSkipped` line up with a direct query of applicable learners minus `tms_fee_bill` coverage minus persons billed under the other structure. Confirm `tms_fee_generation_run` gained ZERO rows and `billing_student_bills` count is unchanged (dry run writes nothing).

- [ ] **Step 4: Toggle-off no-op.** `curl -s -H "Authorization: Bearer local-test" "http://localhost:3001/api/cron/auto-generate-bills"` (no dryRun) ⇒ `{ skipped: 'autoGenerateBills is off' }` and again zero new rows. Also `curl -s -o /dev/null -w '%{http_code}' "http://localhost:3001/api/cron/auto-generate-bills"` (no auth header) ⇒ `401`.

- [ ] **Step 5: Manual-route regression.** POST a dry-run to `/api/admin/fees/<id>/generate` cannot be done unauthenticated (proxy 401s API routes) — instead confirm the contract freeze by (a) the untouched vitest suite, (b) `git diff bf8acc8..HEAD -- app/api/admin/fees/[id]/generate/route.ts` showing the wrapper matches the plan, and (c) the build. Flag in the final report that a manual dry-run click in the admin UI is the one remaining human check.

- [ ] **Step 6: Stop the dev server, final commit if fixes were made, and report** — including the go-live steps for the user: (1) deactivate the "Testing" structure, (2) flip the Settings toggle, (3) optionally hit dryRun once more in prod.
