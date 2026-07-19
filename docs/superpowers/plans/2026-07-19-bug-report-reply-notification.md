# Bug-report reply → student notification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/bug-reports/[id]` "Send" action deliver an admin's reply to the reporter as a TMS in-app notification, instead of calling the broken external platform endpoint.

**Architecture:** The reply POST handler resolves the reporter's email + display id from the authoritative external record (GET works), formats a notification with a pure helper, and fans it out through the existing `dispatchNotification` primitive targeting the email. The detail page reports delivered / not-delivered inline.

**Tech Stack:** Next.js 15 App Router (route handlers), TypeScript, Supabase (service-role), TanStack Query (client mutation), Vitest.

## Global Constraints

- Verify with `npm test` (`vitest run`) + `npm run build` + path-scoped `tsc` grep. Do NOT treat a red full `tsc` as a regression — `main` carries ~540 chronic errors and `next build` has `ignoreBuildErrors:true`. Only assert no *new* errors in the files this plan touches.
- No DB migration, no new permission. Reuse `tms.settings.manage` (the route's existing `PERM`) and the `tms_notification` plane.
- Notification format is fixed: title `Reply to your bug report (<display_id>)` (parenthetical omitted when there is no id), body = the admin's reply verbatim, trimmed, capped at 4000 chars.
- Notification delivery MUST go through `dispatchNotification(svc, …)` with `targeting: { type: 'emails', emails: [reporterEmail] }` and `createdBy: auth.userId`. Never write `tms_notification*` tables directly.
- Recipient email is resolved SERVER-SIDE from `getBugReport(id)`, never from the client request body.
- Vitest only scans `lib/**/*.test.ts` (see `vitest.config.ts`); route/page files are verified by build + manual, not unit tests.

---

### Task 1: Pure reply-notification formatter

**Files:**
- Create: `lib/bug-reports/notify.ts`
- Test: `lib/bug-reports/notify.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `buildReplyNotification(displayId: string | null, message: string): { title: string; body: string }` — used by Task 2.

- [ ] **Step 1: Write the failing test**

Create `lib/bug-reports/notify.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildReplyNotification } from './notify';

describe('buildReplyNotification', () => {
  it('puts the display id in the title when present', () => {
    expect(buildReplyNotification('BUG-489', 'hello').title).toBe(
      'Reply to your bug report (BUG-489)',
    );
  });

  it('omits the parenthetical when the display id is null or blank', () => {
    expect(buildReplyNotification(null, 'hi').title).toBe('Reply to your bug report');
    expect(buildReplyNotification('   ', 'hi').title).toBe('Reply to your bug report');
  });

  it('trims the body', () => {
    expect(buildReplyNotification('BUG-1', '  hi  ').body).toBe('hi');
  });

  it('caps the body at 4000 characters', () => {
    expect(buildReplyNotification('BUG-1', 'x'.repeat(5000)).body).toHaveLength(4000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/bug-reports/notify.test.ts`
Expected: FAIL — cannot resolve `./notify` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `lib/bug-reports/notify.ts`:

```ts
/**
 * Formats an admin bug-report reply into a TMS notification (title + body).
 * Pure + dependency-free so it is unit-testable; delivery lives in the
 * bug-reports POST route via lib/notifications/dispatch.
 */
export function buildReplyNotification(
  displayId: string | null,
  message: string,
): { title: string; body: string } {
  const id = displayId?.trim();
  return {
    title: id ? `Reply to your bug report (${id})` : 'Reply to your bug report',
    body: message.trim().slice(0, 4000),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/bug-reports/notify.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/bug-reports/notify.ts lib/bug-reports/notify.test.ts
git commit -m "feat(bug-reports): add reply-notification formatter"
```

---

### Task 2: Deliver the reply as a notification (POST handler)

**Files:**
- Modify: `app/api/admin/bug-reports/route.ts` (imports at lines 4-9; `handlePost` at lines 164-184)
- Modify: `lib/bug-reports/client.ts` (comment on the now-unused `replyToBugReport`, ~line 81)

**Interfaces:**
- Consumes: `buildReplyNotification` (Task 1); existing module-scope helpers `pickReporter(b, meta)` and `readMeta(b)` in the same route file; `getBugReport(id)`, `isBugReporterConfigured()` from `@/lib/bug-reports/client`; `createServiceRoleClient()` from `@/lib/supabase/server`; `dispatchNotification(svc, input)` from `@/lib/notifications/dispatch`.
- Produces: `POST /api/admin/bug-reports` JSON responses:
  - `200 { success: true, delivered: true, recipientCount: number }`
  - `200 { success: true, delivered: false, reason: 'no_email' | 'no_profile' }`
  - `400 { error }` (missing id/message), `403 { error }` (perm), `502 { error }` (load/notify failure), `503 { error }` (not configured). Consumed by Task 3.

- [ ] **Step 1: Update imports**

In `app/api/admin/bug-reports/route.ts`, remove `replyToBugReport` from the client import and add the two new imports. Replace lines 4-9:

```ts
import {
  isBugReporterConfigured,
  listBugReports,
  getBugReport,
  replyToBugReport,
} from '@/lib/bug-reports/client';
```

with:

```ts
import { isBugReporterConfigured, listBugReports, getBugReport } from '@/lib/bug-reports/client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { dispatchNotification } from '@/lib/notifications/dispatch';
import { buildReplyNotification } from '@/lib/bug-reports/notify';
```

- [ ] **Step 2: Rewrite `handlePost`**

Replace the entire `handlePost` function (currently lines 164-184) with:

```ts
async function handlePost(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, PERM))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { id?: string; message?: string };
  const id = String(body.id ?? '').trim();
  const message = String(body.message ?? '').trim();
  if (!id || !message) {
    return NextResponse.json({ error: 'id and message are required' }, { status: 400 });
  }
  if (!isBugReporterConfigured()) {
    return NextResponse.json({ error: 'Bug Reporter is not configured' }, { status: 503 });
  }

  // Resolve the recipient from the AUTHORITATIVE platform record (read works),
  // never from the client — so a reply can't be aimed at another student. The
  // platform's own /messages write is unusable here: it requires a NOT NULL
  // sender_user_id that our API-key auth has no user for. We route the reply to
  // the reporter's TMS notification inbox instead.
  let reporterEmail: string | null;
  let displayId: string | null;
  try {
    const b = (await getBugReport(id)).bug_report;
    reporterEmail = pickReporter(b, readMeta(b)).email;
    displayId = (b as unknown as { display_id?: string | null }).display_id ?? null;
  } catch (e) {
    console.error('bug-reports reply: load report failed:', e);
    return NextResponse.json(
      { error: "Couldn't load the report to find the reporter." },
      { status: 502 },
    );
  }

  if (!reporterEmail) {
    return NextResponse.json({ success: true, delivered: false, reason: 'no_email' });
  }

  const { title, body: notifBody } = buildReplyNotification(displayId, message);
  try {
    const svc = createServiceRoleClient();
    const { recipientCount } = await dispatchNotification(svc, {
      title,
      body: notifBody,
      category: 'general',
      url: null,
      createdBy: auth.userId,
      targeting: { type: 'emails', emails: [reporterEmail] },
    });
    return recipientCount > 0
      ? NextResponse.json({ success: true, delivered: true, recipientCount })
      : NextResponse.json({ success: true, delivered: false, reason: 'no_profile' });
  } catch (e) {
    console.error('bug-reports reply: notify failed:', e);
    return NextResponse.json(
      { error: (e as Error).message || 'Failed to notify the reporter' },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 3: Note the retired external call**

In `lib/bug-reports/client.ts`, add a comment above `export function replyToBugReport` (~line 81) — the function stays for reference but is no longer called:

```ts
// NOTE: currently UNUSED. The platform's /messages insert requires a NOT NULL
// sender_user_id, which our API-key auth (no user identity) cannot supply, so it
// 500s. The admin console now routes replies to the reporter's TMS notification
// inbox instead (see app/api/admin/bug-reports/route.ts handlePost). Kept for
// reference / if the platform later accepts API-key senders.
export function replyToBugReport(id: string, message: string): Promise<unknown> {
```

- [ ] **Step 4: Verify no new type errors in the touched files**

Run: `npx tsc --noEmit 2>&1 | grep -E "bug-reports/(route|notify|client)"`
Expected: no output (the ~540 chronic errors elsewhere are unrelated; our files must be clean).

- [ ] **Step 5: Verify the build compiles**

Run: `npm run build`
Expected: exit 0 (build succeeds).

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/bug-reports/route.ts lib/bug-reports/client.ts
git commit -m "feat(bug-reports): deliver admin replies to the reporter's notification inbox"
```

---

### Task 3: Reply-box feedback (detail page)

**Files:**
- Modify: `app/(admin)/bug-reports/[id]/page.tsx` (`sendReply` mutation at lines 55-69; reply UI at lines 179-194)

**Interfaces:**
- Consumes: the `POST /api/admin/bug-reports` response contract from Task 2 (`{ delivered, reason }`).
- Produces: nothing (leaf UI).

- [ ] **Step 1: Type the mutation result and return the JSON**

Replace the `sendReply` mutation (lines 55-69) with:

```ts
  type SendResult = { delivered: boolean; reason?: 'no_email' | 'no_profile' };

  const sendReply = useMutation<SendResult>({
    mutationFn: async () => {
      const res = await fetch('/api/admin/bug-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id, message: reply }),
      });
      const json = (await res.json().catch(() => ({}))) as SendResult & { error?: string };
      if (!res.ok) throw new Error(json.error || 'Failed');
      return json;
    },
    onSuccess: (data) => {
      if (data.delivered) {
        setReply('');
        qc.invalidateQueries({ queryKey: ['admin-bug-report', id] });
      }
    },
  });
```

- [ ] **Step 2: Add the caption + delivered/not-delivered messages**

In the `canReply` block, add a caption under the input row. Replace lines 179-193 (the `{canReply && ( … )}` block) with:

```tsx
          {canReply && (
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <Input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Reply to reporter…"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && reply && !sendReply.isPending) sendReply.mutate();
                  }}
                />
                <Button onClick={() => sendReply.mutate()} disabled={!reply || sendReply.isPending}>
                  Send
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Replies are delivered to the reporter&apos;s notification inbox.
              </p>
            </div>
          )}
```

Then replace the existing error line (line 194):

```tsx
          {sendReply.isError && <p className="text-xs text-destructive">{(sendReply.error as Error).message}</p>}
```

with:

```tsx
          {sendReply.isSuccess && sendReply.data?.delivered && (
            <p className="text-xs text-green-600">Reply delivered to the reporter&apos;s inbox.</p>
          )}
          {sendReply.isSuccess && sendReply.data && !sendReply.data.delivered && (
            <p className="text-xs text-amber-600">
              {sendReply.data.reason === 'no_email'
                ? 'This report has no reporter email — nothing to deliver.'
                : "The reporter isn't a TMS app user — reply couldn't be delivered."}
            </p>
          )}
          {sendReply.isError && (
            <p className="text-xs text-destructive">{(sendReply.error as Error).message}</p>
          )}
```

- [ ] **Step 3: Verify no new type errors in the page**

Run: `npx tsc --noEmit 2>&1 | grep -E "bug-reports/\[id\]/page"`
Expected: no output.

- [ ] **Step 4: Verify the build compiles**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/bug-reports/[id]/page.tsx"
git commit -m "feat(bug-reports): show delivered / not-delivered feedback on reply send"
```

---

### Task 4: Manual end-to-end verification

**Files:** none (verification only).

This path cannot be tested by the agent (its Chrome is unauthenticated; the app is proxy-gated). The human runs it in their logged-in browser.

- [ ] **Step 1: Run the unit + build gates one final time**

Run: `npm test && npm run build`
Expected: vitest all-pass; build exit 0.

- [ ] **Step 2: Deliver-path check**

Open a real bug report whose reporter is a TMS student (e.g. `BUG-489`, reporter `karthigeyansp24rit@jkkn.ac.in`). Type a reply, click **Send**.
Expected: green **"Reply delivered to the reporter's inbox."**; box clears.

- [ ] **Step 3: Recipient inbox check**

As that student (or via the student portal 🔔), confirm a notification titled **"Reply to your bug report (BUG-489)"** with the reply text as its body.

- [ ] **Step 4: Not-delivered path check (optional)**

Open a report from a non-student / anonymous reporter and Send.
Expected: amber warning ("isn't a TMS app user…" or "no reporter email…"), no red error, box NOT cleared.

---

## Self-Review

**Spec coverage:**
- Reply → notification, external call dropped → Task 2. ✓
- Minimal format (title + verbatim body, id-omitting) → Task 1 + `buildReplyNotification`. ✓
- 3 files, no migration, no permission → Tasks 1-3 only. ✓
- Server-side email resolution → Task 2 Step 2. ✓
- Frontend delivered / no_profile / no_email feedback + caption → Task 3. ✓
- Edge cases (no email, no profile, >4000 chars, fetch failure) → Task 1 cap + Task 2 branches. ✓
- Testing (vitest formatter, build, manual) → Tasks 1, 2, 3, 4. ✓

**Placeholder scan:** none — every code step shows complete code; every command shows expected output.

**Type consistency:** `buildReplyNotification(displayId: string | null, message: string)` is defined in Task 1 and called with `(displayId, message)` in Task 2. The response contract `{ delivered, reason?: 'no_email' | 'no_profile' }` produced in Task 2 matches `SendResult` consumed in Task 3. `dispatchNotification` return `{ recipientCount }` matches the send route's usage. ✓
