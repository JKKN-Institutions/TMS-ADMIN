# Staff Transport Fee Billing — 19 Non-In-Charge Staff

**Date:** 2026-08-04
**Status:** Approved design, pending implementation plan
**Fee structure:** `Transport Fees 2026-2027 (Staff - All Colleges)` — `1cff2da9-565b-4618-9c21-68fb66c52aad`

## Problem

131 staff are onboarded for transport (`staff.bus_required = true AND is_active = true`). 109 hold an
active bus in-charge assignment in `tms_staff_route_assignment`, which carries a transport fee
exemption. 22 do not. Of those 22, three carry `JICATE*` staff IDs and are excluded by operator
decision, leaving **19 staff to bill**.

Zero staff bills have ever been generated (`tms_fee_bill` holds 2,220 learner rows and 0 staff rows).
The policy — *volunteer as bus in-charge, or transport fees apply* — is already encoded in the
generation route as a cohort filter, but has never been executed for staff.

## Decisions

| Decision | Choice |
|---|---|
| Bill semantics | **Payable bill inside TMS.** Staff cannot enter `billing_student_bills` (its `student_id` is `NOT NULL` with FK to `learners_profiles`), so `tms_fee_bill` becomes the authoritative staff ledger. |
| Cohort | **Exactly the 19** listed below — requires explicit person-id scoping. |
| Instalments | **One term at 100%** of the stop's annual rate (replacing the configured 2 × 50%). |
| Due date | **2026-08-31** — the previously configured Term 1 date of 2026-07-31 has already passed. |
| Notification | **Bill now, then notify** each staffer with their own amount, stop and due date. |
| Payment capture | Transport office records payment manually (reference + actor). No payment gateway. |

**Total billed: ₹2,08,550 across 19 rows.**

## Why the cohort cannot be expressed by institution

`institution_ids` cannot isolate these 19. Only KOKILA B belongs to *Jicate Solutions*; JANANI G and
KAYALVIZHI S carry `JICATE*` staff IDs while sitting under *JKKN College of Pharmacy*, which also
contains SALINI P, who **is** billed. Institution filtering would therefore either over- or
under-bill. An explicit person-id list is required.

### Canonical cohort query

```sql
with onboard as (
  select s.id, s.staff_id, s.transport_stop_id,
         lower(trim(s.email)) pe, lower(trim(s.institution_email)) ie, lower(trim(p.email)) pfe
  from staff s left join profiles p on p.id = s.profile_id
  where s.bus_required and s.is_active
),
act as (select lower(trim(staff_email)) em from tms_staff_route_assignment where is_active)
select o.id from onboard o
where not exists (select 1 from act a where a.em in (o.pe, o.ie, o.pfe))
  and coalesce(o.staff_id,'') not like 'JICATE%';
```

Matching across **all three** staff addresses is mandatory. `staff.email` is the personal address and
diverges from `profiles.email` for 37 of 131 staff; matching on it alone finds only 77 of the 109
in-charges and would wrongly bill 32 exempt people. One record — VIGNESH S
(`b20646ac-d425-4f1a-a33a-4ba15c096f79`) — has a malformed `staff.email` (`jkkn.a.c.in`) that matches
no profile at all.

### The 19

| staff.id | Staff ID | Name | Annual ₹ |
|---|---|---|---|
| `97d79de9-5573-44a3-a5ad-af1dd9f5fc6c` | NV12408 | ANITHA ARUL MARY R | 5,500 |
| `c4ea7c30-7a98-4c67-b61c-6adaa7c92fa5` | — | Dhandapani M | 5,500 |
| `7f9b31ee-f0ae-4a22-a42c-27a3c59fe5be` | DCH128 | DR. EZHILARASI A.V.S | 10,450 |
| `84e004da-0634-4433-a45a-253b36cc26d6` | DCH038 | DR. GOKULAPRIYA S | 8,800 |
| `864dbd24-6bc9-4f74-8be7-77b10041829a` | CAS083 | Dr. KARUPPUSAMY O P | 10,700 |
| `4fea28be-b446-462f-adea-cf96da90f44a` | CET126 | Dr. Mohanraj M R | 13,200 |
| `8bb147f8-1bd1-4dd9-8036-a60acf81ba8b` | DCH137 | Dr. SRUTHI SRIVAISNAVI S.N | 19,800 |
| `64a17876-c771-4be1-bd71-06db03969b7b` | NOT 219 | Miss. SALINI P | 10,100 |
| `1d39f92c-7b5d-4ee0-9505-bf763f2dac4f` | NOT219 | Miss. SNEKA P | 5,500 |
| `53f8644f-b1ee-465b-9901-4f032d4313f9` | — | Miss. SOWBARNIKA R | 5,500 |
| `033a1ee4-7327-40d4-ab5f-f4f93cd4407a` | CET053 | Mr. Aruljothi K | 21,450 |
| `81a57374-9f94-4c1b-8420-af464f6b32ac` | AHS107 | MR. GIRIDHARAN P | 18,400 |
| `8ca0d8b6-3d0a-47aa-bdd4-51e8fbb4b3b8` | AHS117 | MR. MANIKANDAN P | 8,250 |
| `b631d1a7-9b6a-4488-bbe8-301f04c12122` | CET052 | Mr. RAVISHANKAR S | 14,300 |
| `436ab61c-c26b-4dc8-a3d5-753d778461da` | CET242 | Mrs. Dharshini Devi M | 5,500 |
| `f5ca7b8b-2120-4fc8-bbc0-5cfa4e257efd` | — | Mrs. THENMOZHI S | 8,250 |
| `7eb732d7-bd2d-4ee2-a09e-70354c6c31ec` | 121 | Muralidharan c | 19,800 |
| `0fa583d3-b630-4d40-b74b-827cfef1268e` | AHS132 | Sanjai V | 10,400 |
| `b20646ac-d425-4f1a-a33a-4ba15c096f79` | CAS126 | VIGNESH S | 7,150 |

All 19 have a `transport_stop_id` **and** a matching rate among the structure's 463 stop rates, so all
19 resolve. All 19 have a `profile_id`, so all 19 are notifiable.

## Architecture

Seven units, each independently testable.

### 1 · Instalment schedule: 2 × 50% → 1 × 100%

Data change through the existing `PUT /api/admin/fees/[id]`, which calls `writeStopTerms`
(`app/api/admin/fees/route.ts:137`) to delete and re-insert the schedule. Not a migration.

New schedule: `{ term_no: 1, term_label: 'Term 1', share_percent: 100.00, due_date: '2026-08-31' }`.

Safe because no bill has ever been generated from this structure, and the only other staff-billing
consumer (`generateStaffBill`) reads `tms_fee_structure_term`, not `tms_fee_structure_stop_term`.

### 2 · Migration: make staff bills payable

`tms_fee_bill.status`'s CHECK constraint currently permits only
`generated | staff_deferred | error | cancelled`. Add:

- `paid` to the status CHECK
- `paid_at timestamptz null`
- `paid_amount numeric null`
- `payment_reference text null`
- `marked_paid_by uuid null`

This is the only schema change. Commit under `supabase/migrations/`.

### 3 · Person-id scoping on the generate route

`POST /api/admin/fees/[id]/generate` gains optional `personIds: string[]`.

Applied **after** `resolveApplicablePeople` and the in-charge exemption, as a set intersection. It can
only narrow the cohort, never widen it — so stop-rate resolution and the in-charge exemption remain
the gates. Ids that match nobody in the resolved cohort are counted and returned in the response
rather than silently ignored, so a mistyped id cannot quietly under-bill. Any `.in()` over the id list
is chunked at ≤150 to stay under the Supabase gateway limit, with the error checked (an unchecked
failure reads as an empty set).

### 4 · Staff rows written as payable

`buildStaffFeeBillRow` (`lib/fees/staff-bill.ts:43`) currently hardcodes `status: 'staff_deferred'`.
Add a `status` parameter:

- admin-initiated generation passes `'generated'` — a real, payable bill
- the in-charge enforcement cron (`app/api/cron/incharge-attendance/route.ts:191`) keeps
  `'staff_deferred'`, so the punitive path is unchanged

Idempotency is unchanged and already guaranteed by `tms_fee_bill_idem_unique`
`(fee_structure_id, person_id, term_no, transport_year_id)`.

### 5 · Staff-facing bill view

- `GET /api/boarding/fees` — returns only the caller's own rows, resolved
  `profiles.id → staff.profile_id → tms_fee_bill.person_id`. Never accepts a person id from the client.
- `/boarding/fees` page — amount, boarding stop, due date, paid/unpaid state.

This fills the route that `proxy.ts:239-242` already names in its staff-fee seam.

### 6 · Admin list + mark paid

- `GET /api/admin/fees/[id]/staff-bills` — staff bills for a structure, joined to name, stop and status.
- `POST /api/admin/fees/[id]/staff-bills/mark-paid` — sets `status='paid'`, `paid_at`, `paid_amount`,
  `payment_reference`, `marked_paid_by`; writes an activity log entry.

Both gated by the existing `TMS_PERMISSIONS.FEES_*` checks used elsewhere in the module.

### 7 · Notification

After a successful generate, one `notifyProfile` call per staffer (`lib/notifications/notify.ts:19`):

- **title:** `Transport fee 2026-2027 — bill generated`
- **body:** their amount, boarding stop, due date, and how to pay
- **category:** `transport`
- **url:** `/boarding/fees`

Sent **only for rows actually inserted by that run**, keyed off the generation run — so a re-run,
which inserts nothing thanks to the idempotency index, notifies nobody. Notification failures are
non-fatal and must never roll back a generated bill; `notifyProfile` already swallows its own errors.

## Data flow

```
PUT  /api/admin/fees/1cff2da9…            -> schedule becomes 1 × 100%, due 2026-08-31
POST /api/admin/fees/1cff2da9…/generate   { mode: 'dry_run',  personIds: [19] }
       -> resolveApplicablePeople (staff, bus_required, active)   131
       -> filterOutInCharges (staff.email + profiles.email)        22
       -> intersect personIds                                      19
       -> resolvePersonTerms (stop rate × 100%)                    19 resolved
       -> preview: applicable 19, toGeneratePairs 19
POST /api/admin/fees/1cff2da9…/generate   { mode: 'generate', personIds: [19] }
       -> insert 19 tms_fee_bill rows, status 'generated'
       -> notifyProfile × 19
```

## Error handling

- Dry-run is mandatory before generate; the plan must not ship a one-click generate.
- Any `.in()` chunked to ≤150 and error-checked — an unchecked gateway 400 reads as an empty result
  and would silently exempt or drop people.
- Failure to load in-charge assignments must fail loud (already does, `generate/route.ts:257`) —
  exempting nobody would bill 109 exempt staff.
- Notification failures are logged and counted, never fatal.

## Testing

- Unit: `personIds` intersection never widens the cohort; unknown ids are reported; `status` parameter
  writes `generated` for admin runs and `staff_deferred` for the cron path; notification body builder.
- Integration: dry-run reports `applicable: 19`, `toGeneratePairs: 19`, `exemptInCharge: 109` before
  any write.
- Post-generate: 19 rows at `status='generated'`; a second identical run inserts 0 and notifies 0.
- Confirm no portal lockout — the staff fee gate is an inert comment, so the expected result is that
  all 19 retain boarding-portal access.

## Risks

- **These 19 were never warned.** The in-charge deadline notice
  (`app/api/admin/fees/notify-incharge-deadline/route.ts`, deadline 25 July 2026) exists in code but
  no such notification exists in the database. Billing arrives with no prior warning. Accepted by the
  operator; the generated bill notification is the first contact.
- **`staff.transport_stop_id` is owned by MyJKKN.** If a staffer's stop changes after billing, the
  amount does not follow. Out of scope.
- **Four staff hold in-charge assignments for a route they no longer ride** (a separate defect found
  during analysis). They remain exempt and unbilled, which is correct under the current policy.

## Non-goals

- Online payment for staff. Payment is recorded manually by the transport office.
- Writing staff into `billing_student_bills` — structurally impossible.
- Billing the 3 `JICATE*` staff, or the 109 exempt in-charges.
- Fixing the 4 stale in-charge assignments.
- Implementing the `proxy.ts` staff fee gate — it stays inert, so no staffer is locked out.
