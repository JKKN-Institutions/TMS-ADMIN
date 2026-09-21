# Bus Inspection — Phase 1 (Core Inspection) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Transport Head can print QR stickers for buses, scan a bus (in-app scanner or phone camera → `/i/<REG>`), see the bus card with document status, answer the safety checklist with notes/photos, submit, view the report, and see a due/overdue dashboard.

**Architecture:** New admin-portal module `app/(admin)/inspections/*` + `app/(admin)/i/[reg]` backed by `app/api/admin/inspections/**` routes (withAuth + service-role + local `requirePerm`). Pure, unit-tested logic lives in `lib/inspections/*.ts` (no Supabase imports). One migration creates all 5 tables (Phase 2–4 tables included so later phases are code-only), the private photo bucket, permissions, seeded checklist and the interval setting.

**Tech Stack:** Next.js App Router (client pages + route handlers), Supabase Postgres + Storage, TanStack Query, `html5-qrcode` (scan), `qrcode.react` (stickers), Vitest, Tailwind, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-21-bus-inspection-design.md`

## Global Constraints

- Work only in worktree `D:\Sangeetha_V\TMS-ADMIN\.worktrees\bus-inspection` on branch `feat/bus-inspection`. Push with `git push origin HEAD:main` only after the user approves.
- Supabase project `kvizhngldtiuufknvehv`. Apply migrations with the Supabase MCP `apply_migration` AND commit the `.sql` file.
- All API routes: `withAuth` + `createServiceRoleClient()` + local `requirePerm` + `{ success, data, message }` / `{ error }` JSON.
- Permission keys: `tms.inspection.view`, `tms.inspection.conduct`, `tms.inspection.manage` — granted to role_key `transport_head` only (super admins bypass).
- Client permission checks use `usePermissions().can(...)` — **never** the `localStorage 'adminUser'` role check.
- Sticker URL shape `/i/<NORMALISED_REG>` is permanent (printed on stickers).
- Default interval `30` days; "Due soon" ≤ `7` days; document "expiring" ≤ `30` days.
- Dates are IST: use `istToday()` from `lib/booking/window.ts` and `istDateOf()` from `lib/booking/analytics-dims.ts`.
- Photos: bucket `tms-inspection-photos`, private, ≤ 5 MB, jpeg/png/webp, ≤ 3 per item, signed URLs 3600 s.
- Every mutation calls `await logActivity(auth, request, {...})` with module `'inspections'`.
- `npm run lint` is broken — verify with `npx vitest run lib/inspections`, `node node_modules/next/dist/bin/next build`, and route probes.
- Do not leave temp/backup files in the worktree.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260921100000_create_tms_inspection.sql` | 5 tables, indexes, triggers, RLS, bucket, perms, seed checklist, interval setting |
| `lib/constants/tms-permissions.ts` (modify) | `INSPECTION_VIEW/CONDUCT/MANAGE` |
| `lib/activity/log.ts` (modify) | add `'inspections'` to `ActivityModule` |
| `lib/navigation.ts` (modify) | "Bus Inspection" nav entry |
| `lib/inspections/sticker-code.ts` (+test) | normalise reg, build sticker URL, parse a scanned string |
| `lib/inspections/result.ts` (+test) | compute result, submit blockers |
| `lib/inspections/due.ts` (+test) | interval parsing, due date, due state |
| `lib/inspections/doc-status.ts` (+test) | per-document tone for the bus card |
| `lib/inspections/geo.ts` (+test) | haversine distance + location status |
| `lib/inspections/types.ts` | shared DTO types for API ↔ UI |
| `lib/inspections/server.ts` | `requirePerm`, `loadIntervalDays`, `routeForVehicle`, `INSPECTION_PHOTO_BUCKET` |
| `app/api/admin/inspections/route.ts` | GET dashboard |
| `app/api/admin/inspections/resolve-sticker/route.ts` | GET code → vehicle |
| `app/api/admin/inspections/start/route.ts` | POST create/resume draft |
| `app/api/admin/inspections/[id]/route.ts` | GET full inspection |
| `app/api/admin/inspections/[id]/items/route.ts` | PUT save answers |
| `app/api/admin/inspections/[id]/submit/route.ts` | POST submit |
| `app/api/admin/inspections/photos/route.ts` | POST upload / GET signed URL |
| `app/(admin)/inspections/inspection-api.ts` | client fetchers |
| `app/(admin)/inspections/page.tsx` | dashboard |
| `app/(admin)/inspections/stickers/page.tsx` | printable QR sheet |
| `components/inspections/bus-scanner.tsx` | camera scanner for bus stickers |
| `app/(admin)/inspections/scan/page.tsx` | scanner + manual picker |
| `app/(admin)/i/[reg]/page.tsx` | sticker landing → resolve → start |
| `app/(admin)/inspections/[id]/check/page.tsx` | the check screen (draft) |
| `components/inspections/bus-card.tsx` | bus/route/driver/doc badges |
| `components/inspections/checklist-step.tsx` | Pass/Fail/N/A + note + photos |
| `app/(admin)/inspections/[id]/page.tsx` | submitted report |

`★` Flow: scan/sticker → `resolve-sticker` → `start` (returns `inspectionId`) → `/inspections/[id]/check` → autosave `items` → `submit` → `/inspections/[id]`.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260921100000_create_tms_inspection.sql`

**Interfaces:**
- Produces: tables `tms_inspection_checklist_item`, `tms_inspection`, `tms_inspection_item`, `tms_inspection_issue`, `tms_inspection_learner_check`; bucket `tms-inspection-photos`; `admin_settings` row `setting_type='inspection'` with `settings_data = {"interval_days":30}`; perms on `transport_head`.

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Bus Inspection module (Transport Head checking) — Phase 1 schema.
-- Target: shared MyJKKN project kvizhngldtiuufknvehv. Idempotent / safe to re-run.
-- Spec: docs/superpowers/specs/2026-09-21-bus-inspection-design.md
-- All tables are read/written by service-role API routes; RLS is enabled with
-- permission-keyed SELECT policies only (no client writes).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tms_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- 1. Checklist master ---------------------------------------------------------
create table if not exists public.tms_inspection_checklist_item (
  id          uuid primary key default gen_random_uuid(),
  category    text not null check (category in ('documents','safety','mechanical','body_interior','driver')),
  label       text not null,
  description text,
  severity    text not null default 'normal' check (severity in ('critical','normal')),
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid
);
create unique index if not exists uq_tms_inspection_checklist_label
  on public.tms_inspection_checklist_item (category, lower(label));
drop trigger if exists trg_tms_inspection_checklist_updated_at on public.tms_inspection_checklist_item;
create trigger trg_tms_inspection_checklist_updated_at before update on public.tms_inspection_checklist_item
  for each row execute function public.tms_set_updated_at();

-- 2. Inspection header --------------------------------------------------------
create table if not exists public.tms_inspection (
  id                 uuid primary key default gen_random_uuid(),
  vehicle_id         uuid not null references public.tms_vehicle(id) on delete restrict,
  route_id           uuid,
  driver_staff_id    uuid,
  inspected_by       uuid not null references public.profiles(id),
  started_at         timestamptz not null default now(),
  submitted_at       timestamptz,
  status             text not null default 'draft' check (status in ('draft','submitted')),
  result             text check (result in ('pass','pass_with_issues','fail')),
  headcount_observed int  check (headcount_observed is null or headcount_observed >= 0),
  riders_booked      int,
  riders_boarded     int,
  inspector_lat      numeric,
  inspector_lng      numeric,
  bus_distance_m     int,
  location_status    text check (location_status in ('ok','unavailable','bus_no_gps')),
  grounded           boolean not null default false,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint tms_inspection_submitted_has_result
    check (status = 'draft' or (submitted_at is not null and result is not null))
);
create unique index if not exists uq_tms_inspection_one_draft_per_vehicle
  on public.tms_inspection (vehicle_id) where status = 'draft';
create index if not exists idx_tms_inspection_vehicle_submitted
  on public.tms_inspection (vehicle_id, submitted_at desc) where status = 'submitted';
drop trigger if exists trg_tms_inspection_updated_at on public.tms_inspection;
create trigger trg_tms_inspection_updated_at before update on public.tms_inspection
  for each row execute function public.tms_set_updated_at();

-- 3. Inspection lines (snapshot of checklist) ---------------------------------
create table if not exists public.tms_inspection_item (
  id                uuid primary key default gen_random_uuid(),
  inspection_id     uuid not null references public.tms_inspection(id) on delete cascade,
  checklist_item_id uuid references public.tms_inspection_checklist_item(id) on delete set null,
  category          text not null,
  label             text not null,
  severity          text not null check (severity in ('critical','normal')),
  sort_order        int  not null default 0,
  result            text check (result in ('pass','fail','na')),
  note              text,
  photo_paths       text[] not null default '{}' check (cardinality(photo_paths) <= 3),
  updated_at        timestamptz not null default now(),
  unique (inspection_id, checklist_item_id)
);
create index if not exists idx_tms_inspection_item_inspection on public.tms_inspection_item (inspection_id);
drop trigger if exists trg_tms_inspection_item_updated_at on public.tms_inspection_item;
create trigger trg_tms_inspection_item_updated_at before update on public.tms_inspection_item
  for each row execute function public.tms_set_updated_at();

-- 4. Issues (used from Phase 2) -----------------------------------------------
create table if not exists public.tms_inspection_issue (
  id                     uuid primary key default gen_random_uuid(),
  inspection_id          uuid not null references public.tms_inspection(id) on delete cascade,
  inspection_item_id     uuid references public.tms_inspection_item(id) on delete set null,
  vehicle_id             uuid not null references public.tms_vehicle(id) on delete restrict,
  title                  text not null,
  severity               text not null check (severity in ('critical','normal')),
  status                 text not null default 'open' check (status in ('open','resolved','verified')),
  due_date               date,
  resolution_note        text,
  resolution_photo_paths text[] not null default '{}' check (cardinality(resolution_photo_paths) <= 3),
  resolved_by            uuid, resolved_at timestamptz,
  verified_by            uuid, verified_at timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists idx_tms_inspection_issue_vehicle_status on public.tms_inspection_issue (vehicle_id, status);
drop trigger if exists trg_tms_inspection_issue_updated_at on public.tms_inspection_issue;
create trigger trg_tms_inspection_issue_updated_at before update on public.tms_inspection_issue
  for each row execute function public.tms_set_updated_at();

-- 5. Learner spot-checks (used from Phase 3) ----------------------------------
create table if not exists public.tms_inspection_learner_check (
  id            uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.tms_inspection(id) on delete cascade,
  learner_id    uuid,
  jkkn_id       text,
  outcome       text not null check (outcome in ('ok','wrong_bus','not_booked','fee_due','unknown_card')),
  on_this_route boolean, booked_today boolean, boarded_today boolean, fees_ok boolean,
  scanned_at    timestamptz not null default now()
);
create index if not exists idx_tms_inspection_learner_check_inspection on public.tms_inspection_learner_check (inspection_id);

-- RLS: read via permission; no client writes (service role bypasses RLS).
do $$
declare t text;
begin
  foreach t in array array['tms_inspection_checklist_item','tms_inspection','tms_inspection_item',
                           'tms_inspection_issue','tms_inspection_learner_check'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format($p$create policy %I on public.%I for select using (
      public.is_super_admin() or public.user_has_permission('tms.inspection.view')
      or public.user_has_permission('tms.inspection.conduct'))$p$, t || '_select', t);
  end loop;
end $$;

-- Private photo bucket.
insert into storage.buckets (id, name, public)
values ('tms-inspection-photos', 'tms-inspection-photos', false)
on conflict (id) do nothing;

-- Permissions → transport_head only.
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb)
  || '{"tms.inspection.view": true, "tms.inspection.conduct": true, "tms.inspection.manage": true}'::jsonb,
    updated_at = now()
where role_key = 'transport_head';

-- Interval setting (keep an existing value).
insert into public.admin_settings (setting_type, settings_data, updated_at)
values ('inspection', '{"interval_days": 30}'::jsonb, now())
on conflict (setting_type) do nothing;

-- Seed checklist (idempotent on category+label).
insert into public.tms_inspection_checklist_item (category, label, severity, sort_order) values
  ('documents','RC book copy in bus','critical',10),
  ('documents','Insurance certificate in bus','critical',20),
  ('documents','Fitness certificate (FC) in bus','critical',30),
  ('documents','Permit in bus','critical',40),
  ('documents','PUC certificate in bus','normal',50),
  ('safety','Brakes working (service + parking)','critical',110),
  ('safety','Fire extinguisher present and not expired','critical',120),
  ('safety','First-aid kit stocked','critical',130),
  ('safety','Emergency exit opens and is unobstructed','critical',140),
  ('safety','Speed governor fitted and working','critical',150),
  ('safety','Horn working','normal',160),
  ('safety','Headlights, indicators and brake lights working','critical',170),
  ('mechanical','Tyres in good condition (tread, no cuts)','critical',210),
  ('mechanical','Spare tyre and jack available','normal',220),
  ('mechanical','Wipers working','normal',230),
  ('mechanical','Mirrors intact and adjusted','normal',240),
  ('mechanical','No oil / fuel / coolant leaks','critical',250),
  ('body_interior','Seats fixed and undamaged','normal',310),
  ('body_interior','Windows and glass intact','normal',320),
  ('body_interior','Floor and steps safe (no holes / loose plates)','normal',330),
  ('body_interior','Bus clean inside','normal',340),
  ('body_interior','Route board / bus number displayed','normal',350),
  ('driver','Driver carrying valid licence','critical',410),
  ('driver','Driver in uniform','normal',420),
  ('driver','Driver fit to drive (no alcohol / fatigue signs)','critical',430)
on conflict (category, (lower(label))) do nothing;
```

> `on conflict (category, (lower(label)))` requires the expression unique index created above — it exists before the insert runs.

- [ ] **Step 2: Confirm `admin_settings` has a unique constraint on `setting_type`**

Run (Supabase MCP `execute_sql`):
```sql
select indexdef from pg_indexes where tablename='admin_settings';
```
Expected: an index containing `(setting_type)` that is UNIQUE. If absent, replace the settings insert with `insert … select … where not exists (select 1 from public.admin_settings where setting_type='inspection');`.

- [ ] **Step 3: Apply with MCP `apply_migration`** (name `create_tms_inspection`, body = file contents).

- [ ] **Step 4: Verify**

```sql
select (select count(*) from tms_inspection_checklist_item) items,
       (select permissions ? 'tms.inspection.conduct' from custom_roles where role_key='transport_head') head_has_conduct,
       (select settings_data from admin_settings where setting_type='inspection') setting,
       (select public from storage.buckets where id='tms-inspection-photos') bucket_public;
```
Expected: `items=25, head_has_conduct=true, setting={"interval_days":30}, bucket_public=false`. Re-run the whole migration once more via `execute_sql` → no error (idempotency).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260921100000_create_tms_inspection.sql
git commit -m "feat(inspections): schema, bucket, permissions and seeded checklist"
```

---

### Task 2: Permission constants, activity module, navigation

**Files:**
- Modify: `lib/constants/tms-permissions.ts` (before the closing `} as const;`)
- Modify: `lib/activity/log.ts:16-19` (`ActivityModule` union)
- Modify: `lib/navigation.ts` (lucide import list + `allNavigation`)

**Interfaces:**
- Produces: `TMS_PERMISSIONS.INSPECTION_VIEW | INSPECTION_CONDUCT | INSPECTION_MANAGE`; `ActivityModule` includes `'inspections'`.

- [ ] **Step 1: Add constants**

```ts
  // Bus inspection (Transport Head checking). View = dashboard/reports;
  // Conduct = scan a bus and run an inspection; Manage = checklist, issues,
  // grounding, stickers. Seeded on transport_head in 20260921100000.
  INSPECTION_VIEW: 'tms.inspection.view',
  INSPECTION_CONDUCT: 'tms.inspection.conduct',
  INSPECTION_MANAGE: 'tms.inspection.manage',
```

- [ ] **Step 2: Extend `ActivityModule`** — change the last line of the union to:

```ts
  | 'driver-mobiles' | 'transport-vacate' | 'fee-concessions' | 'inspections';
```

- [ ] **Step 3: Nav entry** — add `ShieldCheck` to the lucide import list, and insert after the `Vehicles` item:

```ts
  { name: 'Bus Inspection', href: '/inspections', icon: ShieldCheck, permission: TMS_PERMISSIONS.INSPECTION_VIEW, group: 'transport' },
```

- [ ] **Step 4: Type-check touched files**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "tms-permissions|activity/log|lib/navigation" || echo CLEAN`
Expected: `CLEAN`

- [ ] **Step 5: Commit**

```bash
git add lib/constants/tms-permissions.ts lib/activity/log.ts lib/navigation.ts
git commit -m "feat(inspections): permission keys, activity module and nav entry"
```

---

### Task 3: Sticker code (pure)

**Files:**
- Create: `lib/inspections/sticker-code.ts`
- Test: `lib/inspections/sticker-code.test.ts`

**Interfaces:**
- Produces: `normalizeReg(raw: string): string`, `stickerPath(reg: string): string`, `stickerUrl(origin: string, reg: string): string`, `parseStickerScan(raw: string): string | null`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { normalizeReg, stickerPath, stickerUrl, parseStickerScan } from './sticker-code';

describe('normalizeReg', () => {
  it('uppercases and strips spaces, dashes and dots', () => {
    expect(normalizeReg(' tn 34-ab.1234 ')).toBe('TN34AB1234');
  });
});

describe('stickerPath / stickerUrl', () => {
  it('builds the permanent /i/<REG> path', () => {
    expect(stickerPath('TN 34 AB 1234')).toBe('/i/TN34AB1234');
  });
  it('joins origin without a double slash', () => {
    expect(stickerUrl('https://tms.jkkn.ai/', 'TN 34 AB 1234')).toBe('https://tms.jkkn.ai/i/TN34AB1234');
  });
});

describe('parseStickerScan', () => {
  it('reads the code out of a full sticker URL', () => {
    expect(parseStickerScan('https://tms.jkkn.ai/i/TN34AB1234')).toBe('TN34AB1234');
  });
  it('reads a URL with query string and trailing newline', () => {
    expect(parseStickerScan('https://tms.jkkn.ai/i/tn34ab1234?x=1\r\n')).toBe('TN34AB1234');
  });
  it('accepts a bare registration (typed or old sticker)', () => {
    expect(parseStickerScan('TN 34 AB 1234')).toBe('TN34AB1234');
  });
  it('rejects a JKKN ID card (digits only)', () => {
    expect(parseStickerScan('348295-7')).toBeNull();
  });
  it('rejects empty and junk', () => {
    expect(parseStickerScan('   ')).toBeNull();
    expect(parseStickerScan('https://example.com/some/page')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/inspections/sticker-code.test.ts`
Expected: FAIL — cannot resolve `./sticker-code`.

- [ ] **Step 3: Implement**

```ts
/**
 * Bus sticker QR codes. The QR holds a URL `https://<tms>/i/<REG>` so a phone's
 * own camera app opens the inspection directly; the in-app scanner reads the
 * same string. The /i/<REG> shape is PRINTED on stickers — never change it.
 * Pure (no I/O): shared by the scanner, the sticker page and the API.
 */

/** Uppercase, strip everything that is not A–Z / 0–9. */
export function normalizeReg(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function stickerPath(reg: string): string {
  return `/i/${normalizeReg(reg)}`;
}

export function stickerUrl(origin: string, reg: string): string {
  return `${origin.replace(/\/+$/, '')}${stickerPath(reg)}`;
}

/**
 * Turn whatever the camera read into a normalised registration, or null when it
 * is not a bus sticker. Indian registrations always contain letters, which is
 * what separates them from a digits-only JKKN ID card.
 */
export function parseStickerScan(raw: string): string | null {
  const text = raw.replace(/[\r\n]+/g, '').trim();
  if (!text) return null;
  let candidate = text;
  if (/^https?:\/\//i.test(text) || text.startsWith('/')) {
    const m = text.match(/\/i\/([^/?#\s]+)/i);
    if (!m) return null;
    try { candidate = decodeURIComponent(m[1]); } catch { candidate = m[1]; }
  }
  const code = normalizeReg(candidate);
  if (code.length < 6 || code.length > 12) return null;
  if (!/[A-Z]/.test(code) || !/[0-9]/.test(code)) return null;
  return code;
}
```

- [ ] **Step 4: Run tests** — `npx vitest run lib/inspections/sticker-code.test.ts` → PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/inspections/sticker-code.ts lib/inspections/sticker-code.test.ts
git commit -m "feat(inspections): sticker code normalise/build/parse"
```

---

### Task 4: Result, due-state, document status and geo (pure)

**Files:**
- Create: `lib/inspections/result.ts`, `lib/inspections/due.ts`, `lib/inspections/doc-status.ts`, `lib/inspections/geo.ts`
- Test: `lib/inspections/result.test.ts`, `lib/inspections/due.test.ts`, `lib/inspections/doc-status.test.ts`, `lib/inspections/geo.test.ts`

**Interfaces:**
- Produces:
  - `type ItemResult = 'pass'|'fail'|'na'`, `type Severity = 'critical'|'normal'`, `type InspectionResult = 'pass'|'pass_with_issues'|'fail'`
  - `computeResult(items: {severity: Severity; result: ItemResult|null}[]): InspectionResult`
  - `submitBlockers(items: {result: ItemResult|null; note: string|null}[]): string[]`
  - `DEFAULT_INTERVAL_DAYS = 30`, `DUE_SOON_DAYS = 7`, `parseIntervalDays(data: unknown): number`, `addDays(date: string, n: number): string`, `daysBetween(from: string, to: string): number`
  - `type DueState = 'never'|'overdue'|'due_soon'|'ok'`, `dueInfo(lastSubmittedDate: string|null, intervalDays: number, today: string): { state: DueState; dueOn: string|null; daysLeft: number|null }`
  - `DOC_WARN_DAYS = 30`, `VEHICLE_DOCS`, `type DocTone = 'valid'|'expiring'|'expired'|'missing'`, `docTone(expiry: string|null, today: string): { tone: DocTone; daysLeft: number|null }`, `vehicleDocStatuses(v: Record<string, unknown>, today: string): DocStatus[]`
  - `distanceMeters(a: LatLng, b: LatLng): number`, `locationEvidence(inspector: LatLng|null, bus: LatLng|null): { location_status: 'ok'|'unavailable'|'bus_no_gps'; bus_distance_m: number|null }`

- [ ] **Step 1: Write the failing tests**

`lib/inspections/result.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeResult, submitBlockers } from './result';

describe('computeResult', () => {
  it('pass when nothing failed (N/A allowed)', () => {
    expect(computeResult([{ severity: 'critical', result: 'pass' }, { severity: 'normal', result: 'na' }])).toBe('pass');
  });
  it('pass_with_issues when only normal items failed', () => {
    expect(computeResult([{ severity: 'critical', result: 'pass' }, { severity: 'normal', result: 'fail' }])).toBe('pass_with_issues');
  });
  it('fail when any critical item failed', () => {
    expect(computeResult([{ severity: 'critical', result: 'fail' }, { severity: 'normal', result: 'fail' }])).toBe('fail');
  });
});

describe('submitBlockers', () => {
  it('none when every item answered and fails have notes', () => {
    expect(submitBlockers([{ result: 'pass', note: null }, { result: 'fail', note: 'worn' }])).toEqual([]);
  });
  it('reports unanswered items and fails without a note', () => {
    expect(submitBlockers([{ result: null, note: null }, { result: 'fail', note: '  ' }, { result: null, note: null }]))
      .toEqual(['2 items are not answered', '1 failed item needs a note']);
  });
});
```

`lib/inspections/due.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseIntervalDays, addDays, daysBetween, dueInfo } from './due';

describe('parseIntervalDays', () => {
  it('reads interval_days', () => expect(parseIntervalDays({ interval_days: 14 })).toBe(14));
  it('defaults to 30 on missing/invalid', () => {
    expect(parseIntervalDays(null)).toBe(30);
    expect(parseIntervalDays({ interval_days: 'x' })).toBe(30);
    expect(parseIntervalDays({ interval_days: 0 })).toBe(30);
    expect(parseIntervalDays({ interval_days: 999 })).toBe(30);
  });
});

describe('date helpers', () => {
  it('addDays crosses month ends', () => expect(addDays('2026-09-25', 10)).toBe('2026-10-05'));
  it('daysBetween', () => expect(daysBetween('2026-09-21', '2026-10-01')).toBe(10));
});

describe('dueInfo', () => {
  const today = '2026-09-21';
  it('never inspected', () => expect(dueInfo(null, 30, today)).toEqual({ state: 'never', dueOn: null, daysLeft: null }));
  it('ok when more than 7 days left', () => expect(dueInfo('2026-09-10', 30, today)).toEqual({ state: 'ok', dueOn: '2026-10-10', daysLeft: 19 }));
  it('due_soon within 7 days', () => expect(dueInfo('2026-08-25', 30, today)).toEqual({ state: 'due_soon', dueOn: '2026-09-24', daysLeft: 3 }));
  it('due_soon on the due day itself', () => expect(dueInfo('2026-08-22', 30, today).state).toBe('due_soon'));
  it('overdue after the due day', () => expect(dueInfo('2026-08-01', 30, today)).toEqual({ state: 'overdue', dueOn: '2026-08-31', daysLeft: -21 }));
});
```

`lib/inspections/doc-status.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { docTone, vehicleDocStatuses } from './doc-status';

describe('docTone', () => {
  const today = '2026-09-21';
  it('missing', () => expect(docTone(null, today)).toEqual({ tone: 'missing', daysLeft: null }));
  it('expired', () => expect(docTone('2026-09-20', today)).toEqual({ tone: 'expired', daysLeft: -1 }));
  it('expiring on the day and within 30', () => {
    expect(docTone('2026-09-21', today).tone).toBe('expiring');
    expect(docTone('2026-10-21', today).tone).toBe('expiring');
  });
  it('valid beyond 30 days', () => expect(docTone('2026-10-22', today)).toEqual({ tone: 'valid', daysLeft: 31 }));
});

describe('vehicleDocStatuses', () => {
  it('lists the six documents in order', () => {
    const rows = vehicleDocStatuses({ insurance_expiry: '2027-01-01', pollution_expiry_date: '2026-01-01' }, '2026-09-21');
    expect(rows.map((r) => r.label)).toEqual(['Insurance', 'Fitness (FC)', 'Permit', 'PUC', 'Road tax', 'Fire extinguisher']);
    expect(rows[0].tone).toBe('valid');
    expect(rows[3].tone).toBe('expired');
    expect(rows[1].tone).toBe('missing');
  });
});
```

`lib/inspections/geo.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { distanceMeters, locationEvidence } from './geo';

describe('distanceMeters', () => {
  it('~111 m per 0.001° latitude', () => {
    const d = distanceMeters({ lat: 11.0, lng: 77.0 }, { lat: 11.001, lng: 77.0 });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(118);
  });
});

describe('locationEvidence', () => {
  it('unavailable without inspector position', () =>
    expect(locationEvidence(null, { lat: 11, lng: 77 })).toEqual({ location_status: 'unavailable', bus_distance_m: null }));
  it('bus_no_gps without bus position', () =>
    expect(locationEvidence({ lat: 11, lng: 77 }, null)).toEqual({ location_status: 'bus_no_gps', bus_distance_m: null }));
  it('ok with rounded distance', () => {
    const r = locationEvidence({ lat: 11.0, lng: 77.0 }, { lat: 11.001, lng: 77.0 });
    expect(r.location_status).toBe('ok');
    expect(Number.isInteger(r.bus_distance_m)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run lib/inspections` → FAIL (modules missing).

- [ ] **Step 3: Implement**

`lib/inspections/result.ts`:
```ts
export type ItemResult = 'pass' | 'fail' | 'na';
export type Severity = 'critical' | 'normal';
export type InspectionResult = 'pass' | 'pass_with_issues' | 'fail';

/** Any critical fail → fail; any other fail → pass_with_issues; else pass. */
export function computeResult(items: { severity: Severity; result: ItemResult | null }[]): InspectionResult {
  if (items.some((i) => i.result === 'fail' && i.severity === 'critical')) return 'fail';
  if (items.some((i) => i.result === 'fail')) return 'pass_with_issues';
  return 'pass';
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Human-readable reasons the inspection cannot be submitted yet (empty = OK). */
export function submitBlockers(items: { result: ItemResult | null; note: string | null }[]): string[] {
  const out: string[] = [];
  const unanswered = items.filter((i) => !i.result).length;
  const failNoNote = items.filter((i) => i.result === 'fail' && !(i.note ?? '').trim()).length;
  if (unanswered) out.push(`${plural(unanswered, 'item is', 'items are')} not answered`);
  if (failNoNote) out.push(`${plural(failNoNote, 'failed item needs', 'failed items need')} a note`);
  return out;
}
```

`lib/inspections/due.ts`:
```ts
export const DEFAULT_INTERVAL_DAYS = 30;
export const DUE_SOON_DAYS = 7;
export type DueState = 'never' | 'overdue' | 'due_soon' | 'ok';

/** admin_settings(setting_type='inspection').settings_data → interval in days (1..365, default 30). */
export function parseIntervalDays(data: unknown): number {
  const n = Number((data as { interval_days?: unknown } | null)?.interval_days);
  return Number.isInteger(n) && n >= 1 && n <= 365 ? n : DEFAULT_INTERVAL_DAYS;
}

const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));

/** YYYY-MM-DD + n days (calendar math, timezone-free). */
export function addDays(date: string, n: number): string {
  return new Date(toUtc(date) + n * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

/** `lastSubmittedDate` is the IST calendar date of the last submitted inspection. */
export function dueInfo(lastSubmittedDate: string | null, intervalDays: number, today: string) {
  if (!lastSubmittedDate) return { state: 'never' as DueState, dueOn: null, daysLeft: null };
  const dueOn = addDays(lastSubmittedDate, intervalDays);
  const daysLeft = daysBetween(today, dueOn);
  const state: DueState = daysLeft < 0 ? 'overdue' : daysLeft <= DUE_SOON_DAYS ? 'due_soon' : 'ok';
  return { state, dueOn, daysLeft };
}
```

`lib/inspections/doc-status.ts`:
```ts
import { daysBetween } from './due';

export const DOC_WARN_DAYS = 30;
export type DocTone = 'valid' | 'expiring' | 'expired' | 'missing';

/** The statutory/safety dates shown on the bus card, in display order. */
export const VEHICLE_DOCS = [
  { key: 'insurance_expiry', label: 'Insurance' },
  { key: 'fitness_expiry', label: 'Fitness (FC)' },
  { key: 'permit_expiry_date', label: 'Permit' },
  { key: 'pollution_expiry_date', label: 'PUC' },
  { key: 'road_tax_expiry_date', label: 'Road tax' },
  { key: 'fire_extinguisher_expiry', label: 'Fire extinguisher' },
] as const;

export interface DocStatus { key: string; label: string; expiry: string | null; tone: DocTone; daysLeft: number | null }

export function docTone(expiry: string | null, today: string): { tone: DocTone; daysLeft: number | null } {
  if (!expiry) return { tone: 'missing', daysLeft: null };
  const daysLeft = daysBetween(today, expiry.slice(0, 10));
  if (daysLeft < 0) return { tone: 'expired', daysLeft };
  return { tone: daysLeft <= DOC_WARN_DAYS ? 'expiring' : 'valid', daysLeft };
}

export function vehicleDocStatuses(v: Record<string, unknown>, today: string): DocStatus[] {
  return VEHICLE_DOCS.map(({ key, label }) => {
    const expiry = typeof v[key] === 'string' ? (v[key] as string) : null;
    return { key, label, expiry, ...docTone(expiry, today) };
  });
}
```

`lib/inspections/geo.ts`:
```ts
export interface LatLng { lat: number; lng: number }

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "Was the inspector at the bus?" — recorded as evidence, never enforced. */
export function locationEvidence(inspector: LatLng | null, bus: LatLng | null) {
  if (!inspector) return { location_status: 'unavailable' as const, bus_distance_m: null };
  if (!bus) return { location_status: 'bus_no_gps' as const, bus_distance_m: null };
  return { location_status: 'ok' as const, bus_distance_m: Math.round(distanceMeters(inspector, bus)) };
}
```

- [ ] **Step 4: Run tests** — `npx vitest run lib/inspections` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/inspections/result.* lib/inspections/due.* lib/inspections/doc-status.* lib/inspections/geo.*
git commit -m "feat(inspections): result, due-state, document status and location evidence logic"
```

---

### Task 5: Shared types and server helpers

**Files:**
- Create: `lib/inspections/types.ts`, `lib/inspections/server.ts`

**Interfaces:**
- Produces (types.ts):
```ts
import type { InspectionResult, ItemResult, Severity } from './result';
import type { DueState } from './due';
import type { DocStatus } from './doc-status';

export interface DashboardBus {
  vehicleId: string; registration: string; model: string | null; status: string;
  routeLabel: string | null; lastSubmittedAt: string | null; lastResult: InspectionResult | null;
  lastInspectionId: string | null; draftInspectionId: string | null;
  due: { state: DueState; dueOn: string | null; daysLeft: number | null };
}
export interface DashboardData {
  intervalDays: number;
  tiles: { overdue: number; dueSoon: number; never: number; grounded: number; openIssues: number };
  buses: DashboardBus[];
}
export interface InspectionItemDTO {
  id: string; category: string; label: string; severity: Severity; sortOrder: number;
  result: ItemResult | null; note: string | null; photoPaths: string[]; photoUrls: (string | null)[];
}
export interface InspectionDetail {
  id: string; status: 'draft' | 'submitted'; result: InspectionResult | null;
  startedAt: string; submittedAt: string | null; notes: string | null;
  inspectorName: string | null; isMine: boolean;
  location: { status: string | null; distanceM: number | null };
  vehicle: { id: string; registration: string; model: string | null; capacity: number | null; status: string; docs: DocStatus[]; firstAidAvailable: boolean | null };
  route: { id: string; number: string | null; name: string | null } | null;
  driver: { staffId: string; name: string; phone: string | null } | null;
  previous: { id: string; submittedAt: string; result: InspectionResult } | null;
  items: InspectionItemDTO[];
}
```
- Produces (server.ts): `INSPECTION_PHOTO_BUCKET`, `requirePerm(auth, ...perms): Promise<boolean>`, `loadIntervalDays(svc): Promise<number>`, `routeForVehicle(svc, vehicleId): Promise<{ id: string; route_number: string|null; route_name: string|null; driver_id: string|null } | null>`, `staffBrief(svc, staffId): Promise<{ name: string; phone: string|null } | null>`

- [ ] **Step 1: Write `types.ts`** exactly as above.

- [ ] **Step 2: Write `server.ts`**

```ts
import type { AuthContext } from '@/lib/api/with-auth';
import type { createServiceRoleClient } from '@/lib/supabase/server';
import { parseIntervalDays } from './due';

type Svc = ReturnType<typeof createServiceRoleClient>;

export const INSPECTION_PHOTO_BUCKET = 'tms-inspection-photos';

/** True when the user holds ANY of the permissions (super admins always). */
export async function requirePerm(auth: AuthContext, ...permissions: string[]): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  for (const p of permissions) {
    const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: p });
    if (data) return true;
  }
  return false;
}

export async function loadIntervalDays(svc: Svc): Promise<number> {
  const { data } = await svc.from('admin_settings').select('settings_data').eq('setting_type', 'inspection').maybeSingle();
  return parseIntervalDays(data?.settings_data ?? null);
}

/** A bus is on at most one active route (verified 2026-09-21); take the newest if that ever changes. */
export async function routeForVehicle(svc: Svc, vehicleId: string) {
  const { data } = await svc
    .from('tms_route')
    .select('id, route_number, route_name, driver_id')
    .eq('vehicle_id', vehicleId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1);
  return (data?.[0] as { id: string; route_number: string | null; route_name: string | null; driver_id: string | null } | undefined) ?? null;
}

export async function staffBrief(svc: Svc, staffId: string) {
  const { data } = await svc.from('staff').select('first_name, last_name, phone').eq('id', staffId).maybeSingle();
  if (!data) return null;
  const s = data as { first_name: string | null; last_name: string | null; phone: string | null };
  return { name: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || '—', phone: s.phone ?? null };
}
```

- [ ] **Step 3: Type-check** — `npx tsc --noEmit -p . 2>&1 | grep "lib/inspections" || echo CLEAN` → `CLEAN`.

- [ ] **Step 4: Commit**

```bash
git add lib/inspections/types.ts lib/inspections/server.ts
git commit -m "feat(inspections): shared DTO types and server helpers"
```

---

### Task 6: Dashboard + sticker-resolve APIs

**Files:**
- Create: `app/api/admin/inspections/route.ts`, `app/api/admin/inspections/resolve-sticker/route.ts`

**Interfaces:**
- Consumes: `requirePerm`, `loadIntervalDays`, `dueInfo`, `normalizeReg`, `DashboardData`, `istToday`, `istDateOf`.
- Produces: `GET /api/admin/inspections` → `{ success, data: DashboardData }`; `GET /api/admin/inspections/resolve-sticker?code=` → `{ success, data: { vehicleId, registration, status } }` or 404 `{ error }`.

- [ ] **Step 1: Dashboard route**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm, loadIntervalDays } from '@/lib/inspections/server';
import { dueInfo } from '@/lib/inspections/due';
import { istToday } from '@/lib/booking/window';
import { istDateOf } from '@/lib/booking/analytics-dims';
import type { DashboardBus, DashboardData } from '@/lib/inspections/types';
import type { InspectionResult } from '@/lib/inspections/result';

async function getDashboard(_req: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.INSPECTION_VIEW, TMS_PERMISSIONS.INSPECTION_CONDUCT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const svc = createServiceRoleClient();
    const [intervalDays, vehiclesQ, routesQ, inspQ, issuesQ] = await Promise.all([
      loadIntervalDays(svc),
      svc.from('tms_vehicle').select('id, registration_number, model, status').neq('status', 'retired').order('registration_number'),
      svc.from('tms_route').select('vehicle_id, route_number, route_name').eq('status', 'active').not('vehicle_id', 'is', null),
      // 35 buses × a few inspections a month: a full scan is small; newest first.
      svc.from('tms_inspection').select('id, vehicle_id, status, result, submitted_at, grounded').order('submitted_at', { ascending: false, nullsFirst: false }),
      svc.from('tms_inspection_issue').select('id', { count: 'exact', head: true }).neq('status', 'verified'),
    ]);
    if (vehiclesQ.error) {
      console.error('inspections dashboard vehicles error:', vehiclesQ.error);
      return NextResponse.json({ error: 'Failed to load buses' }, { status: 500 });
    }
    if (inspQ.error && inspQ.error.code !== '42P01') {
      console.error('inspections dashboard inspections error:', inspQ.error);
      return NextResponse.json({ error: 'Failed to load inspections' }, { status: 500 });
    }
    const routeByVehicle = new Map<string, string>();
    for (const r of (routesQ.data ?? []) as { vehicle_id: string; route_number: string | null; route_name: string | null }[]) {
      routeByVehicle.set(r.vehicle_id, [r.route_number, r.route_name].filter(Boolean).join(' · '));
    }
    type Row = { id: string; vehicle_id: string; status: string; result: InspectionResult | null; submitted_at: string | null; grounded: boolean };
    const lastByVehicle = new Map<string, Row>();
    const draftByVehicle = new Map<string, string>();
    for (const r of (inspQ.data ?? []) as Row[]) {
      if (r.status === 'draft') draftByVehicle.set(r.vehicle_id, r.id);
      else if (!lastByVehicle.has(r.vehicle_id)) lastByVehicle.set(r.vehicle_id, r);
    }
    const today = istToday();
    const buses: DashboardBus[] = ((vehiclesQ.data ?? []) as { id: string; registration_number: string; model: string | null; status: string }[]).map((v) => {
      const last = lastByVehicle.get(v.id);
      return {
        vehicleId: v.id,
        registration: v.registration_number,
        model: v.model,
        status: v.status,
        routeLabel: routeByVehicle.get(v.id) ?? null,
        lastSubmittedAt: last?.submitted_at ?? null,
        lastResult: last?.result ?? null,
        lastInspectionId: last?.id ?? null,
        draftInspectionId: draftByVehicle.get(v.id) ?? null,
        due: dueInfo(last?.submitted_at ? istDateOf(last.submitted_at) : null, intervalDays, today),
      };
    });
    const data: DashboardData = {
      intervalDays,
      tiles: {
        overdue: buses.filter((b) => b.due.state === 'overdue').length,
        dueSoon: buses.filter((b) => b.due.state === 'due_soon').length,
        never: buses.filter((b) => b.due.state === 'never').length,
        grounded: buses.filter((b) => b.status === 'maintenance').length,
        openIssues: issuesQ.count ?? 0,
      },
      buses,
    };
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('inspections dashboard error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getDashboard(request, auth));
```

- [ ] **Step 2: Resolve-sticker route**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm } from '@/lib/inspections/server';
import { normalizeReg, parseStickerScan } from '@/lib/inspections/sticker-code';

async function resolveSticker(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.INSPECTION_CONDUCT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const raw = new URL(request.url).searchParams.get('code') ?? '';
    const code = parseStickerScan(raw);
    if (!code) return NextResponse.json({ error: 'This is not a bus sticker' }, { status: 400 });

    const svc = createServiceRoleClient();
    const { data, error } = await svc.from('tms_vehicle').select('id, registration_number, status');
    if (error) {
      console.error('resolve-sticker error:', error);
      return NextResponse.json({ error: 'Failed to look up bus' }, { status: 500 });
    }
    // Registration numbers are stored with inconsistent spacing; compare normalised.
    const bus = ((data ?? []) as { id: string; registration_number: string; status: string }[])
      .find((v) => normalizeReg(v.registration_number) === code);
    if (!bus) return NextResponse.json({ error: `No bus is registered as ${code}` }, { status: 404 });
    return NextResponse.json({ success: true, data: { vehicleId: bus.id, registration: bus.registration_number, status: bus.status } });
  } catch (e) {
    console.error('resolve-sticker error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => resolveSticker(request, auth));
```

- [ ] **Step 3: Type-check + build probe** — `npx tsc --noEmit -p . 2>&1 | grep "api/admin/inspections" || echo CLEAN` → `CLEAN`.

- [ ] **Step 4: Probe unauthenticated** (dev server on port 3000 from the worktree: `node node_modules/next/dist/bin/next dev -p 3000`)
Run: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/admin/inspections`
Expected: `401`.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/inspections/route.ts app/api/admin/inspections/resolve-sticker/route.ts
git commit -m "feat(inspections): dashboard and sticker-resolve APIs"
```

---

### Task 7: Start/resume + detail APIs

**Files:**
- Create: `app/api/admin/inspections/start/route.ts`, `app/api/admin/inspections/[id]/route.ts`

**Interfaces:**
- Produces: `POST /api/admin/inspections/start` body `{ vehicleId: string; lat?: number|null; lng?: number|null }` → `{ success, data: { inspectionId: string; resumed: boolean } }`; `GET /api/admin/inspections/[id]` → `{ success, data: InspectionDetail }`.

- [ ] **Step 1: Start route**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm, routeForVehicle } from '@/lib/inspections/server';
import { locationEvidence } from '@/lib/inspections/geo';
import { logActivity } from '@/lib/activity/log';

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

async function startInspection(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.INSPECTION_CONDUCT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { vehicleId?: string; lat?: unknown; lng?: unknown };
    if (!body.vehicleId) return NextResponse.json({ error: 'vehicleId is required' }, { status: 400 });
    const svc = createServiceRoleClient();

    // Resume the bus's open draft (partial unique index guarantees at most one).
    const { data: draft } = await svc.from('tms_inspection').select('id').eq('vehicle_id', body.vehicleId).eq('status', 'draft').maybeSingle();
    if (draft) return NextResponse.json({ success: true, data: { inspectionId: draft.id, resumed: true } });

    const { data: bus, error: busErr } = await svc
      .from('tms_vehicle').select('id, registration_number, current_latitude, current_longitude').eq('id', body.vehicleId).maybeSingle();
    if (busErr || !bus) return NextResponse.json({ error: 'Bus not found' }, { status: 404 });

    const lat = num(body.lat); const lng = num(body.lng);
    const busLat = num(bus.current_latitude == null ? null : Number(bus.current_latitude));
    const busLng = num(bus.current_longitude == null ? null : Number(bus.current_longitude));
    const evidence = locationEvidence(
      lat != null && lng != null ? { lat, lng } : null,
      busLat != null && busLng != null ? { lat: busLat, lng: busLng } : null,
    );
    const route = await routeForVehicle(svc, bus.id);

    const { data: created, error: insErr } = await svc.from('tms_inspection').insert({
      vehicle_id: bus.id,
      route_id: route?.id ?? null,
      driver_staff_id: route?.driver_id ?? null,
      inspected_by: auth.userId,
      inspector_lat: lat, inspector_lng: lng,
      ...evidence,
    }).select('id').single();
    if (insErr) {
      // Two taps racing: the other request created the draft — return it.
      if (insErr.code === '23505') {
        const { data: again } = await svc.from('tms_inspection').select('id').eq('vehicle_id', bus.id).eq('status', 'draft').maybeSingle();
        if (again) return NextResponse.json({ success: true, data: { inspectionId: again.id, resumed: true } });
      }
      console.error('start inspection insert error:', insErr);
      return NextResponse.json({ error: 'Failed to start inspection' }, { status: 500 });
    }

    const { data: checklist, error: clErr } = await svc
      .from('tms_inspection_checklist_item').select('id, category, label, severity, sort_order').eq('is_active', true).order('sort_order');
    if (clErr || !checklist?.length) {
      await svc.from('tms_inspection').delete().eq('id', created.id);
      return NextResponse.json({ error: 'The checklist is empty — add checklist items first' }, { status: 409 });
    }
    const { error: itemsErr } = await svc.from('tms_inspection_item').insert(
      checklist.map((c) => ({ inspection_id: created.id, checklist_item_id: c.id, category: c.category, label: c.label, severity: c.severity, sort_order: c.sort_order })),
    );
    if (itemsErr) {
      await svc.from('tms_inspection').delete().eq('id', created.id);
      console.error('start inspection items error:', itemsErr);
      return NextResponse.json({ error: 'Failed to start inspection' }, { status: 500 });
    }

    await logActivity(auth, request, {
      module: 'inspections', action: 'create', entityType: 'tms_inspection', entityId: created.id,
      entityLabel: bus.registration_number, description: `Started inspection of ${bus.registration_number}`,
      metadata: { ...evidence },
    });
    return NextResponse.json({ success: true, data: { inspectionId: created.id, resumed: false } });
  } catch (e) {
    console.error('start inspection error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => startInspection(request, auth));
```

- [ ] **Step 2: Detail route** (`app/api/admin/inspections/[id]/route.ts`)

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm, staffBrief, INSPECTION_PHOTO_BUCKET } from '@/lib/inspections/server';
import { vehicleDocStatuses } from '@/lib/inspections/doc-status';
import { istToday } from '@/lib/booking/window';
import type { InspectionDetail } from '@/lib/inspections/types';

function idFrom(request: NextRequest) {
  // /api/admin/inspections/<id>
  return new URL(request.url).pathname.split('/').filter(Boolean)[3] ?? '';
}

async function getInspection(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.INSPECTION_VIEW, TMS_PERMISSIONS.INSPECTION_CONDUCT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = idFrom(request);
    const svc = createServiceRoleClient();
    const { data: ins } = await svc.from('tms_inspection').select('*').eq('id', id).maybeSingle();
    if (!ins) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });

    const [busQ, routeQ, itemsQ, prevQ, inspectorQ, driver] = await Promise.all([
      svc.from('tms_vehicle').select('*').eq('id', ins.vehicle_id).single(),
      ins.route_id ? svc.from('tms_route').select('id, route_number, route_name').eq('id', ins.route_id).maybeSingle() : Promise.resolve({ data: null }),
      svc.from('tms_inspection_item').select('*').eq('inspection_id', id).order('sort_order'),
      svc.from('tms_inspection').select('id, submitted_at, result').eq('vehicle_id', ins.vehicle_id).eq('status', 'submitted')
        .neq('id', id).order('submitted_at', { ascending: false }).limit(1),
      svc.from('profiles').select('full_name').eq('id', ins.inspected_by).maybeSingle(),
      ins.driver_staff_id ? staffBrief(svc, ins.driver_staff_id) : Promise.resolve(null),
    ]);
    const bus = busQ.data as Record<string, unknown>;
    const items = (itemsQ.data ?? []) as { id: string; category: string; label: string; severity: 'critical' | 'normal'; sort_order: number; result: 'pass' | 'fail' | 'na' | null; note: string | null; photo_paths: string[] }[];

    const paths = [...new Set(items.flatMap((i) => i.photo_paths ?? []))];
    const signed = new Map<string, string>();
    if (paths.length) {
      const { data: urls } = await svc.storage.from(INSPECTION_PHOTO_BUCKET).createSignedUrls(paths, 3600);
      for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
    }
    const prev = (prevQ.data ?? [])[0] as { id: string; submitted_at: string; result: 'pass' | 'pass_with_issues' | 'fail' } | undefined;

    const data: InspectionDetail = {
      id: ins.id, status: ins.status, result: ins.result, startedAt: ins.started_at, submittedAt: ins.submitted_at, notes: ins.notes,
      inspectorName: (inspectorQ.data as { full_name?: string } | null)?.full_name ?? null,
      isMine: ins.inspected_by === auth.userId,
      location: { status: ins.location_status, distanceM: ins.bus_distance_m },
      vehicle: {
        id: String(bus.id), registration: String(bus.registration_number), model: (bus.model as string) ?? null,
        capacity: (bus.capacity as number) ?? null, status: String(bus.status),
        docs: vehicleDocStatuses(bus, istToday()), firstAidAvailable: (bus.first_aid_available as boolean) ?? null,
      },
      route: routeQ.data ? { id: routeQ.data.id, number: routeQ.data.route_number, name: routeQ.data.route_name } : null,
      driver: ins.driver_staff_id && driver ? { staffId: ins.driver_staff_id, name: driver.name, phone: driver.phone } : null,
      previous: prev ? { id: prev.id, submittedAt: prev.submitted_at, result: prev.result } : null,
      items: items.map((i) => ({
        id: i.id, category: i.category, label: i.label, severity: i.severity, sortOrder: i.sort_order,
        result: i.result, note: i.note, photoPaths: i.photo_paths ?? [],
        photoUrls: (i.photo_paths ?? []).map((p) => signed.get(p) ?? null),
      })),
    };
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('get inspection error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getInspection(request, auth));
```

- [ ] **Step 3: Verify `profiles.full_name` exists** — MCP `execute_sql`: `select column_name from information_schema.columns where table_name='profiles' and column_name in ('full_name','first_name');` If `full_name` is absent, select the column that exists and adjust `inspectorName`.

- [ ] **Step 4: Type-check** — `npx tsc --noEmit -p . 2>&1 | grep "api/admin/inspections" || echo CLEAN` → `CLEAN`.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/inspections/start app/api/admin/inspections/[id]/route.ts
git commit -m "feat(inspections): start/resume draft and inspection detail APIs"
```

---

### Task 8: Save answers, photos and submit APIs

**Files:**
- Create: `app/api/admin/inspections/[id]/items/route.ts`, `app/api/admin/inspections/[id]/submit/route.ts`, `app/api/admin/inspections/photos/route.ts`

**Interfaces:**
- Produces:
  - `PUT /api/admin/inspections/[id]/items` body `{ items: { id: string; result: 'pass'|'fail'|'na'|null; note: string|null; photoPaths: string[] }[] }` → `{ success, data: { saved: number } }`
  - `POST /api/admin/inspections/[id]/submit` body `{ notes?: string|null }` → `{ success, data: { result: InspectionResult } }` or 400 `{ error, blockers: string[] }`
  - `POST /api/admin/inspections/photos` multipart `file` → `{ success, path }`; `GET ?path=` → `{ success, url }`

- [ ] **Step 1: Items route** — owner-only while draft.

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm } from '@/lib/inspections/server';

const RESULTS = new Set(['pass', 'fail', 'na']);
const idFrom = (r: NextRequest) => new URL(r.url).pathname.split('/').filter(Boolean)[3] ?? '';

async function saveItems(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.INSPECTION_CONDUCT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = idFrom(request);
    const svc = createServiceRoleClient();
    const { data: ins } = await svc.from('tms_inspection').select('id, status, inspected_by').eq('id', id).maybeSingle();
    if (!ins) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
    if (ins.status !== 'draft') return NextResponse.json({ error: 'This inspection is already submitted' }, { status: 409 });
    if (ins.inspected_by !== auth.userId && !auth.isSuperAdmin) {
      return NextResponse.json({ error: 'Only the inspector who started this inspection can change it' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { items?: { id: string; result: string | null; note: string | null; photoPaths: string[] }[] };
    const items = Array.isArray(body.items) ? body.items : [];
    for (const it of items) {
      if (it.result !== null && !RESULTS.has(it.result)) return NextResponse.json({ error: 'Invalid result' }, { status: 400 });
      if (!Array.isArray(it.photoPaths) || it.photoPaths.length > 3) return NextResponse.json({ error: 'At most 3 photos per item' }, { status: 400 });
    }
    // Small batch (≤ ~25 rows): one update per row, scoped to this inspection.
    const results = await Promise.all(items.map((it) =>
      svc.from('tms_inspection_item')
        .update({ result: it.result, note: it.note?.trim() || null, photo_paths: it.photoPaths })
        .eq('id', it.id).eq('inspection_id', id)));
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      console.error('save inspection items error:', failed.error);
      return NextResponse.json({ error: 'Failed to save answers' }, { status: 500 });
    }
    await svc.from('tms_inspection').update({ updated_at: new Date().toISOString() }).eq('id', id);
    return NextResponse.json({ success: true, data: { saved: items.length } });
  } catch (e) {
    console.error('save inspection items error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const PUT = withAuth((request, auth) => saveItems(request, auth));
```

> Autosave is not activity-logged (would flood the log); `submit` logs the final state.

- [ ] **Step 2: Submit route**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm } from '@/lib/inspections/server';
import { computeResult, submitBlockers, type ItemResult, type Severity } from '@/lib/inspections/result';
import { logActivity } from '@/lib/activity/log';

const idFrom = (r: NextRequest) => new URL(r.url).pathname.split('/').filter(Boolean)[3] ?? '';

async function submitInspection(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.INSPECTION_CONDUCT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = idFrom(request);
    const body = (await request.json().catch(() => ({}))) as { notes?: string | null };
    const svc = createServiceRoleClient();
    const { data: ins } = await svc.from('tms_inspection').select('id, status, inspected_by, vehicle_id').eq('id', id).maybeSingle();
    if (!ins) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
    if (ins.status !== 'draft') return NextResponse.json({ error: 'This inspection is already submitted' }, { status: 409 });
    if (ins.inspected_by !== auth.userId && !auth.isSuperAdmin) {
      return NextResponse.json({ error: 'Only the inspector who started this inspection can submit it' }, { status: 403 });
    }
    const { data: rows } = await svc.from('tms_inspection_item').select('severity, result, note, label').eq('inspection_id', id);
    const items = (rows ?? []) as { severity: Severity; result: ItemResult | null; note: string | null; label: string }[];
    const blockers = submitBlockers(items);
    if (blockers.length) return NextResponse.json({ error: blockers.join('; '), blockers }, { status: 400 });

    const result = computeResult(items);
    const { error } = await svc.from('tms_inspection')
      .update({ status: 'submitted', result, submitted_at: new Date().toISOString(), notes: body.notes?.trim() || null })
      .eq('id', id).eq('status', 'draft');
    if (error) {
      console.error('submit inspection error:', error);
      return NextResponse.json({ error: 'Failed to submit inspection' }, { status: 500 });
    }
    const { data: bus } = await svc.from('tms_vehicle').select('registration_number').eq('id', ins.vehicle_id).maybeSingle();
    await logActivity(auth, request, {
      module: 'inspections', action: 'submit', entityType: 'tms_inspection', entityId: id,
      entityLabel: bus?.registration_number ?? null,
      description: `Submitted inspection of ${bus?.registration_number ?? 'bus'}: ${result}`,
      metadata: { result, failed: items.filter((i) => i.result === 'fail').map((i) => i.label) },
    });
    return NextResponse.json({ success: true, data: { result }, message: 'Inspection submitted' });
  } catch (e) {
    console.error('submit inspection error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => submitInspection(request, auth));
```

- [ ] **Step 3: Photos route** — copy of the driver-mobiles image route with these exact changes: bucket `INSPECTION_PHOTO_BUCKET`, perms `INSPECTION_CONDUCT` for POST and `INSPECTION_VIEW, INSPECTION_CONDUCT` for GET, activity `module: 'inspections'`, `entityType: 'tms_inspection_item'`, description `Uploaded inspection photo: ${file.name}`.

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm, INSPECTION_PHOTO_BUCKET } from '@/lib/inspections/server';
import { logActivity } from '@/lib/activity/log';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

function safeName(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = (dot >= 0 ? name.slice(0, dot) : name).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  const ext = (dot >= 0 ? name.slice(dot + 1) : '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return ext ? `${base || 'file'}.${ext}` : base || 'file';
}

async function uploadPhoto(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.INSPECTION_CONDUCT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Photo must be 5MB or smaller' }, { status: 400 });
    if (!ALLOWED.has(file.type)) return NextResponse.json({ error: 'Only JPG, PNG, or WEBP photos are allowed' }, { status: 400 });

    const path = `${new Date().getUTCFullYear()}/${uuidv4()}-${safeName(file.name)}`;
    const svc = createServiceRoleClient();
    const { error } = await svc.storage.from(INSPECTION_PHOTO_BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (error) {
      console.error('inspection photo upload error:', error);
      return NextResponse.json({ error: 'Failed to upload photo' }, { status: 500 });
    }
    await logActivity(auth, request, {
      module: 'inspections', action: 'upload', entityType: 'tms_inspection_item',
      description: `Uploaded inspection photo: ${file.name}`, metadata: { path, fileType: file.type },
    });
    return NextResponse.json({ success: true, path });
  } catch (e) {
    console.error('inspection photo upload error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function signedUrl(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.INSPECTION_VIEW, TMS_PERMISSIONS.INSPECTION_CONDUCT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const path = new URL(request.url).searchParams.get('path');
    if (!path) return NextResponse.json({ error: 'path is required' }, { status: 400 });
    const { data, error } = await createServiceRoleClient().storage.from(INSPECTION_PHOTO_BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) return NextResponse.json({ error: 'Failed to create signed URL' }, { status: 404 });
    return NextResponse.json({ success: true, url: data.signedUrl });
  } catch (e) {
    console.error('inspection photo signed-url error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => uploadPhoto(request, auth));
export const GET = withAuth((request, auth) => signedUrl(request, auth));
```

- [ ] **Step 4: Type-check** — `npx tsc --noEmit -p . 2>&1 | grep "api/admin/inspections" || echo CLEAN` → `CLEAN`.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/inspections/[id]/items app/api/admin/inspections/[id]/submit app/api/admin/inspections/photos
git commit -m "feat(inspections): autosave answers, photo upload and submit APIs"
```

---

### Task 9: Client fetchers + dashboard page + stickers page

**Files:**
- Create: `app/(admin)/inspections/inspection-api.ts`, `app/(admin)/inspections/page.tsx`, `app/(admin)/inspections/stickers/page.tsx`

**Interfaces:**
- Produces (inspection-api.ts): `fetchDashboard(): Promise<DashboardData>`, `resolveSticker(code: string): Promise<{vehicleId: string; registration: string; status: string}>`, `startInspection(vehicleId: string, pos: {lat: number; lng: number} | null): Promise<{inspectionId: string; resumed: boolean}>`, `fetchInspection(id: string): Promise<InspectionDetail>`, `saveItems(id: string, items: {id: string; result: ItemResult|null; note: string|null; photoPaths: string[]}[]): Promise<void>`, `submitInspection(id: string, notes: string|null): Promise<{result: InspectionResult}>`, `uploadPhoto(file: File): Promise<string>`, `currentPosition(timeoutMs?: number): Promise<{lat: number; lng: number} | null>`

- [ ] **Step 1: Fetchers**

```ts
import type { DashboardData, InspectionDetail } from '@/lib/inspections/types';
import type { InspectionResult, ItemResult } from '@/lib/inspections/result';

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

export async function fetchDashboard(): Promise<DashboardData> {
  return (await json<{ data: DashboardData }>(await fetch('/api/admin/inspections'))).data;
}
export async function resolveSticker(code: string) {
  const r = await fetch(`/api/admin/inspections/resolve-sticker?code=${encodeURIComponent(code)}`);
  return (await json<{ data: { vehicleId: string; registration: string; status: string } }>(r)).data;
}
export async function startInspection(vehicleId: string, pos: { lat: number; lng: number } | null) {
  const r = await fetch('/api/admin/inspections/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicleId, lat: pos?.lat ?? null, lng: pos?.lng ?? null }),
  });
  return (await json<{ data: { inspectionId: string; resumed: boolean } }>(r)).data;
}
export async function fetchInspection(id: string): Promise<InspectionDetail> {
  return (await json<{ data: InspectionDetail }>(await fetch(`/api/admin/inspections/${id}`))).data;
}
export async function saveItems(id: string, items: { id: string; result: ItemResult | null; note: string | null; photoPaths: string[] }[]) {
  await json(await fetch(`/api/admin/inspections/${id}/items`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }),
  }));
}
export async function submitInspection(id: string, notes: string | null) {
  const r = await fetch(`/api/admin/inspections/${id}/submit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }),
  });
  return (await json<{ data: { result: InspectionResult } }>(r)).data;
}
export async function uploadPhoto(file: File): Promise<string> {
  const fd = new FormData(); fd.append('file', file);
  return (await json<{ path: string }>(await fetch('/api/admin/inspections/photos', { method: 'POST', body: fd }))).path;
}
/** Best-effort browser location; null when denied/unavailable (never throws). */
export function currentPosition(timeoutMs = 8000): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
```

- [ ] **Step 2: Dashboard page** (`app/(admin)/inspections/page.tsx`)

```tsx
'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ScanLine, Printer } from 'lucide-react';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { usePermissions } from '@/hooks/use-permissions';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { fetchDashboard } from './inspection-api';
import type { DashboardBus } from '@/lib/inspections/types';

const DUE_BADGE: Record<DashboardBus['due']['state'], string> = {
  overdue: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  due_soon: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  never: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  ok: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
};
const RESULT_TEXT = { pass: 'Pass', pass_with_issues: 'Pass with issues', fail: 'Fail' } as const;
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

function dueText(b: DashboardBus) {
  if (b.due.state === 'never') return 'Never inspected';
  if (b.due.state === 'overdue') return `Overdue ${-(b.due.daysLeft ?? 0)}d`;
  if (b.due.daysLeft === 0) return 'Due today';
  return `Due in ${b.due.daysLeft}d`;
}

export default function InspectionsDashboardPage() {
  const { can } = usePermissions();
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['inspections', 'dashboard'], queryFn: fetchDashboard });

  const tiles = data ? [
    { label: 'Overdue', value: data.tiles.overdue, tone: 'text-red-600' },
    { label: 'Due in 7 days', value: data.tiles.dueSoon, tone: 'text-amber-600' },
    { label: 'Never inspected', value: data.tiles.never, tone: 'text-gray-700 dark:text-gray-300' },
    { label: 'Grounded', value: data.tiles.grounded, tone: 'text-red-600' },
  ] : [];

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Bus Inspection' }]}
        title="Bus Inspection"
        subtitle={data ? `Every bus is due once every ${data.intervalDays} days` : undefined}
        actions={<>
          {can(TMS_PERMISSIONS.INSPECTION_MANAGE) && (
            <Link href="/inspections/stickers" className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
              <Printer className="h-4 w-4" /> Print stickers
            </Link>
          )}
          {can(TMS_PERMISSIONS.INSPECTION_CONDUCT) && (
            <Link href="/inspections/scan" className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
              <ScanLine className="h-4 w-4" /> Scan bus
            </Link>
          )}
        </>}
      />

      {isError && <p className="text-red-600">{(error as Error).message}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(isLoading ? Array.from({ length: 4 }, () => null) : tiles).map((t, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            {t ? (<><p className="text-sm text-gray-500">{t.label}</p><p className={`text-2xl font-bold ${t.tone}`}>{t.value}</p></>)
               : <div className="h-12 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />}
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {data?.buses.map((b) => (
            <li key={b.vehicleId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-gray-900 dark:text-gray-100">
                  {b.registration}
                  {b.status === 'maintenance' && <span className="ml-2 rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">GROUNDED</span>}
                </p>
                <p className="truncate text-sm text-gray-500">{b.routeLabel ?? 'No active route'} · Last: {fmt(b.lastSubmittedAt)}{b.lastResult ? ` (${RESULT_TEXT[b.lastResult]})` : ''}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${DUE_BADGE[b.due.state]}`}>{dueText(b)}</span>
              {b.draftInspectionId ? (
                <Link href={`/inspections/${b.draftInspectionId}/check`} className="text-sm font-medium text-amber-700 hover:underline">Resume draft</Link>
              ) : b.lastInspectionId ? (
                <Link href={`/inspections/${b.lastInspectionId}`} className="text-sm font-medium text-green-700 hover:underline">View last</Link>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Stickers page** (`app/(admin)/inspections/stickers/page.tsx`) — prints on A4, 2 columns, one sticker per bus; uses `window.location.origin` so dev/prod URLs are right.

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { Printer } from 'lucide-react';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { stickerUrl, normalizeReg } from '@/lib/inspections/sticker-code';
import { fetchDashboard } from '../inspection-api';

export default function InspectionStickersPage() {
  const { data } = useQuery({ queryKey: ['inspections', 'dashboard'], queryFn: fetchDashboard });
  const [origin, setOrigin] = useState('');
  const [only, setOnly] = useState<string>('all');
  useEffect(() => setOrigin(window.location.origin), []);

  const buses = (data?.buses ?? []).filter((b) => only === 'all' || b.vehicleId === only);

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <DetailPageHeader
          crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Bus Inspection', href: '/inspections' }, { label: 'Stickers' }]}
          backHref="/inspections"
          title="Bus QR stickers"
          subtitle="Stick one inside each bus near the door. Scanning opens that bus's inspection."
          actions={<>
            <select value={only} onChange={(e) => setOnly(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
              <option value="all">All buses</option>
              {data?.buses.map((b) => <option key={b.vehicleId} value={b.vehicleId}>{b.registration}</option>)}
            </select>
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
              <Printer className="h-4 w-4" /> Print
            </button>
          </>}
        />
      </div>
      {origin && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2">
          {buses.map((b) => (
            <div key={b.vehicleId} className="flex break-inside-avoid flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-400 bg-white p-5 text-black">
              <p className="text-xs font-semibold uppercase tracking-wide">JKKN Transport · Bus Inspection</p>
              <QRCodeSVG value={stickerUrl(origin, b.registration)} size={180} level="M" marginSize={2} />
              <p className="text-2xl font-extrabold tracking-wider">{normalizeReg(b.registration)}</p>
              <p className="text-xs">{b.routeLabel ?? ''}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

> Check `qrcode.react` v4 prop name: run `grep -n "marginSize\|includeMargin" node_modules/qrcode.react/lib/index.d.ts`. If only `includeMargin` exists, use `includeMargin` instead of `marginSize={2}`.


- [ ] **Step 4: Type-check** — `npx tsc --noEmit -p . 2>&1 | grep "(admin)/inspections" || echo CLEAN` → `CLEAN`.

- [ ] **Step 6: Commit**

```bash
git add "app/(admin)/inspections/inspection-api.ts" "app/(admin)/inspections/page.tsx" "app/(admin)/inspections/stickers"
git commit -m "feat(inspections): dashboard and printable QR sticker pages"
```

---

### Task 10: Bus scanner, scan page and sticker landing `/i/[reg]`

**Files:**
- Create: `components/inspections/bus-scanner.tsx`, `app/(admin)/inspections/scan/page.tsx`, `app/(admin)/i/[reg]/page.tsx`

**Interfaces:**
- Consumes: `classifyCameraError`, `cameraErrorMessage`, `shouldTryOtherCameras`, `pickBackCamera` (from `lib/boarding/camera-errors`), `parseStickerScan`, `resolveSticker`, `startInspection`, `currentPosition`, `fetchDashboard`.
- Produces: `<BusScanner onCode={(code: string) => void} paused={boolean} />`; hook-less helper `openInspection(router, vehicleId)` inside each page.

- [ ] **Step 1: BusScanner component** — the boarding start chain (sharp facingMode → plain facingMode → cameras by id), QR-only, with generation guard. Sticker photo fallback does **not** need the freshness check (stickers are not identity proof).

```tsx
'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera } from 'lucide-react';
import { classifyCameraError, cameraErrorMessage, shouldTryOtherCameras, pickBackCamera } from '@/lib/boarding/camera-errors';
import { parseStickerScan } from '@/lib/inspections/sticker-code';

const READER_ID = 'bus-sticker-reader';
const PHOTO_READER_ID = 'bus-sticker-photo-reader';
const READER_OPTIONS = { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false };
const SCAN_CONFIG = {
  fps: 12,
  qrbox: (w: number, h: number) => { const s = Math.max(50, Math.floor(Math.min(w, h) * 0.75)); return { width: s, height: s }; },
};
const SHARP_VIDEO: MediaTrackConstraints = {
  width: { ideal: 1280 }, height: { ideal: 720 },
  advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
};

export function BusScanner({ onCode, paused }: { onCode: (code: string) => void; paused: boolean }) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const genRef = useRef(0);
  const startingRef = useRef(false);
  const pausedRef = useRef(paused);
  const onCodeRef = useRef(onCode);
  const [error, setError] = useState<string | null>(null);
  pausedRef.current = paused;
  onCodeRef.current = onCode;

  function onRead(text: string) {
    if (pausedRef.current) return;
    const code = parseStickerScan(text);
    if (!code) { setError('That QR is not a bus sticker. Scan the sticker inside the bus.'); return; }
    setError(null);
    onCodeRef.current(code);
  }

  async function stop() {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) { try { await s.stop(); await s.clear(); } catch { /* ignore */ } }
  }

  async function start() {
    if (scannerRef.current || startingRef.current || !document.getElementById(READER_ID)) return;
    startingRef.current = true;
    const gen = genRef.current;
    try {
      const attempt = async (camera: string | MediaTrackConstraints, video?: MediaTrackConstraints): Promise<true | { err: unknown }> => {
        const s = new Html5Qrcode(READER_ID, READER_OPTIONS);
        try { await s.start(camera, video ? { ...SCAN_CONFIG, videoConstraints: video } : SCAN_CONFIG, onRead, () => {}); }
        catch (err) { try { s.clear(); } catch { /* ignore */ } return { err }; }
        if (genRef.current !== gen) { try { await s.stop(); await s.clear(); } catch { /* ignore */ } return true; }
        scannerRef.current = s;
        return true;
      };
      const sharp = await attempt({ facingMode: 'environment' }, { facingMode: 'environment', ...SHARP_VIDEO });
      if (sharp === true) return;
      let kind = classifyCameraError(sharp.err);
      if (shouldTryOtherCameras(kind) && genRef.current === gen) {
        const plain = await attempt({ facingMode: 'environment' });
        if (plain === true) return;
        kind = classifyCameraError(plain.err);
      }
      if (shouldTryOtherCameras(kind) && genRef.current === gen) {
        try {
          const cams = await Html5Qrcode.getCameras();
          const preferred = pickBackCamera(cams);
          const ids = preferred ? [preferred, ...cams.map((c) => c.id).filter((id) => id !== preferred)] : [];
          for (const id of ids) {
            if (genRef.current !== gen) return;
            const r = await attempt(id);
            if (r === true) return;
            kind = classifyCameraError(r.err);
          }
        } catch (err) { kind = classifyCameraError(err); }
      }
      if (genRef.current === gen) setError(cameraErrorMessage(kind).replace('ID card', 'bus sticker'));
    } finally {
      startingRef.current = false;
    }
  }

  useEffect(() => {
    genRef.current++;
    void start();
    return () => { genRef.current++; void stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const photoRef = useRef<HTMLInputElement>(null);
  async function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await stop();
    const reader = new Html5Qrcode(PHOTO_READER_ID, READER_OPTIONS);
    try { onRead(await reader.scanFile(file, false)); }
    catch { setError('Could not read the sticker in that photo. Fill the frame with the QR and avoid glare.'); }
    finally { try { reader.clear(); } catch { /* ignore */ } genRef.current++; void start(); }
  }

  return (
    <div className="space-y-3">
      <div id={READER_ID} className="mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl bg-black" />
      <div id={PHOTO_READER_ID} className="hidden" />
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</p>}
      <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
      <button type="button" onClick={() => photoRef.current?.click()}
        className="mx-auto flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700">
        <Camera className="h-4 w-4" /> Scan from photo
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Scan page** (`app/(admin)/inspections/scan/page.tsx`)

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { BusScanner } from '@/components/inspections/bus-scanner';
import { fetchDashboard, resolveSticker, startInspection, currentPosition } from '../inspection-api';

export default function ScanBusPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');
  const { data } = useQuery({ queryKey: ['inspections', 'dashboard'], queryFn: fetchDashboard });

  async function open(vehicleId: string) {
    setBusy(true);
    try {
      const pos = await currentPosition();
      const { inspectionId, resumed } = await startInspection(vehicleId, pos);
      if (resumed) toast.info('Resuming the open inspection for this bus');
      router.push(`/inspections/${inspectionId}/check`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  async function onCode(code: string) {
    if (busy) return;
    setBusy(true);
    try { const bus = await resolveSticker(code); await open(bus.vehicleId); }
    catch (e) { toast.error((e as Error).message); setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <DetailPageHeader
        crumbs={[{ label: 'Bus Inspection', href: '/inspections' }, { label: 'Scan' }]}
        backHref="/inspections" title="Scan bus sticker" subtitle="Point the camera at the QR sticker inside the bus"
      />
      <BusScanner onCode={onCode} paused={busy} />
      {busy && <p className="text-center text-sm text-gray-500">Opening inspection…</p>}
      <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <p className="mb-2 text-sm font-medium">Sticker missing or damaged? Pick the bus:</p>
        <div className="flex gap-2">
          <select value={manual} onChange={(e) => setManual(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
            <option value="">Select bus…</option>
            {data?.buses.map((b) => <option key={b.vehicleId} value={b.vehicleId}>{b.registration}{b.routeLabel ? ` — ${b.routeLabel}` : ''}</option>)}
          </select>
          <button disabled={!manual || busy} onClick={() => open(manual)} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Inspect</button>
        </div>
      </div>
    </div>
  );
}
```

> Confirm the toast library: `grep -rn "from 'sonner'\|from 'react-hot-toast'" app | head -2`. Use whichever the codebase uses.

- [ ] **Step 3: Sticker landing** (`app/(admin)/i/[reg]/page.tsx`) — the proxy already redirects signed-out users to `/auth/login?redirect=/i/<REG>`, and login honours `redirect`.

```tsx
'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { resolveSticker, startInspection, currentPosition } from '../../inspections/inspection-api';

export default function StickerLandingPage({ params }: { params: Promise<{ reg: string }> }) {
  const { reg } = use(params);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode double-invoke would create two starts
    ran.current = true;
    (async () => {
      try {
        const bus = await resolveSticker(reg);
        const { inspectionId } = await startInspection(bus.vehicleId, await currentPosition());
        router.replace(`/inspections/${inspectionId}/check`);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [reg, router]);

  return (
    <div className="mx-auto max-w-md space-y-4 py-10 text-center">
      {error ? (
        <>
          <p className="text-lg font-semibold text-red-600">{error}</p>
          <Link href="/inspections/scan" className="inline-block rounded-lg bg-green-600 px-4 py-2 font-semibold text-white">Pick the bus manually</Link>
        </>
      ) : (
        <p className="text-gray-600">Opening inspection for {decodeURIComponent(reg)}…</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Probe** — dev server running: `curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://127.0.0.1:3000/i/TN34AB1234`
Expected: `307 …/auth/login?redirect=%2Fi%2FTN34AB1234` (signed out).

- [ ] **Step 5: Commit**

```bash
git add components/inspections/bus-scanner.tsx "app/(admin)/inspections/scan" "app/(admin)/i"
git commit -m "feat(inspections): bus sticker scanner, scan page and /i/<REG> landing"
```

---

### Task 11: Check screen (bus card + checklist + submit)

**Files:**
- Create: `components/inspections/bus-card.tsx`, `components/inspections/checklist-step.tsx`, `app/(admin)/inspections/[id]/check/page.tsx`

**Interfaces:**
- Consumes: `InspectionDetail`, `InspectionItemDTO`, `fetchInspection`, `saveItems`, `submitInspection`, `uploadPhoto`, `submitBlockers`, `computeResult`.
- Produces: `<BusCard detail={InspectionDetail} />`, `<ChecklistStep items={InspectionItemDTO[]} onChange={(id, patch: Partial<Pick<InspectionItemDTO,'result'|'note'|'photoPaths'|'photoUrls'>>) => void} onMarkRemainingPass={() => void} />`

- [ ] **Step 1: BusCard**

```tsx
import { Phone } from 'lucide-react';
import type { InspectionDetail } from '@/lib/inspections/types';
import type { DocTone } from '@/lib/inspections/doc-status';

const TONE: Record<DocTone, string> = {
  valid: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  expiring: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  expired: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  missing: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not recorded');

export function BusCard({ detail }: { detail: InspectionDetail }) {
  const { vehicle, route, driver, previous } = detail;
  return (
    <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">{vehicle.registration}</h2>
        {vehicle.status === 'maintenance' && <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">GROUNDED</span>}
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {vehicle.model ?? 'Model not recorded'} · {vehicle.capacity ?? '—'} seats · {route ? `Route ${route.number ?? ''} ${route.name ?? ''}` : 'No active route'}
      </p>
      {driver ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">Driver: <b>{driver.name}</b>
          {driver.phone && <a href={`tel:${driver.phone}`} className="inline-flex items-center gap-1 text-green-700 hover:underline"><Phone className="h-3.5 w-3.5" />{driver.phone}</a>}
        </p>
      ) : <p className="text-sm text-amber-700">No driver linked to this bus's route</p>}
      <div className="flex flex-wrap gap-2">
        {vehicle.docs.map((d) => (
          <span key={d.key} title={fmt(d.expiry)} className={`rounded-full px-2.5 py-1 text-xs font-medium ${TONE[d.tone]}`}>
            {d.label}: {d.tone === 'missing' ? 'not recorded' : d.tone === 'expired' ? `expired ${fmt(d.expiry)}` : fmt(d.expiry)}
          </span>
        ))}
      </div>
      <p className="text-xs text-gray-500">
        Last inspection: {previous ? `${fmt(previous.submittedAt)} (${previous.result.replace(/_/g, ' ')})` : 'none'}
        {' · '}Location check: {detail.location.status === 'ok' ? `${detail.location.distanceM} m from bus GPS` : detail.location.status === 'bus_no_gps' ? 'bus has no GPS fix' : 'location not shared'}
      </p>
    </section>
  );
}
```

- [ ] **Step 2: ChecklistStep**

```tsx
'use client';

import { useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import type { InspectionItemDTO } from '@/lib/inspections/types';
import type { ItemResult } from '@/lib/inspections/result';
import { uploadPhoto } from '@/app/(admin)/inspections/inspection-api';

type Patch = Partial<Pick<InspectionItemDTO, 'result' | 'note' | 'photoPaths' | 'photoUrls'>>;
const CATEGORY_TITLE: Record<string, string> = {
  documents: 'Documents', safety: 'Safety', mechanical: 'Mechanical', body_interior: 'Body & interior', driver: 'Driver',
};
const BTN: Record<ItemResult, [string, string]> = {
  pass: ['Pass', 'bg-green-600 text-white'], fail: ['Fail', 'bg-red-600 text-white'], na: ['N/A', 'bg-gray-600 text-white'],
};

function ItemRow({ item, onChange }: { item: InspectionItemDTO; onChange: (p: Patch) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || item.photoPaths.length >= 3) return;
    setUploading(true); setErr(null);
    try {
      const path = await uploadPhoto(file);
      onChange({ photoPaths: [...item.photoPaths, path], photoUrls: [...item.photoUrls, URL.createObjectURL(file)] });
    } catch (x) { setErr((x as Error).message + ' — tap the camera to retry'); }
    finally { setUploading(false); }
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium">
          {item.label}{item.severity === 'critical' && <span className="ml-1.5 rounded bg-red-100 px-1 text-[10px] font-bold uppercase text-red-700 dark:bg-red-900/40 dark:text-red-300">critical</span>}
        </p>
        <div className="flex gap-1">
          {(Object.keys(BTN) as ItemResult[]).map((r) => (
            <button key={r} type="button" onClick={() => onChange({ result: r })}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${item.result === r ? BTN[r][1] : 'border border-gray-300 dark:border-gray-700'}`}>
              {BTN[r][0]}
            </button>
          ))}
        </div>
      </div>
      {item.result === 'fail' && (
        <div className="space-y-2 rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
          <textarea value={item.note ?? ''} onChange={(e) => onChange({ note: e.target.value })} rows={2}
            placeholder="What is wrong? (required)" className="w-full rounded-md border border-red-200 p-2 text-sm dark:border-red-900 dark:bg-gray-900" />
          <div className="flex flex-wrap items-center gap-2">
            {item.photoUrls.map((u, i) => (
              <div key={item.photoPaths[i]} className="relative">
                {u ? <img src={u} alt="" className="h-16 w-16 rounded object-cover" /> : <div className="h-16 w-16 rounded bg-gray-200" />}
                <button type="button" aria-label="Remove photo" className="absolute -right-1 -top-1 rounded-full bg-black/70 p-0.5 text-white"
                  onClick={() => onChange({ photoPaths: item.photoPaths.filter((_, j) => j !== i), photoUrls: item.photoUrls.filter((_, j) => j !== i) })}>
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {item.photoPaths.length < 3 && (
              <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}
                className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-gray-400 text-gray-500">
                {uploading ? '…' : <Camera className="h-5 w-5" />}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={onFile} />
          </div>
          {err && <p className="text-xs text-red-700">{err}</p>}
        </div>
      )}
    </li>
  );
}

export function ChecklistStep({ items, onChange, onMarkRemainingPass }: {
  items: InspectionItemDTO[]; onChange: (id: string, patch: Patch) => void; onMarkRemainingPass: () => void;
}) {
  const groups = items.reduce<Record<string, InspectionItemDTO[]>>((acc, i) => { (acc[i.category] ??= []).push(i); return acc; }, {});
  const answered = items.filter((i) => i.result).length;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600 dark:text-gray-400">{answered} / {items.length} answered</p>
        <button type="button" onClick={onMarkRemainingPass} className="text-sm font-medium text-green-700 hover:underline">Mark remaining as Pass</button>
      </div>
      {Object.entries(groups).map(([cat, list]) => (
        <div key={cat} className="rounded-xl border border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="pt-3 text-sm font-bold uppercase tracking-wide text-gray-500">{CATEGORY_TITLE[cat] ?? cat}</h3>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {list.map((i) => <ItemRow key={i.id} item={i} onChange={(p) => onChange(i.id, p)} />)}
          </ul>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 3: Check page** (`app/(admin)/inspections/[id]/check/page.tsx`) — local state seeded from the server; debounced autosave (1.5 s) of changed items; submit shows blockers first.

```tsx
'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { BusCard } from '@/components/inspections/bus-card';
import { ChecklistStep } from '@/components/inspections/checklist-step';
import { computeResult, submitBlockers } from '@/lib/inspections/result';
import type { InspectionItemDTO } from '@/lib/inspections/types';
import { fetchInspection, saveItems, submitInspection } from '../../inspection-api';

type Patch = Partial<Pick<InspectionItemDTO, 'result' | 'note' | 'photoPaths' | 'photoUrls'>>;

export default function InspectionCheckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['inspection', id], queryFn: () => fetchInspection(id), refetchOnWindowFocus: false });

  const [items, setItems] = useState<InspectionItemDTO[]>([]);
  const [notes, setNotes] = useState('');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [submitting, setSubmitting] = useState(false);
  const dirty = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    if (!data || seeded.current) return;
    seeded.current = true;
    if (data.status === 'submitted') { router.replace(`/inspections/${id}`); return; }
    setItems(data.items);
  }, [data, id, router]);

  async function flush(current: InspectionItemDTO[]) {
    const ids = [...dirty.current];
    if (!ids.length) return;
    dirty.current.clear();
    setSaveState('saving');
    try {
      await saveItems(id, current.filter((i) => ids.includes(i.id)).map((i) => ({ id: i.id, result: i.result, note: i.note, photoPaths: i.photoPaths })));
      setSaveState('saved');
    } catch {
      ids.forEach((x) => dirty.current.add(x)); // keep for the next attempt
      setSaveState('error');
    }
  }

  function update(next: InspectionItemDTO[], changed: string[]) {
    setItems(next);
    changed.forEach((x) => dirty.current.add(x));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(next), 1500);
  }

  const onChange = (itemId: string, patch: Patch) =>
    update(items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)), [itemId]);

  const onMarkRemainingPass = () => {
    const changed = items.filter((i) => !i.result).map((i) => i.id);
    update(items.map((i) => (i.result ? i : { ...i, result: 'pass' as const })), changed);
  };

  async function onSubmit() {
    const blockers = submitBlockers(items);
    if (blockers.length) { toast.error(blockers.join(' · ')); return; }
    setSubmitting(true);
    try {
      if (timer.current) clearTimeout(timer.current);
      await flush(items);
      if (dirty.current.size) throw new Error('Could not save your answers — check the connection and try again');
      const { result } = await submitInspection(id, notes || null);
      toast.success(result === 'pass' ? 'Inspection passed' : result === 'fail' ? 'Inspection FAILED — critical items failed' : 'Passed with issues');
      await qc.invalidateQueries({ queryKey: ['inspections'] });
      await qc.invalidateQueries({ queryKey: ['inspection', id] });
      router.replace(`/inspections/${id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setSubmitting(false);
    }
  }

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />;
  if (isError || !data) return <p className="text-red-600">{(error as Error)?.message ?? 'Inspection not found'}</p>;
  if (!data.isMine) return <p className="text-amber-700">This draft was started by {data.inspectorName ?? 'another inspector'}; only they can continue it.</p>;

  const preview = computeResult(items);
  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-28">
      <DetailPageHeader
        crumbs={[{ label: 'Bus Inspection', href: '/inspections' }, { label: data.vehicle.registration }]}
        backHref="/inspections" title={`Inspect ${data.vehicle.registration}`}
        subtitle={saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved — will retry on next change' : 'All changes saved'}
      />
      <BusCard detail={data} />
      <ChecklistStep items={items} onChange={onChange} onMarkRemainingPass={onMarkRemainingPass} />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Overall remarks (optional)"
        className="w-full rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-800 dark:bg-gray-900" />
      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-gray-200 bg-white/95 p-3 backdrop-blur lg:bottom-0 dark:border-gray-800 dark:bg-gray-950/95">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <p className="text-sm">Result so far: <b className={preview === 'fail' ? 'text-red-600' : preview === 'pass' ? 'text-green-600' : 'text-amber-600'}>{preview.replace(/_/g, ' ')}</b></p>
          <button disabled={submitting} onClick={onSubmit} className="rounded-lg bg-green-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">
            {submitting ? 'Submitting…' : 'Submit inspection'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

> `bottom-16` keeps the submit bar above the admin mobile bottom nav; verify on a 390px-wide viewport that it does not overlap (adjust to the nav's real height if needed).

- [ ] **Step 4: Type-check** — `npx tsc --noEmit -p . 2>&1 | grep -E "inspections|components/inspections" || echo CLEAN` → `CLEAN`.

- [ ] **Step 5: Commit**

```bash
git add components/inspections/bus-card.tsx components/inspections/checklist-step.tsx "app/(admin)/inspections/[id]/check"
git commit -m "feat(inspections): check screen with bus card, checklist, autosave and submit"
```

---

### Task 12: Report page

**Files:**
- Create: `app/(admin)/inspections/[id]/page.tsx`

**Interfaces:**
- Consumes: `fetchInspection`, `BusCard`, `DetailPageHeader`, `SectionCard`.

- [ ] **Step 1: Implement**

```tsx
'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { DetailPageHeader, SectionCard } from '@/components/ui/detail-view';
import { BusCard } from '@/components/inspections/bus-card';
import { fetchInspection } from '../inspection-api';

const RESULT = {
  pass: ['PASS', 'bg-green-600'], pass_with_issues: ['PASS WITH ISSUES', 'bg-amber-500'], fail: ['FAIL', 'bg-red-600'],
} as const;
const ITEM = { pass: 'text-green-700', fail: 'text-red-700 font-semibold', na: 'text-gray-500' } as const;

export default function InspectionReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, isError } = useQuery({ queryKey: ['inspection', id], queryFn: () => fetchInspection(id) });
  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />;
  if (isError || !data) return <p className="text-red-600">Inspection not found. <Link href="/inspections" className="underline">Back</Link></p>;

  const failed = data.items.filter((i) => i.result === 'fail');
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <DetailPageHeader
        crumbs={[{ label: 'Bus Inspection', href: '/inspections' }, { label: data.vehicle.registration }]}
        backHref="/inspections"
        title={`Inspection — ${data.vehicle.registration}`}
        subtitle={`${data.submittedAt ? new Date(data.submittedAt).toLocaleString('en-IN') : 'Draft'} · by ${data.inspectorName ?? '—'}`}
        actions={data.result ? <span className={`rounded-lg px-3 py-1.5 text-sm font-bold text-white ${RESULT[data.result][1]}`}>{RESULT[data.result][0]}</span>
          : <Link href={`/inspections/${id}/check`} className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white">Continue draft</Link>}
      />
      <BusCard detail={data} />
      {failed.length > 0 && (
        <SectionCard title={`Failed items (${failed.length})`}>
          <ul className="space-y-3">
            {failed.map((i) => (
              <li key={i.id}>
                <p className="font-medium text-red-700">{i.label}{i.severity === 'critical' ? ' — critical' : ''}</p>
                {i.note && <p className="text-sm">{i.note}</p>}
                <div className="mt-1 flex gap-2">{i.photoUrls.map((u, k) => u && <a key={k} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="h-20 w-20 rounded object-cover" /></a>)}</div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
      <SectionCard title="All checklist items">
        <ul className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
          {data.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-2">
              <span className="min-w-0">{i.label}</span>
              <span className={i.result ? ITEM[i.result] : 'text-gray-400'}>{i.result ? i.result.toUpperCase() : '—'}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
      {data.notes && <SectionCard title="Remarks"><p className="whitespace-pre-wrap text-sm">{data.notes}</p></SectionCard>}
    </div>
  );
}
```

> Check the `SectionCard` prop set (`components/ui/detail-view.tsx:71-90`) — if it requires extra props (e.g. `icon`), pass them.

- [ ] **Step 2: Type-check** → `CLEAN` as in Task 11.

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/inspections/[id]/page.tsx"
git commit -m "feat(inspections): submitted inspection report page"
```

---

### Task 13: Phase 1 verification

- [ ] **Step 1: Unit tests** — `npx vitest run lib/inspections` → all PASS. Also `npx vitest run` → no new failures vs `main`.
- [ ] **Step 2: Build** — `node node_modules/next/dist/bin/next build` → succeeds; route list includes `/inspections`, `/inspections/scan`, `/inspections/stickers`, `/inspections/[id]`, `/inspections/[id]/check`, `/i/[reg]`, and 7 `/api/admin/inspections/*` routes.
- [ ] **Step 3: Route probes (signed out)** — each `/api/admin/inspections*` → `401`; `/inspections` and `/i/X` → redirect to `/auth/login?redirect=…`.
- [ ] **Step 4: DB end-to-end via SQL** (simulate a full inspection on the real DB, then remove it):

```sql
with v as (select id from tms_vehicle order by registration_number limit 1),
     p as (select ur.user_id id from user_roles ur join custom_roles cr on cr.id=ur.role_id where cr.role_key='transport_head' limit 1),
     ins as (insert into tms_inspection (vehicle_id, inspected_by) select v.id, p.id from v, p returning id)
insert into tms_inspection_item (inspection_id, checklist_item_id, category, label, severity, sort_order, result)
select ins.id, c.id, c.category, c.label, c.severity, c.sort_order, 'pass' from ins, tms_inspection_checklist_item c where c.is_active
returning inspection_id;
-- second draft for same bus must fail with 23505:
-- insert into tms_inspection (vehicle_id, inspected_by) select vehicle_id, inspected_by from tms_inspection where status='draft' limit 1;
-- clean up:
-- delete from tms_inspection where status='draft' and started_at > now() - interval '10 minutes';
```
Expected: 25 rows inserted; duplicate draft → unique violation; cleanup deletes 1 row (items cascade).

- [ ] **Step 5: User smoke test (needs the user's signed-in browser + phone)** — ask the user to:
  1. Open `/inspections` as a transport_head user → tiles + 35 buses listed.
  2. `/inspections/stickers` → print one sticker.
  3. On the phone: scan the printed sticker with the **phone camera app** → lands on the check screen; also via **Scan bus** in-app.
  4. Mark items, fail one critical item with a note + photo, reload mid-way (answers persist), submit → result FAIL → report shows photo.
  5. Dashboard shows that bus as inspected today, due in 30 days.
- [ ] **Step 6: Update memory** — add `project_bus_inspection_module.md` (phase status, sticker URL permanence, grounding is warn-only) and index line in `MEMORY.md`.
- [ ] **Step 7: Hand back** — report results; push only after the user approves (`git log origin/main..HEAD` first, then `git push origin HEAD:main`).

---

## Later phases (separate plans, written after Phase 1 ships)

- **Phase 2 — Follow-up:** create issues on submit, issues queue page + resolve/verify/reopen APIs, grounding + Return to service (+ GROUNDED badges on vehicles page, dashboard, Track-All, driver trip-start banner), driver notification via `notifyProfile` (driver `staff → profile`), checklist editor page, `'ground'`-style activity actions.
- **Phase 3 — Riders:** riders API (reuse `lib/booking/roster.ts`), headcount save, verify-only learner scan (`classifyScan` + `jkkn_identities` + fee badge) writing `tms_inspection_learner_check`.
- **Phase 4 — Reports:** route-wise report API + page + CSV export, riders affected by grounded buses.
