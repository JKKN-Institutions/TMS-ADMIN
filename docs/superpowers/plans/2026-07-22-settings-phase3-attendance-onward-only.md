# Settings Phase 3 — Onward-Only Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Boarding staff mark **Onward (morning)** attendance only. Remove the Return/evening leg from the settings editor, the window library, and the whole scan/marking flow — WITHOUT breaking the display of historical `direction='return'` rows.

**Architecture:** `lib/boarding/attendance-window.ts` is the single source of truth for directions and their time windows; only 6 files import from it, so collapsing `AttDirection` to `'onward'` gives a compiler-enforced sweep of every write path. Read paths that surface historical attendance use plain `string` for direction and are deliberately left untouched, so old return rows keep rendering.

**Tech Stack:** Next.js 15 route handlers, React client components, Supabase service-role, Vitest.

## Global Constraints

- **NON-DESTRUCTIVE TO DATA.** No migration, no deletes. Existing `tms_attendance` rows with `direction='return'` and the `tms_attendance_window` return row STAY. We stop *writing* return rows; we never remove ones already written.
- **Historical return rows must still RENDER.** These read paths use plain `string` direction and MUST NOT be changed: `app/api/boarding/attendance/roster/route.ts`, `app/api/boarding/dashboard/route.ts`, `app/api/boarding/routes/[routeId]/roster/route.ts`, `app/boarding/dashboard/page.tsx`, `app/boarding/routes/[routeId]/columns.tsx`, `app/student/attendance/page.tsx`. Verify they still compile and still display `'return'` — do not "tidy" them.
- **The attendance history GET filter keeps accepting `return`.** In `app/api/boarding/attendance/route.ts` the history endpoint filters by `direction` for VIEWING. It must continue to accept `'return'` so staff can look at past evening data. Only the WRITE paths (mark, clear, scan) become onward-only.
- **The DB upsert key stays `(learner_id, trip_date, direction)`.** Do not change it. New rows simply always carry `'onward'`.
- Verify with `npm run test -- <path>` (NOT `npx vitest run`). Test files MUST use RELATIVE imports — vitest cannot resolve `@/`. `npm run lint` is BROKEN. `next build` does NOT gate types; type gate = `npx tsc --noEmit 2>&1 | grep <file>` returning ZERO lines (repo carries ~530 pre-existing unrelated errors).
- Commit per task, LOCAL ONLY, explicit `git add <paths>`, never `-A`/`-u`. No history rewrites.

---

## File structure

| File | Responsibility | Action |
|------|----------------|--------|
| `lib/boarding/attendance-window.ts` | Directions + window logic (source of truth) | Modify — collapse to onward |
| `lib/boarding/attendance-window.test.ts` | Window unit tests | Modify |
| `app/api/admin/attendance-windows/route.ts` | Admin read/write of windows | Modify — onward only |
| `components/admin/attendance-window-settings.tsx` | Settings > Attendance editor | Modify — drop Return card |
| `app/api/boarding/scan/route.ts` | QR scan → attendance | Modify — reject `return` |
| `app/api/boarding/attendance/route.ts` | Manual mark + clear (+ history GET) | Modify — reject `return` on WRITES only |
| `app/boarding/attendance/page.tsx` | Boarding marking screen | Modify — drop leg tabs |
| `components/boarding/scan-dialog.tsx` | Scan dialog | Modify — onward only |
| `app/api/boarding/attendance-window/route.ts` | Scan page's window/active-direction feed | Verify only — likely no change |

---

### Task 1: Collapse the window library to onward

**Files:**
- Modify: `lib/boarding/attendance-window.ts`
- Test: `lib/boarding/attendance-window.test.ts`

**Interfaces produced (every later task depends on these):**
- `type AttDirection = 'onward'`
- `interface AttendanceWindows { onward: AttendanceWindow }`
- `DEFAULT_WINDOWS: AttendanceWindows` = onward `07:00`–`09:30`, enabled
- `activeDirection(windows, now?): 'onward' | null`
- `loadAttendanceWindows(svc): Promise<AttendanceWindows>` — reads ONLY the `onward` row
- `isDirectionOpen`, `istMinutesOfDay`, `hmToMinutes`, `normalizeTime`, `formatHM` — unchanged signatures

- [ ] **Step 1: Update the tests first**

In `lib/boarding/attendance-window.test.ts`, remove/replace every assertion that references a `return` window. `activeDirection` must now be a simple reflection of the onward window:

```typescript
describe('activeDirection', () => {
  it('returns onward while the onward window is open', () => {
    // 08:00 IST = 02:30 UTC
    expect(activeDirection(DEFAULT_WINDOWS, new Date('2026-07-23T02:30:00Z'))).toBe('onward');
  });
  it('returns null outside the onward window', () => {
    // 18:00 IST = 12:30 UTC — the old return window; now nothing is open
    expect(activeDirection(DEFAULT_WINDOWS, new Date('2026-07-23T12:30:00Z'))).toBeNull();
  });
  it('returns onward at any time when the window is disabled', () => {
    const win = { onward: { ...DEFAULT_WINDOWS.onward, enabled: false } };
    expect(activeDirection(win, new Date('2026-07-23T12:30:00Z'))).toBe('onward');
  });
});
```

Keep the existing `istMinutesOfDay` / `hmToMinutes` / `formatHM` / `isDirectionOpen` tests as-is — those functions do not change.

- [ ] **Step 2: Run and confirm FAIL**

Run: `npm run test -- lib/boarding/attendance-window.test.ts`
Expected: FAIL (type errors on the onward-only object and/or the 18:00 case still returning `'return'`).

- [ ] **Step 3: Rewrite the library**

Apply these edits to `lib/boarding/attendance-window.ts`:

- Update the file header comment: it currently describes onward AND return. It must say attendance is onward (morning) only, and note that historical `direction='return'` rows are retained and still readable — we stopped writing them, we did not delete them.
- `export type AttDirection = 'onward';`
- `export type AttendanceWindows = { onward: AttendanceWindow };` (drop the `Record<AttDirection, ...>` mapping)
- `DEFAULT_WINDOWS` keeps only the onward entry.
- `activeDirection` becomes:

```typescript
/**
 * Whether scanning is open right now — drives the scan page's enablement.
 * Attendance is onward-only, so this is simply the onward window's state:
 * 'onward' when open, null when closed.
 */
export function activeDirection(windows: AttendanceWindows, now: Date = new Date()): AttDirection | null {
  return isDirectionOpen(windows.onward, now) ? 'onward' : null;
}
```

- `loadAttendanceWindows` reads only the onward row (a stored `return` row is ignored, not deleted):

```typescript
/** Load the onward window from the DB; falls back to DEFAULT_WINDOWS if absent/empty. */
export async function loadAttendanceWindows(svc: SupabaseClient): Promise<AttendanceWindows> {
  const out: AttendanceWindows = { onward: { ...DEFAULT_WINDOWS.onward } };
  const { data, error } = await svc
    .from('tms_attendance_window')
    .select('direction, start_time, end_time, enabled')
    .eq('direction', 'onward');
  if (error || !data) return out; // missing table / empty ⇒ defaults
  for (const r of data as { direction: string; start_time: string; end_time: string; enabled: boolean }[]) {
    if (r.direction === 'onward') {
      out.onward = {
        direction: 'onward',
        start: normalizeTime(r.start_time),
        end: normalizeTime(r.end_time),
        enabled: r.enabled,
      };
    }
  }
  return out;
}
```

- [ ] **Step 4: Run and confirm PASS**

Run: `npm run test -- lib/boarding/attendance-window.test.ts` — expect PASS.
Run: `npx tsc --noEmit 2>&1 | grep "lib/boarding/attendance-window"` — expect ZERO lines.

> Type errors in the 5 OTHER importing files are EXPECTED at this point — Tasks 2-4 fix them. Do not fix them here.

- [ ] **Step 5: Commit**

```bash
git add lib/boarding/attendance-window.ts lib/boarding/attendance-window.test.ts
git commit -m "refactor(boarding): collapse attendance windows to onward only"
```

---

### Task 2: Admin windows API + Settings editor

**Files:**
- Modify: `app/api/admin/attendance-windows/route.ts`
- Modify: `components/admin/attendance-window-settings.tsx`

**Interfaces consumed (Task 1):** `AttDirection = 'onward'`, `AttendanceWindows = { onward }`, `loadAttendanceWindows`.

- [ ] **Step 1: Onward-only API**

In `app/api/admin/attendance-windows/route.ts`:
- The PUT currently validates `body.onward` AND `body.return` and upserts two rows. Make it validate and upsert ONLY onward. A `return` key in the body is IGNORED (not an error — an old client shouldn't 400).
- The response `data.windows` must be `{ onward: {...} }` only.
- Keep the existing `requirePerm(ATTENDANCE_MANAGE)` gate, the `HM` regex validation, the start<end check, and the `logActivity` call — but update the log `description` so it no longer mentions a return window.
- **Do NOT delete the stored `return` row** from `tms_attendance_window`. Leave it; it is simply never read now.

- [ ] **Step 2: Single-card editor**

In `components/admin/attendance-window-settings.tsx`:
- Remove the `ret` state and the second `WindowCard`. Keep one Onward card.
- The PUT body becomes `{ onward }` only.
- The GET handler reads `json.data.windows.onward` only.
- Update the copy: the heading/description currently explains that a direction can't be scanned outside its window and mentions the evening leg. It must now describe a single morning attendance window. The `WindowCard` component itself is reusable as-is.
- Keep the client-side start<end validation and the toast behaviour.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit 2>&1 | grep -E "admin/attendance-windows|attendance-window-settings"` — expect ZERO lines.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/attendance-windows/route.ts components/admin/attendance-window-settings.tsx
git commit -m "feat(settings): Attendance tab configures the onward window only"
```

---

### Task 3: Write APIs reject the return direction

**Files:**
- Modify: `app/api/boarding/scan/route.ts`
- Modify: `app/api/boarding/attendance/route.ts`

- [ ] **Step 1: Scan route**

In `app/api/boarding/scan/route.ts`:
- It currently does `const direction = body.direction === 'return' ? 'return' : 'onward';`. Replace with an explicit rejection so a stale client cannot silently write the wrong leg:

```typescript
    // Attendance is onward-only. A stale client sending 'return' must fail loudly
    // rather than silently having its scan recorded as a morning trip.
    if (body.direction && body.direction !== 'onward') {
      return NextResponse.json(
        { error: 'Only onward (morning) attendance is supported.' },
        { status: 400 },
      );
    }
    const direction: AttDirection = 'onward';
```

- Everywhere it branches on `direction === 'onward' ? 'Onward (morning)' : 'Return (evening)'`, simplify to the onward wording.
- `windows[direction]` still works (`windows.onward`).

- [ ] **Step 2: Manual mark + clear routes**

In `app/api/boarding/attendance/route.ts`:
- The POST (mark) and the DELETE/clear handler each do the same `body.direction === 'return' ? ...` coercion. Apply the SAME explicit 400 rejection + `const direction: AttDirection = 'onward'` in BOTH.
- Simplify the onward/return wording in the window-closed error message.
- **LEAVE THE HISTORY GET ALONE.** Its filter `if (fDir === 'onward' || fDir === 'return') q = q.eq('direction', fDir)` must keep accepting `'return'` so past evening records remain viewable, and `HistoryAtt.direction` stays `string | null`. This is a read path.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit 2>&1 | grep -E "boarding/scan|boarding/attendance/route"` — expect ZERO lines.
Run: `grep -n "'return'" app/api/boarding/attendance/route.ts` — the ONLY remaining hits must be in the history GET filter. Confirm each remaining hit is a read path.

- [ ] **Step 4: Commit**

```bash
git add app/api/boarding/scan/route.ts app/api/boarding/attendance/route.ts
git commit -m "feat(boarding): write paths accept onward attendance only"
```

---

### Task 4: Boarding UI — remove the leg switcher

**Files:**
- Modify: `app/boarding/attendance/page.tsx`
- Modify: `components/boarding/scan-dialog.tsx`

- [ ] **Step 1: Attendance page**

In `app/boarding/attendance/page.tsx`:
- Remove the `direction` state and the `dirSeeded` ref — the leg is always `'onward'`.
- **Remove the two-button leg switcher** (the `(['onward','return'] as AttDirection[]).map(...)` block).
- The roster fetch always requests `direction=onward`; keep it in the React Query key so the cache shape is unchanged.
- `legOpen` becomes `isDirectionOpen(windows.onward)`.
- The closed-window banner text drops the leg name — it should read as the (single) attendance window being closed.
- The CSV filename drops the direction suffix (or hardcodes `onward`) — just keep it valid.
- `fetchWindows` still reads `json.data.windows`; its `activeDirection` seeding is no longer needed for tab selection, so remove that effect.

- [ ] **Step 2: Scan dialog**

In `components/boarding/scan-dialog.tsx`:
- Drop the `direction` prop and the `directionRef`; the scan always posts `direction: 'onward'`.
- `win` becomes `windows.onward`; keep the `windowsRef` freshness pattern (it exists because the camera-start effect closes over stale props — do NOT remove that safeguard, only the direction part of it).
- Update the dialog title and the closed-window message to drop the leg name.
- Update the caller in `app/boarding/attendance/page.tsx` to stop passing `direction`.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit 2>&1 | grep -E "boarding/attendance/page|scan-dialog"` — expect ZERO lines.

- [ ] **Step 4: Commit**

```bash
git add app/boarding/attendance/page.tsx components/boarding/scan-dialog.tsx
git commit -m "feat(boarding): attendance screen and scanner are onward-only"
```

---

### Task 5: Whole-flow verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm the read paths still compile and still show history**

Run: `npx tsc --noEmit 2>&1 | grep -E "boarding/dashboard|routes/\[routeId\]|student/attendance|attendance/roster"` — expect ZERO lines. These files were NOT modified; they must still build against the collapsed type.
Run: `grep -rn "'return'" app/api/boarding app/boarding app/student/attendance components/boarding --include=*.ts --include=*.tsx` — every remaining hit must be a READ path (history filter, display mapping). List them in the report and justify each.

- [ ] **Step 2: Full suite + type gate + build**

Run: `npm run test` — all passing.
Run: `npx tsc --noEmit 2>&1 | grep -E "boarding|attendance"` — ZERO lines.
Run: `./node_modules/.bin/next build --webpack` — reaches "Compiled successfully". If Bun reports "could not find bin metadata file", that is a known environment artifact of the shared node_modules junction, NOT a code defect — report it as an unverified gap rather than chasing it.

- [ ] **Step 3: Record the human smoke checklist**

Needs a real authenticated browser (the agent's is unauthenticated):
1. Settings → Attendance shows ONE window card (Onward); saving persists it.
2. Boarding → Attendance shows NO leg switcher; the roster loads for today.
3. Inside the window: marking Present/Absent works; the QR scanner records a scan.
4. Outside the window: marking and scanning are disabled with a clear message.
5. **History intact:** a learner with a historical evening record still shows that `return` row (student attendance page / boarding history) — nothing was deleted.
6. A stale client POSTing `direction: 'return'` to `/api/boarding/scan` gets a 400, not a silent onward write.
