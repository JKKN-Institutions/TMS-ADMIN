-- ############################################################################
-- REVERTED. Do not read this file as the current state of the ledger.
--
-- This migration was applied on 2026-08-28 and undone the same day by
-- 20260828100001_revert_cancel_orphaned_staff_deferred_bills.sql. The transport
-- office decided the bills STAND and are decided by the 31 August attendance
-- rule; the seven locked-out staff were instead unblocked via an in-charge
-- route assignment, which leaves the fee ledger untouched -- see
-- 20260828110000_grant_incharge_access_to_billed_staff.sql.
--
-- The file is kept because it is applied history: the DB migration log records
-- it, and deleting it would leave the revert referring to nothing. The analysis
-- below is still accurate about WHY the bills are frozen; only its conclusion
-- (cancel them) was overruled.
-- ############################################################################
--
-- Cancel the staff transport bills that outlived the rule which was meant to clear them.
--
-- WHY
-- ---
-- On 2026-08-14 (and 3 more on 08-17) the in-charge enforcement run raised 37
-- staff transport bills at status 'staff_deferred'. 'staff_deferred' does not
-- mean "owed" -- it means "raised, but HELD pending the month-end verdict".
-- The bargain those staff were given was explicit, and the verdict's own
-- notification text spelled it out:
--
--   "Your bus was marked on every service day this month, so your transport
--    fee bill has been cancelled."
--
-- The judge of that bargain was app/api/cron/incharge-month-verdict/route.ts.
-- It was DELETED on 2026-08-27 by PR #23 (remove in-charge attendance
-- enforcement), together with its pg_cron schedule -- four days before the
-- August verdict was due to run on 08-31. The month's attendance was worked;
-- nothing was ever going to reward it.
--
-- What PR #23 did NOT remove is the bill check in deriveInChargeGate()
-- (lib/boarding/incharge-gate.ts). That check is still correct on its own
-- terms -- it stops a billed staffer re-granting themselves the fee exemption
-- via the willingness toggle, which is how 26 people escaped their bills on
-- 2026-08-17/18. But it was written assuming a verdict would clear honest
-- staff every month. With the verdict gone, the punishment survived and the
-- pardon did not, and the check became a permanent wall.
--
-- The wall is total. cancelStaffBills() and makeStaffBillsPayable() -- the only
-- two functions that move a bill out of 'staff_deferred' -- now have zero
-- callers anywhere in the codebase; the deleted verdict was their only caller.
-- The admin mark-paid route refuses 'staff_deferred' outright ("held pending
-- the month-end verdict and cannot be marked paid here"). So these 37 bills are
-- unpayable, uncancellable and unsettleable by every action the application
-- offers. Seven of the 37 are additionally locked out of the boarding portal
-- entirely, sitting on the 'Transport fees are due' screen; all seven are
-- eligible bus in-charges with an active route (verified via
-- tms_staff_boarding_eligibility) and are blocked by nothing but the frozen bill.
--
-- The honest reading is that a held bill whose releasing condition has been
-- deleted was never owed. Cancelling restores the position the staff were
-- promised and reopens the willingness toggle so they can self-select as
-- in-charge again.
--
-- CANCELLED, NOT DELETED. The Vacate module set this precedent and it holds
-- here for the same reason: a cancelled bill is evidence that duty was
-- performed, a deleted one is evidence of nothing. The 2026-08-14 audit trail
-- (tms_incharge_attendance_strike, tms_incharge_probation,
-- tms_incharge_month_verdict) was deliberately kept by PR #23 and stays.
--
-- SCOPE (measured 2026-08-28, immediately before applying)
--   37 bills / 37 distinct staff / Rs 4,88,400 total
--   all term_no = 1, all due_date = 2026-08-31
--   transport_year_id = 6b3768f9-c9fb-48d5-a955-41949983c3b0 (is_current)
--   billing_student_bill_id IS NULL on all 37 -- there is no MyJKKN mirror row
--   to keep in step, so this change is confined to tms_fee_bill.
--
-- CONSEQUENCE THE NEXT READER MUST KNOW
--   tms_fee_bill_idem_unique is UNIQUE on
--   (fee_structure_id, person_id, term_no, transport_year_id) and does NOT
--   include status. A cancelled row therefore keeps occupying its slot: no NEW
--   term-1 bill can be generated for these 37 staff for 2026-2027. Re-billing
--   them this year means un-cancelling the existing row, not inserting another.
--   That is also what makes this migration reversible -- see ROLLBACK below.
--
-- paid_at IS NULL is not optional: cancelling a settled bill would erase the
-- record of a payment and hand back a fee someone actually paid.

do $$
declare
  v_year uuid := '6b3768f9-c9fb-48d5-a955-41949983c3b0';
  v_count int;
  v_total numeric;
begin
  select count(*), coalesce(sum(amount), 0)
    into v_count, v_total
  from public.tms_fee_bill
  where person_type = 'staff'
    and status = 'staff_deferred'
    and paid_at is null
    and transport_year_id = v_year;

  raise notice 'cancelling % held staff bills totalling Rs %', v_count, v_total;

  update public.tms_fee_bill
     set status = 'cancelled'
   where person_type = 'staff'
     and status = 'staff_deferred'
     and paid_at is null
     and transport_year_id = v_year;
end $$;

-- Verify:
--   select status, count(*), sum(amount)
--     from tms_fee_bill
--    where person_type = 'staff'
--      and transport_year_id = '6b3768f9-c9fb-48d5-a955-41949983c3b0'
--    group by status;
--   -> no 'staff_deferred' rows remain.
--
-- ROLLBACK (if the transport office decides these fees stand after all):
--   update tms_fee_bill
--      set status = 'staff_deferred'
--    where person_type = 'staff'
--      and status = 'cancelled'
--      and paid_at is null
--      and transport_year_id = '6b3768f9-c9fb-48d5-a955-41949983c3b0'
--      and term_no = 1
--      and due_date = '2026-08-31';
--   Note this would also catch any bill cancelled by another path with the same
--   shape. The 37 ids this migration actually touched are captured below --
--   add `and id in (<list>)` to the rollback to scope it to exactly this run.
--
-- THE 37 BILL IDS CANCELLED BY THIS MIGRATION (captured 2026-08-28, pre-apply):
--   '01a710a8-ec74-410f-92c6-500f97d1e95a','06376324-7622-4cc4-937f-c95e0ea43566',
--   '065eb195-1a60-4564-9141-f34179c8b3b7','1a14bd09-cba7-47f5-b10c-dce7faefbfe5',
--   '21fe5744-45d1-4cc7-8c08-e9e63e45d020','2b4d2af9-f446-4584-bef0-010f7904f456',
--   '2ccb6e6e-3910-432f-b8fc-cabef617a08c','314875a3-7909-42d5-b6a7-e8e74833c005',
--   '3f565e9d-4b7a-481c-98d2-47dcbcabb528','4255512b-d1c7-4903-acb8-48e3d7aedafc',
--   '584009a9-66c2-4894-9d94-334bbf4ef8e0','5db11855-6be2-478a-89f5-eb0a4f7fa60a',
--   '607773f0-290e-4469-9e39-f19ad4234cef','60fdce92-0d20-4400-b49e-273b2718361f',
--   '65b85c68-82ec-4f0c-b39b-31e4af772604','666b71ac-77e9-409e-be3c-a5738d059b8a',
--   '6e077bab-89ae-4519-a696-a6483b1e4f70','81deb4d9-2fd5-4f3b-8fde-ec1d16630e96',
--   '8963c6e2-3d4a-40d4-b38e-52ca4a38f8fa','8d9e5c7b-59ad-4012-a0b8-0970cf3829f8',
--   '90a4979b-439b-47bc-b2fc-d99de5fcbfef','9d446d1b-9ba6-49ec-a409-bf281737a113',
--   'a5a0349e-9081-4aea-a320-31ac200abf00','a690ef79-a3a0-408f-9787-e742e6353c78',
--   'b7246dd3-d3e1-475f-bdc9-3eb0f62d6b60','bb5cc7d1-bd0b-4973-8b75-b01a77ad0ae1',
--   'bf4103dd-2fe8-442a-9e3f-0be82c5f3201','c75efdcb-18bc-4747-a8f3-e766388b73a4',
--   'ced01959-e1c8-46e4-9285-e0d7f665704d','d784a8c6-eabc-4b95-aa1a-1a1bd61a4e7d',
--   'e5f8f241-4aec-405a-93c5-153234359bdb','e7dacaf1-d9c9-4add-b3c2-b5b730475f98',
--   'e8f4fa81-8bef-475d-99c5-87bfc60c0797','efc370a4-8cbe-4cec-933a-ce5b8e7784e0',
--   'f47e494c-ccea-4f77-8788-38da9cf579d1','fdc357e9-12d4-43cc-8ebf-cb36192597a8',
--   'fea1e200-bcf3-46fc-bef1-58fb0c44d427'
