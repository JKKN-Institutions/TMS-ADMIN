# Verification: boarding evening attendance (branch `feat/boarding-evening-attendance`)

Date: 2026-09-11
Verified against commit: `36c186181ca7e14ccdca9c395fac0bc43a9d7c94` — "feat(settings): evening return trip switch and hours"

This is an honest evidence record, not a sign-off. Everything below is what was actually run and what it actually printed. Nothing was fixed in this task; if a check had failed, this record would say so and stop.

## Step 1: Whole test suite and build

`npx vitest run`:

```
Test Files  98 passed (98)
     Tests  1172 passed (1172)
  Duration  15.03s
```

`npm run build`: **exit 0**, `✓ Compiled successfully in 29.4s`. Did not hit the "could not find bin metadata file" failure, so `bun install` was not needed.

## Step 2: Scoped type check

Touched files (`git diff --name-only main...HEAD`):

```
app/api/admin/attendance-windows/route.ts
app/api/boarding/attendance/route.ts
app/api/boarding/scan/route.ts
app/boarding/attendance/page.tsx
app/boarding/routes/[routeId]/page.tsx
components/admin/attendance-window-settings.tsx
components/boarding/scan-dialog.tsx
docs/superpowers/plans/2026-09-11-boarding-evening-attendance.md
docs/superpowers/specs/2026-09-11-boarding-evening-attendance-design.md
hooks/use-attendance-settings-live.ts
lib/boarding/attendance-broadcast.ts
lib/boarding/attendance-window.test.ts
lib/boarding/attendance-window.ts
lib/boarding/trip-direction.test.ts
lib/boarding/trip-direction.ts
supabase/migrations/20260911160000_attendance_window_is_active.sql
supabase/migrations/20260911161000_attendance_settings_realtime_receive.sql
```

`npx tsc --noEmit` on the whole project exits 1 with 566 lines of output (repo-wide `tsc` is red on `main`, per project memory — not a gate). Filtering that output to only the files above: **zero matches, in every file.** The branch introduces no new type errors in the files it touched.

## Step 3: Database state (read only)

```sql
select direction, start_time, end_time, enabled, is_active from public.tms_attendance_window order by direction;
```

```
direction | start_time | end_time | enabled | is_active
onward    | 07:00:00   | 17:30:00 | true    | true
return    | 16:30:00   | 19:00:00 | true    | false
```

Matches expectation: evening (`return`) row is `is_active = false` — evening ships switched off. `enabled = true` on both rows is the column that carries the configured hours; `is_active` is the separate on/off switch, and only the evening one is off.

```sql
select policyname, cmd, roles::text, qual from pg_policies where schemaname='realtime' and tablename='messages' order by policyname;
```

```
induction_poll_realtime_receive          | SELECT | {authenticated} | (unrelated policy, pre-existing)
tms_attendance_settings_realtime_receive | SELECT | {authenticated} | ((topic = 'tms_attendance_settings'::text) AND user_has_permission('tms.attendance.scan'::text))
tms_bus_realtime_receive                 | SELECT | {authenticated} | (((topic ~~ 'tms_bus:%'::text) AND tms_can_view_route_live((NULLIF(split_part(topic, ':'::text, 2), ''::text))::uuid)) OR ((topic = 'tms_fleet'::text) AND user_has_permission('tms.tracking.fleet.view'::text)))
```

The new `tms_attendance_settings_realtime_receive` policy is present, gated on `tms.attendance.scan` — the same permission the boarding attendance screen requires. `tms_bus_realtime_receive` is **byte-for-byte identical** to the text recorded in Task 3's report (`docs/superpowers/sdd/.../task-3-report.md`) — the new policy did not touch the existing bus-tracking policy.

## Step 4: Live push delivery

Script run from the repository root (per the brief, in the scratchpad, deleted afterward):

```
node --env-file=.env "<scratchpad>/push-check.mjs"
```

Note: the brief said `--env-file=.env.local`; that file does not exist in this checkout (only `.env` and `.env.local.example` do), and `.env` carries `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, so `.env` was used instead.

Full output line:

```json
{"broadcastHttpStatus":202,"bareSubscribeStatus":"SUBSCRIBED","bareReceived":true,"suffixedSubscribeStatus":"SUBSCRIBED","suffixedReceived":false}
```

- `bareReceived: true` — required, and met. A broadcast sent to the bare topic `tms_attendance_settings` was received by a client subscribed to that same bare topic.
- `suffixedReceived: false` — **report-only, and it is false.** A channel subscribed as `tms_attendance_settings#probe` (a bare topic plus a `#suffix`) did **not** receive a broadcast sent to the bare topic `tms_attendance_settings`. `hooks/use-live-bus.ts` subscribes using that suffixed form. This means live bus tracking may not be receiving pushes over this channel and may be running on its polling fallback instead. No bus code was changed in this task or this verification.
- This script authenticates with the service-role key, which bypasses Row Level Security entirely. It proves the broadcast infrastructure delivers messages end to end; it does **not** prove that a real staff user, subject to the new `tms_attendance_settings_realtime_receive` RLS policy, would receive the same push. That gap is listed below under "not verified."

The script was deleted from the scratchpad after the run.

## What was NOT verified

- **No browser session is logged in.** Nothing in this task drove an authenticated browser. The seven-item checklist below (Settings toggling the Evening tab live, the scan panel's "Marked present · Evening" text, the Morning-tab refusal during the evening window, the out-of-window refusal message, undo behavior, and the tab disappearing on toggle-off) is all UNTESTED by this task and needs a human or a browser-automation pass.
- **No test harness covers the route handlers.** `npx vitest run` exercises `lib/boarding/attendance-window.ts`, `lib/boarding/trip-direction.ts`, and their `.test.ts` files, but nothing in the suite calls `app/api/boarding/scan/route.ts`, `app/api/boarding/attendance/route.ts`, or `app/api/admin/attendance-windows/route.ts` as HTTP handlers.
- **The receive policy was not exercised as a real staff user.** Step 4 proves delivery under the service-role key, which bypasses RLS. The policy that actually gates a boarding staff member's `useAttendanceSettingsLive` subscription (`tms_attendance_settings_realtime_receive`, requiring `tms.attendance.scan`) was never evaluated against a real authenticated, non-service-role session in this task.
- **The suffixed-channel gap noted above is unresolved and unassigned.** It was recorded, not investigated or fixed.

## Product notes for the record (not this task's to change)

1. `app/boarding/routes/[routeId]/page.tsx` is deliberately kept morning-only. During the evening window it refuses marks with: "This page marks the morning trip. Mark the evening trip from the Attendance page." This is intended behavior, not a gap.
2. Once evening is switched off, that day's evening marks cannot be undone directly — the undo path refuses the evening trip while evening is off, and the Evening tab is hidden too. The accepted correction path is: switch evening back on, undo the mark, then switch it off again. This is a known, accepted limitation, not a bug.
3. After deploy, the product owner has asked for evening to be switched **on** with morning **07:00–09:30** and evening **16:30–19:00**. That change was deliberately **not** made in this task — no setting was changed by this verification. Today the morning window still runs 07:00–17:30, which overlaps the evening's 16:30 start, so turning evening on today would be refused until the morning window is shortened.

## Product owner checklist (manual / browser verification, still to be done)

1. In Settings, end the morning trip at or before 16:30, switch Evening return attendance on, and save. With a boarding attendance screen already open on another device, the Evening tab should appear within a couple of seconds, without reloading.
2. Try to switch evening on while the morning still ends after the evening starts. Settings should refuse with a message saying when the morning must end.
3. During the evening window, scan a learner. The panel should say "Marked present · Evening".
4. On the Morning tab during the evening window, marking should be closed with a hint to switch to the Evening tab.
5. Outside both windows, scanning should be refused, naming both trips' hours.
6. Undo an evening mark from the Evening tab. It should undo the evening mark only; the learner's morning mark must remain.
7. Switch evening off in Settings. The Evening tab should disappear from the open screen without reloading.
8. On the per-route page (`app/boarding/routes/[routeId]/page.tsx`) during the evening window, a mark should be refused with the message pointing to the Attendance page.
