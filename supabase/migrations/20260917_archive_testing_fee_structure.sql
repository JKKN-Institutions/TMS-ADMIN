-- One-off data change, APPLIED to production 2026-09-17 06:57 UTC.
--
-- A leftover fee structure named "Testing" (flat Rs 5,500, created 2026-06-17)
-- was still 'active'. It inflated the Maintenance Fee page's old
-- "Active Annual Value" card to Rs 11,000 and stayed eligible for bill
-- generation. Archived (the UI's retired state; the CHECK constraint allows only
-- draft/active/archived). Its 2 bills (none paid) are untouched.
--
-- Revert: set status = 'active' for the same id.

update tms_fee_structure
set status = 'archived', updated_at = now()
where id = 'f96259f1-60f7-463b-b873-7ca4c96be3bb'
  and name = 'Testing'
  and status = 'active';
