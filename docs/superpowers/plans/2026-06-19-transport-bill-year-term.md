# Transport Bills: Academic Year + Term + Transport Year — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make generated transport bills carry the learner's correct academic year (from their profile), a self-describing name (`Transport Fee - <AY> - Term n`), and a `transport_year_id` for year-wise stats — and keep the TMS ledger auto-consistent with MyJKKN via a cascade FK + live reads.

**Architecture:** Generation (`/api/admin/fees/[id]/generate`) inserts a money row into the shared `billing_student_bills` + a ledger row into `tms_fee_bill`. We source the academic year from `learners_profiles.academic_year_id` (already loaded by applicability), add a `transport_year_id` column to the money table, add an `ON DELETE CASCADE` FK from the ledger to the money table, and switch the admin read layer to display live amount/due-date. No triggers; the only mutating DDL on the shared table is one additive nullable column.

**Tech Stack:** Next.js 15 (App Router, route handlers), TypeScript, `@supabase/supabase-js` (service-role), Postgres (Supabase), TanStack Table, `xlsx`.

## Global Constraints

- **No unit-test harness exists** for API routes / SQL in this repo, and `npm run lint` (ESLint) is broken. Verify every code task with **`npx tsc --noEmit` filtered to the changed files**; verify DB/behavior with **Supabase SQL probes** and (for the authed UI) a **user-driven generate**.
- **Migrations:** apply via the Supabase MCP `apply_migration` (targets the real app DB) **and** commit the `.sql` file under `supabase/migrations/`.
- **Commits:** project convention is to work on `main`. Use **specific `git add <path>`** — never `git add -A`, never `git stash` (parallel sessions share `main`). Verify `git status` before each commit so you only stage this task's files.
- **Bill name format (verbatim):** `Transport Fee - <academic_year> - Term <n>` for flat structures; `Transport Fee - <academic_year> - <band> - Term <n>` for tiered. Omit the `<academic_year> - ` segment only if the learner has no `academic_year_id`.
- **Large `.in()` rule:** chunk any `.in()` of ≥150 UUIDs. (The academic-year-name lookups here are bounded by the number of academic years — tiny — so a single `.in()` is safe.)
- **Category name source:** the bill name's leading `Transport Fee` is the already-computed `catName = TRANSPORT_CATEGORY_NAME[fs.audience]` (`'student' → 'Transport Fee'`). Learner money rows are only ever inserted for student-audience structures, so `catName` is always `'Transport Fee'` there.

---

### Task 1: Migration — add `transport_year_id` to `billing_student_bills`

**Files:**
- Create: `supabase/migrations/20260619000000_add_transport_year_id_to_billing_student_bills.sql`

**Interfaces:**
- Produces: a nullable column `billing_student_bills.transport_year_id uuid REFERENCES tms_transport_year(id)` + index `idx_billing_student_bills_transport_year`. Consumed by Task 4 (generation insert).

- [ ] **Step 1: Write the migration file**

```sql
-- Add a transport-year link to the shared bills table so transport-fee bills can be
-- aggregated transport-year-wise (mirrors the existing hostel_year_id -> hostel_years
-- pattern). Nullable + additive: other apps are unaffected; only the TMS generator
-- populates it (for Transport Fee bills).
ALTER TABLE billing_student_bills
  ADD COLUMN IF NOT EXISTS transport_year_id uuid
  REFERENCES tms_transport_year(id) ON DELETE NO ACTION;

CREATE INDEX IF NOT EXISTS idx_billing_student_bills_transport_year
  ON billing_student_bills (transport_year_id);
```

- [ ] **Step 2: Apply the migration**

Apply via Supabase MCP `apply_migration` with name `add_transport_year_id_to_billing_student_bills` and the SQL above.

- [ ] **Step 3: Verify the column exists**

Run (Supabase MCP `execute_sql`):
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='billing_student_bills'
  and column_name='transport_year_id';
```
Expected: one row, `uuid`, `is_nullable = YES`.

- [ ] **Step 4: Verify the FK target + index**

```sql
select 1
from information_schema.referential_constraints rc
join information_schema.key_column_usage kcu on kcu.constraint_name = rc.constraint_name
where kcu.table_name='billing_student_bills' and kcu.column_name='transport_year_id';
```
Expected: one row (FK present).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260619000000_add_transport_year_id_to_billing_student_bills.sql
git commit -m "feat(fees): add transport_year_id to billing_student_bills for year-wise stats"
```

---

### Task 2: Migration — clean orphans + cascade-link the ledger to MyJKKN

**Files:**
- Create: `supabase/migrations/20260619000100_tms_fee_bill_cascade_link.sql`

**Interfaces:**
- Produces: FK `tms_fee_bill_billing_student_bill_id_fkey` (`tms_fee_bill.billing_student_bill_id → billing_student_bills(id) ON DELETE CASCADE`) + supporting indexes. Makes MyJKKN deletes auto-clean the ledger.
- Consumes: nothing from earlier tasks (independent of Task 1), but the cleanup **must** precede the FK in the same file.

- [ ] **Step 1: Pre-check the orphan count (sanity)**

```sql
select count(*) as orphaned
from tms_fee_bill l
where l.billing_student_bill_id is not null
  and not exists (select 1 from billing_student_bills b where b.id = l.billing_student_bill_id);
```
Expected: a number (≈768 at time of writing; any value is fine — the migration is idempotent).

- [ ] **Step 2: Write the migration file**

```sql
-- TMS becomes a derived mirror of MyJKKN's billing_student_bills:
--   * remove orphaned ledger rows (their money row was already deleted)
--   * add the previously-missing FK with ON DELETE CASCADE, so deleting a bill in
--     MyJKKN auto-removes its ledger row. Staff rows have a NULL link and are untouched.
-- The constraint lives on OUR table; MyJKKN deletes keep working and just clean the ledger.

-- 1) clear orphans (must run before adding the FK — they would violate it)
DELETE FROM tms_fee_bill
WHERE billing_student_bill_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM billing_student_bills b WHERE b.id = tms_fee_bill.billing_student_bill_id
  );

-- 2) index for the cascade lookup + joins
CREATE INDEX IF NOT EXISTS idx_tms_fee_bill_billing_student_bill
  ON tms_fee_bill (billing_student_bill_id);

-- 3) one ledger row per money row (partial so staff NULLs are allowed)
CREATE UNIQUE INDEX IF NOT EXISTS uq_tms_fee_bill_billing_student_bill
  ON tms_fee_bill (billing_student_bill_id)
  WHERE billing_student_bill_id IS NOT NULL;

-- 4) the missing link, with cascade
ALTER TABLE tms_fee_bill
  ADD CONSTRAINT tms_fee_bill_billing_student_bill_id_fkey
  FOREIGN KEY (billing_student_bill_id)
  REFERENCES billing_student_bills(id) ON DELETE CASCADE;
```

- [ ] **Step 3: Apply the migration**

Apply via Supabase MCP `apply_migration` with name `tms_fee_bill_cascade_link` and the SQL above.

- [ ] **Step 4: Verify the FK exists with CASCADE**

```sql
select rc.delete_rule
from information_schema.referential_constraints rc
where rc.constraint_name = 'tms_fee_bill_billing_student_bill_id_fkey';
```
Expected: one row, `delete_rule = CASCADE`.

- [ ] **Step 5: Verify orphans are gone**

```sql
select count(*) as orphaned
from tms_fee_bill l
where l.billing_student_bill_id is not null
  and not exists (select 1 from billing_student_bills b where b.id = l.billing_student_bill_id);
```
Expected: `0`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260619000100_tms_fee_bill_cascade_link.sql
git commit -m "feat(fees): cascade-link tms_fee_bill to billing_student_bills + clear orphans"
```

---

### Task 3: Surface the learner's academic year in applicability

**Files:**
- Modify: `lib/fees/applicability.ts` (interface `ApplicablePerson` ~16-21; learner select ~40-44 and the learner `return rows.map(...)` ~65-70; staff `return` ~84-89)

**Interfaces:**
- Produces: `ApplicablePerson.academic_year_id: string | null` (the learner's `learners_profiles.academic_year_id`; `null` for staff). Consumed by Task 4.

- [ ] **Step 1: Add `academic_year_id` to the `ApplicablePerson` interface**

Replace the interface:
```ts
export interface ApplicablePerson {
  person_id: string;
  person_type: 'learner' | 'staff';
  institution_id: string | null;
  admission_year: number | null; // learners only (null for staff / missing data)
  academic_year_id: string | null; // learners only — their current academic year (null for staff)
}
```

- [ ] **Step 2: Select `academic_year_id` in the learner query**

Change the learner select (add `academic_year_id`):
```ts
    let q = supabase
      .from('learners_profiles')
      .select('id, institution_id, admission_year_id, academic_year_id')
      .eq('bus_required', true)
      .in('lifecycle_status', statuses);
```

- [ ] **Step 3: Widen the learner row type + return it**

Update the row type and the learner `return`:
```ts
    const rows = (data ?? []) as Array<{
      id: string;
      institution_id: string | null;
      admission_year_id: string | null;
      academic_year_id: string | null;
    }>;
```
```ts
    return rows.map((r) => ({
      person_id: r.id,
      person_type: 'learner' as const,
      institution_id: r.institution_id,
      admission_year: r.admission_year_id ? yearById.get(r.admission_year_id) ?? null : null,
      academic_year_id: r.academic_year_id ?? null,
    }));
```

- [ ] **Step 4: Add `academic_year_id: null` to the staff return**

```ts
  return (data ?? []).map((r: { id: string; institution_id: string | null }) => ({
    person_id: r.id,
    person_type: 'staff' as const,
    institution_id: r.institution_id,
    admission_year: null,
    academic_year_id: null,
  }));
```

- [ ] **Step 5: Type-check the changed file**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -E "applicability|fees/" || echo "no type errors in changed files"
```
Expected: `no type errors in changed files` (or no lines mentioning `applicability.ts`).

- [ ] **Step 6: Commit**

```bash
git add lib/fees/applicability.ts
git commit -m "feat(fees): expose learner academic_year_id from applicability"
```

---

### Task 4: Generation — use profile academic year, new bill name, set transport year

**Files:**
- Modify: `app/api/admin/fees/[id]/generate/route.ts` (the `acadCache`/`resolveAcademicYear` block ~211-227; the resolved loop ~247-291)

**Interfaces:**
- Consumes: `ApplicablePerson.academic_year_id` (Task 3); `billing_student_bills.transport_year_id` (Task 1).
- Produces: learner money rows with correct `academic_year_id`, `transport_year_id`, and `bill_description = "Transport Fee - <AY> - [<band> - ]Term <n>"`.

- [ ] **Step 1: Replace the date-derivation block with a profile-AY name lookup**

Replace the whole `// academic_year_id is institution-scoped — cache per institution.` block (the `acadCache` declaration through the end of the `resolveAcademicYear` arrow function) with:
```ts
    // Each learner's academic year comes from their PROFILE (resolveApplicablePeople
    // already loaded learners_profiles.academic_year_id). Resolve the distinct ids ->
    // display name in one query; the number of distinct academic years is tiny (one or
    // two per institution), so a single .in() stays well under the gateway limit.
    const learnerAyIds = [
      ...new Set(
        resolved
          .filter((r) => r.person.person_type === 'learner' && r.person.academic_year_id)
          .map((r) => r.person.academic_year_id as string)
      ),
    ];
    const acadYearNameById = new Map<string, string>();
    if (learnerAyIds.length) {
      const { data: ays } = await supabase
        .from('academic_years')
        .select('id, academic_year_name')
        .in('id', learnerAyIds);
      for (const a of (ays ?? []) as Array<{ id: string; academic_year_name: string | null }>) {
        if (a.academic_year_name) acadYearNameById.set(a.id, a.academic_year_name);
      }
    }
```

- [ ] **Step 2: Update the per-person prologue inside the resolved loop**

Replace these three lines at the top of `for (const r of resolved) {`:
```ts
      const p = r.person;
      const bandPrefix = r.band?.label ? `${r.band.label} - ` : '';
      const acadYear = p.person_type === 'learner' ? await resolveAcademicYear(p.institution_id) : null;
```
with:
```ts
      const p = r.person;
      const bandPrefix = r.band?.label ? `${r.band.label} - ` : '';
      const acadYearId = p.person_type === 'learner' ? p.academic_year_id : null;
      const acadYearName = acadYearId ? acadYearNameById.get(acadYearId) ?? null : null;
      const ayPart = acadYearName ? `${acadYearName} - ` : '';
```

- [ ] **Step 3: Update the learner `billing_student_bills` insert (name + AY + transport year)**

In the `if (p.person_type === 'learner')` insert object, change the description, `academic_year_id`, and add `transport_year_id`:
```ts
              bill_description: `${catName} - ${ayPart}${bandPrefix}${t.term_label || `Term ${t.term_no}`}`,
```
```ts
              status: 'unpaid',
              academic_year_id: acadYearId,
              transport_year_id: fs.transport_year_id,
              created_by: auth.userId,
```

- [ ] **Step 4: Type-check the changed file**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -E "generate/route|fees/" || echo "no type errors in changed files"
```
Expected: `no type errors in changed files`.

- [ ] **Step 5: Commit**

```bash
git add "app/api/admin/fees/[id]/generate/route.ts"
git commit -m "feat(fees): source bill academic year from learner profile + tag transport year"
```

---

### Task 5: Read layer — live amount/due-date + academic year on bill rows

**Files:**
- Modify: `lib/fees/bills.ts` (interface `TransportBillRow` ~15-35; `billMap` build ~185-202; name-map block ~204-207; row mapping ~211-262)

**Interfaces:**
- Consumes: `billing_student_bills.academic_year_id` (existing) + `due_date`/`final_amount` (existing).
- Produces: `TransportBillRow.academic_year_id` + `TransportBillRow.academic_year_name`, and amount/due_date now read live from the money row for learners. Consumed by Task 6.

- [ ] **Step 1: Add the two fields to `TransportBillRow`**

After the `year_name: string | null;` line, add:
```ts
  academic_year_id: string | null;
  academic_year_name: string | null;
```

- [ ] **Step 2: Widen `billMap` to carry due_date + academic_year_id**

Replace the `billMap` declaration + populate block:
```ts
  const billMap = new Map<
    string,
    { final: number; balance: number; status: string; payment_date: string | null; due_date: string | null; academic_year_id: string | null }
  >();
  if (billIds.length) {
    const data = await selectByIds<{
      id: string;
      final_amount: number | string | null;
      balance_amount: number | string | null;
      status: string | null;
      payment_date: string | null;
      due_date: string | null;
      academic_year_id: string | null;
    }>(supabase, 'billing_student_bills', 'id, final_amount, balance_amount, status, payment_date, due_date, academic_year_id', billIds);
    for (const b of data) {
      billMap.set(b.id, {
        final: Number(b.final_amount ?? 0),
        balance: Number(b.balance_amount ?? 0),
        status: b.status ?? 'unpaid',
        payment_date: b.payment_date ?? null,
        due_date: b.due_date ?? null,
        academic_year_id: b.academic_year_id ?? null,
      });
    }
  }
```

- [ ] **Step 3: Resolve academic-year names**

Right after the `const instMap = await nameMapFor(...)` line, add:
```ts
  const acadYearIds = uniq([...billMap.values()].map((b) => b.academic_year_id));
  const acadYearMap = await nameMapFor(supabase, 'academic_years', 'academic_year_name', acadYearIds);
```

- [ ] **Step 4: Use live amount/due-date and emit the AY fields in the row mapping**

Replace the `const amount = ...` and `const dueDate = ...` lines:
```ts
    // Prefer the LIVE money row for amount/due_date so MyJKKN edits reflect; fall back
    // to the ledger snapshot for staff (no money row) or a missing row.
    const amount = personType === 'learner' && bill ? bill.final : Number(r.amount ?? 0);
    const dueDate = (personType === 'learner' && bill ? bill.due_date : null) ?? (r.due_date as string);
    const acadYearId = bill?.academic_year_id ?? null;
```
Then in the returned object, add after `year_name: ...`:
```ts
      academic_year_id: acadYearId,
      academic_year_name: acadYearId ? acadYearMap.get(acadYearId) ?? null : null,
```

- [ ] **Step 5: Type-check the changed file**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -E "fees/bills" || echo "no type errors in changed files"
```
Expected: `no type errors in changed files`.

- [ ] **Step 6: Commit**

```bash
git add lib/fees/bills.ts
git commit -m "feat(fees): show academic year + live amount/due-date on transport bill rows"
```

---

### Task 6: Admin display — Academic Year column in table + export

**Files:**
- Modify: `app/(admin)/bill-management/columns.tsx` (after the `id: 'structure'` column ~99-109)
- Modify: `app/(admin)/bill-management/bill-export.ts` (the `data` map ~14-28 and the `header` array ~30-33)

**Interfaces:**
- Consumes: `TransportBillRow.academic_year_name` (Task 5).

- [ ] **Step 1: Add the Academic Year column**

In `getBillColumns()`, immediately after the `id: 'structure'` column object, insert:
```tsx
    {
      id: 'academic_year',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Academic Year" />,
      accessorFn: (r) => r.academic_year_name ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {row.original.academic_year_name || '—'}
        </span>
      ),
      size: 140,
    },
```

- [ ] **Step 2: Add "Academic year" to the Excel export**

In `exportBills`, add the field to the row map (after `Structure: r.structure_name ?? '',`):
```ts
    Structure: r.structure_name ?? '',
    'Academic year': r.academic_year_name ?? '',
    Term: r.term_no,
```
and add it to the `header` array (after `'Structure'`):
```ts
  const header = [
    'Person', 'Code', 'Type', 'Institution', 'Structure', 'Academic year', 'Term', 'Transport year',
    'Amount', 'Paid', 'Pending', 'Due date', 'Status', 'Payment date',
  ];
```

- [ ] **Step 3: Type-check the changed files**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -E "bill-management" || echo "no type errors in changed files"
```
Expected: `no type errors in changed files`.

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/bill-management/columns.tsx" "app/(admin)/bill-management/bill-export.ts"
git commit -m "feat(fees): add Academic Year column to Bill Management table + export"
```

---

### Task 7: End-to-end verification

**Files:** none (verification only).

This task mixes **agent-runnable** checks (tsc, SQL) with **one user action** (the authed UI generate), because the generate endpoint is behind the Supabase/Google auth gate and can't be triggered headless.

- [ ] **Step 1: Full type-check (no new errors)**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -E "applicability|generate/route|fees/bills|bill-management" || echo "changed files clean"
```
Expected: `changed files clean`.

- [ ] **Step 2: Confirm the DB is ready for a clean regeneration**

Run (Supabase MCP):
```sql
select
  (select count(*) from tms_fee_bill) as ledger_rows,
  (select count(*) from billing_student_bills where item_category_id='bb5bbf2b-5777-4802-8113-8178b28c88af') as transport_money_rows;
```
Expected: `ledger_rows = 0` and `transport_money_rows = 0` (orphans cleared, prior transport bills already deleted). If `ledger_rows > 0`, generation will skip those pairs — investigate before generating.

- [ ] **Step 3: USER ACTION — generate bills**

Ask the user to open the active Arts Self fee structure in the admin UI and click **Generate** (dry-run first, then generate). Wait for confirmation it completed.

- [ ] **Step 4: Verify academic year + name + transport year on the new bills**

Run (Supabase MCP):
```sql
with ad as (
  select b.id, b.bill_description, b.academic_year_id, b.transport_year_id,
         b.student_id, b.final_amount, b.due_date,
         lp.academic_year_id as profile_ay
  from billing_student_bills b
  join learners_profiles lp on lp.id = b.student_id
  where b.item_category_id = 'bb5bbf2b-5777-4802-8113-8178b28c88af'
  order by b.created_at desc
  limit 20
)
select
  count(*) as bills,
  count(*) filter (where academic_year_id is not distinct from profile_ay) as ay_matches_profile,
  count(*) filter (where transport_year_id is not null) as has_transport_year,
  count(*) filter (where bill_description ~ '^Transport Fee - .+ - .*Term [0-9]+$') as name_format_ok
from ad;
```
Expected: `ay_matches_profile = bills`, `has_transport_year = bills`, `name_format_ok = bills`.

- [ ] **Step 5: Eyeball a few names**

```sql
select bill_description
from billing_student_bills
where item_category_id = 'bb5bbf2b-5777-4802-8113-8178b28c88af'
order by created_at desc
limit 6;
```
Expected: rows like `Transport Fee - 2026-2027 - Term 1` (tiered: `Transport Fee - 2026-2027 - <band> - Term 1`).

- [ ] **Step 6: Verify the cascade FK is enforced (constraint present)**

```sql
select rc.delete_rule
from information_schema.referential_constraints rc
where rc.constraint_name = 'tms_fee_bill_billing_student_bill_id_fkey';
```
Expected: `CASCADE`. (Optional live test for the user: delete one bill in MyJKKN and confirm its `tms_fee_bill` row disappears and Bill Management no longer shows it as "unknown".)

- [ ] **Step 7: USER ACTION — admin display check**

Ask the user to open **Bill Management**, pick the transport year, and confirm: the **Academic Year** column shows `2026-2027`, the **Amount** matches, and the **Export** `.xlsx` includes an "Academic year" column. (Optional: edit a bill's amount in MyJKKN and confirm the table's Amount updates on refresh — proves the live read.)

---

## Self-Review

**Spec coverage:**
- §A academic year from profile → Tasks 3 + 4 ✓
- §B bill name format → Task 4 (+ Global Constraints verbatim) ✓
- §C transport_year_id column → Task 1; populated → Task 4 ✓
- §D admin Academic Year column + export → Tasks 5 + 6 ✓
- §E orphan cleanup → Task 2 (step 2.1) ✓
- §F cascade FK + live read → Task 2 (FK) + Task 5 (live amount/due-date) ✓
- Verification (tsc + SQL + cascade + edit) → Task 7 ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; every command has expected output. ✓

**Type consistency:** `academic_year_id`/`academic_year_name` named identically across `ApplicablePerson` (T3), the generation lookup (T4), `TransportBillRow` + `billMap` (T5), and the column/export (T6). `transport_year_id` matches the T1 column and the T4 insert key. `catName`/`ayPart`/`bandPrefix`/`acadYearId`/`acadYearName` are all defined before use within Task 4. ✓
