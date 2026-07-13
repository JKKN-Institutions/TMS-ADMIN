# Driver Mobiles — Bus Route Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add an optional "bus route" (picked from existing routes, shown by route number) to each supplied mobile in the existing driver-mobiles admin module.

**Architecture:** Additive `route_id uuid` FK on `tms_driver_mobile` → `tms_route(id)` `ON DELETE SET NULL` (optional link releases on route delete). The value flows through the existing `buildDriverMobilePayload` whitelist; the API resolves `route_number`/`route_name` fresh at read time (same technique as driver names); the form gains a route picker from `/api/admin/routes`; list + detail display the route number.

**Tech Stack:** Next.js 16 + React 19, Supabase, TanStack Query/Table, Tailwind, Vitest.

## Global Constraints

- **Shared branch `feat/driver-mobile-supply`:** a parallel session commits here. NEVER `git commit --amend`/`rebase`/`reset`/`push`. Only append-only `git add <exact paths> && git commit`. Commit ONLY the files each task names (explicit paths, never `-A`). Do NOT touch anything under `app/(admin)/passengers/`, `lib/passengers/`, or any file outside the task's list. Run `git status --short` before every commit and confirm only the intended files are staged.
- **Typecheck:** `npm run type-check` emits ~559 PRE-EXISTING legacy errors. Success = `npm run type-check 2>&1 | grep driver-mobiles` returns ZERO lines.
- **Vitest imports** use RELATIVE paths (`./fields`), never `@/`. Run: `npx vitest run lib/driver-mobiles/fields.test.ts`.
- **DB:** migration additive + idempotent; apply to shared project `kvizhngldtiuufknvehv` via Supabase MCP `apply_migration`, then commit the file.
- **Field parity:** the form's field set stays aligned with `lib/driver-mobiles/fields.ts` EDITABLE — `route_id` must be whitelisted there (Task 1) before the form sends it (Task 4), or it's silently dropped on save.
- **FK asymmetry (intentional):** `route_id` uses `ON DELETE SET NULL` (optional); the existing `driver_staff_id` uses `ON DELETE RESTRICT` (required). Do not change the driver link.

---

## File Structure

**Create:** `supabase/migrations/20260713140000_add_route_to_tms_driver_mobile.sql`
**Modify:**
- `lib/driver-mobiles/fields.ts` (add `route_id` to UUID_FIELDS) + `lib/driver-mobiles/fields.test.ts` (assertion)
- `app/api/admin/driver-mobiles/route.ts` + `app/api/admin/driver-mobiles/[id]/route.ts` (resolve route)
- `app/(admin)/driver-mobiles/columns.tsx` (row type + Route column)
- `app/(admin)/driver-mobiles/driver-mobile-api.ts` (fetchRouteOptions) + `driver-mobile-form.tsx` (picker) + `[id]/edit/page.tsx` (initial value)
- `app/(admin)/driver-mobiles/[id]/page.tsx` (detail Field)

---

## Task 1: Migration + field whitelist + test

**Files:**
- Create: `supabase/migrations/20260713140000_add_route_to_tms_driver_mobile.sql`
- Modify: `lib/driver-mobiles/fields.ts:14`
- Modify: `lib/driver-mobiles/fields.test.ts`

**Interfaces:**
- Produces: `tms_driver_mobile.route_id` column (nullable FK); `route_id` included in `UUID_FIELDS`/`EDITABLE` so `buildDriverMobilePayload` passes it through (empty → null). Consumed by Tasks 2 & 4.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260713140000_add_route_to_tms_driver_mobile.sql`:

```sql
-- Add an OPTIONAL bus-route link to tms_driver_mobile.
-- route_id → tms_route(id) ON DELETE SET NULL: the route is optional, so deleting a
-- route just clears it from any phones (never blocks the delete or orphans the phone).
-- Contrast driver_staff_id which is required (ON DELETE RESTRICT).
-- Target: shared project kvizhngldtiuufknvehv. Additive. Idempotent.
alter table public.tms_driver_mobile
  add column if not exists route_id uuid references public.tms_route(id) on delete set null;

create index if not exists idx_tms_driver_mobile_route on public.tms_driver_mobile(route_id);
```

- [ ] **Step 2: Apply via MCP and verify**

Load tools: ToolSearch `select:mcp__supabase__apply_migration,mcp__supabase__execute_sql`. Apply with name `add_route_to_tms_driver_mobile` and the SQL above. Then verify:

```sql
select column_name, data_type from information_schema.columns
where table_name = 'tms_driver_mobile' and column_name = 'route_id';
```
Expected: one row, `route_id | uuid`.

- [ ] **Step 3: Add `route_id` to the write whitelist**

In `lib/driver-mobiles/fields.ts`, change line 14:

```ts
export const UUID_FIELDS = ['driver_staff_id'] as const;
```
to:
```ts
export const UUID_FIELDS = ['driver_staff_id', 'route_id'] as const;
```

(No other change — `route_id` is now in `EDITABLE` and handled by the existing UUID loop: empty string → null.)

- [ ] **Step 4: Add the failing test, then confirm it passes**

In `lib/driver-mobiles/fields.test.ts`, add this test immediately after the existing `driver_staff_id` uuid test:

```ts
  it('passes route_id through as a uuid string, empty → null', () => {
    expect(buildDriverMobilePayload({ route_id: 'route-9' }).route_id).toBe('route-9');
    expect(buildDriverMobilePayload({ route_id: '' }).route_id).toBe(null);
  });
```

Run: `npx vitest run lib/driver-mobiles/fields.test.ts`
Expected: all tests pass (now 7). (The new test passes immediately because Step 3 already added `route_id` to `UUID_FIELDS` — if you want a true RED, do Step 4 before Step 3 and watch it fail with `route_id` undefined first.)

- [ ] **Step 5: Typecheck**

Run: `npm run type-check 2>&1 | grep driver-mobiles || echo "clean"`
Expected: `clean`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260713140000_add_route_to_tms_driver_mobile.sql lib/driver-mobiles/fields.ts lib/driver-mobiles/fields.test.ts
git commit -m "feat(driver-mobiles): add optional route_id column + whitelist"
```

---

## Task 2: API — resolve route number/name in GET

**Files:**
- Modify: `app/api/admin/driver-mobiles/route.ts`
- Modify: `app/api/admin/driver-mobiles/[id]/route.ts`

**Interfaces:**
- Consumes: `route_id` column (Task 1).
- Produces: both GETs return each row with `route_number: string | null` + `route_name: string | null` added. Consumed by Tasks 3 & 5.

- [ ] **Step 1: Add a route resolver to the collection route**

In `app/api/admin/driver-mobiles/route.ts`, add this function immediately AFTER the existing `resolveDriverNames` function (after its closing `}` near line 29):

```ts
// Resolve route number + name for a set of route ids (tms_driver_mobile stores only route_id).
async function resolveRouteInfo(
  supabase: ReturnType<typeof createServiceRoleClient>,
  routeIds: string[]
): Promise<Map<string, { number: string | null; name: string | null }>> {
  const map = new Map<string, { number: string | null; name: string | null }>();
  const ids = [...new Set(routeIds.filter(Boolean))];
  if (!ids.length) return map;
  const { data } = await supabase.from('tms_route').select('id, route_number, route_name').in('id', ids);
  for (const r of (data ?? []) as { id: string; route_number: string | null; route_name: string | null }[]) {
    map.set(r.id, { number: r.route_number ?? null, name: r.route_name ?? null });
  }
  return map;
}
```

- [ ] **Step 2: Attach route fields in the list mapping**

In the same file, in `getDriverMobiles`, REPLACE this block (lines ~43-49):

```ts
    const list = (rows ?? []) as { driver_staff_id: string }[];
    const names = await resolveDriverNames(supabase, list.map((r) => r.driver_staff_id));
    const data = list.map((r) => ({
      ...r,
      driver_name: names.get(r.driver_staff_id)?.name ?? '—',
      driver_phone: names.get(r.driver_staff_id)?.phone ?? null,
    }));
```
with:
```ts
    const list = (rows ?? []) as { driver_staff_id: string; route_id: string | null }[];
    const names = await resolveDriverNames(supabase, list.map((r) => r.driver_staff_id));
    const routes = await resolveRouteInfo(supabase, list.map((r) => r.route_id ?? '').filter(Boolean));
    const data = list.map((r) => ({
      ...r,
      driver_name: names.get(r.driver_staff_id)?.name ?? '—',
      driver_phone: names.get(r.driver_staff_id)?.phone ?? null,
      route_number: r.route_id ? routes.get(r.route_id)?.number ?? null : null,
      route_name: r.route_id ? routes.get(r.route_id)?.name ?? null : null,
    }));
```

- [ ] **Step 3: Resolve route in the single-record route**

In `app/api/admin/driver-mobiles/[id]/route.ts`, add this block immediately AFTER the driver-resolution block (after the `}` that closes `if ((row as { driver_staff_id?: string }).driver_staff_id) { ... }`, around line 42):

```ts
    let route_number: string | null = null;
    let route_name: string | null = null;
    if ((row as { route_id?: string | null }).route_id) {
      const { data: rt } = await supabase
        .from('tms_route')
        .select('route_number, route_name')
        .eq('id', (row as { route_id: string }).route_id)
        .maybeSingle();
      if (rt) {
        route_number = rt.route_number ?? null;
        route_name = rt.route_name ?? null;
      }
    }
```

Then REPLACE the return line:
```ts
    return NextResponse.json({ success: true, data: { ...row, driver_name, driver_phone } });
```
with:
```ts
    return NextResponse.json({ success: true, data: { ...row, driver_name, driver_phone, route_number, route_name } });
```

- [ ] **Step 4: Typecheck + probe**

Run: `npm run type-check 2>&1 | grep driver-mobiles || echo "clean"` → `clean`.
Run (dev server may be up): `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/admin/driver-mobiles` → `401` (proxy-gated; confirms compile). If curl can't connect, rely on the typecheck.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/driver-mobiles/route.ts "app/api/admin/driver-mobiles/[id]/route.ts"
git commit -m "feat(driver-mobiles): resolve route number/name in GET responses"
```

---

## Task 3: List — row type + Route column

**Files:**
- Modify: `app/(admin)/driver-mobiles/columns.tsx`

**Interfaces:**
- Consumes: the API's new `route_number`/`route_name` (Task 2).
- Produces: `DriverMobileRow` gains `route_id`/`route_number`/`route_name` (imported by the form's edit wrapper and the detail page).

- [ ] **Step 1: Extend the row type**

In `app/(admin)/driver-mobiles/columns.tsx`, in the `DriverMobileRow` interface, add these three lines immediately AFTER `driver_phone: string | null;` (line 17):

```ts
  route_id: string | null;
  route_number: string | null;
  route_name: string | null;
```

- [ ] **Step 2: Add the Route column**

In the same file, add this column object immediately AFTER the Driver column (after the `driver_name` column's closing `},` near line 109) and before the `phone_number` column:

```tsx
    {
      id: 'route',
      accessorFn: (m) => m.route_number ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.original.route_number ?? '—'}</span>
          {row.original.route_name && <span className="text-xs text-gray-500">{row.original.route_name}</span>}
        </span>
      ),
    },
```

- [ ] **Step 3: Typecheck**

Run: `npm run type-check 2>&1 | grep driver-mobiles || echo "clean"` → `clean`.

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/driver-mobiles/columns.tsx"
git commit -m "feat(driver-mobiles): show bus route column in the list"
```

---

## Task 4: Form — route picker + fetcher + edit initial value

**Files:**
- Modify: `app/(admin)/driver-mobiles/driver-mobile-api.ts`
- Modify: `app/(admin)/driver-mobiles/driver-mobile-form.tsx`
- Modify: `app/(admin)/driver-mobiles/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `route_id` whitelist (Task 1), `/api/admin/routes` list, `DriverMobileRow.route_id` (Task 3).
- Produces: `fetchRouteOptions()` + `RouteOption`; the form sends `route_id` on create/edit.

- [ ] **Step 1: Add the route-options fetcher**

In `app/(admin)/driver-mobiles/driver-mobile-api.ts`, append at the end of the file:

```ts
export interface RouteOption {
  id: string;
  number: string;
  name: string;
}

// Bus routes for the picker — from /api/admin/routes (tms_route). Optional field, so
// the form adds a "— None —" choice; this returns only real routes.
export async function fetchRouteOptions(): Promise<RouteOption[]> {
  const res = await fetch('/api/admin/routes', { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load routes');
  return (json.data as { id: string; route_number: string | null; route_name: string | null }[])
    .map((r) => ({ id: r.id, number: r.route_number ?? '', name: r.route_name ?? '' }));
}
```

- [ ] **Step 2: Wire the picker into the form**

In `app/(admin)/driver-mobiles/driver-mobile-form.tsx`:

(a) Update the import from the api module:
```ts
import { fetchDriverOptions } from './driver-mobile-api';
```
to:
```ts
import { fetchDriverOptions, fetchRouteOptions } from './driver-mobile-api';
```

(b) In the `FormValues` interface, add `route_id: string;` immediately after `driver_staff_id: string;`.

(c) In the `EMPTY` object, change the start of the first line:
```ts
  driver_staff_id: '', brand: '', model: '', color: '', imei: '', status: 'assigned',
```
to:
```ts
  driver_staff_id: '', route_id: '', brand: '', model: '', color: '', imei: '', status: 'assigned',
```

(d) Add the routes query immediately AFTER the existing drivers query line:
```ts
  const { data: drivers = [] } = useQuery({ queryKey: ['driver-options'], queryFn: fetchDriverOptions });
```
add:
```ts
  const { data: routes = [] } = useQuery({ queryKey: ['route-options'], queryFn: fetchRouteOptions });
```

(e) In the `payload` object (inside `onSubmit`), add `route_id: form.route_id || null,` immediately after `driver_staff_id: form.driver_staff_id,`.

(f) In the Supply card, add the Bus route `<div>` immediately AFTER the Supplied date field's `</div>` (i.e. after the block containing `value={form.supplied_date}`), still inside the same `grid` container:

```tsx
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Bus route</label>
            <select value={form.route_id} onChange={(e) => set('route_id', e.target.value)} className="input" disabled={saving}>
              <option value="">— None —</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>{r.number}{r.name ? ` — ${r.name}` : ''}</option>
              ))}
            </select>
          </div>
```

- [ ] **Step 3: Map the initial value in the edit wrapper**

In `app/(admin)/driver-mobiles/[id]/edit/page.tsx`, in the `initial={{ ... }}` object, add `route_id: m.route_id ?? '',` immediately after the `driver_staff_id:` line.

- [ ] **Step 4: Typecheck**

Run: `npm run type-check 2>&1 | grep driver-mobiles || echo "clean"` → `clean`.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/driver-mobiles/driver-mobile-api.ts" "app/(admin)/driver-mobiles/driver-mobile-form.tsx" "app/(admin)/driver-mobiles/[id]/edit/page.tsx"
git commit -m "feat(driver-mobiles): bus-route picker in the create/edit form"
```

---

## Task 5: Detail page — Bus route field

**Files:**
- Modify: `app/(admin)/driver-mobiles/[id]/page.tsx`

**Interfaces:**
- Consumes: `DriverMobileRow.route_number`/`route_name` (Tasks 2 & 3).

- [ ] **Step 1: Add the Bus route Field**

In `app/(admin)/driver-mobiles/[id]/page.tsx`, inside the `<SectionCard title="Supply">` grid, add this line immediately AFTER the `<Field label="Supplied date" value={fmtDate(m.supplied_date)} />` line:

```tsx
          <Field label="Bus route" value={m.route_number ? `${m.route_number}${m.route_name ? ` — ${m.route_name}` : ''}` : '—'} />
```

- [ ] **Step 2: Typecheck**

Run: `npm run type-check 2>&1 | grep driver-mobiles || echo "clean"` → `clean`.

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/driver-mobiles/[id]/page.tsx"
git commit -m "feat(driver-mobiles): show bus route on the detail page"
```

---

## Final verification (after all tasks)
- [ ] `npx vitest run lib/driver-mobiles/fields.test.ts` → all pass (7).
- [ ] `npm run type-check 2>&1 | grep driver-mobiles || echo clean` → `clean`.
- [ ] Owed manual smoke test (auth-gated): create/edit a mobile → pick a Bus route → Save → route number shows in the list Route column + on the detail page → edit back to "— None —" → shows "—".

## Spec coverage self-check
- route_id nullable FK ON DELETE SET NULL + index → Task 1 ✅
- route_id whitelisted (flows through payload) + test → Task 1 ✅
- API resolves route_number/route_name (list + single) → Task 2 ✅
- Row type + Route column → Task 3 ✅
- fetchRouteOptions + form picker (— None — + optional) + edit initial → Task 4 ✅
- Detail Bus route field → Task 5 ✅
- No driver-link/perms/nav/activity changes → not touched ✅
