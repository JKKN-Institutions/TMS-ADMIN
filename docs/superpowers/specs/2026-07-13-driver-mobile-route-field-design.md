# Driver Mobiles — add "Bus route" field — Design Spec

**Date:** 2026-07-13
**Branch:** `feat/driver-mobile-supply` (extends the existing, unmerged driver-mobiles module)
**Status:** Approved (design), pending plan

## 1. Purpose

Add an optional **bus route** to each supplied mobile, selected from existing routes and
displayed by route number, so the office can see which bus route a phone is issued for.

## 2. Decisions (from brainstorming)
- **Pick from existing routes** — a `route_id` FK to `tms_route(id)`, chosen via a picker
  showing `"<route_number> — <route_name>"`. Not free text, not auto-derived from the driver.
- **Optional** — `route_id` is nullable; the form has a "— None —" choice; list/detail show
  `—` when unset.
- **FK on delete:** `ON DELETE SET NULL` (route is optional — deleting a route clears it from
  any phones, never blocks the delete or orphans the phone). Contrast the required
  `driver_staff_id` FK which uses `ON DELETE RESTRICT`.

## 3. Changes (extends the existing module — no new module, nav, perms, or activity wiring)

### Data model (additive migration)
`ALTER TABLE public.tms_driver_mobile ADD COLUMN IF NOT EXISTS route_id uuid
 REFERENCES public.tms_route(id) ON DELETE SET NULL;`
plus `CREATE INDEX IF NOT EXISTS idx_tms_driver_mobile_route ON public.tms_driver_mobile(route_id);`
Applied to live project `kvizhngldtiuufknvehv` via MCP; file committed under supabase/migrations/.

### Field whitelist (`lib/driver-mobiles/fields.ts`)
Add `route_id` to `UUID_FIELDS` (empty string → null, same handling as `driver_staff_id`).

### API (`app/api/admin/driver-mobiles/route.ts` + `[id]/route.ts`)
Alongside the existing driver-name resolution, batch-resolve route display info from
`tms_route` (`select id, route_number, route_name`) and attach `route_number: string | null` +
`route_name: string | null` to each returned row. `route_id` flows through
`buildDriverMobilePayload` on create/edit automatically (no extra validation — the picker only
offers valid routes; an invalid FK would surface as the existing 23503→400 on POST).

### Row type + list (`app/(admin)/driver-mobiles/columns.tsx`)
Add `route_id: string | null`, `route_number: string | null`, `route_name: string | null` to
`DriverMobileRow`. Add a **Route** column showing `route_number` (route name as subtitle),
placed after Driver; shows `—` when unset.

### Form (`driver-mobile-api.ts` + `driver-mobile-form.tsx` + `[id]/edit/page.tsx`)
- `driver-mobile-api.ts`: add `fetchRouteOptions()` → GET `/api/admin/routes`, map to
  `{ id, number, name }` (RouteOption type).
- `driver-mobile-form.tsx`: add `route_id` to `FormValues`; a **Bus route** `<select>` in the
  Supply card (next to the driver picker) with a leading "— None —" (`value=""`) option,
  options labelled `"<number> — <name>"`; include `route_id: form.route_id || null` in the
  POST/PUT payload.
- `[id]/edit/page.tsx`: map `route_id: m.route_id ?? ''` into the form's initial values.

### Detail page (`app/(admin)/driver-mobiles/[id]/page.tsx`)
Add a **Bus route** `Field` to the Supply section: `route_number — route_name` or `—`.

## 4. Out of scope
No change to the driver link, permissions, nav, or activity-log wiring. No route-based
filtering on the list (could be added later). No backfill (new column starts null).

## 5. Verification
- Vitest: `lib/driver-mobiles/fields.test.ts` still green; add a `route_id` passthrough/empty→null
  assertion.
- `npm run type-check 2>&1 | grep driver-mobiles` → zero lines.
- Route probes (401/200) + owed manual browser smoke test (auth-gated): pick a route on
  create/edit, see the route number in list + detail, clear it back to None.
