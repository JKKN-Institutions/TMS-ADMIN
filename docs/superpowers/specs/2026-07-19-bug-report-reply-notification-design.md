# Bug-report reply → student notification

**Date:** 2026-07-19
**Status:** Approved (design)
**Author:** Sangeetha V (with Claude)

## Problem

Admins reply to bug reports in the in-app console at `/bug-reports/[id]` (the
"Conversation" box → **Send**). Sending fails with a red **"Failed to send
message."**

### Root cause (verified, not our code)

The console is a thin proxy over the external JKKN Bug Reporter platform
(`jkkn-centralized-bug-reporter.vercel.app`). Reproducing the reply POST
directly against that platform returns:

```
HTTP/1.1 500 Internal Server Error
{"success":false,"error":{"code":"INTERNAL_ERROR","message":"Failed to send message",
 "details":{"error":"null value in column \"sender_user_id\" of relation
             \"bug_report_messages\" violates not-null constraint"}}}
```

The platform's `bug_report_messages.sender_user_id` is **NOT NULL** — every
message must be attributed to a *user*. Our admin console authenticates with an
**application API key** (`X-API-Key: br_…`), which carries **no user identity**,
so the insert violates the constraint. The public `/messages` endpoint was built
for the *reporter* to add messages from inside the widget (their login supplies
the id); it was never wired for an admin/support reply via API key. This was the
one path the integration flagged as UNVERIFIED.

The fix for the shared thread belongs in the *platform's* repo/DB, which we do
not own. This spec routes around it to satisfy the real goal: **the reporter
should be notified of the admin's reply.**

## Goal

Every admin reply in `/bug-reports/[id]` is delivered to the reporter as a TMS
in-app notification (which also fires best-effort web push via the existing
dispatch primitive). Applies to **all** bug-report replies.

## Non-goals (YAGNI)

- No fix to the external platform (not our repo).
- No local persistence of the reply thread / no new DB table.
- No new permission or migration (reuse `tms.settings.manage` + `tms_notification`).
- No email channel (the in-app inbox + its automatic web-push is the deliverable).

## Approach

**Option A (chosen):** the Send button stops calling the external platform and
instead delivers the reply as a TMS notification to the reporter's student
inbox, keyed by the reporter's email.

Rejected: **B** (also best-effort call the still-broken external endpoint) and
**C** (persist replies locally so the console thread shows them). Both add work
for value that only matters once the platform is fixed.

## Change surface (3 files)

1. `app/api/admin/bug-reports/route.ts` — rewrite the `handlePost` body.
2. `lib/bug-reports/notify.ts` *(new)* — one pure, unit-testable formatter.
3. `app/(admin)/bug-reports/[id]/page.tsx` — clearer send feedback.

## Detailed design

### The formatter (new, pure — `lib/bug-reports/notify.ts`)

```ts
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

If the report has no `display_id`, the title omits the parenthetical entirely
(never renders a filler like "(your report)").

Chosen format = **"Reply only (minimal)"**: title names the report id, body is the
admin's reply verbatim. No "Re:" context line, no signature.

### `handlePost` (rewrite)

1. `requirePerm(auth, PERM)` — unchanged (super-admin or `tms.settings.manage`).
2. Parse `{ id, message }`; `400` if either missing — unchanged.
3. `isBugReporterConfigured()` guard — unchanged (`503` if not).
4. **Fetch the report server-side** via `getBugReport(id)`:
   - `reporterEmail` from the existing `pickReporter(b, readMeta(b))` helper.
   - `displayId` = `(b as { display_id?: string }).display_id ?? null`
     (read defensively; the SDK type does not declare `display_id`).
   - On fetch error → `502 { error: "Couldn't load the report to find the reporter." }`.
   - *Server-side fetch, not client-supplied email, so a reply can never be aimed
     at the wrong student.*
5. If `!reporterEmail` → `200 { success:true, delivered:false, reason:'no_email' }`.
6. `const { title, body } = buildReplyNotification(displayId, message)`.
7. Deliver:
   ```ts
   const svc = createServiceRoleClient();
   const { recipientCount } = await dispatchNotification(svc, {
     title, body,
     category: 'general',
     url: null,
     createdBy: auth.userId,          // admin's profiles.id
     targeting: { type: 'emails', emails: [reporterEmail] },
   });
   ```
8. `recipientCount === 0`
   → `200 { success:true, delivered:false, reason:'no_profile' }`
   else → `200 { success:true, delivered:true, recipientCount }`.
9. Wrap the dispatch in try/catch → `502 { error: (e as Error).message || 'Failed to notify the reporter' }`.
10. The `replyToBugReport` import/call is removed from this route. The function
    stays in `lib/bug-reports/client.ts` with a comment noting it is currently
    unused because the platform's `/messages` endpoint rejects API-key senders.

### Frontend (`app/(admin)/bug-reports/[id]/page.tsx`)

- The `sendReply` mutation returns the parsed JSON (`{ delivered, reason }`)
  instead of `void`.
- `onSuccess(data)`:
  - `delivered` → clear the box; show green **"Reply delivered to the reporter's inbox."**
  - `reason === 'no_profile'` → amber **"The reporter isn't a TMS app user — reply couldn't be delivered."** (do not clear the box).
  - `reason === 'no_email'` → amber **"This report has no reporter email — nothing to deliver."**
- `onError` → existing red inline error (unchanged mechanism).
- Static caption under the reply box: *"Replies are delivered to the reporter's
  notification inbox."* — so the still-empty external "Conversation" thread does
  not read as broken.
- Feedback uses the page's existing inline `<p>` pattern (green/amber/red text),
  not a toast, to keep the change self-contained.

## Edge cases

| Case | Behaviour |
|------|-----------|
| Anonymous report (no reporter email) | amber `no_email`, no error |
| Email present but no matching TMS profile (staff/external) | amber `no_profile`, no error |
| Reply longer than 4000 chars | truncated to 4000 |
| External `getBugReport` fails | `502`, red inline error |
| Reporter matches a profile | delivered → in-app notif + best-effort web push |

## Testing

- **Unit (vitest):** `buildReplyNotification` — title contains the display id
  when present and omits the parenthetical when `null`; body is trimmed and
  capped at 4000 chars.
- **Build:** `next build` exits 0. (`tsc` is chronically red on `main` and is NOT
  the build gate — `ignoreBuildErrors:true`; verify with build + vitest.)
- **Manual (needs a logged-in browser — the agent's Chrome is unauthenticated):**
  open a real report, Send a reply, confirm the green confirmation; confirm the
  student's 🔔 inbox shows *"Reply to your bug report (BUG-xxx)"*.

## Related

- `project_bug_reporter_integration` memory (platform proxy, API-shape drift).
- `project_notifications_module` memory (`dispatchNotification`, `emails` targeting).
