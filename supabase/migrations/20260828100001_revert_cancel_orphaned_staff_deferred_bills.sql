-- REVERT of 20260828100000_cancel_orphaned_staff_deferred_bills.
--
-- That migration cancelled all 37 held staff transport bills (Rs 4,88,400) on
-- the reading that a bill whose releasing condition -- the month-end verdict,
-- deleted 2026-08-27 by PR #23 -- no longer exists was never owed.
--
-- The transport office decided otherwise on 2026-08-28: THE BILLS STAND, and
-- the 31 August attendance rule decides them. Writing them off would pre-empt
-- that decision by three days.
--
-- The seven staff who were locked out of the boarding portal by the 'must_pay'
-- gate are unblocked by the other door instead -- an active route assignment,
-- which makes deriveInChargeGate() return 'in_duty' before it ever reaches the
-- bill check. See 20260828110000_grant_incharge_access_to_billed_staff.sql.
-- That approach leaves the fee ledger completely untouched, which is the point.
--
-- SCOPED TO THE 37 IDS THE CANCEL TOUCHED. A blanket
-- "status='cancelled' -> 'staff_deferred'" would also resurrect the one staff
-- bill (Rs 8,800) that was already cancelled before that run by an unrelated
-- path. Listing the ids is what keeps this a true inverse rather than an
-- approximate one.
--
-- Verified after applying: staff_deferred 37 / Rs 4,88,400, cancelled 1 /
-- Rs 8,800 -- byte-for-byte the pre-cancel position.

update public.tms_fee_bill
   set status = 'staff_deferred'
 where person_type = 'staff'
   and status = 'cancelled'
   and paid_at is null
   and transport_year_id = '6b3768f9-c9fb-48d5-a955-41949983c3b0'
   and id in (
     '01a710a8-ec74-410f-92c6-500f97d1e95a','06376324-7622-4cc4-937f-c95e0ea43566',
     '065eb195-1a60-4564-9141-f34179c8b3b7','1a14bd09-cba7-47f5-b10c-dce7faefbfe5',
     '21fe5744-45d1-4cc7-8c08-e9e63e45d020','2b4d2af9-f446-4584-bef0-010f7904f456',
     '2ccb6e6e-3910-432f-b8fc-cabef617a08c','314875a3-7909-42d5-b6a7-e8e74833c005',
     '3f565e9d-4b7a-481c-98d2-47dcbcabb528','4255512b-d1c7-4903-acb8-48e3d7aedafc',
     '584009a9-66c2-4894-9d94-334bbf4ef8e0','5db11855-6be2-478a-89f5-eb0a4f7fa60a',
     '607773f0-290e-4469-9e39-f19ad4234cef','60fdce92-0d20-4400-b49e-273b2718361f',
     '65b85c68-82ec-4f0c-b39b-31e4af772604','666b71ac-77e9-409e-be3c-a5738d059b8a',
     '6e077bab-89ae-4519-a696-a6483b1e4f70','81deb4d9-2fd5-4f3b-8fde-ec1d16630e96',
     '8963c6e2-3d4a-40d4-b38e-52ca4a38f8fa','8d9e5c7b-59ad-4012-a0b8-0970cf3829f8',
     '90a4979b-439b-47bc-b2fc-d99de5fcbfef','9d446d1b-9ba6-49ec-a409-bf281737a113',
     'a5a0349e-9081-4aea-a320-31ac200abf00','a690ef79-a3a0-408f-9787-e742e6353c78',
     'b7246dd3-d3e1-475f-bdc9-3eb0f62d6b60','bb5cc7d1-bd0b-4973-8b75-b01a77ad0ae1',
     'bf4103dd-2fe8-442a-9e3f-0be82c5f3201','c75efdcb-18bc-4747-a8f3-e766388b73a4',
     'ced01959-e1c8-46e4-9285-e0d7f665704d','d784a8c6-eabc-4b95-aa1a-1a1bd61a4e7d',
     'e5f8f241-4aec-405a-93c5-153234359bdb','e7dacaf1-d9c9-4add-b3c2-b5b730475f98',
     'e8f4fa81-8bef-475d-99c5-87bfc60c0797','efc370a4-8cbe-4cec-933a-ce5b8e7784e0',
     'f47e494c-ccea-4f77-8788-38da9cf579d1','fdc357e9-12d4-43cc-8ebf-cb36192597a8',
     'fea1e200-bcf3-46fc-bef1-58fb0c44d427'
   );
