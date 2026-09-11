# Verification: JKKN ID card boarding scan (branch `feat/boarding-jkkn-id-scan`)

Date: 2026-09-11
Scope: full-branch verification (Task 7 of the JKKN ID card boarding scan plan). Covers everything from Tasks 1–6: the scan-resolve service, the `id_card` attendance method, the split of `tms_transport_access_for_learner` off `tms_student_transport_access`, the scan dialog UI, the booking analytics attendance tab/filter changes, and the scan API route.

Related: [Transport access split parity review](2026-09-11-transport-access-split-parity.md) (Task 3) — the parity evidence that splitting the access function did not change results for any learner.

## 1. Whole test suite

Command: `npx vitest run` (no path filter — first whole-repo run for this branch; earlier tasks only ran `lib/boarding` and `lib/booking`).

```
 Test Files  86 passed (86)
      Tests  978 passed (978)
   Start at  11:34:24
   Duration  14.28s (transform 6.78s, setup 0ms, import 13.31s, tests 3.07s, environment 64ms)
```

Result: **PASS**, 86/86 files, 978/978 tests. No regressions surfaced outside the two directories earlier tasks had already covered.

## 2. Build

Command: `npm run build`.

Result: **PASS**. The build completed and produced the full route manifest (admin, boarding, driver, student portals, and the new/changed routes: `/api/boarding/scan`, `/bookings/analytics`, etc.). It did not hit the "could not find bin metadata file" stale-lockfile symptom, so `bun install` was not needed this run.

As the brief notes, `next build` in this repo does not gate on TypeScript errors (`ignoreBuildErrors: true`), so this is necessary but not sufficient — see the scoped `tsc` result below for the type-safety evidence.

## 3. Database state

Checked read-only via `mcp__supabase__execute_sql` against the live project (`kvizhngldtiuufknvehv`). No writes were made.

**`tms_attendance_method_check` constraint:**

```sql
CHECK ((method = ANY (ARRAY['qr_scan'::text, 'manual'::text, 'id_card'::text])))
```

Three methods listed as expected: `qr_scan`, `manual`, `id_card`.

**Function grants** (`has_function_privilege`):

| Function | authenticated | service_role |
|---|---|---|
| `public.tms_student_transport_access(uuid)` (wrapper) | **true** | **true** |
| `public.tms_transport_access_for_learner(uuid)` (core) | **false** | **true** |

This matches the expected, deliberate split: the wrapper performs no caller check of its own — it is callable by any authenticated user for any profile id it is given, and self-only access is enforced by its calling route (`app/api/student/transport-access/route.ts`), which passes the authenticated user's own id and never accepts one from the client. The core (which reads any learner's fee position with no caller check either) is callable only by the service role, i.e. only from trusted server-side code paths like the boarding scan route.

## 4. Scoped TypeScript check

Command: `npx tsc --noEmit`, then filtered to only the files this branch touches.

File list (`git diff --name-only main...HEAD`, TS/TSX only):

```
app/(admin)/bookings/analytics/attendance-tab.tsx
app/(admin)/bookings/analytics/filter-bar.tsx
app/api/admin/bookings/analytics/route.ts
app/api/boarding/scan/route.ts
components/boarding/scan-dialog.tsx
lib/boarding/fee-status.ts
lib/boarding/scan-resolve.test.ts
lib/boarding/scan-resolve.ts
lib/booking/analytics-attendance.test.ts
lib/booking/analytics-attendance.ts
lib/booking/analytics-types.ts
```

Result: **zero errors in any of these 11 files.** The full `tsc --noEmit` run reported 532 errors total, none of which are in the above file list — consistent with the project's known ~540 pre-existing, ungated `tsc` error baseline on `main` (see `project_typecheck_debt` memory). Those pre-existing errors are not a gate and are not reported here as findings of this branch.

## What was NOT verified (read this before treating the branch as done)

- **No automated test exercises `app/api/boarding/scan/route.ts` directly.** This repository has no test harness for Next.js route handlers (no request/response mocking scaffold, no integration-test runner wired for API routes). The route's logic is covered indirectly through unit tests on the pieces it composes (`lib/boarding/scan-resolve.ts`, `lib/boarding/fee-status.ts`), but the HTTP handler itself — request parsing, status codes, error shapes — is untested by anything that ran in this verification.
- **No browser check was performed.** This agent's Chrome session is not authenticated against the boarding portal, so none of the actual scan-dialog UI, camera behavior, or roster-refresh behavior was exercised end to end. Everything above is static analysis, unit tests, a production build, and read-only database inspection — not a live run of the feature.

Both gaps mean the seven checklist items below are the only remaining evidence this feature works for a real user with a real ID card and a real camera. They are not optional follow-up; they are the verification.

## Open checklist for the product owner (run on a phone, during a real morning scan window: 07:00–09:30 IST)

Run these in order on the actual boarding-staff phone, logged into the real boarding portal, during live morning boarding — not as a desk test.

1. **Scan a real printed JKKN ID card.**
   Pass looks like: the result panel names the learner, shows their photo, shows their route and stop, and the credential badge on the panel reads "JKKN ID card".

2. **Scan a card belonging to a learner who has pending transport fees.**
   Pass looks like: a red banner warning about the pending fee appears on the panel, AND the learner is still marked present (the fee warning does not block boarding).

3. **Scan a card for a learner who has no booking for today.**
   Pass looks like: a "walk-up" button appears on the panel, and tapping it successfully marks the learner as boarded.

4. **Type a JKKN ID number into the manual entry box (instead of scanning it).**
   Pass looks like: the app refuses the entry and shows a message telling you to use the camera instead — a typed JKKN ID should never be accepted as if it were scanned.

5. **Type a valid six-digit boarding pass code into the manual entry box.**
   Pass looks like: it works exactly as it did before this change — the learner is found and can be marked present, same as the old pass-code flow.

6. **Scan the same ID card a second time (same learner, same day).**
   Pass looks like: the app says the learner is already marked present, and names who marked them the first time.

7. **After each successful scan above, check the roster list behind the scan dialog.**
   Pass looks like: the roster updates itself (the learner's row flips to "present") without needing to close the dialog or refresh the page manually.

Please report back which of the seven passed, and paste in the exact wording of any error or unexpected message for anything that didn't.
