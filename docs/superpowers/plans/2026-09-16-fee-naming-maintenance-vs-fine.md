# Admin naming: "Transport Maintenance Fee" (the charge) vs "Transport Fee" (the fine)

> Status: **AWAITING USER CONFIRMATION** — no code or DB changes until approved.

**Rule the UI must express:** the institution collects a **Transport Maintenance Fee**. A learner
who fails to pay it is charged a **Transport Fee** (today's "fine"). So `/fees` = maintenance fee,
`/fees/fine-rates` = transport fee.

---

## 1. Analysis (live, 2026-09-16)

### 1.1 The money layer is ALREADY correct — this is a labels job
`billing_student_bills` descriptions today:

| Description | Rows |
|---|---|
| `Transport Maintenance Fee - 2026-2027 - Term 1 / Term 2 / (no term)` | 2,774 |
| `Transport Maintenance Fee` | 27 |
| `Transport Fine — <reason>` | 26 |

Categories are already split (`Transport Maintenance Fee` / `Staff Transport Maintenance Fee` for the
charge; `Transport Fee` for fines), and `lib/fees/generate.ts:706` composes the description FROM the
category name. **No category, constant or ledger change is in scope.**

### 1.2 The fee-structure ROWS still say "Transport Fees"

| Structure | Mode | Bills |
|---|---|---|
| `Transport Fees 2026-2027` | flat | 1,652 |
| `Transport Fees 2026-2027(Arts Self)` | tiered | 1,103 |
| `Transport Fees 2026-2027 (Arts Aided)` | stop_wise | 44 |
| `Transport Fees 2026-2027 (Staff - All Colleges)` | stop_wise | 38 |
| `Testing` | flat | 2 |

These names show in: the Fees list (`Fee Structure` column), the detail/edit headers, **Bill
Management → `Structure / Term` column + CSV export**, activity-log entity labels, auto-generate logs.

**Renaming them is display-only and safe:** the name is never used to build a bill description, and
**zero** DB functions or views contain the string `Transport Fees` (checked `pg_proc` + `pg_views`).
Old migrations matched those names but are already applied.

### 1.3 A real defect this rename exposes
`/fees/fine-rates` has **no heading of its own**. The header title comes from `derivePageTitle()`
(`lib/navigation.ts:97`), which matches the longest nav href — so the fine page's header currently
reads **"Fees"**. Unless the fine page gets its own nav entry, it will keep showing the maintenance
module's name. The sidebar already renders `subItems` when the parent is active
(`app/(admin)/layout.tsx:169`), so a child entry is the clean fix.

### 1.4 Every admin string to change
* **Nav:** `lib/navigation.ts:69` `Fees`.
* **`/fees` page** (`app/(admin)/fees/page.tsx`): h1 `Fees` (117), subtitle "Configure transport fee
  structures…" (118), stat `Fee Structures` (108), buttons `Fine Rates` (125) + `Add Fee Structure`
  (132), `entityName`/search/toasts/delete dialogs (44, 62, 82, 157, 159, 189, 199, 200), `fetch` error (19).
* **List columns** (`fees/columns.tsx`): `Fee Structure` (67), `Total Fee` (93).
* **Create/edit/detail**: `fees/new/page.tsx` (12–17), `fees/[id]/page.tsx` (111, 126, 140),
  `fees/[id]/edit/page.tsx` (19, 27, 36, 48), `fee-structure-form.tsx` (316, 353, 679),
  `[id]/stop-rates-card.tsx:24`.
* **Fine module**: `fees/fine-rates/page.tsx` (blurb 122–125, `Copy from fee structure` 171),
  `copy-rates-dialog.tsx` (125, 129, 135, 141, 150), `bill-management/fine-dialog.tsx` (title/blurb),
  `bill-management/fines-api.ts:46`.
* **Bill Management**: subtitle (`page.tsx:150`), `Structure / Term` header (`columns.tsx:117`).
* **Activity log**: `MODULE_LABEL.fees = 'Fees'` (`activity-log/columns.tsx:66`).
* **Settings**: auto-generate helper text (`settings/page.tsx:246`).

---

## 2. Proposed wording

| Where | Now | After |
|---|---|---|
| Sidebar parent | `Fees` | `Maintenance Fee` |
| Sidebar child (new) | — | `Transport Fee` → `/fees/fine-rates` |
| `/fees` h1 | `Fees` | `Transport Maintenance Fee` |
| `/fees` subtitle | "Configure transport fee structures and generate bills" | "The recurring charge the institution collects. Configure structures and generate bills." |
| `/fees` stat | `Fee Structures` | `Structures` |
| `/fees` buttons | `Fine Rates`, `Add Fee Structure` | `Transport Fee rates`, `Add Structure` |
| List column | `Fee Structure`, `Total Fee` | `Maintenance Fee Structure`, `Annual Amount` |
| `/fees/fine-rates` (new h1) | *(shows "Fees")* | `Transport Fee` + "Charged when a learner has not paid the transport maintenance fee. One amount per route, applied to every stop on it." |
| Copy dialog | "Copy from fee structure" | "Copy from a maintenance fee structure" |
| Bill Management subtitle | "…across all fee structures" | "…across all maintenance fee structures" |
| Activity log module | `Fees` | `Fees (maintenance & transport fee)` |

Structure rows renamed `Transport Fees 2026-2027…` → **`Transport Maintenance Fee 2026-2027…`**
(same suffixes; `Testing` untouched).

---

## 3. Tasks

1. **Nav** (`lib/navigation.ts`): rename the entry, add the `subItems` child for `/fees/fine-rates`.
   Verify `derivePageTitle('/fees/fine-rates')` now returns `Transport Fee` (add a unit test — this
   is the 1.3 defect) and check the mobile bottom-nav still renders.
2. **`/fees` page + columns**: apply the table in §2.
3. **Create / edit / detail / form**: titles, subtitles, breadcrumbs, placeholder, submit label.
4. **Fine module**: add the page heading block; reword the blurb, Copy dialog and Generate-fine
   dialog; `fines-api.ts` comment.
5. **Bill Management + activity log + settings** wording.
6. **Migration** `20260916_rename_fee_structures_maintenance.sql`: rename the 4 transport structures
   by **id** (not by name pattern), assert 4 rows, apply to prod, commit the .sql.
7. **Verify**: full vitest, scoped tsc, `next build`; SQL check that bill descriptions and category
   names are untouched (2,801 maintenance + 26 fine rows unchanged); your browser check of `/fees`,
   `/fees/fine-rates`, Bill Management.

**Out of scope:** categories, constants, the fine ledger, the learner portal.

---

## 4. Needs your confirmation
1. **Sidebar label** — `Maintenance Fee` (parent) + `Transport Fee` (child)? Or spell the parent out
   in full as `Transport Maintenance Fee` (wider, may wrap)?
2. **Rename the 4 DB structure rows** to `Transport Maintenance Fee 2026-2027…`? (display-only, safe)
3. **The word "fine" inside the fine module** — keep it on the *actions* (`Generate fine`, `Fines`
   tab, `Raise N fine(s)`) while the *module* is named `Transport Fee`? Or replace every "fine" with
   "transport fee" (then the Bill Management tab reads `Transport Fee` next to maintenance bills)?
4. **Learner portal** (`/student/fees` h1 `Transport Fees`) — leave as is, as you said admin only?
